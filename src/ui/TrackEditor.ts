import {DrawnTrack,TrackPoint,TrackStore,makeDrawnTrack,trackId,buildDrawnRoad} from '../racing/DrawnTrack';

export class TrackEditor{
  readonly store=new TrackStore();
  points:TrackPoint[]=[];
  private canvas:HTMLCanvasElement;
  private name:HTMLInputElement;
  private width:HTMLInputElement;
  private message:HTMLElement;
  private drawing=false;
  private strokeStart=0;
  private strokeOrigin:TrackPoint=[0,0];
  private submitting=false;
  private pointer:number|null=null;
  private history:TrackPoint[][]=[];
  onSolo:(track:DrawnTrack,laps:number)=>void|Promise<void>=()=>{};
  onMultiplayer:(track:DrawnTrack,laps:number)=>void|Promise<void>=()=>{};
  constructor(private root:HTMLElement,private toast:(text:string)=>void){
    root.insertAdjacentHTML('beforeend',`<section data-panel="tracks" class="overlay" hidden><div class="panel track-panel"><div class="panel-head"><div><span class="tiny">CREATE YOUR CIRCUIT</span><h2>Draw a track</h2></div><button data-action="track-back" class="text-button">← BACK</button></div><p class="muted">Draw with your finger or drag the mouse. You can also tap to place corners. The line becomes a smooth, closed racing circuit. Start and finish are at your first point.</p><div class="track-editor-layout"><div><canvas id="track-drawing" width="720" height="720" aria-label="Track drawing canvas"></canvas><div class="track-tools"><button data-track-tool="undo">UNDO</button><button data-track-tool="clear">CLEAR</button><button data-track-tool="example">EXAMPLE</button></div></div><aside><label>Track name<input id="track-name" maxlength="32" value="My circuit"></label><label>Road width <span id="track-width-label">14 m</span><input id="track-width" type="range" min="10" max="22" value="14" step="1"></label><label>Race length<select id="track-laps"><option value="1">1 lap</option><option value="3">3 laps</option></select></label><p id="track-message" role="status" aria-live="polite">Draw a loop to get started.</p><div class="stack"><button data-track-tool="save">SAVE TRACK</button><button data-track-tool="solo" class="primary">RACE SOLO →</button><button data-track-tool="multiplayer">RACE WITH FRIENDS →</button></div><p class="muted">Solo is a timed race with no AI cars. Friends receive the host’s course automatically. Multiplayer needs internet and the same game version.</p><h3>SAVED TRACKS</h3><div id="saved-tracks"></div></aside></div></div></section>`);
    this.canvas=root.querySelector('#track-drawing')!;this.name=root.querySelector('#track-name')!;this.width=root.querySelector('#track-width')!;this.message=root.querySelector('#track-message')!;
    this.width.addEventListener('input',()=>{root.querySelector('#track-width-label')!.textContent=`${this.width.value} m`;this.draw();this.describe();});
    this.canvas.addEventListener('pointerdown',event=>{
      if(!event.isPrimary||this.pointer!==null||this.submitting)return;
      event.preventDefault();this.canvas.setPointerCapture(event.pointerId);this.pointer=event.pointerId;this.drawing=true;
      this.history.push(this.points.map(p=>[...p] as TrackPoint));if(this.history.length>30)this.history.shift();this.strokeStart=this.points.length;this.strokeOrigin=this.point(event);this.add(event);
    });
    this.canvas.addEventListener('pointermove',event=>{if(this.drawing&&event.pointerId===this.pointer){event.preventDefault();this.add(event);}});
    const finish=(event:PointerEvent)=>{if(event.pointerId!==this.pointer)return;this.drawing=false;this.pointer=null;if(this.canvas.hasPointerCapture(event.pointerId))this.canvas.releasePointerCapture(event.pointerId);this.draw();this.describe();};
    this.canvas.addEventListener('pointerup',finish);this.canvas.addEventListener('pointercancel',finish);this.canvas.addEventListener('lostpointercapture',()=>{this.drawing=false;this.pointer=null;});
    root.querySelector('[data-panel=tracks]')!.addEventListener('click',async event=>{
      const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-track-tool]');if(!button||this.submitting)return;
      const action=button.dataset.trackTool!;
      if(action==='undo'){this.points=this.history.pop()??this.points.slice(0,-1);this.draw();this.describe();return;}
      if(action==='clear'){this.history.push(this.points);this.points=[];this.draw();this.describe();return;}
      if(action==='example'){this.history.push(this.points);this.points=Array.from({length:20},(_,i)=>{const t=i/20*Math.PI*2;return [.5+Math.sin(t)*(.31+.055*Math.sin(t*3)),.5+Math.cos(t)*.34] as TrackPoint;});this.name.value='Coastal loop';this.draw();this.describe();return;}
      if(action.startsWith('load:')){const track=this.store.tracks.find(t=>trackId(t)===action.slice(5));if(track){this.points=track.points.map(p=>[...p] as TrackPoint);this.name.value=track.name;this.width.value=String(track.width);root.querySelector('#track-width-label')!.textContent=`${track.width} m`;this.history=[];this.draw();this.describe();}return;}
      if(action.startsWith('delete:')){try{this.store.remove(action.slice(7));this.renderSaved();}catch{this.reportError('Track could not be deleted. Browser storage is unavailable.');}return;}
      if(!['save','solo','multiplayer'].includes(action))return;
      const buttons=[...root.querySelectorAll<HTMLButtonElement>('[data-track-tool]')];
      this.submitting=true;buttons.forEach(b=>b.disabled=true);
      try{
        const track=makeDrawnTrack(this.points,this.name.value,Number(this.width.value));this.points=track.points.map(p=>[...p] as TrackPoint);this.draw();
        if(action==='save'){try{this.store.save(track);}catch{throw new Error('Track could not be saved. Browser storage is unavailable or full. You can still race it.');}this.renderSaved();this.status('Track saved. Choose solo or multiplayer to race it.');}
        else if(action==='solo'){this.status('Loading your solo race…');await this.onSolo(track,Number((root.querySelector('#track-laps') as HTMLSelectElement).value));}
        else if(action==='multiplayer'){this.status('Opening multiplayer…');await this.onMultiplayer(track,Number((root.querySelector('#track-laps') as HTMLSelectElement).value));}
      }catch(error){this.reportError(error instanceof Error?error.message:'The track could not be loaded.');}
      finally{this.submitting=false;buttons.forEach(b=>b.disabled=false);}
    });
    this.draw();this.renderSaved();
  }
  private point(event:PointerEvent):TrackPoint{
    const rect=this.canvas.getBoundingClientRect();return [Math.max(.02,Math.min(.98,(event.clientX-rect.left)/rect.width)),Math.max(.02,Math.min(.98,(event.clientY-rect.top)/rect.height))];
  }
  private add(event:PointerEvent){
    const point=this.point(event);
    // A drag replaces a previous course even if it starts on its final point.
    // Taps continue adding individual corners.
    if(this.strokeStart>3&&Math.hypot(this.strokeOrigin[0]-point[0],this.strokeOrigin[1]-point[1])>.006){this.points=[this.strokeOrigin];this.strokeStart=0;}
    if(this.points.length>=4096)return;
    const previous=this.points.at(-1);if(previous&&Math.hypot(previous[0]-point[0],previous[1]-point[1])<.004)return;
    this.points.push(point);this.draw();
  }
  private status(text:string,error=false){this.message.textContent=text;this.message.dataset.error=String(error);}
  reportError(text:string){this.status(text,true);this.toast(text);this.message.scrollIntoView({block:'nearest'});}
  refresh(){this.renderSaved();this.draw();this.describe();}
  private describe(){
    if(this.points.length<4){this.status('Draw a loop or tap at least four corners. The dashed line closes the circuit.');return;}
    try{const track=makeDrawnTrack(this.points,this.name.value,Number(this.width.value)),road=buildDrawnRoad(track);this.status(`${(road.length/1000).toFixed(2)} km circuit · ${track.width} m wide · ready to race`);}
    catch(error){this.status(error instanceof Error?error.message:'Keep drawing your circuit.',true);}
  }
  private draw(){
    const c=this.canvas.getContext('2d')!,s=720;c.clearRect(0,0,s,s);c.fillStyle='#101f26';c.fillRect(0,0,s,s);
    c.strokeStyle='#233942';c.lineWidth=1;for(let n=36;n<s;n+=36){c.beginPath();c.moveTo(n,0);c.lineTo(n,s);c.moveTo(0,n);c.lineTo(s,n);c.stroke();}
    c.font='16px Arial';c.fillStyle='#78929a';c.fillText('2 km × 2 km drawing area',18,s-18);
    if(!this.points.length){c.font='bold 25px Arial';c.fillStyle='#aac5ca';c.textAlign='center';c.fillText('DRAW YOUR RACING LINE',s/2,s/2);c.textAlign='left';return;}
    c.strokeStyle='#334952';c.lineWidth=Math.max(7,Number(this.width.value)/2000*s);c.lineJoin=c.lineCap='round';c.beginPath();this.points.forEach((p,i)=>i?c.lineTo(p[0]*s,p[1]*s):c.moveTo(p[0]*s,p[1]*s));c.stroke();
    c.strokeStyle='#85ead3';c.lineWidth=3;c.stroke();if(this.points.length>2){c.setLineDash([8,8]);c.lineTo(this.points[0][0]*s,this.points[0][1]*s);c.stroke();c.setLineDash([]);}
    const first=this.points[0];c.fillStyle='#fff2aa';c.beginPath();c.arc(first[0]*s,first[1]*s,7,0,Math.PI*2);c.fill();c.font='bold 17px Arial';c.fillText('START →',first[0]*s+12,first[1]*s-12);
  }
  renderSaved(){
    const list=this.root.querySelector('#saved-tracks')!;list.replaceChildren();
    if(!this.store.tracks.length){const p=document.createElement('p');p.className='muted';p.textContent='Your saved courses will appear here.';list.append(p);return;}
    for(const track of this.store.tracks){const row=document.createElement('div');row.className='saved-track';const button=document.createElement('button');button.dataset.trackTool=`load:${trackId(track)}`;button.textContent=track.name;const remove=document.createElement('button');remove.dataset.trackTool=`delete:${trackId(track)}`;remove.textContent='×';remove.setAttribute('aria-label',`Delete ${track.name}`);row.append(button,remove);list.append(row);}
  }
}
