import type { DesignSelection } from '../../../shared/types'

export const PREVIEW_SELECTION_CHANNEL = 'kern:preview-selection'

export type PreviewSelectionMessage =
  | { channel: typeof PREVIEW_SELECTION_CHANNEL; type: 'ready' }
  | {
      channel: typeof PREVIEW_SELECTION_CHANNEL
      type: 'selection'
      target: DesignSelection
    }
  | {
      channel: typeof PREVIEW_SELECTION_CHANNEL
      type: 'rect'
      rect: NonNullable<DesignSelection['rect']> | null
    }
  | { channel: typeof PREVIEW_SELECTION_CHANNEL; type: 'cancelled' }

function selectionRuntime(preferVectorTargets: boolean): string {
  const targetSelector = preferVectorTargets
    ? 'svg,g,path,rect,circle,ellipse,line,polyline,polygon,text,use'
    : 'section,article,header,footer,nav,main,figure,picture,img,h1,h2,h3,h4,h5,h6,p,a,button,input,select,textarea,li,div'
  return `<script data-kern-selection-runtime>(function(){
if(window.__kernPreviewSelection)return;
window.__kernPreviewSelection=true;
var channel=${JSON.stringify(PREVIEW_SELECTION_CHANNEL)};
var active=false;
var selected=null;
var hovered=null;
var root=document.createElement('div');
root.setAttribute('data-kern-selection-ui','');
root.style.cssText='position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
var box=document.createElement('div');
box.style.cssText='position:absolute;display:none;border:2px solid #1b6c80;background:rgba(27,108,128,.08);box-sizing:border-box;';
var tag=document.createElement('div');
tag.style.cssText='position:absolute;display:none;max-width:240px;padding:3px 6px;border-radius:4px;background:#181a18;color:#fff;font:500 10px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
root.appendChild(box);
root.appendChild(tag);
document.body.appendChild(root);
var cursorStyle=document.createElement('style');
cursorStyle.setAttribute('data-kern-selection-style','');
cursorStyle.textContent='body.kern-selection-active,body.kern-selection-active *{cursor:crosshair!important}';
document.head.appendChild(cursorStyle);
function post(type,payload){
  var message={channel:channel,type:type};
  if(payload){for(var key in payload){message[key]=payload[key];}}
  window.parent.postMessage(message,'*');
}
function escapeId(value){
  if(window.CSS&&CSS.escape)return CSS.escape(value);
  return String(value).replace(/[^a-zA-Z0-9_-]/g,function(c){return '\\\\'+c;});
}
function uniqueSelector(element){
  if(element.id){
    var idSelector='#'+escapeId(element.id);
    try{if(document.querySelectorAll(idSelector).length===1)return idSelector;}catch(error){}
  }
  var parts=[];
  var node=element;
  while(node&&node.nodeType===1&&node!==document.documentElement){
    if(node!==document.body&&node.id){
      var candidate='#'+escapeId(node.id);
      try{
        if(document.querySelectorAll(candidate).length===1){
          parts.unshift(candidate);
          break;
        }
      }catch(error){}
    }
    var name=node.tagName.toLowerCase();
    if(node===document.body){parts.unshift('body');break;}
    var index=1;
    var sibling=node;
    while((sibling=sibling.previousElementSibling)){
      if(sibling.tagName===node.tagName)index+=1;
    }
    parts.unshift(name+':nth-of-type('+index+')');
    node=node.parentElement;
  }
  return parts.join(' > ');
}
function isUiNode(node){
  return Boolean(node&&node.closest&&node.closest('[data-kern-selection-ui]'));
}
function selectableTarget(node){
  if(!(node instanceof Element)||isUiNode(node))return null;
  var candidate=node.closest(${JSON.stringify(targetSelector)});
  if(!candidate||candidate===document.documentElement||candidate===document.body)return null;
  return candidate;
}
function labelFor(element){
  var name=element.tagName.toLowerCase();
  var className=typeof element.className==='string'?element.className.trim().split(/\\s+/).slice(0,2).join('.'):'';
  if(className)name+='.'+className;
  var aria=element.getAttribute('aria-label');
  var text=(aria||element.textContent||'').replace(/\\s+/g,' ').trim();
  return text?name+' - '+text.slice(0,72):name;
}
function snapshot(element){
  var computed=getComputedStyle(element);
  var properties=['display','position','width','height','color','backgroundColor','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','borderRadius','gap','gridTemplateColumns','padding','margin','objectFit'];
  var styles=properties.map(function(property){
    return property+': '+computed.getPropertyValue(property.replace(/[A-Z]/g,function(letter){return '-'+letter.toLowerCase();}))+';';
  }).join('\\n');
  return {
    selector:uniqueSelector(element),
    tag:element.tagName.toLowerCase(),
    label:labelFor(element),
    text:(element.textContent||'').replace(/\\s+/g,' ').trim().slice(0,1200),
    html:(element.outerHTML||'').slice(0,30000),
    styles:styles,
    rect:rectFor(element) || undefined
  };
}
function rectFor(element){
  if(!element||!element.isConnected)return null;
  var rect=element.getBoundingClientRect();
  return {x:rect.x,y:rect.y,width:rect.width,height:rect.height};
}
function place(element,isSelected){
  if(!element||!element.isConnected){box.style.display='none';tag.style.display='none';return;}
  var rect=rectFor(element);
  if(!rect){return;}
  box.style.display='block';
  box.style.left=rect.x+'px';
  box.style.top=rect.y+'px';
  box.style.width=rect.width+'px';
  box.style.height=rect.height+'px';
  box.style.borderColor=isSelected?'#1b6c80':'#4f8792';
  box.style.background=isSelected?'rgba(27,108,128,.08)':'rgba(27,108,128,.045)';
  tag.style.display='block';
  tag.textContent=labelFor(element);
  var top=rect.y>=26?rect.y-24:rect.y+rect.height+4;
  tag.style.left=Math.max(4,Math.min(rect.x,window.innerWidth-244))+'px';
  tag.style.top=Math.max(4,top)+'px';
}
function publishRect(){
  if(!active&&!selected)return;
  post('rect',{rect:rectFor(selected||hovered)});
}
document.addEventListener('mousemove',function(event){
  if(!active)return;
  var target=selectableTarget(event.target);
  if(target===hovered)return;
  hovered=target;
  place(hovered,false);
},{passive:true});
document.addEventListener('click',function(event){
  if(!active)return;
  var target=selectableTarget(event.target);
  if(!target)return;
  event.preventDefault();
  event.stopPropagation();
  selected=target;
  active=false;
  document.body.classList.remove('kern-selection-active');
  place(selected,true);
  post('selection',{target:snapshot(selected)});
  publishRect();
},true);
document.addEventListener('keydown',function(event){
  if(event.key!=='Escape')return;
  if(!active)return;
  active=false;
  document.body.classList.remove('kern-selection-active');
  hovered=null;
  place(selected,true);
  post('cancelled');
},true);
window.addEventListener('scroll',publishRect,{passive:true});
window.addEventListener('resize',publishRect);
window.addEventListener('message',function(event){
  if(event.source!==window.parent)return;
  var data=event.data;
  if(!data||data.channel!==channel)return;
  if(data.type==='set-mode'){
    active=data.active===true;
    document.body.classList.toggle('kern-selection-active',active);
    if(!active){hovered=null;place(selected,true);publishRect();}
    return;
  }
  if(data.type==='clear'){
    selected=null;hovered=null;active=false;
    document.body.classList.remove('kern-selection-active');
    box.style.display='none';tag.style.display='none';
    return;
  }
  if(data.type==='request-rect'){publishRect();}
});
post('ready');
})();</script>`
}

export function injectPreviewSelectionRuntime(
  html: string,
  preferVectorTargets = false
): string {
  if (!html.trim() || html.includes('data-kern-selection-runtime')) return html
  const runtime = selectionRuntime(preferVectorTargets)
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${runtime}</body>`)
  }
  return `${html}\n${runtime}`
}
