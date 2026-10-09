import * as T from 'three';
import {Road} from '../world/RoadNetwork';

export type TrackPoint=[number,number];
export type DrawnTrack={version:1;name:string;width:number;points:TrackPoint[]};
export const TRACK_ORIGIN=20000,TRACK_SIZE=2000,TRACK_HEIGHT=24.55;
const distance=(a:TrackPoint,b:TrackPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const cross=(a:TrackPoint,b:TrackPoint,c:TrackPoint)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function intersects(a:TrackPoint,b:TrackPoint,c:TrackPoint,d:TrackPoint){
  const side1=cross(a,b,c),side2=cross(a,b,d),side3=cross(c,d,a),side4=cross(c,d,b);
  if(Math.max(a[0],b[0])<Math.min(c[0],d[0])||Math.max(c[0],d[0])<Math.min(a[0],b[0])||Math.max(a[1],b[1])<Math.min(c[1],d[1])||Math.max(c[1],d[1])<Math.min(a[1],b[1]))return false;
  return side1*side2<=0&&side3*side4<=0;
}
function simpleLoop(points:TrackPoint[]){
  for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){
    if(i===0&&j===points.length-1)continue;
    if(intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))return false;
  }
  return true;
}
/** Bound and validate network/storage payloads before creating geometry. */
export function validDrawnTrack(v:unknown):v is DrawnTrack{
  const t=v as DrawnTrack;
  return !!t&&t.version===1&&typeof t.name==='string'&&t.name.length>=1&&t.name.length<=32&&
    !/[<>\x00-\x1f]/.test(t.name)&&Number.isFinite(t.width)&&t.width>=10&&t.width<=22&&
    Array.isArray(t.points)&&t.points.length>=4&&t.points.length<=96&&
    t.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=.02&&n<=.98))&&
    t.points.every((p,i)=>distance(p,t.points[(i+1)%t.points.length])>=.004)&&
    t.points.reduce((length,p,i)=>length+distance(p,t.points[(i+1)%t.points.length]),0)>=.25&&simpleLoop(t.points);
}
/** Iterative Douglas–Peucker avoids stack overflow on long touch strokes. */
function simplify(points:TrackPoint[],epsilon:number):TrackPoint[]{
  if(points.length<3)return points;
  const keep=new Set([0,points.length-1]),pending:[number,number][]=[[0,points.length-1]];
  while(pending.length){
    const [start,end]=pending.pop()!,a=points[start],b=points[end],dx=b[0]-a[0],dy=b[1]-a[1],length2=dx*dx+dy*dy;
    let best=epsilon,index=-1;
    for(let i=start+1;i<end;i++){
      const p=points[i],t=length2?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length2)):0;
      const gap=Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);if(gap>best){best=gap;index=i;}
    }
    if(index>=0){keep.add(index);pending.push([start,index],[index,end]);}
  }
  return [...keep].sort((a,b)=>a-b).map(i=>points[i]);
}
/** Snap a small finishing overrun to the start without hiding crossings elsewhere. */
function closeStroke(raw:TrackPoint[]):TrackPoint[]{
  const travelled=[0];for(let i=1;i<raw.length;i++)travelled.push(travelled[i-1]+distance(raw[i-1],raw[i]));
  const total=travelled.at(-1)!;let nearest=.025,closure=-1;
  for(let i=4;i<raw.length;i++){
    const gap=distance(raw[0],raw[i]);
    if(travelled[i]>=.25&&total-travelled[i]<=Math.min(.12,total*.15)&&gap<nearest){nearest=gap;closure=i;}
  }
  return closure<0?raw:raw.slice(0,closure);
}
export function makeDrawnTrack(raw:TrackPoint[],name='My circuit',width=14):DrawnTrack{
  if(raw.length<4||raw.length>4096)throw new Error('Draw a complete loop with at least four points.');
  if(!raw.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isFinite(n)&&n>=.02&&n<=.98)))throw new Error('Keep the track inside the drawing area.');
  const track:DrawnTrack={version:1,name:name.replace(/[<>\x00-\x1f]/g,'').trim().slice(0,32)||'My circuit',width,points:raw.map(p=>[...p])};
  // Saved/network control points are already normalized. Do not reshape them on play.
  if(!validDrawnTrack(track as unknown)){
    const rounded=simplify(closeStroke(raw),.0035).map(p=>p.map(n=>Math.round(n*10000)/10000) as TrackPoint),points:TrackPoint[]=[];
    for(const p of rounded)if(!points.length||distance(p,points.at(-1)!)>=.004)points.push(p);
    while(points.length>4&&distance(points[0],points.at(-1)!)<.025)points.pop();
    track.points=points;
  }
  if(!validDrawnTrack(track))throw new Error('Draw a longer, wider loop without crossing your line. Keep the bends spaced apart.');
  buildDrawnRoad(track); // Also check the smoothed driving surface.
  return track;
}
export function trackId(track:DrawnTrack){
  const text=JSON.stringify([track.width,track.points]);let hash=2166136261;
  for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(36);
}
export function buildDrawnRoad(track:DrawnTrack):Road{
  if(!validDrawnTrack(track))throw new Error('This track is invalid. Draw a new loop.');
  const curve=new T.CatmullRomCurve3(track.points.map(([x,z])=>new T.Vector3(TRACK_ORIGIN+(x-.5)*TRACK_SIZE,TRACK_HEIGHT,TRACK_ORIGIN+(z-.5)*TRACK_SIZE)),true,'centripetal');
  curve.arcLengthDivisions=2400;
  const length=curve.getLength();if(length<500||length>12000)throw new Error('The track must be between 0.5 and 12 km long.');
  const count=Math.ceil(length/5),positions=curve.getSpacedPoints(count);
  // Sampled curve crossings can appear even when the control polygon is simple.
  const polygon=positions.slice(0,-1).map(p=>[p.x,p.z] as TrackPoint);
  if(!simpleLoop(polygon))throw new Error('Those bends overlap after smoothing. Space them farther apart.');
  let total=0;
  const samples=positions.map((p,i)=>{if(i)total+=p.distanceTo(positions[i-1]);const t=curve.getTangentAt(i/count).normalize();return {p,t,r:new T.Vector3(-t.z,0,t.x),d:total};});
  return {name:`DRAWN: ${track.name}`,curve,length:total,width:track.width,closed:true,samples};
}

export class TrackStore{
  tracks:DrawnTrack[]=[];
  bests:Record<string,number>={};
  private readonly key='redline_horizon_tracks_v1';
  constructor(){try{const v=JSON.parse(localStorage.getItem(this.key)||'{}');if(Array.isArray(v.tracks))this.tracks=v.tracks.filter(validDrawnTrack).slice(0,8);if(v.bests&&typeof v.bests==='object')for(const [id,time] of Object.entries(v.bests))if(/^[a-z0-9]+-(dry|wet)-(1|3)$/.test(id)&&typeof time==='number'&&Number.isFinite(time)&&time>0&&time<86400)this.bests[id]=time;}catch{}}
  private persist(){localStorage.setItem(this.key,JSON.stringify({tracks:this.tracks,bests:this.bests}));}
  save(track:DrawnTrack){
    if(!validDrawnTrack(track))throw new Error('Invalid track.');
    const next=[track,...this.tracks.filter(t=>trackId(t)!==trackId(track))].slice(0,8),old=this.tracks;this.tracks=next;
    try{this.persist();}catch(error){this.tracks=old;throw error;}
  }
  remove(id:string){const old=this.tracks;this.tracks=this.tracks.filter(t=>trackId(t)!==id);try{this.persist();}catch(error){this.tracks=old;throw error;}}
  best(track:DrawnTrack,condition:'dry'|'wet',laps=1){return this.bests[`${trackId(track)}-${condition}-${laps===3?3:1}`]||0;}
  record(track:DrawnTrack,time:number,condition:'dry'|'wet',laps=1){
    if(!Number.isFinite(time)||time<=0)return;
    const key=`${trackId(track)}-${condition}-${laps===3?3:1}`,previous=this.bests[key];if(previous&&previous<=time)return;
    this.bests[key]=time;try{this.persist();}catch(error){if(previous)this.bests[key]=previous;else delete this.bests[key];throw error;}
  }
}
