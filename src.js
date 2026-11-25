import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css';
import '@toast-ui/editor/dist/i18n/ru-ru';
import './style.css';
import codeSyntaxHighlight from '@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight-all.js';
import '@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight.css';
import 'prismjs/themes/prism.css';
import { marked } from 'marked';

const $=id=>document.getElementById(id);
const tabs=new Map();
let active=null,mode='wysiwyg',busy=false,loading=false,editor=null;
async function insertImage(blob,callback){
  const id=active;
  try{
    const bytes=new Uint8Array(await blob.arrayBuffer());
    if(id!==active)return;
    const rel=await window.desktop.stageImage(id,blob.type,bytes,blob.name||'photo');
    if(id===active)callback(rel,blob.name||'Изображение');
  }catch(e){alert('Не удалось вставить изображение: '+e.message);}
}
function makeEditor(content){
  $('editor').replaceChildren();
  return new Editor({el:$('editor'),height:'100%',initialEditType:mode,previewStyle:'tab',language:'ru-RU',hideModeSwitch:true,usageStatistics:false,plugins:[codeSyntaxHighlight],hooks:{addImageBlobHook:insertImage},initialValue:content,toolbarItems:[['heading','bold','italic','strike'],['hr','quote'],['ul','ol','task','indent','outdent'],['table','image','link'],['code','codeblock']]});
}
const selector=()=>mode==='wysiwyg'?'.toastui-editor-ww-container .ProseMirror':'.toastui-editor-md-container .ProseMirror';
function root(){return $('editor').querySelector(selector());}
function position(){
  try{const p=editor.getSelection();return {mode,selection:p,ratio:scrollRatio()};}catch{return {mode,ratio:scrollRatio()};}
}
function scrollBox(){const r=root();if(!r)return null;for(let n=r;n&&n!==$('editor');n=n.parentElement){if(n.scrollHeight>n.clientHeight+4&&/auto|scroll/.test(getComputedStyle(n).overflowY))return n;}return r;}
function scrollRatio(){const n=scrollBox();return n&&n.scrollHeight>n.clientHeight?n.scrollTop/(n.scrollHeight-n.clientHeight):0;}
function restore(pos){if(!pos)return;try{if(pos.selection&&pos.mode===mode)editor.setSelection(...pos.selection);}catch{}requestAnimationFrame(()=>{const n=scrollBox();if(n)n.scrollTop=pos.ratio*(n.scrollHeight-n.clientHeight);});}
function capture(){const t=tabs.get(active);if(t&&editor){t.content=editor.getMarkdown();t.pos=position();t.mode=mode;}}
function renderTabs(){const bar=$('tabs');bar.replaceChildren();for(const [id,t] of tabs){const div=document.createElement('div');div.className='tab'+(id===active?' active':'');const b=document.createElement('button');b.className='tab-name';b.textContent=(t.content!==t.saved?'● ':'')+t.name;b.title=t.name;b.onclick=()=>run(()=>switchTab(id));const x=document.createElement('button');x.textContent='×';x.title='Закрыть вкладку';x.onclick=()=>run(()=>closeTab(id));div.append(b,x);bar.append(div);}}
function refresh(){if(loading||!editor||!active)return;const t=tabs.get(active),md=editor.getMarkdown();t.content=md;window.desktop.dirty([...tabs.values()].some(t=>t.content!==t.saved));$('file').textContent=t.name;$('count').textContent=(md.trim()?md.trim().split(/\s+/u).length:0)+' слов · '+md.length+' символов';renderTabs();$('outline').replaceChildren();marked.lexer(md).filter(t=>t.type==='heading').forEach((h,i)=>{const b=document.createElement('button'),template=document.createElement('template');template.innerHTML=marked.parseInline(h.text);b.textContent=template.content.textContent;b.style.paddingLeft=(8+12*(h.depth-1))+'px';b.onclick=()=>{if(mode!=='wysiwyg')return;root()?.querySelectorAll('h1,h2,h3,h4,h5,h6')[i]?.scrollIntoView({block:'center'});};$('outline').append(b);});if(!$('searchbar').hidden)search(false);}
async function switchTab(id){if(id===active||!tabs.has(id))return;capture();clearSearch();loading=true;try{if(editor){editor.destroy();editor=null;}await window.desktop.activate(id);active=id;const t=tabs.get(id);mode=t.mode||'wysiwyg';editor=makeEditor(t.content);editor.on('change',refresh);$('mode').textContent=mode==='wysiwyg'?'Исходный текст':'Визуальный режим';$('editor').classList.toggle('toastui-editor-dark',document.body.classList.contains('dark'));restore(t.pos);}finally{loading=false;}refresh();}
async function addTab(r){if(r.existing){await switchTab(r.id);return;}tabs.set(r.id,{name:r.name||'Без названия',content:r.content||'',saved:r.content||'',mode:'wysiwyg'});await switchTab(r.id);const t=tabs.get(r.id);t.saved=editor.getMarkdown();refresh();}
async function save(as=false){const t=tabs.get(active);if(!t)return false;const md=editor.getMarkdown(),result=await window.desktop.save(active,md,as);if(!result)return false;const pos=position();if(result.content!==md)editor.setMarkdown(result.content,false);t.saved=editor.getMarkdown();t.name=result.name;restore(pos);refresh();$('status').textContent='Сохранено';return true;}
async function guard(){const t=tabs.get(active);if(!t||t.content===t.saved)return true;if(confirm('Сохранить изменения в «'+t.name+'»?'))return save();return confirm('Закрыть без сохранения?');}
async function closeTab(id){await switchTab(id);if(!await guard())return;const ids=[...tabs.keys()],i=ids.indexOf(id),next=ids[i+1]||ids[i-1];if(editor){editor.destroy();editor=null;}active=null;tabs.delete(id);await window.desktop.drop(id);if(next)await switchTab(next);else await addTab(await window.desktop.newFile());}
async function run(fn){if(busy)return;busy=true;try{await fn();}catch(e){alert('Ошибка: '+e.message);}finally{busy=false;}}
$('new').onclick=()=>run(async()=>addTab(await window.desktop.newFile()));
$('open').onclick=()=>run(async()=>{const r=await window.desktop.open();if(r)await addTab(r);});
$('save').onclick=()=>run(()=>save());$('saveAs').onclick=()=>run(()=>save(true));
function toggleMode(){const pos=position();const target=mode==='wysiwyg'?'markdown':'wysiwyg';clearSearch();editor.changeMode(target,false);mode=target;$('mode').textContent=mode==='wysiwyg'?'Исходный текст':'Визуальный режим';try{editor.focus();}catch{}requestAnimationFrame(()=>{const n=scrollBox();if(n&&pos.ratio>0&&Math.abs(scrollRatio()-pos.ratio)>.12)n.scrollTop=pos.ratio*(n.scrollHeight-n.clientHeight);});refresh();}
$('mode').onclick=()=>{if(editor)toggleMode();};
$('theme').onclick=()=>{document.body.classList.toggle('dark');$('editor').classList.toggle('toastui-editor-dark');};
$('pdf').onclick=()=>run(async()=>{if(mode!=='wysiwyg')toggleMode();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));if(await window.desktop.pdf())$('status').textContent='PDF сохранён';});
window.desktop.onClose(()=>run(async()=>{capture();for(const [id,t] of tabs){if(t.content!==t.saved){await switchTab(id);if(!await guard())return;}}window.desktop.close();}));
let ranges=[],index=-1;
function clearSearch(){CSS.highlights?.delete('md-find');CSS.highlights?.delete('md-current');ranges=[];index=-1;}
function search(jump=true){clearSearch();const q=$('query').value.toLocaleLowerCase(),r=root();if(!q||!r){$('matches').textContent='';return;}const walker=document.createTreeWalker(r,NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const txt=n.data.toLocaleLowerCase();let i=0;while((i=txt.indexOf(q,i))!==-1){const range=document.createRange();range.setStart(n,i);range.setEnd(n,i+q.length);ranges.push(range);i+=q.length;}}if(window.Highlight)CSS.highlights.set('md-find',new Highlight(...ranges));if(ranges.length&&jump)move(1);else $('matches').textContent=ranges.length?'Найдено: '+ranges.length:'Нет совпадений';}
function move(step){if(!ranges.length)return;index=(index<0?(step<0?ranges.length-1:0):(index+step+ranges.length)%ranges.length);const range=ranges[index];if(window.Highlight)CSS.highlights.set('md-current',new Highlight(range));range.startContainer.parentElement?.scrollIntoView({block:'center',inline:'nearest'});$('matches').textContent=(index+1)+' / '+ranges.length;}
function openSearch(){if(!editor)return;$('searchbar').hidden=false;$('query').focus();$('query').select();search();}
function closeSearch(){clearSearch();$('searchbar').hidden=true;editor?.focus();}
$('query').oninput=()=>search();$('next').onclick=()=>move(1);$('prev').onclick=()=>move(-1);$('search-close').onclick=closeSearch;
$('query').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();move(e.shiftKey?-1:1);}if(e.key==='Escape'){e.preventDefault();closeSearch();}};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('searchbar').hidden){closeSearch();return;}if(!e.ctrlKey)return;const key=e.key.toLowerCase();if(key==='f'){e.preventDefault();openSearch();return;}if(key==='w'){e.preventDefault();run(()=>closeTab(active));return;}if(key==='tab'){e.preventDefault();const ids=[...tabs.keys()];run(()=>switchTab(ids[(ids.indexOf(active)+(e.shiftKey?-1:1)+ids.length)%ids.length]));return;}const id={s:e.shiftKey?'saveAs':'save',o:'open',n:'new'}[key];if(id){e.preventDefault();$(id).click();}},true);
run(async()=>addTab(await window.desktop.newFile()));
