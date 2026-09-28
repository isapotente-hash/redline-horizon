import { clamp, wrap } from '../core/math';
import { Road } from '../world/RoadNetwork';
export type NavigationCar = {d:number; lane:number; speed:number; direction:number;road?:Road};
export type NavigationOrb = {road:Road; d:number; offset:number; cooldown:number};
export type NavigationCoin = {road:Road;d:number;offset:number;active:boolean};
export type NavigationScene = {routeChoices?:boolean;preferredLane?:number;orbs?:NavigationOrb[]; coins?:NavigationCoin[]; cars?:NavigationCar[];limits?:{road:Road;start:number;end:number;limit:number}[]};

/** Choose reachable pickups and predict traffic before committing to a lane. */
export function navigate(road:Road, distance:number, direction:number, speed:number, offset:number, previous:number, scene:NavigationScene) {
  const signedGap=(d:number)=>road.closed ? wrap((d-distance)*direction+road.length/2,road.length)-road.length/2 : (d-distance)*direction;
  const horizon=Math.max(95,speed*4);
  let desired=scene.preferredLane??road.width*.23*direction, nearest=Infinity,target:'coin'|'orb'|undefined;
  const edge=road.width/2-1.65;
  const nearby=(scene.cars||[]).filter(c=>!c.road||c.road===road).map(c=>({...c,gap:signedGap(c.d),velocity:c.speed*c.direction*direction})).filter(c=>c.gap>-30&&c.gap<horizon+100);
  const consider=(pickup:NavigationCoin|NavigationOrb,kind:'coin'|'orb')=>{
    if(pickup.road!==road||('active' in pickup?!pickup.active:pickup.cooldown>0)||Math.abs(pickup.offset)>edge)return;
    const gap=signedGap(pickup.d),lateral=Math.abs(pickup.offset-offset);
    if(gap< -1.5||gap>horizon)return;
    // Do not dive sideways for an already missed pickup, especially under boost.
    const arrival=Math.max(0,gap)/Math.max(8,speed);
    if(lateral>1.1+arrival*3.8)return;
    if(nearby.some(c=>Math.abs(c.gap+c.velocity*arrival-gap)<12&&Math.abs(c.lane-pickup.offset)<3.2))return;
    const score=Math.max(0,gap)+lateral*2+Math.abs(pickup.offset-previous)*1.5;
    if(score<nearest){nearest=score;desired=pickup.offset;target=kind;}
  };
  for(const coin of scene.coins||[])consider(coin,'coin');
  for(const orb of scene.orbs||[])consider(orb,'orb');
  desired=clamp(desired,-edge,edge);
  const lanes=[desired,clamp(previous,-edge,edge),clamp(offset,-edge,edge),-edge,-edge*.5,0,edge*.5,edge];
  let lane=desired,best=Infinity;
  for(const candidate of lanes) {
    let cost=Math.abs(candidate-desired)*2+Math.abs(candidate-previous)*.5;
    for(const c of nearby) {
      for(let t=.2;t<=3.61;t+=.4) {
        const gap=c.gap+(c.velocity-speed)*t;
        const lateral=offset+clamp(candidate-offset,-t*3.8,t*3.8);
        const separation=Math.abs(lateral-c.lane);
        if(Math.abs(gap)<9&&separation<3.2)cost+= (3.2-separation)*150*(1-t/5);
      }
      // Keep space from cars already beside us, even at low speed.
      if(Math.abs(c.gap)<8&&Math.abs(candidate-c.lane)<3.2)cost+=500;
    }
    if(cost<best){best=cost;lane=candidate;}
  }
  let speedLimit=Infinity;
  for(const c of nearby) {
    if(c.gap<0||Math.abs(c.lane-offset)>2.8)continue;
    const closing=Math.max(0,speed-c.velocity);
    if(c.gap<14+closing*1.6) speedLimit=Math.min(speedLimit,Math.max(0,c.velocity+(c.gap-12)*.45));
    // Brake before a stopped queue if no collision-free passing lane exists.
    if(best>150&&c.gap>0)speedLimit=Math.min(speedLimit,Math.sqrt(Math.max(0,c.gap-12)*6));
  }
  return {lane,speedLimit,target:Math.abs(lane-desired)<.5?target:undefined};
}
