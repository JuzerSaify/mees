import type {
  ArtifactRuntimeReport,
  DesignAudit,
  DesignIssue,
  DesignMode,
  DesignViewport,
  DesignViewportAudit
} from '../../../shared/types'
import { fingerprintArtifactDesign } from './designMemory'

const AUDIT_CHANNEL = 'kern:design-audit'
const MOTION_AUDIT_CHANNEL = 'kern:motion-audit'

const auditViewports: Array<{
  id: DesignViewport
  width: number
  height: number
}> = [
  { id: 'desktop', width: 1440, height: 1000 },
  { id: 'tablet', width: 834, height: 1000 },
  { id: 'mobile', width: 390, height: 844 }
]

interface RawViewportAudit {
  issues?: unknown
  nodeCount?: unknown
  headingCount?: unknown
  interactiveCount?: unknown
  imageCount?: unknown
  palette?: unknown
  fonts?: unknown
  fingerprint?: unknown
}

interface MotionRuntimeResult {
  width?: number
  height?: number
  duration?: number
  fps?: number
  signatures?: string[]
  inkRatios?: number[]
  colorCounts?: number[]
  readable?: boolean
  play?: boolean
  pause?: boolean
  seek?: boolean
  error?: string
}

function motionAuditScript(token: string): string {
  return `<script>(()=>{"use strict";
const token=${JSON.stringify(token)};
let settled=false;
let attempts=0;
const send=(payload)=>{
  if(settled)return;
  settled=true;
  parent.postMessage({channel:${JSON.stringify(MOTION_AUDIT_CHANNEL)},token,result:payload},'*');
};
const waitForTimeline=()=>{
  const motion=window.KERN_MOTION;
  const canvas=document.querySelector('canvas');
  if(!motion||!canvas||typeof motion.renderAt!=='function'){
    attempts+=1;
    if(attempts<70)setTimeout(waitForTimeline,50);
    else send({error:'The timeline did not expose KERN_MOTION.renderAt within the review window.'});
    return;
  }
  try{
    document.querySelectorAll('audio').forEach((node)=>node.remove());
    document.querySelectorAll('video').forEach((node)=>{node.muted=true;node.volume=0;node.pause();});
    if(typeof motion.pause==='function')motion.pause();
    const width=Math.max(1,Math.round(canvas.width||motion.width||1280));
    const height=Math.max(1,Math.round(canvas.height||motion.height||720));
    const duration=Math.max(0.1,Number(motion.duration)||8);
    const fps=Math.max(1,Number(motion.fps)||30);
    const context=canvas.getContext('2d',{willReadFrequently:true});
    if(!context)throw new Error('Canvas rendering context is unavailable.');
    const sampleTimes=[0,duration/2,duration];
    const signatures=[];
    const inkRatios=[];
    const colorCounts=[];
    for(const time of sampleTimes){
      motion.renderAt(time);
      const pixels=context.getImageData(0,0,width,height).data;
      const totalPixels=width*height;
      const step=Math.max(1,Math.floor(totalPixels/16000));
      let hash=2166136261;
      let inked=0;
      let sampled=0;
      const colorBuckets=new Set();
      for(let pixel=0;pixel<totalPixels;pixel+=step){
        const offset=pixel*4;
        const red=pixels[offset]||0;
        const green=pixels[offset+1]||0;
        const blue=pixels[offset+2]||0;
        const alpha=pixels[offset+3]||0;
        if(alpha>8)colorBuckets.add(((red>>4)<<8)|((green>>4)<<4)|(blue>>4));
        if(alpha>8&&(red<247||green<247||blue<247))inked+=1;
        sampled+=1;
        hash=Math.imul(hash^red,16777619)>>>0;
        hash=Math.imul(hash^green,16777619)>>>0;
        hash=Math.imul(hash^blue,16777619)>>>0;
        hash=Math.imul(hash^alpha,16777619)>>>0;
      }
      signatures.push(hash.toString(16).padStart(8,'0'));
      inkRatios.push(sampled?inked/sampled:0);
      colorCounts.push(colorBuckets.size);
    }
    send({
      width,
      height,
      duration,
      fps,
      signatures,
      inkRatios,
      colorCounts,
      readable:true,
      play:typeof motion.play==='function',
      pause:typeof motion.pause==='function',
      seek:typeof motion.seek==='function'
    });
  }catch(error){
    send({error:String(error&&error.message||error).slice(0,240)});
  }
};
window.addEventListener('load',waitForTimeline,{once:true});
setTimeout(waitForTimeline,0);
})();</script>`
}

function runMotionRuntimeAudit(html: string): Promise<MotionRuntimeResult> {
  const token = crypto.randomUUID()
  const iframe = document.createElement('iframe')
  const host = document.createElement('div')
  host.style.cssText =
    'position:fixed;left:-20000px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;'
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.setAttribute('tabindex', '-1')
  iframe.setAttribute('title', 'Kern motion review')
  iframe.style.cssText = 'width:1280px;height:720px;border:0;'
  host.appendChild(iframe)
  document.body.appendChild(host)

  return new Promise((resolve) => {
    let settled = false
    const finish = (value: MotionRuntimeResult): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      iframe.remove()
      host.remove()
      resolve(value)
    }
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== iframe.contentWindow) return
      const payload =
        event.data && typeof event.data === 'object'
          ? (event.data as Record<string, unknown>)
          : null
      if (
        !payload ||
        payload.channel !== MOTION_AUDIT_CHANNEL ||
        payload.token !== token
      ) {
        return
      }
      finish(
        payload.result && typeof payload.result === 'object'
          ? (payload.result as MotionRuntimeResult)
          : { error: 'The motion review returned no result.' }
      )
    }
    const timeout = window.setTimeout(() => {
      finish({ error: 'The motion timeline did not settle in time for review.' })
    }, 5000)
    window.addEventListener('message', onMessage)
    const runtime = motionAuditScript(token)
    iframe.srcdoc = /<\/body>/i.test(html)
      ? html.replace(/<\/body>/i, `${runtime}</body>`)
      : `${html}\n${runtime}`
  })
}

export function auditScript(
  token: string,
  viewport: DesignViewport,
  width: number,
  height = 1000
): string {
  return `<script>(()=>{"use strict";
const token=${JSON.stringify(token)};
const viewport=${JSON.stringify(viewport)};
const targetWidth=${width};
const targetHeight=${height};
let sent=false;
const textOf=(node)=>String(node&&node.textContent||'').replace(/\\s+/g,' ').trim().slice(0,100);
const selectorFor=(el)=>{
  if(!el||!el.tagName)return '';
  const tag=el.tagName.toLowerCase();
  if(el.id)return tag+'#'+String(el.id).slice(0,40);
  const cls=String(el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className||'').trim().split(/\\s+/).filter(Boolean).slice(0,2);
  return tag+(cls.length?'.'+cls.join('.'):'');
};
const isVisible=(el)=>{
  if(!(el instanceof Element))return false;
  const s=getComputedStyle(el),r=el.getBoundingClientRect();
  return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)!==0&&r.width>0&&r.height>0;
};
const inHorizontalScroller=(el)=>{
  let p=el.parentElement;
  while(p&&p!==document.body){const s=getComputedStyle(p);if((s.overflowX==='auto'||s.overflowX==='scroll'||s.overflowX==='hidden')&&p.scrollWidth>p.clientWidth+1)return true;p=p.parentElement}
  return false;
};
const normalizeColor=(value)=>{
  const m=String(value||'').match(/^rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)(?:[,\\s/]+([\\d.]+))?\\)$/i);
  if(!m)return null;if(m[4]!==undefined&&Number(m[4])<0.15)return null;
  return '#'+[m[1],m[2],m[3]].map(v=>Math.max(0,Math.min(255,Number(v))).toString(16).padStart(2,'0')).join('');
};
const colorLuminance=(value)=>{
  const m=String(value||'').match(/rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/i);
  if(!m)return null;
  return (0.2126*Number(m[1])+0.7152*Number(m[2])+0.0722*Number(m[3]))/255;
};
const fontKind=(value)=>{
  const family=String(value||'').toLocaleLowerCase('en');
  if(/mono|cascadia|consolas|courier/.test(family))return 'mono';
  if(/sans-serif/.test(family))return 'sans';
  if(/serif|georgia|palatino|iowan|times|garamond|playfair/.test(family))return 'serif';
  return 'sans';
};
const addIssue=(issues,seen,rule,severity,title,detail,el,index)=>{
  const selector=selectorFor(el);const key=rule+'|'+selector+'|'+title;
  if(seen.has(key)||issues.length>=18)return;seen.add(key);
  issues.push({id:viewport+'-'+rule+'-'+index,viewport,severity,rule,title,detail:detail.slice(0,240),selector});
};
const run=()=>{
  if(sent)return;sent=true;
  try{
    const issues=[],seen=new Set(),paletteCounts=new Map(),fontCounts=new Map();
    const all=Array.from(document.querySelectorAll('body *'));
    const visible=all.filter(isVisible);
    const doc=document.documentElement;
    const sections=Array.from(document.querySelectorAll('main > section,body > section,main > article')).filter(isVisible);
    let microLabelCount=0,microLabelExample=null;
    let indexLabelCount=0,indexLabelExample=null;
    let staticShadowCount=0,staticShadowExample=null;
    let gradientCount=0,gradientExample=null,largeGradient=false;
    const cardGroups=new Map();
    let cardExample=null;
    const overflow=Math.max(0,doc.scrollWidth-targetWidth);
    if(overflow>1)addIssue(issues,seen,'horizontal-overflow','error','Horizontal overflow','The page extends '+withUnit(overflow)+' past the '+targetWidth+'px viewport.',doc.body,0);
    let outside=0,outsideExample=null;
    for(const el of visible){
      if(inHorizontalScroller(el))continue;
      const r=el.getBoundingClientRect();
      if(r.right>targetWidth+2||r.left<-2){outside++;outsideExample=outsideExample||el;}
    }
    if(outside>0&&overflow<=1)addIssue(issues,seen,'offscreen-content','error','Content sits outside the viewport',outside+' visible element'+(outside===1?' extends':'s extend')+' beyond the viewport edge.',outsideExample,1);
    let smallText=0,smallExample=null;
    for(const el of visible){
      const own=Array.from(el.childNodes).some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
      if(!own)continue;
      if(parseFloat(getComputedStyle(el).fontSize)<11.5){smallText++;smallExample=smallExample||el;}
    }
    if(smallText>0)addIssue(issues,seen,'small-text','warning','Text below 12px',smallText+' text element'+(smallText===1?' is':'s are')+' below the 12px readable minimum. "'+String(textOf(smallExample)).slice(0,56)+'"',smallExample,2);
    if(viewport!=='desktop'){
      let smallTargets=0,smallTarget=null;
      for(const el of visible){
        if(!el.matches('button,a[href],input,select,textarea,[role="button"]'))continue;
        const r=el.getBoundingClientRect();
        if(r.width<32||r.height<32){smallTargets++;smallTarget=smallTarget||el;}
      }
      if(smallTargets>0)addIssue(issues,seen,'tap-target','warning','Small touch targets',smallTargets+' interactive element'+(smallTargets===1?' is':'s are')+' smaller than 32 by 32px.',smallTarget,3);
    }
    const images=Array.from(document.images);
    let broken=0,missingAlt=0,imageExample=null;
    for(const image of images){
      if(isVisible(image)&&image.complete&&image.naturalWidth===0){broken++;imageExample=imageExample||image;}
      if(!image.hasAttribute('alt')){missingAlt++;imageExample=imageExample||image;}
    }
    if(broken>0)addIssue(issues,seen,'broken-image','error','Broken image',broken+' image'+(broken===1?' could':'s could')+' not be loaded.',imageExample,4);
    if(missingAlt>0)addIssue(issues,seen,'missing-alt','warning','Image description missing',missingAlt+' image'+(missingAlt===1?' has':'s have')+' no alt attribute.',imageExample,5);
    const h1Count=document.querySelectorAll('h1').length;
    if(h1Count!==1)addIssue(issues,seen,'heading-structure','warning','Heading structure',h1Count===0?'The page has no h1.':'The page has '+h1Count+' h1 headings; use one primary title.',document.body,6);
    if(!doc.lang)addIssue(issues,seen,'missing-language','warning','Document language missing','Add a lang attribute to the html element.',doc,7);
    let unlabeled=0,unlabeledExample=null;
    for(const field of Array.from(document.querySelectorAll('input:not([type="hidden"]),select,textarea'))){
      if(!isVisible(field))continue;
      const id=field.id;
      const labelled=field.getAttribute('aria-label')||field.getAttribute('aria-labelledby')||field.getAttribute('title')||field.closest('label')||(id&&document.querySelector('label[for="'+CSS.escape(id)+'"]'));
      if(!labelled){unlabeled++;unlabeledExample=unlabeledExample||field;}
    }
    if(unlabeled>0)addIssue(issues,seen,'field-label','warning','Form field needs a name',unlabeled+' field'+(unlabeled===1?' has':'s have')+' no accessible label.',unlabeledExample,8);
    let unnamedButtons=0,buttonExample=null;
    for(const control of Array.from(document.querySelectorAll('button,[role="button"]'))){
      if(!isVisible(control))continue;
      if(!(control.getAttribute('aria-label')||control.getAttribute('aria-labelledby')||textOf(control))){unnamedButtons++;buttonExample=buttonExample||control;}
    }
    if(unnamedButtons>0)addIssue(issues,seen,'unnamed-control','warning','Control needs a name',unnamedButtons+' control'+(unnamedButtons===1?' has':'s have')+' no accessible name.',buttonExample,9);
    for(const el of visible){
      const s=getComputedStyle(el);
      const background=normalizeColor(s.backgroundColor);
      if(background)paletteCounts.set(background,(paletteCounts.get(background)||0)+1);
      const hasOwnText=Array.from(el.childNodes).some(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
      const ownText=hasOwnText?String(el.textContent||'').replace(/\\s+/g,' ').trim():'';
      if(hasOwnText){
        const foreground=normalizeColor(s.color);
        if(foreground)paletteCounts.set(foreground,(paletteCounts.get(foreground)||0)+1);
      }
      const rect=el.getBoundingClientRect();
      const area=Math.max(0,rect.width*rect.height);
      if(hasOwnText&&ownText.length>=2&&ownText.length<=64){
        const family=s.fontFamily.split(',')[0].replace(/["']/g,'').trim();
        if(family)fontCounts.set(family,(fontCounts.get(family)||0)+1);
        const fontSize=parseFloat(s.fontSize)||0;
        const tracking=parseFloat(s.letterSpacing)||0;
        const letters=ownText.match(/[A-Za-z]/g)||[];
        const isUppercase=
          (s.textTransform==='uppercase'&&letters.length>0)||
          (letters.length>0&&ownText===ownText.toUpperCase());
        if(fontSize<=12&&isUppercase&&(tracking>=0.15||ownText.length<=28)){
          microLabelCount+=1;
          microLabelExample=microLabelExample||el;
        }
        if(/^(?:0?[1-9]|1[0-9])(?:\\s*[./·:—-]|\\s*$)/.test(ownText)){
          indexLabelCount+=1;
          indexLabelExample=indexLabelExample||el;
        }
      }
      if(area>=targetWidth*targetHeight*0.08&&s.backgroundImage&&s.backgroundImage.includes('gradient')){
        gradientCount+=1;
        gradientExample=gradientExample||el;
        if(area>=targetWidth*targetHeight*0.2)largeGradient=true;
      }
      if(area>=500&&s.boxShadow&&s.boxShadow!=='none'&&!['fixed','absolute','sticky'].includes(s.position)){
        staticShadowCount+=1;
        staticShadowExample=staticShadowExample||el;
      }
      if(
        ['DIV','ARTICLE','LI'].includes(el.tagName)&&
        area>=6000&&
        el.children.length>=2&&
        el.children.length<=8
      ){
        const parentStyle=el.parentElement?getComputedStyle(el.parentElement):null;
        const radius=parseFloat(s.borderRadius)||0;
        const opaque=s.backgroundColor&&!['transparent','rgba(0, 0, 0, 0)'].includes(s.backgroundColor);
        if(radius>=10&&opaque&&parentStyle&&/(?:grid|flex)/.test(parentStyle.display)){
          const signature=Math.round(radius/4)*4+'|'+s.backgroundColor;
          const group=cardGroups.get(signature)||{count:0,element:el};
          group.count+=1;
          cardGroups.set(signature,group);
          cardExample=cardExample||el;
        }
      }
    }
    if(microLabelCount>=3)addIssue(issues,seen,'micro-label-stack','warning','Decorative uppercase labels',microLabelCount+' tiny tracked uppercase labels are used across the page. Fold this information into readable sentence-case headings or remove it.',microLabelExample,10);
    if(indexLabelCount>=3)addIssue(issues,seen,'decorative-numbering','warning','Decorative numbering',indexLabelCount+' numbered markers appear without a real sequence. Use position, scale or an actual list instead.',indexLabelExample,11);
    if(gradientCount>=2||largeGradient)addIssue(issues,seen,'decorative-gradient','warning','Decorative gradient',gradientCount+' large gradient surface'+(gradientCount===1?' is':'s are')+' used as styling. Keep gradients only for a real data encoding or a neutral photo scrim.',gradientExample,12);
    if(staticShadowCount>=3)addIssue(issues,seen,'static-shadow','warning','Shadows on resting surfaces',staticShadowCount+' non-floating surfaces use box shadows. Use a tone step or a border instead.',staticShadowExample,13);
    const repeatedCards=Array.from(cardGroups.values()).find((group)=>group.count>=3);
    if(repeatedCards)addIssue(issues,seen,'card-kit','warning','Repeated card treatment',repeatedCards.count+' content containers share the same radius and fill. Replace the generic card row with a composition that follows the content.',repeatedCards.element,14);
    const sectionSignatures=new Map();
    for(const section of sections){
      const sectionRect=section.getBoundingClientRect();
      const heading=section.querySelector('h2,h3');
      const headingMode=heading?Math.round((heading.getBoundingClientRect().left-sectionRect.left)/20)*20:-1;
      const directChildren=Array.from(section.children).filter((child)=>{
        const childRect=child.getBoundingClientRect();
        return childRect.width>20&&childRect.height>20;
      });
      const mediaCount=section.querySelectorAll('img,picture,video').length;
      const style=getComputedStyle(section);
      const signature=[
        style.display,
        headingMode,
        directChildren.length,
        mediaCount>0?'media':'text',
        sectionRect.width>targetWidth*0.8?'wide':'contained'
      ].join('|');
      const group=sectionSignatures.get(signature)||{count:0,element:section};
      group.count+=1;
      sectionSignatures.set(signature,group);
    }
    const repeatedSection=Array.from(sectionSignatures.values()).find((group)=>group.count>=3);
    if(repeatedSection)addIssue(issues,seen,'repeated-section-rhythm','warning','Repeated section structure',repeatedSection.count+' sections share the same alignment, direct-child count and media rhythm. Give the argument a different physical shape instead of repeating one block.',repeatedSection.element,15);
    if(fontCounts.size>2)addIssue(issues,seen,'typeface-count','warning','Too many typefaces',fontCounts.size+' typeface families carry text. Reduce the system to one family or two clearly separated roles.',document.body,16);
    if(viewport==='desktop'&&images.length===0&&sections.length>=4&&doc.scrollHeight>=2500)addIssue(issues,seen,'text-only-composition','warning','Text-only composition',sections.length+' long sections use no image or product evidence. Use real subject material when it exists, or give the page a stronger content-led visual argument.',document.body,17);
    const h1Element=document.querySelector('h1');
    const firstSection=sections[0]||null;
    const h1Style=h1Element?getComputedStyle(h1Element):null;
    const bodyStyle=getComputedStyle(document.body);
    const bodyLuminance=colorLuminance(bodyStyle.backgroundColor);
    const background=bodyLuminance===null?'unknown':bodyLuminance<0.3?'dark':bodyLuminance>0.75?'light':'mid';
    const h1Kind=h1Style?fontKind(h1Style.fontFamily):'sans';
    const bodyKind=fontKind(bodyStyle.fontFamily);
    const typography=h1Kind===bodyKind?h1Kind:h1Kind+'-display';
    const sectionRect=firstSection?firstSection.getBoundingClientRect():null;
    const h1Rect=h1Element?h1Element.getBoundingClientRect():null;
    const sectionArea=sectionRect?Math.max(1,sectionRect.width*sectionRect.height):1;
    const largestVisual=firstSection?Array.from(firstSection.querySelectorAll('img,picture,video,svg'))
      .filter(isVisible)
      .map((element)=>({element,rect:element.getBoundingClientRect()}))
      .sort((left,right)=>right.rect.width*right.rect.height-left.rect.width*left.rect.height)[0]:null;
    const largeVisual=Boolean(largestVisual&&(
      largestVisual.rect.width*largestVisual.rect.height>=sectionArea*0.12||
      (sectionRect&&largestVisual.rect.width>=sectionRect.width*0.32)
    ));
    const centered=Boolean(h1Rect&&sectionRect&&Math.abs((h1Rect.left+h1Rect.width/2)-(sectionRect.left+sectionRect.width/2))<sectionRect.width*0.1);
    const sideVisual=Boolean(
      largestVisual&&
      h1Rect&&
      largestVisual.rect.left>h1Rect.right-12&&
      largestVisual.rect.top<h1Rect.bottom&&
      largestVisual.rect.bottom>h1Rect.top
    );
    const hero=!h1Rect?'text':
      largestVisual&&sectionRect&&largestVisual.rect.width>=sectionRect.width*0.65?'full-media':
      (largeVisual||sideVisual)?'split':
      centered?'centered':'stacked';
    const svgCount=document.querySelectorAll('svg').length;
    const media=images.length>0&&svgCount>0?'mixed':images.length>0?'photo':svgCount>0?'graphic':'none';
    const bodyWords=(document.body.innerText||'').trim().split(/\\s+/).filter(Boolean).length;
    const wordsPerSection=sections.length>0?bodyWords/sections.length:bodyWords;
    const density=wordsPerSection<75?'sparse':wordsPerSection>180?'dense':'balanced';
    const fingerprint={hero,media,typography,background,density,sectionCount:sections.length};
    const palette=Array.from(paletteCounts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,7).map(x=>x[0]);
    const fonts=Array.from(fontCounts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0]);
    parent.postMessage({channel:${JSON.stringify(AUDIT_CHANNEL)},token,result:{viewport,width:${width},issues,nodeCount:all.length,headingCount:document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,interactiveCount:document.querySelectorAll('button,a[href],input,select,textarea,[role="button"]').length,imageCount:images.length,palette,fonts,fingerprint}},'*');
  }catch(error){
    parent.postMessage({channel:${JSON.stringify(AUDIT_CHANNEL)},token,error:String(error&&error.message||error).slice(0,240)},'*');
  }
};
const withUnit=(n)=>n+'px';
window.addEventListener('load',()=>setTimeout(run,80),{once:true});
setTimeout(run,1600);
})();</script>`
}

function sanitizeIssue(value: unknown, viewport: DesignViewport): DesignIssue | null {
  if (!value || typeof value !== 'object') return null
  const issue = value as Record<string, unknown>
  if (typeof issue.title !== 'string' || typeof issue.detail !== 'string') return null
  return {
    id: typeof issue.id === 'string' ? issue.id.slice(0, 120) : `${viewport}-issue`,
    viewport,
    severity: issue.severity === 'error' ? 'error' : 'warning',
    rule: typeof issue.rule === 'string' ? issue.rule.slice(0, 60) : 'review',
    title: issue.title.slice(0, 120),
    detail: issue.detail.slice(0, 280),
    selector: typeof issue.selector === 'string' ? issue.selector.slice(0, 120) : undefined
  }
}

function sanitizeFingerprint(
  value: unknown
): DesignViewportAudit['fingerprint'] {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const text = (input: unknown, limit: number): string =>
    typeof input === 'string'
      ? input.replace(/\s+/g, ' ').trim().slice(0, limit)
      : ''
  const hero = text(record.hero, 40)
  const media = text(record.media, 40)
  const typography = text(record.typography, 60)
  const background = text(record.background, 40)
  const density = text(record.density, 40)
  if (!hero || !media || !typography || !background || !density) {
    return undefined
  }
  return {
    hero,
    media,
    typography,
    background,
    density,
    sectionCount:
      typeof record.sectionCount === 'number' &&
      Number.isFinite(record.sectionCount)
        ? Math.max(0, Math.min(40, Math.round(record.sectionCount)))
        : 0
  }
}

function sanitizeViewportAudit(
  value: unknown,
  viewport: DesignViewport,
  width: number
): DesignViewportAudit {
  const result = value && typeof value === 'object' ? (value as RawViewportAudit) : {}
  const issues = Array.isArray(result.issues)
    ? result.issues
        .slice(0, 18)
        .map((issue) => sanitizeIssue(issue, viewport))
        .filter((issue): issue is DesignIssue => Boolean(issue))
    : []
  const number = (candidate: unknown): number =>
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
      ? Math.round(candidate)
      : 0

  return {
    viewport,
    width,
    issues,
    nodeCount: number(result.nodeCount),
    headingCount: number(result.headingCount),
    interactiveCount: number(result.interactiveCount),
    imageCount: number(result.imageCount),
    fingerprint: sanitizeFingerprint(result.fingerprint)
  }
}

function runViewportAudit(
  html: string,
  viewport: DesignViewport,
  width: number,
  height: number
): Promise<RawViewportAudit> {
  const token = crypto.randomUUID()
  const iframe = document.createElement('iframe')
  const host = document.createElement('div')
  host.style.cssText =
    'position:fixed;left:-20000px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;'
  iframe.setAttribute('sandbox', 'allow-scripts')
  iframe.setAttribute('tabindex', '-1')
  iframe.setAttribute('title', `Kern ${viewport} review`)
  iframe.style.cssText = `width:${width}px;height:${height}px;border:0;`
  host.appendChild(iframe)
  document.body.appendChild(host)

  return new Promise((resolve) => {
    let settled = false
    const finish = (value: RawViewportAudit): void => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      iframe.remove()
      host.remove()
      resolve(value)
    }
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== iframe.contentWindow) return
      const data = event.data
      if (!data || typeof data !== 'object') return
      const message = data as Record<string, unknown>
      if (message.channel !== AUDIT_CHANNEL || message.token !== token) return
      if (message.error) {
        finish({
          issues: [
            {
              id: `${viewport}-audit-error`,
              viewport,
              severity: 'warning',
              rule: 'audit-incomplete',
              title: 'Review did not finish',
              detail: String(message.error).slice(0, 240)
            }
          ]
        })
        return
      }
      finish(
        message.result && typeof message.result === 'object'
          ? (message.result as RawViewportAudit)
          : {}
      )
    }
    const timeout = window.setTimeout(() => {
      finish({
        issues: [
          {
            id: `${viewport}-audit-timeout`,
            viewport,
            severity: 'warning',
            rule: 'audit-incomplete',
            title: 'Review timed out',
            detail: 'The rendered page did not settle in time for measurement.'
          }
        ]
      })
    }, 8000)

    window.addEventListener('message', onMessage)
    iframe.srcdoc = `${html}\n${auditScript(token, viewport, width, height)}`
  })
}

export async function auditDesign(html: string, revision: number): Promise<DesignAudit> {
  if (!html.trim()) throw new Error('There is no rendered design to review.')
  const rawResults = await Promise.all(
    auditViewports.map((viewport) =>
      runViewportAudit(
        html,
        viewport.id,
        viewport.width,
        viewport.height
      )
    )
  )
  const viewports = rawResults.map((result, index) => {
    const viewport = auditViewports[index]
    if (!viewport) throw new Error('The review viewport is unavailable.')
    return sanitizeViewportAudit(result, viewport.id, viewport.width)
  })
  const palette = Array.from(
    new Set(
      rawResults.flatMap((result) =>
        Array.isArray(result.palette)
          ? result.palette.filter(
              (color): color is string =>
                typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)
            )
          : []
      )
    )
  ).slice(0, 7)
  const fonts = Array.from(
    new Set(
      rawResults.flatMap((result) =>
        Array.isArray(result.fonts)
          ? result.fonts.filter(
              (font): font is string =>
                typeof font === 'string' && font.trim().length > 0
            )
          : []
      )
    )
  ).slice(0, 4)
  const issues = viewports.flatMap((viewport) => viewport.issues)

  return {
    createdAt: new Date().toISOString(),
    revision,
    mode: 'website',
    issueCount: groupDesignIssues(issues).length,
    issues,
    viewports,
    palette,
    fonts
  }
}

function artifactIssue(
  viewport: DesignViewport,
  rule: string,
  severity: DesignIssue['severity'],
  title: string,
  detail: string
): DesignIssue {
  return {
    id: `${viewport}-${rule}`,
    viewport,
    severity,
    rule,
    title,
    detail
  }
}

async function auditVectorDesign(
  html: string,
  revision: number,
  mode: 'logo' | 'vector'
): Promise<DesignAudit> {
  const documentNode = new DOMParser().parseFromString(html, 'text/html')
  const svg = documentNode.querySelector('svg')
  const issues: DesignIssue[] = []
  const add = (
    rule: string,
    severity: DesignIssue['severity'],
    title: string,
    detail: string
  ): void => {
    issues.push(artifactIssue('desktop', rule, severity, title, detail))
  }

  if (!svg) {
    add(
      'svg-root',
      'error',
      'SVG root missing',
      'The generated artifact does not contain a standalone <svg> root.'
    )
  } else {
    if (!svg.getAttribute('viewBox')) {
      add(
        'svg-viewbox',
        'warning',
        'ViewBox missing',
        'Add a viewBox so the artwork scales without clipping.'
      )
    }
    if (!svg.querySelector(':scope > title')) {
      add(
        'svg-title',
        'warning',
        'Accessible title missing',
        'Add a <title> as the first child of the SVG.'
      )
    }
    if (!svg.querySelector(':scope > desc')) {
      add(
        'svg-description',
        'warning',
        'Accessible description missing',
        'Add a short <desc> explaining the mark or artwork.'
      )
    }
    const raster = svg.querySelectorAll('image,foreignObject')
    if (raster.length > 0) {
      add(
        'svg-raster',
        'error',
        'Raster or embedded HTML found',
        `${raster.length} raster or foreignObject element${
          raster.length === 1 ? ' is' : 's are'
        } embedded. Keep ${mode} artwork editable as pure vector shapes.`
      )
    }
    if (svg.querySelector('script')) {
      add(
        'svg-script',
        'error',
        'Script inside vector',
        'Remove scripts from exported logo and vector files.'
      )
    }
    const drawable = svg.querySelectorAll(
      'path,circle,rect,line,polyline,polygon,ellipse,text'
    )
    if (drawable.length < 2) {
      add(
        'svg-complexity',
        'warning',
        'Artwork looks incomplete',
        'The SVG contains very little drawable geometry.'
      )
    }
    const externalReferences = Array.from(
      svg.querySelectorAll('[href], [xlink\\:href]')
    ).filter((element) => {
      const href =
        element.getAttribute('href') ?? element.getAttribute('xlink:href') ?? ''
      return Boolean(href) && !href.startsWith('#')
    })
    if (externalReferences.length > 0) {
      add(
        'svg-external-reference',
        'warning',
        'External vector dependency',
        'Inline referenced shapes so the SVG remains standalone.'
      )
    }
  }

  const colors = new Set<string>()
  if (svg) {
    for (const element of Array.from(svg.querySelectorAll('*'))) {
      for (const attribute of ['fill', 'stroke', 'stop-color']) {
        const value = element.getAttribute(attribute)
        if (value && value !== 'none' && value !== 'currentColor') {
          colors.add(value)
        }
      }
    }
  }
  const viewport: DesignViewportAudit = {
    viewport: 'desktop',
    width: mode === 'logo' ? 1000 : 1200,
    issues,
    nodeCount: svg?.querySelectorAll('*').length ?? 0,
    headingCount: svg?.querySelectorAll('title').length ?? 0,
    interactiveCount: 0,
    imageCount: svg?.querySelectorAll('image').length ?? 0,
    fingerprint: fingerprintArtifactDesign(html, mode)
  }
  return {
    createdAt: new Date().toISOString(),
    revision,
    mode,
    issueCount: issues.length,
    issues,
    viewports: [viewport],
    palette: Array.from(colors).slice(0, 7),
    fonts: []
  }
}

async function auditMotionDesign(
  html: string,
  revision: number
): Promise<DesignAudit> {
  const issues: DesignIssue[] = []
  const add = (
    rule: string,
    severity: DesignIssue['severity'],
    title: string,
    detail: string
  ): void => {
    issues.push(artifactIssue('desktop', rule, severity, title, detail))
  }
  const canvasCount = (html.match(/<canvas\b/gi) ?? []).length
  const runtime = canvasCount === 1 && /window\.KERN_MOTION\s*=/.test(html)
    ? await runMotionRuntimeAudit(html)
    : null
  if (canvasCount !== 1) {
    add(
      'motion-canvas',
      'error',
      'Canvas stage missing',
      canvasCount === 0
        ? 'Motion mode requires one visible canvas.'
        : `Motion mode requires exactly one canvas; found ${canvasCount}.`
    )
  }
  if (!/window\.KERN_MOTION\s*=/.test(html)) {
    add(
      'motion-api',
      'error',
      'Motion API missing',
      'Expose window.KERN_MOTION for deterministic playback and export.'
    )
  }
  if (!/\brenderAt\s*[:(]/.test(html) && !runtime?.readable) {
    add(
      'motion-render-at',
      'error',
      'Timeline renderer missing',
      'Expose renderAt(time) so exported frames are deterministic.'
    )
  }
  if (
    /<audio\b|<video\b|AudioContext|new\s+Audio\s*\(|\.mp3\b|\.wav\b|\.m4a\b/i.test(
      html
    )
  ) {
    add(
      'motion-audio',
      'error',
      'Audio or media dependency found',
      'Motion exports must remain silent and self-contained. Remove audio, video files and Web Audio usage.'
    )
  }
  if (/<script\b[^>]*\bsrc\s*=/i.test(html)) {
    add(
      'motion-external-script',
      'error',
      'External script found',
      'Motion mode must use inline vanilla JavaScript only.'
    )
  }
  if (
    /<link\b[^>]*\brel\s*=\s*['"]?stylesheet/i.test(html) ||
    /@import\s+(?:url\()?/i.test(html)
  ) {
    add(
      'motion-external-style',
      'error',
      'External stylesheet found',
      'Motion mode must keep all styling inline so the exported timeline is self-contained.'
    )
  }
  if (
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/.test(html)
  ) {
    add(
      'motion-network',
      'warning',
      'Network dependency found',
      'Motion playback and export should not depend on a live network request.'
    )
  }
  for (const method of ['play', 'pause', 'seek'] as const) {
    const runtimeHasMethod = runtime?.[method] === true
    const sourceHasMethod = new RegExp(`\\b${method}\\s*\\(`).test(html)
    const methodAvailable = runtime?.readable
      ? runtimeHasMethod
      : sourceHasMethod
    if (!methodAvailable) {
      add(
        `motion-${method}`,
        'warning',
        `Timeline ${method} control missing`,
        `Expose ${method} in window.KERN_MOTION so the preview transport and exported frames stay synchronized.`
      )
    }
  }
  if (runtime?.readable) {
    const ratios = runtime.inkRatios ?? []
    const signatures = runtime.signatures ?? []
    const colorCounts = runtime.colorCounts ?? []
    if (
      colorCounts.length > 0 &&
      colorCounts.every((count) => count <= 1)
    ) {
      add(
        'motion-blank-timeline',
        'error',
        'Timeline frames are blank',
        'The opening, middle and closing samples contain only a flat background. Render a composed frame at every checkpoint.'
      )
    } else if (ratios.length > 0 && ratios.every((ratio) => ratio < 0.0015)) {
      add(
        'motion-blank-timeline',
        'error',
        'Timeline frames are blank',
        'The opening, middle and closing samples contain no visible canvas content. Render a composed frame at every checkpoint.'
      )
    } else if (
      signatures.length >= 3 &&
      signatures[0] === signatures[1] &&
      signatures[1] === signatures[2]
    ) {
      add(
        'motion-static-timeline',
        'warning',
        'Timeline does not change',
        'The opening, middle and closing frames are identical. Move one idea meaningfully through time or remove the motion treatment.'
      )
    }
  } else if (runtime?.error && canvasCount === 1 && /window\.KERN_MOTION\s*=/.test(html)) {
    add(
      'motion-runtime-review',
      'warning',
      'Timeline could not be sampled',
      runtime.error
    )
  }
  const durationMatch = /\bduration\s*:\s*([\d.]+)/i.exec(html)
  const fpsMatch = /\bfps\s*:\s*([\d.]+)/i.exec(html)
  if (durationMatch) {
    const duration = Number.parseFloat(durationMatch[1] ?? '')
    if (!Number.isFinite(duration) || duration < 3 || duration > 15) {
      add(
        'motion-duration',
        'warning',
        'Timeline duration outside range',
        'Keep silent motion clips between 3 and 15 seconds.'
      )
    }
  }
  if (fpsMatch) {
    const fps = Number.parseFloat(fpsMatch[1] ?? '')
    if (!Number.isFinite(fps) || fps < 24 || fps > 60) {
      add(
        'motion-fps',
        'warning',
        'Frame rate outside range',
        'Use a frame rate between 24 and 60 fps.'
      )
    }
  }
  return {
    createdAt: new Date().toISOString(),
    revision,
    mode: 'motion',
    issueCount: issues.length,
    issues,
    viewports: [
      {
        viewport: 'desktop',
        width: 1280,
        issues,
        nodeCount: (html.match(/<[a-z][^>]*>/gi) ?? []).length,
        headingCount: 0,
        interactiveCount: 0,
        imageCount: (html.match(/<img\b/gi) ?? []).length,
        fingerprint: fingerprintArtifactDesign(html, 'motion')
      }
    ],
    palette: [],
    fonts: []
  }
}

export async function auditArtifactDesign(
  html: string,
  revision: number,
  mode: DesignMode
): Promise<DesignAudit> {
  if (mode === 'logo' || mode === 'vector') {
    return auditVectorDesign(html, revision, mode)
  }
  if (mode === 'motion') {
    return auditMotionDesign(html, revision)
  }
  return auditDesign(html, revision)
}

export function mergeRuntimeArtifactReport(
  audit: DesignAudit,
  runtime: ArtifactRuntimeReport
): DesignAudit {
  const runtimeIssues: DesignIssue[] = runtime.issues.map((issue, index) => ({
    id: `${issue.viewport}-${issue.rule}-workspace-${index}`,
    viewport: issue.viewport,
    severity: issue.severity,
    rule: issue.rule,
    title: issue.title,
    detail: issue.detail,
    selector: issue.selector
  }))
  const issues = [...audit.issues, ...runtimeIssues]
  return {
    ...audit,
    issueCount: groupDesignIssues(issues).length,
    issues,
    viewports: audit.viewports.map((viewport) => ({
      ...viewport,
      issues: [
        ...viewport.issues,
        ...runtimeIssues.filter(
          (issue) => issue.viewport === viewport.viewport
        )
      ]
    })),
    runtime,
    screenshots: runtime.screenshots
  }
}

export async function fingerprintDesign(
  html: string
): Promise<DesignAudit['viewports'][number]['fingerprint']> {
  if (!html.trim()) return undefined
  const result = await runViewportAudit(html, 'desktop', 1440, 1000)
  return sanitizeFingerprint(result.fingerprint)
}

export interface GroupedDesignIssue {
  key: string
  issue: DesignIssue
  viewports: DesignViewport[]
}

export function groupDesignIssues(issues: DesignIssue[]): GroupedDesignIssue[] {
  const groups = new Map<string, GroupedDesignIssue>()
  for (const issue of issues) {
    const key = [issue.rule, issue.title, issue.detail, issue.selector ?? ''].join('|')
    const existing = groups.get(key)
    if (existing) {
      if (!existing.viewports.includes(issue.viewport)) {
        existing.viewports.push(issue.viewport)
      }
    } else {
      groups.set(key, {
        key,
        issue,
        viewports: [issue.viewport]
      })
    }
  }
  return Array.from(groups.values()).sort((left, right) => {
    if (left.issue.severity !== right.issue.severity) {
      return left.issue.severity === 'error' ? -1 : 1
    }
    return left.issue.title.localeCompare(right.issue.title)
  })
}

export function formatAuditForAgent(audit: DesignAudit): string {
  if (audit.issueCount === 0) {
    return 'The local rendered-artifact review found no measurable structural, accessibility, artifact-integrity or repeated-design-pattern issues.'
  }
  return groupDesignIssues(audit.issues)
    .slice(0, 14)
    .map(
      ({ issue, viewports }) =>
        `[${viewports.join(', ')}] ${issue.title}: ${issue.detail}${
          issue.selector ? ` Selector: ${issue.selector}.` : ''
        }`
    )
    .join('\n')
}
