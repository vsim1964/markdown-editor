import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css';
import '@toast-ui/editor/dist/i18n/ru-ru';
import './style.css';
const $=id=>document.getElementById(id);
const editor=new Editor({el:$('editor'),height:'100%',initialEditType:'wysiwyg',previewStyle:'tab',language:'ru-RU',hideModeSwitch:true,usageStatistics:false,initialValue:'',toolbarItems:[['heading','bold','italic','strike'],['hr','quote'],['ul','ol','task','indent','outdent'],['table','link'],['code','codeblock']]});
let dirty=false,mode='wysiwyg',saved='',busy=false;
function refresh(){const md=editor.getMarkdown();dirty=md!==saved;window.desktop.dirty(dirty);$('count').textContent=(md.trim()?md.trim().split(/\s+/u).length:0)+' слов · '+md.length+' символов';$('outline').replaceChildren();const headings=md.split('\n').filter(s=>/^#{1,6}\s/.test(s));headings.forEach(s=>{const m=s.match(/^(#+)\s+(.*)/),b=document.createElement('button');b.textContent=m[2];b.style.paddingLeft=(8+12*(m[1].length-1))+'px';b.onclick=()=>{if(mode!=='wysiwyg')return;const nodes=[...$('editor').querySelectorAll('.toastui-editor-ww-container h1,.toastui-editor-ww-container h2,.toastui-editor-ww-container h3,.toastui-editor-ww-container h4,.toastui-editor-ww-container h5,.toastui-editor-ww-container h6')];nodes.find(n=>n.textContent.trim()===m[2].trim())?.scrollIntoView({block:'center'});};$('outline').append(b);});}
editor.on('change',refresh);
async function save(as=false){const md=editor.getMarkdown(),name=await window.desktop.save(md,as);if(!name)return false;saved=md;$('file').textContent=name;refresh();$('status').textContent='Сохранено';return true;}
async function guard(){if(!dirty)return true;if(confirm('Сохранить изменения перед продолжением?'))return save();return confirm('Продолжить без сохранения?');}
async function run(fn){if(busy)return;busy=true;try{await fn();}catch(e){alert('Ошибка: '+e.message);}finally{busy=false;}}
function load(content,name){editor.setMarkdown(content,false);saved=editor.getMarkdown();$('file').textContent=name;refresh();}
$('new').onclick=()=>run(async()=>{if(await guard()){await window.desktop.newFile();load('','Без названия');}});
$('open').onclick=()=>run(async()=>{if(await guard()){const r=await window.desktop.open();if(r)load(r.content,r.name);}});
$('save').onclick=()=>run(()=>save());$('saveAs').onclick=()=>run(()=>save(true));
$('mode').onclick=()=>{mode=mode==='wysiwyg'?'markdown':'wysiwyg';editor.changeMode(mode,true);$('mode').textContent=mode==='wysiwyg'?'Исходный текст':'Визуальный режим';refresh();};
$('theme').onclick=()=>{document.body.classList.toggle('dark');$('editor').classList.toggle('toastui-editor-dark');};
$('pdf').onclick=()=>run(async()=>{if(mode!=='wysiwyg'){$('mode').click();}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(await window.desktop.pdf())$('status').textContent='PDF сохранён';});
window.desktop.onClose(()=>run(async()=>{if(await guard())window.desktop.close();}));
document.addEventListener('keydown',e=>{if(!e.ctrlKey)return;const id={s:e.shiftKey?'saveAs':'save',o:'open',n:'new'}[e.key.toLowerCase()];if(id){e.preventDefault();$(id).click();}});
refresh();