type BoostReading={boostRemaining:number;nitroRemaining:number;boostSerial:number;infiniteBoost:boolean};
export function boostPresentation(car:BoostReading){
  const nitro=Number.isFinite(car.nitroRemaining)?Math.max(0,car.nitroRemaining):0,boost=Number.isFinite(car.boostRemaining)?Math.max(0,car.boostRemaining):0;
  const phase=nitro>0?'nitro':boost>0?'boost':'idle',remaining=phase==='nitro'?nitro:boost,infinite=phase==='boost'&&car.infiniteBoost;
  return {phase,remaining,progress:infinite?1:Math.min(1,remaining/(phase==='nitro'?2.2:5)),title:phase==='nitro'?'NITRO':'BOOST',hint:phase==='nitro'?'DRIFT POWER':infinite?'UNLIMITED':'FULL THROTTLE',timer:infinite?'∞':`${remaining.toFixed(1)}s`};
}
export const boostSignalMarkup=()=>`<div id="boost-signal" data-phase="idle" role="group" aria-label="Boost feedback" hidden>
  <div class="boost-plate"><div class="boost-emblem" aria-hidden="true"><svg viewBox="0 0 48 48"><g class="boost-jets"><path d="M3 17h13M0 24h18M5 31h11"/></g><path class="boost-bolt" d="m29 4-15 23h12l-3 17 17-25H28Z"/></svg></div><div class="boost-copy"><div class="boost-heading"><strong id="boost-title">BOOST</strong><b id="boost-time">5.0s</b></div><span id="boost-hint">FULL THROTTLE</span></div><div class="boost-rush" aria-hidden="true"><i></i><i></i><i></i></div><i class="boost-ring" aria-hidden="true"></i></div>
  <div class="boost-track" role="progressbar" aria-label="Boost remaining" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="boost-fill"></i></div><span id="boost-announcement" class="screen-reader-only" role="status" aria-live="polite"></span>
</div>`;
export class BoostSignal {
  private title:HTMLElement;private time:HTMLElement;private hint:HTMLElement;private fill:HTMLElement;private track:HTMLElement;private announcement:HTMLElement;
  private serial=-1;private phase='idle';
  constructor(private root:HTMLElement){this.title=root.querySelector('#boost-title')!;this.time=root.querySelector('#boost-time')!;this.hint=root.querySelector('#boost-hint')!;this.fill=root.querySelector('#boost-fill')!;this.track=root.querySelector('.boost-track')!;this.announcement=root.querySelector('#boost-announcement')!;}
  hide(){this.root.hidden=true;this.root.dataset.phase='idle';this.phase='idle';this.announcement.textContent='';}
  update(car:BoostReading){
    const p=boostPresentation(car);if(p.phase==='idle'){this.hide();return;}
    this.root.hidden=false;this.root.dataset.phase=p.phase;
    this.title.textContent=p.title;this.time.textContent=p.timer;this.hint.textContent=p.hint;this.fill.style.transform=`scaleX(${p.progress})`;this.track.setAttribute('aria-valuenow',String(Math.round(p.progress*100)));
    const activated=car.boostSerial!==this.serial||p.phase!==this.phase;
    if(activated){this.serial=car.boostSerial;this.phase=p.phase;this.announcement.textContent=p.phase==='nitro'?'Nitro boost active.':'Boost active.';
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
        const ring=this.root.querySelector<HTMLElement>('.boost-ring')!;ring.getAnimations().forEach(a=>a.cancel());ring.animate([{opacity:.85,transform:'scale(.3)'},{opacity:0,transform:'scale(2.2)'}],{duration:550,easing:'ease-out'});
        const plate=this.root.querySelector<HTMLElement>('.boost-plate')!;plate.getAnimations().forEach(a=>a.cancel());plate.animate([{opacity:0,transform:'translateX(20px) skewX(-9deg) scale(.92)'},{opacity:1,transform:'translateX(-3px) skewX(-9deg) scale(1.04)',offset:.3},{opacity:1,transform:'translateX(0) skewX(-9deg) scale(1)'}],{duration:420,easing:'cubic-bezier(.2,.8,.2,1)'});
      }
    }
  }
}
