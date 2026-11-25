const {app,BrowserWindow,ipcMain,dialog,Menu,protocol,net}=require('electron');
const fs=require('node:fs/promises'), path=require('node:path');
let win, current=null, dirty=false, closing=false;
const {randomUUID}=require('node:crypto');
const {pathToFileURL}=require('node:url');
let pending=new Map();
const documents=new Map();
let activeId=null;
function activate(id){const d=documents.get(id);if(!d)throw new Error('Документ закрыт');activeId=id;current=d.path;pending=d.pending;title();}
function makeDoc(p=null){const id=randomUUID();documents.set(id,{path:p,pending:new Map()});return id;}
const imageTypes={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.bmp':'image/bmp','.avif':'image/avif'};
const mimeExt=Object.fromEntries(Object.entries(imageTypes).map(([ext,mime])=>[mime,ext]));
mimeExt['image/jpeg']='.jpg';
protocol.registerSchemesAsPrivileged([{scheme:'mdeditor',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
function stageImage(mime,bytes,name='photo'){
  const ext=mimeExt[mime];
  if(!ext||!bytes.length||bytes.length>30*1024*1024)throw new Error('Неподдерживаемый формат или изображение больше 30 МБ');
  const stem=path.parse(String(name)).name.replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'photo';
  const rel='images/'+stem+'-'+randomUUID().slice(0,12)+ext;
  pending.set(rel,{mime,bytes});
  return rel;
}
ipcMain.handle('stage-image',(_,id,mime,bytes,name)=>{if(id!==activeId)throw new Error('Документ изменился');return stageImage(mime,Buffer.from(bytes),name);});
function imageResponse(bytes,mime){return new Response(bytes,{headers:{'Content-Type':mime,'Cache-Control':'no-store'}});}
async function serve(req){
  try{
    const url=new URL(req.url);
    if(url.hostname!=='editor')return new Response(null,{status:404});
    const rel=decodeURIComponent(url.pathname).replace(/^\/+/,'');
    const staged=pending.get(rel);
    if(staged)return imageResponse(staged.bytes,staged.mime);
    const dist=path.join(__dirname,'dist'),file=path.resolve(dist,rel||'index.html');
    if(file.startsWith(dist+path.sep)){
      try{if((await fs.stat(file)).isFile())return net.fetch(pathToFileURL(file).href);}catch{}
    }
    const type=imageTypes[path.extname(rel).toLowerCase()];
    if(type&&current){
      const p=path.resolve(path.dirname(current),rel);
      const stat=await fs.stat(p);
      if(stat.isFile()&&stat.size<=30*1024*1024)return imageResponse(await fs.readFile(p),type);
    }
  }catch{}
  return new Response(null,{status:404});
}
async function writeImages(content,destination){
  const dir=path.dirname(destination);
  // Convert older embedded raster images only when they occur in Markdown image syntax.
  content=content.replace(/(!\[[^\]\n]*\]\(<?)data:(image\/(?:png|jpeg|gif|webp|bmp|avif));base64,([A-Za-z0-9+/=]+)(>?\))/gi,(_,prefix,mime,data,suffix)=>prefix+stageImage(mime.toLowerCase(),Buffer.from(data,'base64'))+suffix);
  for(const [rel,item] of pending){
    if(!content.includes(rel))continue;
    const target=path.join(dir,rel);
    await fs.mkdir(path.dirname(target),{recursive:true});
    try{await fs.writeFile(target,item.bytes,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;if(!(await fs.readFile(target)).equals(item.bytes))throw new Error('Конфликт имени изображения: '+rel);}
  }
  if(current&&path.dirname(current)!==dir){
    // Copy referenced relative raster images into the new document directory,
    // keeping existing target files intact and assigning unique names if needed.
    const pattern=/!\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)]+)(?=\s|\))/g;
    const replacements=new Map();
    for(const match of content.matchAll(pattern)){
      const raw=match[1],rel=raw.replace(/^<|>$/g,'');
      if(replacements.has(raw)||pending.has(rel)||/^(?:[a-z][a-z0-9+.-]*:|[\\/])/i.test(rel))continue;
      let decoded;try{decoded=decodeURIComponent(rel);}catch{continue;}
      const source=path.resolve(path.dirname(current),decoded),mime=imageTypes[path.extname(source).toLowerCase()];
      if(!mime)continue;
      let bytes;try{const stat=await fs.stat(source);if(!stat.isFile()||stat.size>30*1024*1024)continue;bytes=await fs.readFile(source);}catch{continue;}
      const newRel=stageImage(mime,bytes,path.basename(source));
      const target=path.join(dir,newRel);
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.writeFile(target,bytes,{flag:'wx'});
      replacements.set(raw,newRel);
    }
    content=content.replace(pattern,(whole,raw)=>replacements.has(raw)?whole.slice(0,whole.length-raw.length)+replacements.get(raw):whole);
  }
  return content;
}
const fsSync=require('node:fs');
const zoomSteps=[60,70,80,90,100,110,125,150,175,200];
let zoom=100;
function zoomFile(){return path.join(app.getPath('userData'),'zoom.json');}
function restoreZoom(){try{const v=JSON.parse(fsSync.readFileSync(zoomFile(),'utf8'));if(zoomSteps.includes(v))zoom=v;}catch{}}
function changeZoom(action){const i=zoomSteps.indexOf(zoom);zoom=action==='reset'?100:zoomSteps[Math.max(0,Math.min(zoomSteps.length-1,i+(action==='in'?1:-1)))];win.webContents.setZoomFactor(zoom/100);try{fsSync.writeFileSync(zoomFile(),JSON.stringify(zoom));}catch{}win.webContents.send('zoom-changed',zoom);return zoom;}
ipcMain.handle('zoom-get',()=>zoom);
ipcMain.handle('zoom-change',(_,action)=>{if(['in','out','reset'].includes(action))return changeZoom(action);return zoom;});
function create(){restoreZoom();win=new BrowserWindow({icon:path.join(__dirname,'build','icon.png'),width:1200,height:850,minWidth:760,minHeight:480,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
win.webContents.on('will-navigate',e=>e.preventDefault());
win.webContents.on('did-finish-load',()=>{win.webContents.setZoomFactor(zoom/100);win.webContents.send('zoom-changed',zoom);});
win.loadURL('mdeditor://editor/index.html');
win.on('close',e=>{if(dirty&&!closing){e.preventDefault();win.webContents.send('request-close');}});
}
function title(){win.setTitle((dirty?'* ':'')+(current?path.basename(current):'Без названия')+' — Markdown Editor');}
ipcMain.handle('open',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Markdown',extensions:['md','markdown','txt']}]});if(r.canceled)return null;const p=r.filePaths[0],content=await fs.readFile(p,'utf8');const existing=[...documents].find(([,d])=>d.path&&path.resolve(d.path).toLowerCase()===path.resolve(p).toLowerCase());if(existing)return {id:existing[0],existing:true};const id=makeDoc(p);return {id,name:path.basename(p),content};});
ipcMain.handle('new',()=>({id:makeDoc()}));
ipcMain.handle('activate',(_,id)=>{activate(id);return true;});
ipcMain.handle('drop',(_,id)=>{documents.delete(id);if(activeId===id){activeId=null;current=null;pending=new Map();}});
ipcMain.handle('save',async(_,id,content,as)=>{if(id!==activeId)throw new Error('Документ изменился');let p=current;if(!p||as){const r=await dialog.showSaveDialog(win,{defaultPath:p||'Документ.md',filters:[{name:'Markdown',extensions:['md']}]});if(r.canceled)return null;p=r.filePath;}if([...documents].some(([key,d])=>key!==id&&d.path&&path.resolve(d.path).toLowerCase()===path.resolve(p).toLowerCase()))throw new Error('Этот файл уже открыт в другой вкладке');content=await writeImages(content,p);await fs.writeFile(p,content,'utf8');current=p;documents.get(id).path=p;pending.clear();title();return {name:path.basename(p),content};});
ipcMain.on('dirty',(_,v)=>{dirty=!!v;title();});
ipcMain.on('close-approved',()=>{closing=true;win.close();});
ipcMain.handle('export-pdf',async()=>{const r=await dialog.showSaveDialog(win,{defaultPath:'Документ.pdf',filters:[{name:'PDF',extensions:['pdf']}]});if(r.canceled)return false;await fs.writeFile(r.filePath,await win.webContents.printToPDF({printBackground:true,pageSize:'A4'}));return true;});
app.whenReady().then(()=>{protocol.handle('mdeditor',serve);Menu.setApplicationMenu(null);create();});app.on('window-all-closed',()=>app.quit());
