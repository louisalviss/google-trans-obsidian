const {Plugin,Notice,PluginSettingTab,Setting,requestUrl,MarkdownView}=require('obsidian');
const VERSION='0.1.0';
const DEFAULT_SETTINGS={targetLang:'vi',sourceLang:'auto',outputMode:'new-file',chunkSize:3200,delayMs:180,showNotices:true};
module.exports=class GoogleTransObsidianPlugin extends Plugin{
async onload(){
this.settings=Object.assign({},DEFAULT_SETTINGS,await this.loadData());
this.addRibbonIcon('languages','Translate current note',async()=>{await this.translateActiveNote(this.settings.outputMode);});
this.addCommand({id:'translate-current-note',name:'Translate current note',callback:async()=>{await this.translateActiveNote(this.settings.outputMode);}});
this.addCommand({id:'translate-current-note-to-new-file',name:'Translate current note to new file',callback:async()=>{await this.translateActiveNote('new-file');}});
this.addCommand({id:'replace-current-note-with-translation',name:'Replace current note with translation',callback:async()=>{await this.translateActiveNote('replace');}});
this.addCommand({id:'append-translation-below-current-note',name:'Append translation below current note',callback:async()=>{await this.translateActiveNote('append');}});
this.addSettingTab(new GoogleTransSettingTab(this.app,this));
new Notice('Google Trans Obsidian v'+VERSION+' loaded');
}
async saveSettings(){await this.saveData(this.settings);}
notice(msg){if(this.settings.showNotices)new Notice(msg,3500);}
async translateActiveNote(mode){
const view=this.app.workspace.getActiveViewOfType(MarkdownView);
const file=this.app.workspace.getActiveFile();
if(!view||!file){new Notice('No active Markdown note found.');return;}
const editor=view.editor;
const original=editor.getValue();
if(!original.trim()){new Notice('Current note is empty.');return;}
try{
this.notice('Translating note...');
const translated=await this.translateMarkdown(original);
if(mode==='replace'){editor.setValue(translated);new Notice('Translated and replaced current note.');return;}
if(mode==='append'){editor.setValue(original+String.fromCharCode(10)+String.fromCharCode(10)+'---'+String.fromCharCode(10)+String.fromCharCode(10)+'# Translation ('+this.settings.targetLang+')'+String.fromCharCode(10)+String.fromCharCode(10)+translated);new Notice('Translation appended.');return;}
const path=await this.createTranslatedFile(file,translated);
await this.app.workspace.openLinkText(path,'',true);
new Notice('Translated note created: '+path);
}catch(e){console.error(e);new Notice('Translate failed: '+(e&&e.message?e.message:String(e)),8000);}
}
async createTranslatedFile(file,translated){
const folder=file.parent&&file.parent.path&&file.parent.path!=='/'?file.parent.path:'';
const base=file.basename||file.name.replace('.md','');
const lang=this.settings.targetLang||'vi';
let name=base+'.'+lang+'.md';
let path=folder?folder+'/'+name:name;
let i=2;
while(await this.app.vault.adapter.exists(path)){name=base+'.'+lang+'.'+i+'.md';path=folder?folder+'/'+name:name;i++;}
await this.app.vault.create(path,translated);
return path;
}
async translateMarkdown(markdown){
const blocks=splitMarkdown(markdown);
const output=[];
for(let i=0;i<blocks.length;i++){
const b=blocks[i];
if(b.protected||!b.text.trim()){output.push(b.text);continue;}
output.push(await this.translateText(b.text));
}
return output.join(String.fromCharCode(10));
}
async translateText(text){
const chunks=splitChunks(text,Number(this.settings.chunkSize)||3200);
const out=[];
for(let i=0;i<chunks.length;i++){
const c=chunks[i];
if(!c.trim()){out.push(c);continue;}
this.notice('Translating chunk '+(i+1)+'/'+chunks.length+'...');
out.push(await this.translateChunk(c));
await sleep(Number(this.settings.delayMs)||0);
}
return out.join('');
}
async translateChunk(text){
const q=text.trim();
if(!q)return text;
const params=new URLSearchParams({client:'gtx',sl:this.settings.sourceLang||'auto',tl:this.settings.targetLang||'vi',dt:'t',q:q});
const url='https://translate.googleapis.com/translate_a/single?'+params.toString();
const res=await requestUrl({url:url,method:'GET',headers:{Accept:'application/json,text/plain,*/*'},throw:false});
if(res.status<200||res.status>=300)throw new Error('Google Translate HTTP '+res.status);
let data=res.json;
if(!data){try{data=JSON.parse(res.text);}catch(e){throw new Error('Cannot parse Google Translate response.');}}
if(!Array.isArray(data)||!Array.isArray(data[0]))throw new Error('Unexpected Google Translate response.');
return data[0].map(p=>Array.isArray(p)&&typeof p[0]==='string'?p[0]:'').join('');
}
};
class GoogleTransSettingTab extends PluginSettingTab{
constructor(app,plugin){super(app,plugin);this.plugin=plugin;}
display(){
const c=this.containerEl;c.empty();
c.createEl('h2',{text:'Google Trans Obsidian'});
c.createEl('p',{text:'UI version: '+VERSION});
c.createEl('p',{text:'Uses Google Translate web endpoint. No API key. Best for personal notes, not heavy batch translation.'});
new Setting(c).setName('Target language').setDesc('Vietnamese = vi, English = en, Japanese = ja, Chinese = zh-CN, Korean = ko.').addText(t=>t.setPlaceholder('vi').setValue(this.plugin.settings.targetLang).onChange(async v=>{this.plugin.settings.targetLang=v.trim()||'vi';await this.plugin.saveSettings();}));
new Setting(c).setName('Source language').setDesc('Use auto unless you need fixed source language.').addText(t=>t.setPlaceholder('auto').setValue(this.plugin.settings.sourceLang).onChange(async v=>{this.plugin.settings.sourceLang=v.trim()||'auto';await this.plugin.saveSettings();}));
new Setting(c).setName('Default output mode').setDesc('new-file is safest. replace overwrites current note. append adds translation below.').addDropdown(d=>d.addOption('new-file','Create new translated file').addOption('replace','Replace current note').addOption('append','Append below current note').setValue(this.plugin.settings.outputMode).onChange(async v=>{this.plugin.settings.outputMode=v;await this.plugin.saveSettings();}));
new Setting(c).setName('Chunk size').setDesc('Lower is safer. Higher is faster but can fail.').addText(t=>t.setPlaceholder('3200').setValue(String(this.plugin.settings.chunkSize)).onChange(async v=>{const n=Number(v);this.plugin.settings.chunkSize=Number.isFinite(n)&&n>=500?n:3200;await this.plugin.saveSettings();}));
new Setting(c).setName('Delay between chunks').setDesc('Milliseconds. Increase if requests fail.').addText(t=>t.setPlaceholder('180').setValue(String(this.plugin.settings.delayMs)).onChange(async v=>{const n=Number(v);this.plugin.settings.delayMs=Number.isFinite(n)&&n>=0?n:180;await this.plugin.saveSettings();}));
new Setting(c).setName('Show progress notices').setDesc('Turn off if notices are annoying.').addToggle(t=>t.setValue(Boolean(this.plugin.settings.showNotices)).onChange(async v=>{this.plugin.settings.showNotices=v;await this.plugin.saveSettings();}));
}
}
function splitMarkdown(text){
const NL=String.fromCharCode(10);
const lines=text.split(NL);
const blocks=[];
let buf=[];
let fence=false;
let fm=false;
function push(protectedBlock){if(buf.length){blocks.push({protected:protectedBlock,text:buf.join(NL)});buf=[];}}
for(let i=0;i<lines.length;i++){
const line=lines[i];
const trim=line.trim();
if(i===0&&trim==='---'){push(false);fm=true;buf.push(line);continue;}
if(fm){buf.push(line);if(i>0&&trim==='---'){push(true);fm=false;}continue;}
if(trim.startsWith('```')||trim.startsWith('~~~')){
if(!fence){push(false);fence=true;buf.push(line);}else{buf.push(line);push(true);fence=false;}
continue;
}
if(fence){buf.push(line);continue;}
buf.push(line);
}
if(buf.length)push(fence||fm);
return blocks;
}
function splitChunks(text,max){
const NL=String.fromCharCode(10);
const chunks=[];
let i=0;
while(i<text.length){
let end=Math.min(i+max,text.length);
if(end<text.length){
const cut=text.lastIndexOf(NL,end);
if(cut>i+500)end=cut+1;
}
chunks.push(text.slice(i,end));
i=end;
}
return chunks;
}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}