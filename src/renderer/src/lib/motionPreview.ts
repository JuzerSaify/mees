export const MOTION_PREVIEW_CHANNEL = 'mees:motion-preview'

export interface MotionPreviewMetadata {
  width: number
  height: number
  duration: number
  fps: number
}

export type MotionPreviewMessage =
  | {
      channel: typeof MOTION_PREVIEW_CHANNEL
      type: 'ready' | 'state'
      metadata: MotionPreviewMetadata
      currentTime: number
      playing: boolean
    }
  | {
      channel: typeof MOTION_PREVIEW_CHANNEL
      type: 'error'
      error: string
    }

function motionPreviewRuntime(): string {
  return `<script data-mees-motion-preview-runtime>(function(){
if(window.__meesMotionPreview)return;
window.__meesMotionPreview=true;
var channel=${JSON.stringify(MOTION_PREVIEW_CHANNEL)};
var metadata={width:1280,height:720,duration:8,fps:30};
var currentTime=0;
var playing=false;
var frameHandle=0;
var startedAt=0;
var lastPostAt=0;
var attempts=0;
var motion=null;

function clamp(value,min,max){
  var number=Number(value);
  if(!Number.isFinite(number))return min;
  return Math.max(min,Math.min(max,number));
}
function post(type,extra){
  var message={channel:channel,type:type,metadata:metadata,currentTime:currentTime,playing:playing};
  if(extra){for(var key in extra){message[key]=extra[key];}}
  window.parent.postMessage(message,'*');
}
function silenceMedia(){
  document.querySelectorAll('audio').forEach(function(node){node.remove();});
  document.querySelectorAll('video').forEach(function(node){
    node.muted=true;
    node.volume=0;
    node.autoplay=false;
    node.pause();
  });
}
function render(time){
  currentTime=clamp(time,0,metadata.duration);
  motion.renderAt(currentTime);
}
function stopLoop(){
  playing=false;
  if(frameHandle){
    cancelAnimationFrame(frameHandle);
    frameHandle=0;
  }
}
function tick(now){
  if(!playing)return;
  currentTime=clamp((now-startedAt)/1000,0,metadata.duration);
  motion.renderAt(currentTime);
  if(now-lastPostAt>80){
    lastPostAt=now;
    post('state');
  }
  if(currentTime>=metadata.duration){
    stopLoop();
    post('state');
    return;
  }
  frameHandle=requestAnimationFrame(tick);
}
function play(){
  if(playing)return;
  if(currentTime>=metadata.duration-0.01)render(0);
  playing=true;
  startedAt=performance.now()-currentTime*1000;
  frameHandle=requestAnimationFrame(tick);
  post('state');
}
function pause(){
  if(!playing)return;
  stopLoop();
  post('state');
}
function seek(value){
  pause();
  render(value);
  post('state');
}
function init(){
  if(motion)return;
  motion=window.MEES_MOTION;
  var canvas=document.querySelector('canvas');
  if(!motion||!canvas||typeof motion.renderAt!=='function'){
    attempts+=1;
    if(attempts<80)setTimeout(init,50);
    else post('error',{error:'The motion timeline did not expose a renderable canvas.'});
    return;
  }
  silenceMedia();
  metadata={
    width:Math.round(clamp(canvas.width||motion.width,320,1920)),
    height:Math.round(clamp(canvas.height||motion.height,180,1080)),
    duration:clamp(motion.duration,3,15),
    fps:Math.round(clamp(motion.fps,24,60))
  };
  if(typeof motion.pause==='function')motion.pause();
  render(0);
  post('ready');
}

window.addEventListener('message',function(event){
  if(event.source!==window.parent)return;
  var data=event.data;
  if(!data||data.channel!==channel)return;
  if(data.type==='play')play();
  else if(data.type==='pause')pause();
  else if(data.type==='seek')seek(data.time);
  else if(data.type==='request-state')post('state');
});
document.addEventListener('visibilitychange',function(){
  if(document.hidden)pause();
});
window.addEventListener('load',init,{once:true});
setTimeout(init,0);
})();</script>`
}

export function injectMotionPreviewRuntime(html: string): string {
  if (!html.trim() || html.includes('data-mees-motion-preview-runtime')) {
    return html
  }
  const runtime = motionPreviewRuntime()
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${runtime}</body>`)
  }
  return `${html}\n${runtime}`
}
