import * as T from "three";
import {AutopilotRoutes, RouteExit} from "./AutopilotRoutes";
import {AutopilotDrift} from "./AutopilotDrift";
import { RoadNetwork, Road } from "../world/RoadNetwork";
import { VehiclePhysics } from "../physics/VehiclePhysics";
import { Settings } from "../core/SaveManager";
import { Controls } from "../input/InputManager";
import { navigate, NavigationScene } from "./AutopilotNavigation";
import { clamp, wrap } from "../core/math";

export function autopilotOverride(mode: Settings["autopilotMode"], input: Controls) {
  return (mode !== "speed" && Math.abs(input.steer) > .2) ||
    (mode !== "steering" && (input.throttle > .1 || input.brake > .1 || input.handbrake));
}
export class Autopilot {
  enabled = false;
  drift=new AutopilotDrift();
  private lastTeleport=-1;
  private lastSteer=0;
  private connector?:{curve:T.CubicBezierCurve3;length:number;travel:number;road:Road;d:number;direction:number;lane:number};
  private road?: Road;
  private direction = 1;
  private lane = 0;
  target: 'coin'|'orb'|undefined;
  routes:AutopilotRoutes;
  constructor(private roads: RoadNetwork) {this.routes=new AutopilotRoutes(roads);}
  disable() { this.enabled = false;this.routes.reset();this.target=undefined;this.drift.reset();this.connector=undefined; }
  toggle(car: VehiclePhysics) {
    if (this.enabled) { this.disable(); return; }
    const hit = this.roads.nearest(car.position.x, car.position.z, true);
    this.road = hit.road;
    this.direction = car.forward.dot(hit.sample.t) >= 0 ? 1 : -1;
    this.lane = hit.offset;
    this.routes.reset();this.lastTeleport=car.teleportSerial;this.lastSteer=0;this.drift.reset();this.connector=undefined;
    this.enabled = true;
  }
  controls(car: VehiclePhysics, speedKmh: number, mode: Settings["autopilotMode"] = "full", manual: Controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, up: false, down: false }, scene: NavigationScene = {}, dt=1/120): Controls {
    const input: Controls = { ...manual };
    if(this.enabled&&this.lastTeleport!==car.teleportSerial){this.disable();this.toggle(car);}
    if (!this.enabled || !this.road) return input;
    if (mode === "speed") {
      this.routes.reset();this.target=undefined;this.drift.reset();
      this.speedControls(car, clamp(Number(speedKmh) || 90, 30, 180) / 3.6, input);
      return input;
    }
    if(this.connector)return this.followConnector(car,speedKmh,mode,input,dt,scene);
    const road = this.road;
    const nearby=this.roads.nearest(car.position.x,car.position.z,false,road);
    let best=Infinity,distance=nearby.sample.d;
    // Use the spatial index during normal driving; retain recovery when far off-road.
    if(!Number.isFinite(nearby.distance))for (let i = 0; i < road.samples.length - 1; i++) {
      const a = road.samples[i], b = road.samples[i + 1];
      const dx = b.p.x - a.p.x, dz = b.p.z - a.p.z;
      const u = clamp(((car.position.x - a.p.x) * dx + (car.position.z - a.p.z) * dz) / Math.max(.001, dx * dx + dz * dz), 0, 1);
      const error = (car.position.x - a.p.x - dx * u) ** 2 + (car.position.z - a.p.z - dz * u) ** 2;
      if (error < best) { best = error; distance = a.d + (b.d - a.d) * u; }
    }
    const here = this.roads.at(road, distance);
    const offset = car.position.clone().sub(here.p).dot(here.r);
    if(scene.routeChoices===false)this.routes.reset();
    const choice=scene.routeChoices===false?undefined:this.routes.update(road,distance,this.direction,car.speed,Math.max(0,car.signedSpeed*car.forward.dot(here.t)*this.direction));
    const selected=choice?.options[choice.selected];
    const turning=!!selected&&selected.road!==road;
    if(choice&&choice.distance<18&&choice.distance>0&&turning){
      // Steering-only cannot brake for the driver: skip unsafe last-second turns.
      if(car.speed<13&&this.connectSelected(road,distance,selected!)){this.routes.consume();return this.followConnector(car,speedKmh,mode,input,dt,scene);}
      if(choice.distance<5)this.routes.consume();
    }
    const remaining=road.closed?Infinity:this.direction>0?road.length-distance:distance;
    if(!turning&&remaining<32&&this.connect(road,distance))return this.followConnector(car,speedKmh,mode,input,dt,scene);
    const turnA=this.roads.at(road,distance+this.direction*6),turnB=this.roads.at(road,distance+this.direction*24);
    const curvature=Math.atan2(turnA.t.z*turnB.t.x-turnA.t.x*turnB.t.z,turnA.t.x*turnB.t.x+turnA.t.z*turnB.t.z)/18;
    // Small anticipatory line adjustments stay within the road and yield to pickup/traffic planning.
    const preferred=clamp(road.width*.23*this.direction-Math.sign(curvature)*Math.min(.8,Math.abs(curvature)*55),-road.width/2+2,road.width/2-2);
    const route = navigate(road, distance, this.direction, car.speed, offset, this.lane, {
      orbs:turning||Math.abs(curvature)>.004?[]:scene.orbs,coins:turning||Math.abs(curvature)>.004?[]:scene.coins,cars:scene.cars,preferredLane:preferred,
    });
    this.target=route.target;
    this.lane += clamp(route.lane-this.lane,-3.8*dt,3.8*dt);
    const look = clamp(8+car.speed*.48-Math.min(4,Math.abs(curvature)*140),7,32);
    const target = this.roads.at(road, distance + this.direction * look);
    const point = target.p.clone().addScaledVector(target.r, this.lane);
    const delta = point.sub(car.position);
    const angle = Math.atan2(-delta.dot(car.right), delta.dot(car.forward));
    const wheelAngle = Math.atan2(2 * (car.chassis.halfLength*2) * Math.sin(angle), look);
    input.steer = clamp(wheelAngle * (1 + car.speed * car.chassis.steerFade) / (car.chassis.steerAngle*Math.sqrt(car.spec.handling)*(car.setup?.steering||1)), -1, 1);
    // Compensate measured lateral motion instead of repeatedly chasing the visual heading.
    if(this.drift.phase==='grip')input.steer=clamp(input.steer-car.slip*.35,-1,1);
    if (mode === "steering") {this.drift.reset();this.smoothSteer(input,dt);return input;}
    let desired = this.cornerSpeed(car,distance,speedKmh,scene);
    if(turning&&choice)desired=Math.min(desired,Math.sqrt(49+5*Math.max(0,choice.distance-24)));
    if (Math.abs(angle) > .6) desired = Math.min(desired, 8);
    if(Math.abs(offset)>road.width/2-1)desired=Math.min(desired,9);
    if(this.drift.phase==='grip'&&Math.abs(car.slip)>.22)desired=Math.min(desired,Math.max(5,car.speed*.78));
    if (!road.closed) {
      const remaining = this.direction > 0 ? road.length - distance : distance;
      desired = Math.min(desired, Math.sqrt(Math.max(0, remaining - 9) * 5));
      if (remaining < 12 && car.speed < .8) { this.disable(); input.brake = 1; input.handbrake = true; return input; }
    }
    this.speedControls(car, Math.min(desired, route.speedLimit), input);
    const structure=this.roads.structures.some(s=>s.road===road&&distance>s.start-90&&distance<s.end+90);
    const clear=!turning&&!structure&&(scene.cars||[]).every(c=>{if(c.road&&c.road!==road)return true;const gap=road.closed?wrap(c.d-distance+road.length/2,road.length)-road.length/2:c.d-distance;return Math.abs(gap)>65;})&&route.speedLimit===Infinity&&!route.target&&!this.roads.inJunction(here.p.x,here.p.z);
    this.drift.update(car,input,{curvature,offset,width:road.width,clear,full:true},dt);
    this.smoothSteer(input,dt);
    return input;
  }
  private smoothSteer(input:Controls,dt:number){
    this.lastSteer+=clamp(input.steer-this.lastSteer,-3.8*dt,3.8*dt);input.steer=this.lastSteer;
  }
  /** Select a connected continuation by heading and available road, never jump across a junction. */
  private connect(road:Road,distance:number){
    const end=this.direction>0?road.samples.at(-1)!:road.samples[0],heading=end.t.clone().multiplyScalar(this.direction);
    let best:{road:Road;d:number;direction:number;cost:number}|undefined;
    for(const next of this.roads.roads){if(next===road)continue;const hit=this.roads.nearest(end.p.x,end.p.z,false,next);if(hit.distance>3||Math.abs(hit.height-end.p.y)>1)continue;
      for(const direction of [-1,1]){const d=hit.sample.d+direction*22;if(!next.closed&&(d<8||d>next.length-8))continue;
        const cost=heading.angleTo(hit.sample.t.clone().multiplyScalar(direction));if(cost<2.4&&(!best||cost<best.cost))best={road:next,d,direction,cost};}
    }
    if(!best)return false;
    const lane=best.direction*best.road.width*.23,a=this.roads.at(road,distance),b=this.roads.at(best.road,best.d),start=a.p.clone().addScaledVector(a.r,this.lane),finish=b.p.clone().addScaledVector(b.r,lane),reach=Math.min(18,start.distanceTo(finish)*.42);
    const curve=new T.CubicBezierCurve3(start,start.clone().addScaledVector(a.t,this.direction*reach),finish.clone().addScaledVector(b.t,-best.direction*reach),finish);
    // Reject a connector that would cut outside either graded road corridor.
    for(let t=0;t<=1;t+=.08){const p=curve.getPoint(t),a=this.roads.nearest(p.x,p.z,false,road),b=this.roads.nearest(p.x,p.z,false,best.road);if(a.distance>road.width/2-1.2&&b.distance>best.road.width/2-1.2)return false;}
    this.connector={curve,length:curve.getLength(),travel:0,...best,lane};this.drift.reset();this.target=undefined;return true;
  }
  private connectSelected(road:Road,distance:number,exit:RouteExit){
    const a=this.roads.at(road,distance),lane=exit.direction*exit.road.width*.23;
    for(const ahead of [16,12,20,8]){
      const d=exit.d+exit.direction*ahead,b=this.roads.at(exit.road,d),start=a.p.clone().addScaledVector(a.r,this.lane),finish=b.p.clone().addScaledVector(b.r,lane);
      for(const factor of [.7,.85,.55,1]){
        const reach=start.distanceTo(finish)*factor,curve=new T.CubicBezierCurve3(start,start.clone().addScaledVector(a.t,this.direction*reach),finish.clone().addScaledVector(b.t,-exit.direction*reach),finish);
        let safe=true;
        for(let t=0;t<=1;t+=.04){const p=curve.getPoint(t),h=this.roads.nearest(p.x,p.z,false,road),k=this.roads.nearest(p.x,p.z,false,exit.road);if(h.distance>road.width/2-1.4&&k.distance>exit.road.width/2-1.4){safe=false;break;}}
        if(!safe)continue;
        this.connector={curve,length:curve.getLength(),travel:0,road:exit.road,d,direction:exit.direction,lane};this.drift.reset();this.target=undefined;return true;
      }
    }return false;
  }
  private followConnector(car:VehiclePhysics,speed:number,mode:Settings['autopilotMode'],input:Controls,dt:number,scene:NavigationScene){
    const turn=this.connector!;let best=Infinity,progress=turn.travel;
    // Bounded local projection follows physical travel; timers cannot skip the junction.
    for(let d=Math.max(0,turn.travel-3);d<=Math.min(turn.length,turn.travel+14);d+=.5){const error=turn.curve.getPointAt(d/turn.length).distanceToSquared(car.position);if(error<best){best=error;progress=d;}}
    turn.travel=Math.max(turn.travel,progress);
    const target=turn.curve.getPointAt(Math.min(1,(turn.travel+5+car.speed*.25)/turn.length)),delta=target.sub(car.position),angle=Math.atan2(-delta.dot(car.right),delta.dot(car.forward));
    input.steer=clamp(Math.atan2(4*car.chassis.halfLength*Math.sin(angle),Math.max(5,delta.length()))*(1+car.speed*car.chassis.steerFade)/(car.chassis.steerAngle*Math.sqrt(car.spec.handling)*(car.setup?.steering||1))-car.slip*.35,-1,1);
    if(mode==='full'){
      let desired=Math.min(speed/3.6,7);
      for(const other of scene.cars||[]){const road=other.road||this.road!,a=this.roads.at(road,other.d),delta=a.p.clone().addScaledVector(a.r,other.lane).sub(car.position),ahead=delta.dot(car.forward);if(ahead>0&&ahead<35&&Math.abs(delta.dot(car.right))<3)desired=Math.min(desired,Math.sqrt(Math.max(0,ahead-9)*5));}
      this.speedControls(car,desired,input);
    }this.smoothSteer(input,dt);
    if(car.position.distanceTo(turn.curve.getPointAt(1))<5){this.road=turn.road;this.direction=turn.direction;this.lane=turn.lane;this.connector=undefined;}
    return input;
  }
  /** Work backwards from upcoming bends using available braking distance. */
  private cornerSpeed(car:VehiclePhysics,distance:number,speedKmh:number,scene:NavigationScene){
    const road=this.road!;
    const wet=car.settings.weather==='rain',loose=car.surface==='GRAVEL'||car.surface==='GRASS';
    const traction=loose?.55*car.tune.loose:wet?.7*car.tune.wet:car.tune.dry;
    const lateral=(this.drift.phase==='initiate'||this.drift.phase==='hold'?4.0:3.6)*clamp(traction*Math.sqrt(car.spec.handling),.4,1.3);
    const braking=3.5*clamp(car.tune.brakeForce*traction,.4,1.4);
    let desired=clamp(Number(speedKmh)||90,30,180)/3.6;
    for(const zone of scene.limits||[]){
      if(zone.road!==road)continue;
      let gap=distance>=zone.start&&distance<zone.end?0:(this.direction>0?zone.start-distance:distance-zone.end);
      if(gap<0){if(!road.closed)continue;gap=wrap(gap,road.length);}
      const limit=Math.max(0,zone.limit-2)/3.6;
      desired=Math.min(desired,Math.sqrt(limit*limit+2*braking*Math.max(0,gap-15)));
    }
    for(let ahead=0;ahead<=Math.max(90,car.speed*4);ahead+=14){
      const a=this.roads.at(road,distance+this.direction*ahead);
      const b=this.roads.at(road,distance+this.direction*(ahead+18));
      const curvature=Math.abs(Math.atan2(a.t.z*b.t.x-a.t.x*b.t.z,a.t.x*b.t.x+a.t.z*b.t.z))/18;
      const crest=Math.max(0,a.t.y-b.t.y)/18;
      const turnSpeed=Math.min(Math.sqrt(lateral/Math.max(.0001,curvature)),Math.sqrt(4.5/Math.max(.0001,crest)));
      desired=Math.min(desired,Math.sqrt(turnSpeed*turnSpeed+2*braking*Math.max(0,ahead-10)));
    }
    return desired;
  }
  private speedControls(car: VehiclePhysics, desired: number, input: Controls) {
    const error = desired - car.speed;
    input.throttle = clamp(error * .22 + .12, 0, 1);
    input.brake = error < -1 ? clamp(-error * .22, 0, 1) : 0;
    // Braking must never engage reverse at a stop.
    input.handbrake = desired < .5 && car.speed < 1;
    if (input.brake > 0) input.throttle = 0;
    if (car.rpm > 7700 && car.gear < 8) car.shift(1);
    else if (car.rpm < 3000 && car.gear > 1) car.shift(-1);
    return input;
  }
}
