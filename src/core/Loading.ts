/** Yield between construction batches so the browser can paint and animate the logo. */
export const yieldLoading=()=>new Promise<void>(resolve=>setTimeout(resolve,0));

/** Smooth display estimate. Pending work gets bounded headroom, never premature completion. */
export class LoadingDisplay {
  value=0;confirmed=0;completedAt=Infinity;
  private from=0;private lastWork:number;
  constructor(now:number){this.lastWork=now;}
  report(value:number,now:number){
    this.tick(now);
    if(!Number.isFinite(value))return;
    const next=Math.min(100,Math.max(this.confirmed,value));
    if(next===this.confirmed)return;
    this.confirmed=next;this.from=this.value;this.lastWork=now;
    if(next===100)this.completedAt=now;
  }
  /** Analytic smoothing lets the compositor and percentage use the same time curve. */
  forecast(now:number){
    const waiting=Math.max(0,now-this.lastWork);
    if(this.confirmed===100)return waiting>=300?100:100+(this.from-100)*Math.exp(-waiting/180);
    const headroom=Math.max(0,Math.min(7,99-this.confirmed));
    const ceiling=this.confirmed+headroom,decay=headroom*6000/(6000-180);
    return Math.max(this.from,ceiling-decay*Math.exp(-waiting/6000)+(this.from-ceiling+decay)*Math.exp(-waiting/180));
  }
  tick(now:number){
    this.value=Math.max(this.value,this.forecast(now));
    return this.value;
  }
}
let display:LoadingDisplay|undefined,frame:number|undefined;
let fillAnimation:Animation|undefined;
let elements:{bar:HTMLProgressElement;fill:HTMLElement|null;label:HTMLElement|null}|undefined;
let lastLabel=-1;
function paintLoading(value:number,forceFill=false){
  if(!elements)return;
  elements.bar.value=value;
  if(elements.fill&&(!fillAnimation||forceFill))elements.fill.style.transform=`scaleX(${(value/100).toFixed(5)})`;
  const percent=Math.floor(value);
  if(elements.label&&percent!==lastLabel){lastLabel=percent;elements.label.textContent=percent+'%';}
}
function animateLoadingFill(now:number){
  fillAnimation?.cancel();fillAnimation=undefined;
  const fill=elements?.fill;if(!fill||!display)return;
  fill.style.transform=`scaleX(${(display.value/100).toFixed(5)})`;
  if(typeof fill.animate!=='function'||window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  const times=[0,16,32,64,100,150,225,300,450,700,1000,1400,2000,3000,4500,6000,8000,11000,15000,22000,30000,45000,60000];
  const curve=times.map(t=>({offset:t/60000,transform:`scaleX(${(display!.forecast(now+t)/100).toFixed(5)})`}));
  // The fill keeps moving during synchronous shader/driver work, without a JS frame callback.
  fillAnimation=fill.animate(curve,{duration:60000,fill:'forwards',easing:'linear'});
}
/** Only runs during startup; the fill/stripe transforms can animate on the compositor. */
export function startLoadingProgress(){
  stopLoadingProgress();
  for(const key of Object.keys(progress) as (keyof typeof weights)[])progress[key]=0;
  modelProgress.fill(0);
  const bar=document.getElementById('startup-bar') as HTMLProgressElement|null;if(!bar)return;
  elements={bar,fill:document.getElementById('startup-fill'),label:document.getElementById('startup-percent')};
  display=new LoadingDisplay(performance.now());lastLabel=-1;paintLoading(0);
  animateLoadingFill(performance.now());
  const animate=(now:number)=>{
    frame=undefined;
    if(!elements||!display)return;
    if(!elements.bar.isConnected){stopLoadingProgress();return;}
    const value=display.tick(now);
    if(value===100){fillAnimation?.cancel();fillAnimation=undefined;}
    paintLoading(value);
    if(value<100)frame=requestAnimationFrame(animate);
  };
  frame=requestAnimationFrame(animate);
}
export function stopLoadingProgress(){
  if(frame!==undefined)cancelAnimationFrame(frame);
  fillAnimation?.cancel();fillAnimation=undefined;
  frame=undefined;elements=undefined;display=undefined;
}
async function settleLoadingProgress(){
  if(display?.confirmed===100){
    const remaining=Math.max(0,300-(performance.now()-display.completedAt));
    if(remaining)await new Promise<void>(resolve=>setTimeout(resolve,remaining));
    paintLoading(100,true);
  }
  stopLoadingProgress();
}
export async function finishStartup(){
  const screen=document.getElementById('startup');if(!screen){stopLoadingProgress();return;}
  const logo=screen.querySelector('img');if(logo)await logo.decode().catch(()=>{});
  const animations=logo?.getAnimations()||[];
  await Promise.all(animations.map(a=>a.finished.catch(()=>{})));
  await settleLoadingProgress();
  screen.classList.add('ready');
  await new Promise<void>(resolve=>{
    const done=()=>{clearTimeout(timer);screen.removeEventListener('transitionend',onEnd);resolve();};
    const onEnd=(e:TransitionEvent)=>{if(e.target===screen&&e.propertyName==='opacity')done();};
    const timer=setTimeout(done,650);screen.addEventListener('transitionend',onEnd);
  });
  screen.remove();
}

/** Weighted completion: bytes for models, completed batches for construction. */
const weights={physics:8,assets:36,world:28,terrain:12,vehicles:8,shaders:8};
const progress={physics:0,assets:0,world:0,terrain:0,vehicles:0,shaders:0};
export function loadingProgress(stage:keyof typeof weights,value:number){
  if(!Number.isFinite(value))return;
  progress[stage]=Math.max(progress[stage],Math.min(1,Math.max(0,value)));
  let total=0;for(const key of Object.keys(weights) as (keyof typeof weights)[])total+=weights[key]*progress[key];
  if(display){const now=performance.now(),before=display.confirmed;display.report(total,now);if(before!==display.confirmed)animateLoadingFill(now);return;}
  const percent=Math.floor(total);
  const bar=document.getElementById('startup-bar') as HTMLProgressElement|null,label=document.getElementById('startup-percent');
  if(bar)bar.value=percent;if(label)label.textContent=percent+'%';
}
const modelProgress=[0,0,0,0];
export function modelLoaded(index:number,event?:ProgressEvent){
  const totals=[6056948,4121632,925364,3580584]; // Fallback weights; byte percentages use Content-Length when available.
  modelProgress[index]=event?Math.min(.99,event.loaded/(event.total||totals[index])):1;
  loadingProgress('assets',(modelProgress[0]+modelProgress[1]+modelProgress[2]+modelProgress[3])/4);
}
