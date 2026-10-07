import type {DriftSystem} from '../vehicles/DriftSystem';
type DriftPhase='idle'|'slide'|'charge'|'ready'|'settle'|'reward';
type DriftReading=Pick<DriftSystem,'active'|'charge'|'settling'|'rewardFlash'|'rewardSerial'>;
export function driftPresentation(d:DriftReading,sliding=false){
  const charge=Math.max(0,Math.min(1,Number.isFinite(d.charge)?d.charge:0));
  const phase:DriftPhase=d.rewardFlash>0?'reward':d.active?(d.settling?'settle':charge>=1?'ready':'charge'):sliding?'slide':'idle';
  const title={idle:'',slide:'DRIFT',charge:'DRIFT',ready:'LOCKED',settle:charge>=1?'BANK IT':'DRIFT',reward:'NITRO!'}[phase];
  const hint={idle:'',slide:'KEEP IT SIDEWAYS',charge:'BUILDING NITRO',ready:'RELEASE HANDBRAKE',settle:charge>=1?'STRAIGHTEN TO BOOST':'CLEAN EXIT',reward:'DRIFT BANKED'}[phase];
  return {phase,title,hint,charge:phase==='reward'?1:charge};
}
export const driftSignalMarkup=()=>`<div id="drift-meter" data-phase="idle" role="group" aria-label="Drift feedback" hidden>
  <div class="drift-plate">
    <div class="drift-emblem" aria-hidden="true"><svg viewBox="0 0 48 48"><g class="drift-trails"><path d="M5 35c-2-6 4-11 9-13M11 43c-5-8 1-14 7-17"/></g><g class="drift-car"><path d="m24 7 11 3 6 21-17 5-9-16Z"/><path d="m22 15 10-3 4 12-11 3Z"/><path d="m18 22 2 6m16-17 2 6M23 33l2 6m14-14 2 6"/></g></svg></div>
    <div class="drift-copy"><div class="drift-meter-label"><strong id="drift-state">DRIFT</strong><b id="drift-charge">0%</b></div><span id="drift-hint">BUILDING NITRO</span></div>
    <div class="drift-sparks" aria-hidden="true">${[[55,-35],[83,-12],[60,30],[-35,-24],[-57,5],[-25,32]].map(([x,y])=>`<i style="--dx:${x}px;--dy:${y}px"></i>`).join('')}</div>
  </div>
  <div class="drift-meter-track" role="progressbar" aria-label="Drift charge" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="drift-fill"></i><i class="drift-sweep" aria-hidden="true"></i></div>
  <span id="drift-announcement" class="screen-reader-only" role="status" aria-live="polite"></span>
</div>`;
export class DriftSignal {
  private title:HTMLElement;
  private value:HTMLElement;
  private hint:HTMLElement;
  private fill:HTMLElement;
  private track:HTMLElement;
  private announcement:HTMLElement;
  private phase:DriftPhase='idle';
  private rewardSerial=-1;
  constructor(private root:HTMLElement){
    this.title=root.querySelector('#drift-state')!;this.value=root.querySelector('#drift-charge')!;this.hint=root.querySelector('#drift-hint')!;this.fill=root.querySelector('#drift-fill')!;this.track=root.querySelector('.drift-meter-track')!;this.announcement=root.querySelector('#drift-announcement')!;
  }
  hide(){this.root.hidden=true;this.root.dataset.phase='idle';this.phase='idle';this.announcement.textContent='';}
  update(d:DriftReading,sliding:boolean,score:number){
    const p=driftPresentation(d,sliding);
    this.root.hidden=p.phase==='idle';
    if(p.phase!==this.phase){this.root.dataset.phase=p.phase;this.phase=p.phase;this.announcement.textContent=p.phase==='reward'?'Drift banked. Nitro boost earned.':p.phase==='ready'?'Drift charged. Release the handbrake, then straighten to boost.':'';}
    this.title.textContent=p.title;this.hint.textContent=p.hint;
    this.value.textContent=p.phase==='reward'?'+BOOST':p.phase==='slide'?String(Math.max(0,Math.round(Number.isFinite(score)?score:0))):`${Math.round(p.charge*100)}%`;
    this.track.hidden=p.phase==='slide';this.track.setAttribute('aria-valuenow',String(Math.round(p.charge*100)));
    this.fill.style.transform=`scaleX(${p.charge})`;
    // New physics reward only: repeated HUD ticks never restart the burst.
    if(p.phase==='reward'&&d.rewardSerial!==this.rewardSerial){
      this.rewardSerial=d.rewardSerial;
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
        for(const spark of this.root.querySelectorAll<HTMLElement>('.drift-sparks i')){
          spark.getAnimations().forEach(a=>a.cancel());
          spark.animate([{opacity:0,transform:'translate(0,0) scale(.3)'},{opacity:1,offset:.12},{opacity:0,transform:`translate(${spark.style.getPropertyValue('--dx')},${spark.style.getPropertyValue('--dy')}) scale(.1)`}],{duration:620,easing:'cubic-bezier(.15,.65,.3,1)'});
        }
      }
    }
  }
}
