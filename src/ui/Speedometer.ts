/** Vector instrument matching the supplied circular 0–12 tachometer reference. */
const C=256, CY=260, RADIUS=226;
function point(angle:number,r=RADIUS){const a=angle*Math.PI/180;return `${(C+Math.cos(a)*r).toFixed(3)} ${(CY+Math.sin(a)*r).toFixed(3)}`;}
function arc(start:number,end:number){return `M ${point(start)} A ${RADIUS} ${RADIUS} 0 ${end-start>180?1:0} 1 ${point(end)}`;}
export function speedometerMarkup(){
  let labels='';
  for(let i=0;i<=12;i++){
    const a=(135+i*22.5)*Math.PI/180;
    labels+=`<text x="${(C+Math.cos(a)*170).toFixed(2)}" y="${(CY+Math.sin(a)*170+12).toFixed(2)}">${i}</text>`;
  }
  return `<svg class="speedometer-dial" viewBox="0 0 512 512" role="img" aria-labelledby="speedometer-title" xmlns="http://www.w3.org/2000/svg">
    <title id="speedometer-title">Speed, gear and engine RPM</title>
    <circle cx="256" cy="260" r="240" fill="none" stroke="#c8cdc8" stroke-opacity=".43" stroke-width="3"/>
    <path d="M ${point(324,211)} L ${point(324)} A 226 226 0 0 1 ${point(405)} L ${point(405,211)}" fill="none" stroke="#d63952" stroke-opacity=".9" stroke-width="6" stroke-linejoin="miter"/>
    <path id="rpm-arc" d="${arc(135,154.125)}" fill="none" stroke="#f3ec4d" stroke-width="6"/>
    <path id="rpm-tip" d="M 479 244 L 487 263 L 450 264 L 478 254 Z" fill="#f3ec4d" transform="rotate(154.125 256 260)"/>
    <g class="dial-scale" text-anchor="middle" fill="#e0e1d7" fill-opacity=".79" font-family="'Bahnschrift','Arial Narrow','Segoe UI','Latin Modern Sans',sans-serif" font-size="34" font-weight="300">${labels}</g>
    <text id="gear" x="0" y="0" transform="translate(256 254) scale(.82 1)" text-anchor="middle" fill="#fff" font-family="'Bahnschrift','Segoe UI','Latin Modern Sans',sans-serif" font-size="102" font-weight="300">1</text>
    <text id="speed" x="0" y="0" transform="translate(256 449) scale(.82 1)" text-anchor="middle" fill="#fff" font-family="'Bahnschrift','Segoe UI','Latin Modern Sans',sans-serif" font-size="128" font-weight="300">0</text>
    <text id="unit" x="256" y="482" text-anchor="middle" fill="#c5c6b8" fill-opacity=".77" font-family="'Bahnschrift','Segoe UI','Latin Modern Sans',sans-serif" font-size="27" font-weight="300">km/h</text>
  </svg>`;
}
/** Called with the existing throttled HUD update, never with physics substeps. */
export function updateSpeedometer(speedMetersPerSecond:number,rpm:number,gear:number,reverse:boolean,units:'mph'|'kmh'){
  const value=String(Math.max(0,Math.round((Number.isFinite(speedMetersPerSecond)?speedMetersPerSecond:0)*(units==='mph'?2.23694:3.6))));
  const speed=document.getElementById('speed')!;
  if(speed.textContent!==value){speed.textContent=value;speed.setAttribute('transform',`translate(256 449) scale(${value.length>3?.62:.82} 1)`);}
  const unit=document.getElementById('unit')!,label=units==='mph'?'mph':'km/h';if(unit.textContent!==label)unit.textContent=label;
  const gearText=reverse?'R':String(gear),gearElement=document.getElementById('gear')!;if(gearElement.textContent!==gearText)gearElement.textContent=gearText;
  const fraction=Math.max(0,Math.min(1,(Number.isFinite(rpm)?rpm:0)/12000));
  const end=135+fraction*270;
  document.getElementById('rpm-arc')!.setAttribute('d',fraction>0?arc(135,end):'');
  document.getElementById('rpm-tip')!.setAttribute('transform',`rotate(${end} 256 260)`);
}
