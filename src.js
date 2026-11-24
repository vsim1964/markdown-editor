import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css';
import '@toast-ui/editor/dist/i18n/ru-ru';
import './style.css';
import codeSyntaxHighlight from '@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight-all.js';
import '@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight.css';
import 'prismjs/themes/prism.css';
import { marked } from 'marked';
async function insertImage(blob,callback){
  try{
    const rel=await window.desktop.stageImage(blob.type,new Uint8Array(await blob.arrayBuffer()),blob.name||'photo');
    callback(rel,blob.name||'Изображение');
  }catch(e){alert('Не удалось вставить изображение: '+e.message);}
}

const $=id=>document.getElementById(id);
const editor=new Editor({el:$('editor'),height:'100%',initialEditType:'wysiwyg',previewStyle:'tab',language:'ru-RU',hideModeSwitch:true,usageStatistics:false,plugins:[codeSyntaxHighlight],hooks:{addImageBlobHook:insertImage},initialValue:'',toolbarItems:[['heading','bold','italic','strike'],['hr','quote'],['ul','ol','task','indent','outdent'],['table','image','link'],['code','codeblock']]});
let dirty=false,mode='wysiwyg',saved='',busy=false;
function refresh(){const md=editor.getMarkdown();dirty=md!==saved;window.desktop.dirty(dirty);$('count').textContent=(md.trim()?md.trim().split(/\s+/u).length:0)+' слов · '+md.length+' символов';$('outline').replaceChildren();const headings=marked.lexer(md).filter(t=>t.type==='heading');headings.forEach((h,i)=>{const b=document.createElement('button'), template=document.createElement('template');template.innerHTML=marked.parseInline(h.text);b.textContent=template.content.textContent;b.style.paddingLeft=(8+12*(h.depth-1))+'px';b.onclick=()=>{if(mode!=='wysiwyg')return;const nodes=$('editor').querySelectorAll('.toastui-editor-ww-container h1,.toastui-editor-ww-container h2,.toastui-editor-ww-container h3,.toastui-editor-ww-container h4,.toastui-editor-ww-container h5,.toastui-editor-ww-container h6');nodes[i]?.scrollIntoView({block:'center'});};$('outline').append(b);});}
editor.on('change',refresh);
async function save(as=false){const md=editor.getMarkdown(),result=await window.desktop.save(md,as);if(!result)return false;if(result.content!==md)editor.setMarkdown(result.content,false);saved=editor.getMarkdown();$('file').textContent=result.name;refresh();$('status').textContent='Сохранено';return true;}
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