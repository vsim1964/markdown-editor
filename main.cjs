const {app,BrowserWindow,ipcMain,dialog,Menu}=require('electron');
const fs=require('node:fs/promises'), path=require('node:path');
let win, current=null, dirty=false, closing=false;
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
win.loadFile(path.join(__dirname,'dist','index.html'));
win.on('close',e=>{if(dirty&&!closing){e.preventDefault();win.webContents.send('request-close');}});
}
function title(){win.setTitle((dirty?'* ':'')+(current?path.basename(current):'Без названия')+' — Markdown Editor');}
ipcMain.handle('open',async()=>{const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'Markdown',extensions:['md','markdown','txt']}]});if(r.canceled)return null;const p=r.filePaths[0],content=await fs.readFile(p,'utf8');current=p;dirty=false;title();return {name:path.basename(p),content};});
ipcMain.handle('new',()=>{current=null;dirty=false;title();});
ipcMain.handle('save',async(_,content,as)=>{let p=current;if(!p||as){const r=await dialog.showSaveDialog(win,{defaultPath:p||'Документ.md',filters:[{name:'Markdown',extensions:['md']}]});if(r.canceled)return null;p=r.filePath;}await fs.writeFile(p,content,'utf8');current=p;dirty=false;title();return path.basename(p);});
ipcMain.on('dirty',(_,v)=>{dirty=!!v;title();});
ipcMain.on('close-approved',()=>{closing=true;win.close();});
ipcMain.handle('export-pdf',async()=>{const r=await dialog.showSaveDialog(win,{defaultPath:'Документ.pdf',filters:[{name:'PDF',extensions:['pdf']}]});if(r.canceled)return false;await fs.writeFile(r.filePath,await win.webContents.printToPDF({printBackground:true,pageSize:'A4'}));return true;});
app.whenReady().then(()=>{Menu.setApplicationMenu(null);create();});app.on('window-all-closed',()=>app.quit());
ipcMain.handle('local-image',async(_,src)=>{
  if(!current||typeof src!=='string'||src.length>4096)return null;
  try {
    const p=src.startsWith('file:')?require('node:url').fileURLToPath(src):path.resolve(path.dirname(current),decodeURIComponent(src));
    const types={'.png':'png','.jpg':'jpeg','.jpeg':'jpeg','.gif':'gif','.webp':'webp','.bmp':'bmp','.avif':'avif'};
    const type=types[path.extname(p).toLowerCase()];if(!type)return null;
    const stat=await fs.stat(p);if(!stat.isFile()||stat.size>30*1024*1024)return null;
    return 'data:image/'+type+';base64,'+(await fs.readFile(p)).toString('base64');
  } catch{return null;}
});