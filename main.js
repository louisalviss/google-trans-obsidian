const {Plugin,Notice,PluginSettingTab,Setting,requestUrl,MarkdownView,Modal}=require('obsidian');
const V='0.3.0';
const DEF={targetLang:'vi',sourceLang:'auto',outputMode:'new-file',chunkSize:4500,delayMs:0,maxNoteChars:90000,maxRetries:2,retryBaseMs:600,showNotices:true,concurrentRequests:3};
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
log(s){const x='['+new Date().toLocaleTimeString()+'] '+s;this.logs.push(x);if(this.logs.length>400)this.logs.shift();console.log('[GTO]',s)}
showBox(title){this.hideBox();const o=document.createElement('div');o.style.cssText='position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:22px;';const c=document.createElement('div');c.style.cssText='width:min(420px,92vw);border-radius:16px;background:var(--background-primary);box-shadow:0 12px 40px rgba(0,0,0,.35);padding:18px;font-family:var(--font-interface);';const h=document.createElement('div');h.style.cssText='font-weight:700;font-size:16px;margin-bottom:8px;';h.textContent=title;const s=document.createElement('div');s.style.cssText='font-size:13px;opacity:.85;margin-bottom:12px;';s.textContent='Starting...';const wrap=document.createElement('div');wrap.style.cssText='height:10px;border-radius:99px;background:var(--background-modifier-border);overflow:hidden;';const bar=document.createElement('div');bar.style.cssText='height:100%;width:0%;border-radius:99px;background:var(--interactive-accent);transition:width .15s linear;';const v=document.createElement('div');v.style.cssText='font-size:11px;opacity:.7;margin-top:10px;';v.textContent='UI version '+V;wrap.appendChild(bar);c.appendChild(h);c.appendChild(s);c.appendChild(wrap);c.appendChild(v);o.appendChild(c);document.body.appendChild(o);this.box={o,s,bar,h}}
boxUpdate(msg,pct){if(!this.box)return;this.box.s.textContent=msg;if(Number.isFinite(pct))this.box.bar.style.width=Math.max(0,Math.min(100,pct))+'%'}
hideBox(){if(this.box&&this.box.o)this.box.o.remove();this.box=null}
async run(mode){
const view=this.app.workspace.getActiveViewOfType(MarkdownView),file=this.app.workspace.getActiveFile();
if(!view||!file){new Notice('No active note.');return}
const src=view.editor.getValue();
if(!src.trim()){new Notice('Current note is empty.');return}
if(this.settings.maxNoteChars>0&&src.length>this.settings.maxNoteChars){new Notice('Note too long: '+src.length+' chars. Limit '+this.settings.maxNoteChars+'.',9000);this.status('GT blocked');return}
this.logs=[];this.log('file '+file.path);this.status('GT running');this.showBox('Translating note');this.boxUpdate('Preparing chunks...',3);
try{
const out=await this.translateDoc(src);
this.boxUpdate('Writing result...',98);
if(mode==='replace'){view.editor.setValue(out);this.status('GT done');this.boxUpdate('Done',100);await sleep(350);this.hideBox();new Notice('Translated and replaced current note.');return}
if(mode==='append'){view.editor.setValue(src+'\n\n---\n\n# Translation ('+this.settings.targetLang+')\n\n'+out);this.status('GT done');this.boxUpdate('Done',100);await sleep(350);this.hideBox();new Notice('Translation appended.');return}
const p=await this.newFile(file,out);await this.app.workspace.openLinkText(p,'',true);this.status('GT done');this.boxUpdate('Done',100);await sleep(350);this.hideBox();new Notice('Translated note created: '+p)
}catch(e){const m=e&&e.message?e.message:String(e);this.log('ERROR '+m);this.status('GT failed');this.boxUpdate('Failed: '+m,100);setTimeout(()=>this.hideBox(),2500);new Notice('Translate failed: '+m,9000)}
}
async newFile(file,text){
const folder=file.parent&&file.parent.path&&file.parent.path!=='/'?file.parent.path:'',base=file.basename||file.name.replace(/\.md$/i,''),lang=this.settings.targetLang||'vi';
let name=base+'.'+lang+'.md',path=folder?folder+'/'+name:name,n=2;
while(await this.app.vault.adapter.exists(path)){name=base+'.'+lang+'.'+n+'.md';path=folder?folder+'/'+name:name;n++}
await this.app.vault.create(path,text);return path
}
async translateDoc(src){
const segs=segments(src),jobs=[];let trans=0;
for(const s of segs){if(s.keep||!s.text.trim())continue;const p=protect(s.text);const chunks=cut(p.text,this.settings.chunkSize).filter(x=>x.trim());jobs.push({seg:s,pack:p,chunks});trans+=chunks.length}
this.total=trans||1;this.done=0;this.log('segments '+segs.length+', requests '+trans+', concurrency '+this.settings.concurrentRequests);
const outputs=[];let ji=0;
for(const s of segs){
if(s.keep||!s.text.trim()){outputs.push(s.text);continue}
const j=jobs[ji++];const arr=await limit(j.chunks,Math.max(1,Number(this.settings.concurrentRequests)||1),async chunk=>{const r=await this.reqRetry(chunk);this.done++;const pct=Math.round(this.done/this.total*94)+3;this.status('GT '+this.done+'/'+this.total);this.boxUpdate('Translating '+this.done+'/'+this.total,pct);return r});
outputs.push(restore(arr.join(''),j.pack.items))
}
return outputs.join('')
}
async reqRetry(q){let err=null;
for(let i=0;i<=this.settings.maxRetries;i++){try{if(i){const w=this.settings.retryBaseMs*Math.pow(2,i-1);this.log('retry '+i+' wait '+w);this.boxUpdate('Retry '+i+'/'+this.settings.maxRetries,undefined);await sleep(w)}return await this.req(q)}catch(e){err=e;this.log('request fail '+(i+1)+': '+(e.message||e))}}
throw err||new Error('request failed')
}
async req(q){
const t=q.trim();if(!t)return q;const lead=(q.match(/^\s*/)||[''])[0],tail=(q.match(/\s*$/)||[''])[0];
const u='https://translate.googleapis.com/translate_a/single?'+new URLSearchParams({client:'gtx',sl:this.settings.sourceLang,tl:this.settings.targetLang,dt:'t',q:t}).toString();
const r=await requestUrl({url:u,method:'GET',throw:false});
if(r.status<200||r.status>=300)throw new Error('HTTP '+r.status);
const j=r.json||JSON.parse(r.text);return lead+j[0].map(x=>x[0]||'').join('')+tail
}
};
class LogModal extends Modal{constructor(app,logs){super(app);this.logs=logs}onOpen(){this.contentEl.empty();this.contentEl.createEl('h2',{text:'Translation log'});this.contentEl.createEl('p',{text:'UI version: '+V});this.contentEl.createEl('pre',{text:this.logs.length?this.logs.join('\n'):'No logs yet.'})}}
class Tab extends PluginSettingTab{constructor(app,p){super(app,p);this.p=p}display(){const c=this.containerEl;c.empty();c.createEl('h2',{text:'Google Trans Obsidian'});c.createEl('p',{text:'UI version: '+V});c.createEl('p',{text:'Fast mode: larger chunks + parallel requests. Uses Google Translate web endpoint.'});
txt(c,this.p,'targetLang','Target language','vi / en / ja / zh-CN / ko','vi');
txt(c,this.p,'sourceLang','Source language','auto is recommended','auto');
new Setting(c).setName('Default output mode').setDesc('new-file is safest.').addDropdown(d=>d.addOption('new-file','Create new file').addOption('replace','Replace current note').addOption('append','Append below').setValue(this.p.settings.outputMode).onChange(async v=>{this.p.settings.outputMode=v;await this.p.saveSettings()}));
txt(c,this.p,'chunkSize','Chunk size','Bigger is faster; lower if request fails.','4500',500);
txt(c,this.p,'concurrentRequests','Concurrent requests','Higher is faster but can rate-limit.','3',1);
txt(c,this.p,'maxNoteChars','Max note characters','0 disables limit','90000',0);
txt(c,this.p,'maxRetries','Max retries','Retry failed request','2',0);
txt(c,this.p,'retryBaseMs','Retry base delay ms','Backoff delay','600',0);
txt(c,this.p,'delayMs','Delay between chunks ms','Usually 0 for speed','0',0);
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
function protect(s){const items=[];const save=v=>{const k='ZXQOBSPH'+items.length+'QXZ';items.push([k,v]);return k};let x=s;
x=x.replace(/`[^`\n]*`/g,save);
x=x.replace(/\$[^$\n]+\$/g,save);
x=x.replace(/!?\[\[[^\]]+\]\]/g,save);
x=x.replace(/!?\[[^\]]*\]\([^)]+\)/g,save);
x=x.replace(/https?:\/\/[^\s)\]]+/g,save);
x=x.replace(/#[A-Za-z0-9_\/-]+/g,save);
x=x.replace(/<[^>]+>/g,save);
x=x.replace(/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/gm,save);
return{text:x,items}}
function restore(s,items){let x=s;for(const it of items){x=x.split(it[0]).join(it[1]);x=x.split(it[0].toLowerCase()).join(it[1])}return x}
function cut(s,max){const a=[];let i=0,m=Number(max||4500);while(i<s.length){let e=Math.min(i+m,s.length);if(e<s.length){const n=s.lastIndexOf('\n\n',e);if(n>i+500)e=n+2;else{const p=s.lastIndexOf('\n',e);if(p>i+500)e=p+1}}a.push(s.slice(i,e));i=e}return a}
async function limit(arr,n,fn){const out=new Array(arr.length);let i=0;async function worker(){while(i<arr.length){const k=i++;out[k]=await fn(arr[k],k)}}await Promise.all(Array.from({length:Math.min(n,arr.length)},worker));return out}
function sleep(ms){return new Promise(r=>setTimeout(r,Number(ms)||0))}
