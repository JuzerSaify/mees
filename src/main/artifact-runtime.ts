import { BrowserWindow, session } from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  ArtifactRuntimeIssue,
  ArtifactRuntimeReport,
  DesignMode,
  DesignScreenshot,
  DesignViewport
} from '../shared/types'
import {
  ASSET_PROTOCOL,
  assetFileNameFromUrl,
  type AssetStore
} from './asset-store'

const runtimeViewports: Array<{
  viewport: DesignViewport
  width: number
  height: number
}> = [
  { viewport: 'desktop', width: 1440, height: 1000 },
  { viewport: 'tablet', width: 834, height: 1000 },
  { viewport: 'mobile', width: 390, height: 844 }
]

interface PageMeasurement {
  issues?: ArtifactRuntimeIssue[]
  timing?: number
  document?: ArtifactRuntimeReport['document']
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function uniqueMessages(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    )
  ).slice(0, 24)
}

async function registerRuntimeProtocol(
  runtimeSession: Electron.Session,
  assets: AssetStore
): Promise<void> {
  try {
    runtimeSession.protocol.handle(ASSET_PROTOCOL, async (request) => {
      const fileName = assetFileNameFromUrl(request.url)
      const asset = fileName ? await assets.read(fileName) : null
      if (!asset) return new Response('Asset not found', { status: 404 })
      return new Response(asset.bytes, {
        status: 200,
        headers: {
          'Content-Type': asset.contentType,
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      })
    })
  } catch {
    // A repeated runtime session may already have the protocol registered.
  }
}

async function measurePage(
  window: BrowserWindow,
  viewport: DesignViewport,
  mode: DesignMode
): Promise<PageMeasurement> {
  return (await window.webContents.executeJavaScript(
    `(async()=>{
      const viewport=${JSON.stringify(viewport)};
      const mode=${JSON.stringify(mode)};
      const issues=[];
      const seen=new Set();
      const selectorFor=(element)=>{
        if(!element||!element.tagName)return '';
        const tag=element.tagName.toLowerCase();
        if(element.id)return tag+'#'+String(element.id).slice(0,48);
        const classes=String(element.className||'').trim().split(/\\s+/).filter(Boolean).slice(0,2);
        return tag+(classes.length?'.'+classes.join('.'):'');
      };
      const add=(rule,severity,title,detail,element)=>{
        const selector=selectorFor(element);
        const key=rule+'|'+selector+'|'+title;
        if(seen.has(key)||issues.length>=20)return;
        seen.add(key);
        issues.push({viewport,rule,severity,title,detail:String(detail).slice(0,260),selector});
      };
      const isVisible=(element)=>{
        if(!element)return false;
        const style=getComputedStyle(element);
        const rect=element.getBoundingClientRect();
        return style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)!==0&&rect.width>0&&rect.height>0;
      };
      const started=performance.now();
      if(document.fonts&&document.fonts.ready)await document.fonts.ready;
      await new Promise((resolve)=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const documentElement=document.documentElement;
      const overflow=Math.max(0,documentElement.scrollWidth-window.innerWidth);
      if(overflow>1)add('runtime-horizontal-overflow','error','Page overflows at runtime',overflow+'px beyond the '+window.innerWidth+'px viewport.',document.body);
      const images=Array.from(document.images);
      for(const image of images){
        if(isVisible(image)&&image.complete&&image.naturalWidth===0)add('runtime-broken-image','error','Image failed at runtime',image.currentSrc||image.src||'An image did not load.',image);
      }
      const missingAnchors=[];
      for(const anchor of document.querySelectorAll('a[href^="#"]')){
        if(!isVisible(anchor))continue;
        const hash=anchor.getAttribute('href')||'';
        if(hash.length<=1)continue;
        try{
          if(!document.querySelector(hash))missingAnchors.push(anchor);
        }catch{}
      }
      if(missingAnchors.length)add('runtime-dead-anchor','error','Navigation target missing',missingAnchors.length+' same-page link'+(missingAnchors.length===1?' points':'s point')+' to an element that does not exist.',missingAnchors[0]);
      const unnamed=[];
      for(const control of document.querySelectorAll('button,[role="button"]')){
        if(!isVisible(control))continue;
        const name=control.getAttribute('aria-label')||control.getAttribute('aria-labelledby')||String(control.textContent||'').trim();
        if(!name)unnamed.push(control);
      }
      if(unnamed.length)add('runtime-unnamed-control','warning','Control has no accessible name',unnamed.length+' visible control'+(unnamed.length===1?' needs':'s need')+' a name at runtime.',unnamed[0]);
      let smallTargets=0,smallTarget=null;
      if(viewport!=='desktop'){
        for(const control of document.querySelectorAll('button,a[href],input,select,textarea,[role="button"]')){
          if(!isVisible(control))continue;
          const rect=control.getBoundingClientRect();
          if(rect.width<32||rect.height<32){smallTargets+=1;smallTarget=smallTarget||control;}
        }
        if(smallTargets)add('runtime-tap-target','warning','Touch target is too small',smallTargets+' control'+(smallTargets===1?' is':'s are')+' below 32px.',smallTarget);
      }
      if(mode==='logo'||mode==='vector'){
        const svg=document.querySelector('svg');
        if(!svg){
          add('runtime-svg-root','error','SVG root missing','The rendered ${mode} artifact contains no SVG document.',document.body);
        }else{
          const rect=svg.getBoundingClientRect();
          if(!isVisible(svg)||rect.width<24||rect.height<24)add('runtime-svg-visibility','error','SVG is not visible','The SVG exists but has no visible rendering area.',svg);
          if(!svg.getAttribute('viewBox'))add('runtime-svg-viewbox','warning','SVG viewBox missing','The rendered SVG does not define a scalable viewBox.',svg);
          if(!svg.querySelector(':scope > title'))add('runtime-svg-title','warning','SVG title missing','Add an accessible title inside the SVG root.',svg);
          if(!svg.querySelector(':scope > desc'))add('runtime-svg-description','warning','SVG description missing','Add a short description inside the SVG root.',svg);
          const raster=svg.querySelectorAll('image,foreignObject');
          if(raster.length)add('runtime-svg-raster','error','Raster content inside vector artifact',raster.length+' raster or foreignObject element'+(raster.length===1?' is':'s are')+' embedded in the SVG.',raster[0]);
        }
      }
      if(mode==='motion'){
        const canvas=document.querySelector('canvas');
        const motion=window.MEES_MOTION;
        if(!canvas){
          add('runtime-motion-canvas','error','Motion canvas missing','The rendered motion artifact contains no canvas.',document.body);
        }else if(!isVisible(canvas)||canvas.width<32||canvas.height<18){
          add('runtime-motion-stage','error','Motion stage is not visible','The canvas needs a measurable rendered stage.',canvas);
        }
        if(!motion||typeof motion!=='object'){
          add('runtime-motion-api','error','Motion API missing','The page does not expose window.MEES_MOTION.',document.body);
        }else{
          for(const method of ['renderAt','play','pause','seek']){
            if(typeof motion[method]!=='function')add('runtime-motion-'+method,'error','Motion '+method+' control missing','window.MEES_MOTION.'+method+' must be callable.',canvas);
          }
          const media=document.querySelectorAll('audio,video');
          if(media.length)add('runtime-motion-media','error','Embedded audio or video found',media.length+' media element'+(media.length===1?' exists':'s exist')+' inside the deterministic motion artifact.',media[0]);
          if(canvas&&typeof motion.renderAt==='function'){
            try{
              const width=Math.max(1,Math.round(canvas.width||motion.width||1280));
              const height=Math.max(1,Math.round(canvas.height||motion.height||720));
              const duration=Math.max(0.1,Number(motion.duration)||6);
              const context=canvas.getContext('2d',{willReadFrequently:true});
              if(!context){
                add('runtime-motion-unreadable','warning','Motion frames are unreadable','The canvas does not expose a readable 2D frame buffer.',canvas);
              }else{
                const samples=[];
                const colorCounts=[];
                let minInk=1;
                for(const time of [0,duration/2,duration]){
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
                  const ratio=sampled?inked/sampled:0;
                  minInk=Math.min(minInk,ratio);
                  colorCounts.push(colorBuckets.size);
                  samples.push(hash.toString(16));
                }
                if(colorCounts.every((count)=>count<=1))add('runtime-motion-blank','error','Motion canvas is blank','The opening, middle and ending frames contain only a flat background.',canvas);
                else if(minInk<0.0015)add('runtime-motion-blank','error','Motion canvas is blank','At least one opening, middle or ending frame contains no visible canvas content.',canvas);
                if(new Set(samples).size===1)add('runtime-motion-static','warning','Motion canvas does not change','The opening, middle and ending frames are identical.',canvas);
                motion.renderAt(0);
              }
            }catch(error){
              add('runtime-motion-sample','error','Motion timeline could not be sampled',String(error&&error.message||error).slice(0,240),canvas);
            }
          }
        }
      }
      const documentTitle=String(document.title||document.querySelector('svg > title')?.textContent||'').replace(/\\s+/g,' ').trim().slice(0,180);
      const headings=Array.from(document.querySelectorAll('h1,h2,h3')).filter(isVisible).map((node)=>String(node.textContent||'').replace(/\\s+/g,' ').trim().slice(0,140)).filter(Boolean).slice(0,12);
      const landmarks=Array.from(document.querySelectorAll('main,nav,header,footer,aside,section[aria-label],[role="main"],[role="navigation"]')).filter(isVisible).map((node)=>node.getAttribute('aria-label')||node.getAttribute('role')||node.tagName.toLowerCase()).slice(0,16);
      return {
        issues,
        timing:Math.round(performance.now()-started),
        document:{
          title:documentTitle,
          language:String(document.documentElement.lang||''),
          headings,
          landmarks,
          controls:document.querySelectorAll('button,a[href],input,select,textarea,[role="button"]').length,
          links:document.querySelectorAll('a[href]').length,
          images:images.length,
          forms:document.querySelectorAll('form').length
        }
      };
    })()`,
    true
  )) as PageMeasurement
}

async function captureViewport(
  html: string,
  viewport: DesignViewport,
  width: number,
  height: number,
  mode: DesignMode,
  assets: AssetStore
): Promise<{
  issues: ArtifactRuntimeIssue[]
  consoleErrors: string[]
  pageErrors: string[]
  networkFailures: string[]
  screenshot?: DesignScreenshot
  document?: ArtifactRuntimeReport['document']
}> {
  const partition = `mees-runtime-${randomUUID()}`
  const runtimeSession = session.fromPartition(partition, { cache: false })
  await registerRuntimeProtocol(runtimeSession, assets)
  const window = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    show: false,
    skipTaskbar: true,
    backgroundColor: mode === 'motion' ? '#000000' : '#ffffff',
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: true,
      backgroundThrottling: false,
      offscreen: true
    }
  })

  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const networkFailures: string[] = []
  const onConsole = (
    _event: Electron.Event,
    level: number,
    message: string,
    line: number,
    sourceId: string
  ): void => {
    if (level < 2) return
    if (/Electron Security Warning/i.test(message)) return
    if (/willReadFrequently/i.test(message)) return
    consoleErrors.push(
      `${message.slice(0, 360)}${
        sourceId ? ` (${sourceId.slice(0, 160)}:${line})` : ''
      }`
    )
  }
  const onFailedLoad = (
    _event: Electron.Event,
    code: number,
    description: string,
    url: string
  ): void => {
    if (code === -3) return
    networkFailures.push(
      `${description || 'Load failed'} (${code}) ${url.slice(0, 260)}`
    )
  }
  window.webContents.on('console-message', onConsole)
  window.webContents.on('did-fail-load', onFailedLoad)

  try {
    await window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
    )
    await delay(mode === 'motion' ? 900 : 480)
    const measured = await measurePage(window, viewport, mode)
    const image = await window.webContents.capturePage()
    const stored = await assets.saveBytes(
      image.toPNG(),
      'image/png',
      'screenshot'
    )
    return {
      issues: Array.isArray(measured.issues) ? measured.issues : [],
      consoleErrors,
      pageErrors,
      networkFailures,
      screenshot: {
        viewport,
        width,
        height,
        assetUrl: stored.token,
        createdAt: new Date().toISOString()
      },
      document: measured.document
    }
  } catch (error) {
    pageErrors.push(
      error instanceof Error
        ? error.message.slice(0, 500)
        : 'The rendered artifact could not be inspected.'
    )
    return { issues: [], consoleErrors, pageErrors, networkFailures }
  } finally {
    window.webContents.removeListener('console-message', onConsole)
    window.webContents.removeListener('did-fail-load', onFailedLoad)
    if (!window.isDestroyed()) window.destroy()
    try {
      runtimeSession.protocol.unhandle(ASSET_PROTOCOL)
    } catch {
      // The ephemeral runtime session may already be gone.
    }
    void runtimeSession.clearStorageData().catch(() => undefined)
  }
}

export async function captureArtifactRuntime(
  html: string,
  mode: DesignMode,
  assets: AssetStore
): Promise<ArtifactRuntimeReport> {
  const startedAt = Date.now()
  const viewports =
    mode === 'website'
      ? runtimeViewports
      : [
          {
            viewport: 'desktop' as const,
            width: mode === 'motion' ? 1280 : mode === 'logo' ? 1000 : 1200,
            height: mode === 'motion' ? 720 : mode === 'logo' ? 1000 : 900
          }
        ]
  const results = []
  for (const viewport of viewports) {
    results.push(
      await captureViewport(
        html,
        viewport.viewport,
        viewport.width,
        viewport.height,
        mode,
        assets
      )
    )
  }
  const consoleErrors = uniqueMessages(
    results.flatMap((result) => result.consoleErrors)
  )
  const pageErrors = uniqueMessages(
    results.flatMap((result) => result.pageErrors)
  )
  const networkFailures = uniqueMessages(
    results.flatMap((result) => result.networkFailures)
  )
  const runtimeIssues = results.flatMap((result) => result.issues)
  const firstDocument = results.find((result) => result.document)?.document
  if (consoleErrors.length > 0) {
    runtimeIssues.push({
      viewport: 'desktop',
      rule: 'runtime-console-error',
      severity: 'error',
      title: 'Console error in the rendered artifact',
      detail: consoleErrors.slice(0, 3).join(' | ')
    })
  }
  if (pageErrors.length > 0) {
    runtimeIssues.push({
      viewport: 'desktop',
      rule: 'runtime-page-error',
      severity: 'error',
      title: 'Rendered artifact raised an exception',
      detail: pageErrors.slice(0, 3).join(' | ')
    })
  }
  if (networkFailures.length > 0) {
    runtimeIssues.push({
      viewport: 'desktop',
      rule: 'runtime-network-failure',
      severity: 'error',
      title: 'Artifact resource failed to load',
      detail: networkFailures.slice(0, 3).join(' | ')
    })
  }
  return {
    capturedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    consoleErrors,
    pageErrors,
    networkFailures,
    issues: runtimeIssues,
    screenshots: results.flatMap((result) =>
      result.screenshot ? [result.screenshot] : []
    ),
    document: firstDocument ?? {
      title: '',
      language: '',
      headings: [],
      landmarks: [],
      controls: 0,
      links: 0,
      images: 0,
      forms: 0
    }
  }
}
