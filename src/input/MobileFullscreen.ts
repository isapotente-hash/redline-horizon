type FullscreenDocument = Document & {webkitFullscreenElement?:Element|null;webkitFullscreenEnabled?:boolean};
type FullscreenRoot = HTMLElement & {webkitRequestFullscreen?:()=>void|Promise<void>};

/** Browsers require activation: enter on the first real tap, including during loading. */
export function startMobileFullscreen(mobile:boolean):()=>void {
  const noop=()=>{};
  if(!mobile)return noop;
  const doc=document as FullscreenDocument,root=doc.documentElement as FullscreenRoot;
  const standalone=(navigator as Navigator & {standalone?:boolean}).standalone ||
    matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
  const fullscreen=()=>!!(doc.fullscreenElement||doc.webkitFullscreenElement);
  const standard=typeof root.requestFullscreen==='function';
  const request=standard
    ? ()=>root.requestFullscreen({navigationUI:'hide'})
    : typeof root.webkitRequestFullscreen==='function'?()=>root.webkitRequestFullscreen!():undefined;
  if(standalone||fullscreen()||!request||(standard?doc.fullscreenEnabled===false:doc.webkitFullscreenEnabled===false))return noop;
  const gestures=['pointerup','touchend','click'];
  let stopped=false;
  const stop=()=>{
    if(stopped)return;stopped=true;
    for(const type of gestures)window.removeEventListener(type,onGesture,true);
    doc.removeEventListener('fullscreenchange',onChange);
    doc.removeEventListener('webkitfullscreenchange',onChange);
  };
  const enter=()=>{
    if(stopped||doc.hidden||navigator.userActivation?.isActive===false)return;
    // One automatic request per visit; respect browser denial and a later manual exit.
    stop();
    try{void Promise.resolve(request()).catch(()=>{});}catch{}
  };
  const onGesture=(event:Event)=>{if(event.isTrusted)enter();};
  const onChange=()=>{if(fullscreen())stop();};
  for(const type of gestures)window.addEventListener(type,onGesture,{capture:true,passive:true});
  doc.addEventListener('fullscreenchange',onChange);
  doc.addEventListener('webkitfullscreenchange',onChange);
  // Embedded launches can arrive with activation already available.
  if(navigator.userActivation?.isActive)enter();
  return stop;
}
