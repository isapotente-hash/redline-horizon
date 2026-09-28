/** Yield between construction batches so the browser can paint and animate the logo. */
export const yieldLoading=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
export async function finishStartup(){
  const screen=document.getElementById('startup');if(!screen)return;
  const logo=screen.querySelector('img');if(logo)await logo.decode().catch(()=>{});
  const animations=logo?.getAnimations()||[];
  await Promise.all(animations.map(a=>a.finished.catch(()=>{})));
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
let displayed=-1;
export function loadingProgress(stage:keyof typeof weights,value:number){
  progress[stage]=Math.max(progress[stage],Math.min(1,Math.max(0,value)));
  let total=0;for(const key of Object.keys(weights) as (keyof typeof weights)[])total+=weights[key]*progress[key];
  const percent=Math.floor(total);if(percent===displayed)return;displayed=percent;
  const bar=document.getElementById('startup-bar') as HTMLProgressElement|null,label=document.getElementById('startup-percent');
  if(bar)bar.value=percent;if(label)label.textContent=percent+'%';
}
const modelProgress=[0,0,0];
export function modelLoaded(index:number,event?:ProgressEvent){
  const totals=[6056948,4121632,925364]; // Fallback weights; byte percentages use Content-Length when available.
  modelProgress[index]=event?Math.min(.99,event.loaded/(event.total||totals[index])):1;
  loadingProgress('assets',(modelProgress[0]+modelProgress[1]+modelProgress[2])/3);
}
