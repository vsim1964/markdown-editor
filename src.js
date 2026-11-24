import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css';
import '@toast-ui/editor/dist/i18n/ru-ru';
import './style.css';
import Prism from 'prismjs';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import { Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { marked } from 'marked';
function syntaxPlugin(context) {
  const P=context.pmState?.Plugin || Plugin;
  const D=context.pmView?.Decoration || Decoration;
  const DS=context.pmView?.DecorationSet || DecorationSet;
  function decorate(doc) {
    const decorations=[];
    doc.descendants((node,pos)=>{
      if (!/code.?block/i.test(node.type.name)) return;
      const lang=(node.attrs.language||node.attrs.lang||node.attrs.info||'').trim().split(/\s+/)[0].toLowerCase();
      const grammar=Prism.languages[lang]; if(!grammar)return;
      let offset=0;
      function walk(tokens, classes=[]) {
        for(const t of tokens) {
          if(typeof t==='string') {
            if(t.length && classes.length) decorations.push(D.inline(pos+1+offset,pos+1+offset+t.length,{class:classes.join(' ')}));
            offset+=t.length;
          } else {const c=[...classes,'token',t.type];walk(Array.isArray(t.content)?t.content:[t.content],c);}
        }
      }
      walk(Prism.tokenize(node.textContent,grammar));
      return false;
    });
    return DS.create(doc,decorations);
  }
  return {wysiwygPlugins:[new P({props:{decorations:state=>decorate(state.doc)}})]};
}
async function insertImage(blob,callback){
  const reader=new FileReader();
  reader.onload=()=>callback(reader.result,blob.name||'Изображение');
  reader.onerror=()=>alert('Не удалось прочитать изображение');
  reader.readAsDataURL(blob);
}

const $=id=>document.getElementById(id);
const editor=new Editor({el:$('editor'),height:'100%',initialEditType:'wysiwyg',previewStyle:'tab',language:'ru-RU',hideModeSwitch:true,usageStatistics:false,plugins:[syntaxPlugin],hooks:{addImageBlobHook:insertImage},initialValue:'',toolbarItems:[['heading','bold','italic','strike'],['hr','quote'],['ul','ol','task','indent','outdent'],['table','image','link'],['code','codeblock']]});
let dirty=false,mode='wysiwyg',saved='',busy=false;
function refresh(){const md=editor.getMarkdown();dirty=md!==saved;window.desktop.dirty(dirty);$('count').textContent=(md.trim()?md.trim().split(/\s+/u).length:0)+' слов · '+md.length+' символов';$('outline').replaceChildren();const headings=marked.lexer(md).filter(t=>t.type==='heading');headings.forEach((h,i)=>{const b=document.createElement('button'), template=document.createElement('template');template.innerHTML=marked.parseInline(h.text);b.textContent=template.content.textContent;b.style.paddingLeft=(8+12*(h.depth-1))+'px';b.onclick=()=>{if(mode!=='wysiwyg')return;const nodes=$('editor').querySelectorAll('.toastui-editor-ww-container h1,.toastui-editor-ww-container h2,.toastui-editor-ww-container h3,.toastui-editor-ww-container h4,.toastui-editor-ww-container h5,.toastui-editor-ww-container h6');nodes[i]?.scrollIntoView({block:'center'});};$('outline').append(b);});scheduleImages();}
let imageTimer;
function scheduleImages(){clearTimeout(imageTimer);imageTimer=setTimeout(()=>{for(const img of $('editor').querySelectorAll('img')){const src=img.getAttribute('src');if(!src||/^(data:|blob:|https?:)/i.test(src)||img.dataset.resolved===src)continue;img.dataset.resolved=src;window.desktop.image(src).then(data=>{if(data&&img.isConnected&&img.getAttribute('src')===src)img.src=data;}).catch(()=>{});}},120);}
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