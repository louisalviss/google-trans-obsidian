const {Plugin,Notice,PluginSettingTab,Setting,requestUrl,MarkdownView,Modal}=require('obsidian');
const V='0.2.0';
const DEF={targetLang:'vi',sourceLang:'auto',outputMode:'new-file',chunkSize:2500,delayMs:250,maxNoteChars:60000,maxRetries:3,retryBaseMs:800,showNotices:true};
module.exports=class GT extends Plugin{
async onload(){
this.settings=Object.assign({},DEF,await this.loadData());this.logs=[];this.bar=this.addStatusBarItem();this.status('GT v'+V);
this.addRibbonIcon('languages','Translate current note',()=>this.run(this.settings.outputMode));
for(const c of [['translate-current-note','Translate current note',this.settings.outputMode],['translate-current-note-new-file','Translate current note to new file','new-file'],['translate-current-note-replace','Replace current note with translation','replace'],['translate-current-note-append','Append translation below current note','append']])this.addCommand({id:c[0],name:c[1],callback:()=>this.run(c[2])});
this.addCommand({id:'show-translation-log',name:'Show translation log',callback:()=>new LogModal(this.app,this.logs).open()});
this.addSettingTab(new Tab(this.app,this));new Notice('Google Trans Obsidian v'+V+' loaded');
}
async saveSettings(){await this.saveData(this.settings)}
status(s){if(this.bar)this.bar.setText(s)}
say(s,ms=3000){if(this.settings.showNotices)new Notice(s,ms)}
log(s){const x='['+new Date().toLocaleTimeString()+'] '+s;this.logs.push(x);if(this.logs.length>300)this.logs.shift();console.log('[GTO]',s)}
async run(mode){
const view=this.app.workspace.getActiveViewOfType(MarkdownView),file=this.app.workspace.getActiveFile();
if(!view||!file){new Notice('No active note.');return}
const src=view.editor.getValue();
if(!src.trim()){new Notice('Current note is empty.');return}
if(this.settings.maxNoteChars>0&&src.length>this.settings.maxNoteChars){new Notice('Note too long: '+src.length+' chars. Limit '+this.settings.maxNoteChars+'.',9000);this.status('GT blocked');return}
this.logs=[];this.log('file '+file.path);this.say('Translating note...');this.status('GT running');
try{
const out=await this.translateDoc(src);
if(mode==='replace'){view.editor.setValue(out);this.status('GT done');new Notice('Translated and replaced current note.');return}
if(mode==='append'){view.editor.setValue(src+'\n\n---\n\n# Translation ('+this.settings.targetLang+')\n\n'+out);this.status('GT done');new Notice('Translation appended.');return}
const p=await this.newFile(file,out);await this.app.workspace.openLinkText(p,'',true);this.status('GT done');new Notice('Translated note created: '+p)
}catch(e){const m=e&&e.message?e.message:String(e);this.log('ERROR '+m);this.status('GT failed');new Notice('Translate failed: '+m,9000)}
}
async newFile(file,text){
const folder=file.parent&&file.parent.path&&file.parent.path!=='/'?file.parent.path:'',base=file.basename||file.name.replace('.md',''),lang=this.settings.targetLang||'vi';
let name=base+'.'+lang+'.md',path=folder?folder+'/'+name:name,n=2;
while(await this.app.vault.adapter.exists(path)){name=base+'.'+lang+'.'+n+'.md';path=folder?folder+'/'+name:name;n++}
await this.app.vault.create(path,text);return path
}
async translateDoc(src){
const segs=segments(src),todo=segs.filter(x=>!x.keep&&x.text.trim());let done=0,out=[];
this.log('segments '+segs.length+', translatable '+todo.length);
for(const s of segs){if(s.keep||!s.text.trim()){out.push(s.text);continue}
done++;this.status('GT '+done+'/'+todo.length+' '+Math.round(done/(todo.length||1)*100)+'%');
out.push(await this.translateText(s.text,done,todo.length))}
return out.join('')
}
async translateText(text,idx,total){
const lines=text.split('\n'),out=[];
for(let i=0;i<lines.length;i++)out.push(await this.translateLine(lines[i],idx,total,i+1,lines.length));
return out.join('\n')
}
async translateLine(line,idx,total,li,lt){
if(!line.trim()||tableDivider(line))return line;
const p=prefix(line),guard=protect(p.body),chunks=cut(guard.text,this.settings.chunkSize),out=[];
for(let i=0;i<chunks.length;i++){if(!chunks[i].trim()){out.push(chunks[i]);continue}
this.log('seg '+idx+'/'+total+' line '+li+'/'+lt+' chunk '+(i+1)+'/'+chunks.length);
out.push(await this.reqRetry(chunks[i]));await sleep(this.settings.delayMs)}
return p.pre+restore(out.join(''),guard.items)+p.post
}
async reqRetry(q){let err=null;
for(let i=0;i<=this.settings.maxRetries;i++){try{if(i){const w=this.settings.retryBaseMs*Math.pow(2,i-1);this.status('GT retry '+i);this.log('retry '+i+' wait '+w);await sleep(w)}return await this.req(q)}catch(e){err=e;this.log('request fail '+(i+1)+': '+(e.message||e))}}
throw err||new Error('request failed')
}
async req(q){
const t=q.trim();if(!t)return q;
const lead=(q.match(/^\s*/)||[''])[0],tail=(q.match(/\s*$/)||[''])[0];
const u='https://translate.googleapis.com/translate_a/single?'+new URLSearchParams({client:'gtx',sl:this.settings.sourceLang,tl:this.settings.targetLang,dt:'t',q:t}).toString();
const r=await requestUrl({url:u,method:'GET',throw:false});
if(r.status<200||r.status>=300)throw new Error('HTTP '+r.status);
const j=r.json||JSON.parse(r.text);
return lead+j[0].map(x=>x[0]||'').join('')+tail
}
};
class LogModal extends Modal{constructor(app,logs){super(app);this.logs=logs}onOpen(){this.contentEl.empty();this.contentEl.createEl('h2',{text:'Translation log'});this.contentEl.createEl('p',{text:'UI version: '+V});this.contentEl.createEl('pre',{text:this.logs.length?this.logs.join('\n'):'No logs yet.'})}}
class Tab extends PluginSettingTab{constructor(app,p){super(app,p);this.p=p}display(){const c=this.containerEl;c.empty();c.createEl('h2',{text:'Google Trans Obsidian'});c.createEl('p',{text:'UI version: '+V});c.createEl('p',{text:'Uses Google Translate web endpoint. Do not use for sensitive notes.'});
txt(c,this.p,'targetLang','Target language','vi / en / ja / zh-CN / ko','vi');
txt(c,this.p,'sourceLang','Source language','auto is recommended','auto');
new Setting(c).setName('Default output mode').setDesc('new-file is safest.').addDropdown(d=>d.addOption('new-file','Create new file').addOption('replace','Replace current note').addOption('append','Append below').setValue(this.p.settings.outputMode).onChange(async v=>{this.p.settings.outputMode=v;await this.p.saveSettings()}));
txt(c,this.p,'chunkSize','Chunk size','Lower is safer','2500',500);
txt(c,this.p,'maxNoteChars','Max note characters','0 disables limit','60000',0);
txt(c,this.p,'maxRetries','Max retries','Retry failed request','3',0);
txt(c,this.p,'retryBaseMs','Retry base delay ms','Backoff delay','800',0);
txt(c,this.p,'delayMs','Delay between chunks ms','Increase if rate limited','250',0);
new Setting(c).setName('Show notices').addToggle(t=>t.setValue(!!this.p.settings.showNotices).onChange(async v=>{this.p.settings.showNotices=v;await this.p.saveSettings()}))
}}
function txt(c,p,k,n,d,ph,min){new Setting(c).setName(n).setDesc(d).addText(t=>t.setPlaceholder(ph).setValue(String(p.settings[k])).onChange(async v=>{const num=Number(v);p.settings[k]=min===undefined?(v.trim()||ph):(Number.isFinite(num)&&num>=min?num:Number(ph));await p.saveSettings()}))}
function segments(src){const lines=src.split('\n'),a=[];let b=[],keep=false,fence='',fm=false,math=false;const push=k=>{if(b.length){a.push({keep:k,text:b.join('\n')+'\n'});b=[]}};
for(let i=0;i<lines.length;i++){const x=lines[i],t=x.trim();
if(i===0&&t==='---'){push(false);fm=true;keep=true;b.push(x);continue}
if(fm){b.push(x);if(i&&t==='---'){push(true);fm=false;keep=false}continue}
if(!keep&&(t.startsWith('```')||t.startsWith('~~~'))){push(false);keep=true;fence=t.slice(0,3);b.push(x);continue}
if(keep&&fence&&t.startsWith(fence)){b.push(x);push(true);keep=false;fence='';continue}
if(!keep&&t==='$$'){push(false);keep=true;math=true;b.push(x);continue}
if(keep&&math&&t==='$$'){b.push(x);push(true);keep=false;math=false;continue}
b.push(x)}if(b.length)a.push({keep,text:b.join('\n')});return a}
function prefix(line){const ps=[/^(\s{0,3}#{1,6}\s+)(.*)$/,/^(\s*>\s?)(.*)$/,/^(\s*[-*+]\s+)(.*)$/,/^(\s*\d+[.)]\s+)(.*)$/,/^(\s*\|)(.*)(\|\s*)$/];for(const r of ps){const m=line.match(r);if(m)return{pre:m[1],body:m[2],post:m[3]||''}}return{pre:'',body:line,post:''}}
function protect(s){const items=[];const save=v=>{const k='ZZGTO'+items.length+'ZZ';items.push([k,v]);return k};let x=s;x=x.replace(/`[^`\n]*`/g,save);x=x.replace(/\$[^$\n]+\$/g,save);x=x.replace(/!?\[\[[^\]]+\]\]/g,save);x=x.replace(/!?\[[^\]]*\]\([^)]+\)/g,save);x=x.replace(/https?:\/\/[^\s)\]]+/g,save);x=x.replace(/#[A-Za-z0-9_\/-]+/g,save);x=x.replace(/<[^>]+>/g,save);return{text:x,items}}
function restore(s,items){let x=s;for(const it of items){x=x.split(it[0]).join(it[1]);x=x.split(it[0].toLowerCase()).join(it[1])}return x}
function tableDivider(s){return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(s.trim())}
function cut(s,max){const a=[];let i=0;while(i<s.length){let e=Math.min(i+Number(max||2500),s.length);if(e<s.length){const n=s.lastIndexOf('\n',e);if(n>i+300)e=n+1}a.push(s.slice(i,e));i=e}return a}
function sleep(ms){return new Promise(r=>setTimeout(r,Number(ms)||0))}
