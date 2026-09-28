import * as T from 'three';
import {PhysicsWorld,VehiclePhysics,R} from '../physics/VehiclePhysics';
import {RoadNetwork,Road} from '../world/RoadNetwork';
import {SaveManager} from '../core/SaveManager';
import {makeCar} from '../vehicles/CarModel';
import {clamp,wrap} from '../core/math';
import {SpeedZones} from './SpeedZones';
import {PursuitRules} from './PursuitRules';
import {navigate,NavigationCar} from '../vehicles/AutopilotNavigation';
import {Controls} from '../input/InputManager';

export class PoliceManager {
  root=new T.Group();rules=new PursuitRules();zones:SpeedZones;
  units: {car:VehiclePhysics; visual:ReturnType<typeof makeCar>; cursor:number; lane:number; road?:Road; direction:number; nextPlan:number; input:Controls; red:T.MeshBasicMaterial;blue:T.MeshBasicMaterial}[]=[];
  trail=Array.from({length:512},()=>new T.Vector3());head=0;clock=0;limit=0;nearest=Infinity;
  disabled=false;
  clearWanted(){this.rules.finish(false);this.rules.cooldown=0;this.hide();this.nearest=Infinity;}
  message='';messageSerial=0;lastFine=0;
  constructor(public roads:RoadNetwork,public physics:PhysicsWorld,public save:SaveManager) {
    this.zones=new SpeedZones(roads);
    for(let i=0;i<2;i++) {
      const car=new VehiclePhysics(physics,roads,{...save.settings,automatic:true,stability:true,traction:true}),visual=makeCar(false);
      car.spec={...car.spec,power:car.spec.power*1.85,topSpeed:88,handling:1.12};
      car.body.setEnabled(false);visual.root.visible=false;
      visual.paint.color.set('#e7ebef');visual.body.position.y=-.545;
      const stripe=new T.Mesh(new T.BoxGeometry(1.94,.2,3.3),new T.MeshStandardMaterial({color:0x142637}));stripe.position.y=.18;visual.root.add(stripe);
      const base=new T.Mesh(new T.BoxGeometry(1.25,.08,.35),new T.MeshStandardMaterial({color:0x101722}));base.position.set(0,.99,.05);visual.root.add(base);
      const red=new T.MeshBasicMaterial({color:0xff2444}),blue=new T.MeshBasicMaterial({color:0x178aff});
      for(const side of [-1,1]){const lamp=new T.Mesh(new T.BoxGeometry(.5,.17,.32),side<0?red:blue);lamp.position.set(side*.32,1.1,.05);visual.root.add(lamp);}
      this.root.add(visual.root);this.units.push({car,visual,cursor:0,lane:0,direction:1,nextPlan:0,input:{throttle:0,brake:0,steer:0,handbrake:false,up:false,down:false},red,blue});
    }
  }
  get active(){return this.rules.active;}
  say(message:string){this.message=message;this.messageSerial++;}
  start(player:VehiclePhysics) {
    const hit=this.roads.nearest(player.position.x,player.position.z,true),direction=player.forward.dot(hit.sample.t)>=0?1:-1;
    this.head=24;
    for(let i=0;i<=24;i++) {
      const d=hit.sample.d-(24-i)*6*direction,a=this.roads.at(hit.road,d);
      this.trail[i].copy(a.p).addScaledVector(a.r,clamp(hit.offset,-3,3));
      if(!hit.road.closed)this.trail[i].addScaledVector(a.t,d<0?d:d>hit.road.length?d-hit.road.length:0);
    }
    this.trail[24].copy(player.position);
    for(let i=0;i<this.units.length;i++) {
      const unit=this.units[i],index=12-i*6,p=this.trail[index],a=this.roads.at(hit.road,hit.sample.d-(24-index)*6*direction);
      unit.car.body.setEnabled(true);unit.car.setPosition(p.x,p.y+.8,p.z,Math.atan2(-a.t.x*direction,-a.t.z*direction));
      unit.car.body.setLinvel({x:a.t.x*direction*Math.min(25,player.speed),y:0,z:a.t.z*direction*Math.min(25,player.speed)},true);
      unit.cursor=index+2;unit.lane=clamp(hit.offset,-3,3);unit.road=hit.road;unit.direction=direction;unit.nextPlan=0;unit.visual.root.visible=true;
    }
    this.say('POLICE PURSUIT · Escape beyond 220 m for 8 seconds, or pull over');
  }
  hide(){for(const u of this.units){u.car.body.setEnabled(false);u.visual.root.visible=false;}}
  physicallyIntercepts(player:VehiclePhysics){
    if(this.disabled||!this.active)return false;
    for(const u of this.units){
      if(!u.car.body.isEnabled())continue;
      const delta=u.car.position.clone().sub(player.position),distance=delta.length();
      if(distance>=8||Math.abs(delta.y)>2.5)continue;
      if(distance<.01)return true;
      delta.divideScalar(distance);
      const obstruction=this.physics.world.castRay(new R.Ray(player.position,delta),distance,true,undefined,undefined,undefined,player.body,c=>c.parent()?.handle!==u.car.body.handle);
      if(!obstruction)return true;
    }return false;
  }
  recovered(){this.rules.capture=0;this.rules.warning=0;}
  caught(player:VehiclePhysics) {
    if(!this.active||this.rules.capture<3||player.speed*3.6>=9||!this.physicallyIntercepts(player))return false;
    this.rules.finish(true);this.hide();this.lastFine=this.save.payFine(50);player.boostRemaining=0;
    player.body.setLinvel({x:0,y:0,z:0},true);player.body.setAngvel({x:0,y:0,z:0},true);
    this.say(`CAUGHT · ${this.lastFine} coins deducted · 5-second stop`);return true;
  }
  preStep(dt:number,player:VehiclePhysics,racing:boolean,traffic:NavigationCar[]=[]) {
    if(this.disabled){this.limit=0;return;}
    this.clock+=dt;this.limit=racing?0:this.zones.limitAt(player.position);
    this.nearest=Infinity;
    if(this.active)for(const u of this.units)if(u.car.body.isEnabled())this.nearest=Math.min(this.nearest,u.car.position.distanceTo(player.position));
    const detectionLimit=player.crashCooldown>0||player.contacts<2?0:this.limit;
    const event=this.rules.tick(dt,player.speed*3.6,detectionLimit,this.nearest,racing,this.physicallyIntercepts(player));
    if(event==='start')this.start(player);
    if(event==='caught')this.caught(player);
    if(event==='escaped'){this.hide();this.say('PURSUIT ESCAPED · No fine');}
    if(!this.active)return;
    if(this.trail[this.head%512].distanceToSquared(player.position)>36){this.head++;this.trail[this.head%512].copy(player.position);}
    for(const u of this.units) {
      const car=u.car;if(!car.body.isEnabled())continue;
      if(car.position.y<-8){car.body.setEnabled(false);u.visual.root.visible=false;continue;}
      u.cursor=Math.max(u.cursor,this.head-500);
      while(u.cursor<this.head && car.position.distanceTo(this.trail[u.cursor%512])<12+car.speed*.2)u.cursor++;
      if(this.clock>=u.nextPlan){this.plan(u,player,traffic);u.nextPlan=this.clock+.1;}
      car.preStep(u.input,dt);

    }
  }
  /** Pursuit decisions run at 10 Hz; vehicle suspension/contacts follow the fixed physics timestep. */
  plan(u:PoliceManager['units'][number],player:VehiclePhysics,traffic:NavigationCar[]) {
    const car=u.car,hit=this.roads.nearest(car.position.x,car.position.z),playerHit=this.roads.nearest(player.position.x,player.position.z);
    // Keep the assigned road at crossings until the actual recorded trail takes another road.
    const onAssigned=u.road?this.roads.nearest(car.position.x,car.position.z,false,u.road):hit;
    const here=onAssigned.distance<(u.road?.width||16)/2+4?onAssigned:hit;
    if(u.road!==here.road)u.direction=car.forward.dot(here.sample.t)>=0?1:-1;
    u.road=here.road;
    const road=here.road,direction=u.direction,look=10+car.speed*.5,gap=car.position.distanceTo(player.position),edge=road.width/2-1.8;
    let desired=Math.min(84,Math.max(20,player.speed+12+Math.min(14,gap*.045)));
    let target:T.Vector3;
    if(road===playerHit.road){
      const signed=road.closed?wrap((playerHit.sample.d-here.sample.d)*direction+road.length/2,road.length)-road.length/2:(playerHit.sample.d-here.sample.d)*direction;
      // Lead unit moves toward the player's projected lane. The second covers the other side.
      const index=this.units.indexOf(u),side=index===0||signed< -8?0:(playerHit.offset>=0?-3.4:3.4);
      const intercept=clamp(playerHit.offset+side,-edge,edge);
      const peers=traffic.concat(this.units.filter(other=>other!==u&&other.car.body.isEnabled()).map(other=>{const h=this.roads.nearest(other.car.position.x,other.car.position.z,false,road);return {road,d:h.sample.d,lane:h.offset,speed:other.car.speed,direction:other.direction};}));
      const route=navigate(road,here.sample.d,direction,car.speed,here.offset,u.lane,{cars:peers,preferredLane:gap<130?intercept:road.width*.23*direction});
      u.lane+=clamp(route.lane-u.lane,-.42,.42);desired=Math.min(desired,route.speedLimit);
      target=this.roads.at(road,here.sample.d+direction*look).p.clone().addScaledVector(this.roads.at(road,here.sample.d+direction*look).r,u.lane);
      // Pull alongside with a small closing speed; avoid blindly ramming a stopped car.
      if(index===0&&signed>=0&&gap<25)desired=Math.min(desired,Math.max(0,player.speed+(gap-6)*.85));
      if(signed< -8){desired=Math.min(desired,Math.max(0,player.speed-5));}
    }else{
      // Trail retains the player's junction choice instead of cutting diagonally across terrain.
      target=this.trail[Math.min(this.head,u.cursor+1)%512].clone();desired=Math.min(desired,26);
    }
    const wet=car.settings.weather==='rain'?.72:1;
    for(let ahead=0;ahead<=Math.max(100,car.speed*4);ahead+=18){
      const a=this.roads.at(road,here.sample.d+direction*ahead),b=this.roads.at(road,here.sample.d+direction*(ahead+18));
      const curvature=Math.acos(clamp(a.t.dot(b.t),-1,1))/18;
      desired=Math.min(desired,Math.sqrt(4.5*wet/Math.max(.0001,curvature)+2*5.5*wet*Math.max(0,ahead-12)));
    }
    // Probe full vehicle width against scenery and crashed traffic; player contact is intentional.
    const clearance=(point:T.Vector3)=>{
      const delta=point.clone().sub(car.position),length=Math.max(1,delta.length());delta.normalize();let clear=length;
      for(const side of [-.82,0,.82]){
        const origin=car.position.clone().addScaledVector(car.right,side);origin.y+=.18;
        const hit=this.physics.world.castRay(new R.Ray(origin,delta),length,true,undefined,undefined,undefined,car.body,c=>c.parent()?.handle!==player.body.handle);
        if(hit)clear=Math.min(clear,hit.timeOfImpact);
      }return clear;
    };
    let clear=clearance(target);
    if(clear<Math.max(8,look*.8)){
      const a=this.roads.at(road,here.sample.d+direction*look);let best=clear;
      for(const lane of [-edge,0,edge]){const option=a.p.clone().addScaledVector(a.r,lane),room=clearance(option);if(room>best+2){best=room;u.lane+=clamp(lane-u.lane,-.42,.42);target=a.p.clone().addScaledVector(a.r,u.lane);}}
      clear=clearance(target);desired=Math.min(desired,Math.sqrt(Math.max(0,clear-5)*8));
    }
    const delta=target.sub(car.position),distance=Math.max(3,delta.length()),angle=Math.atan2(-delta.dot(car.right),delta.dot(car.forward));
    const steer=clamp(Math.atan2(5.72*Math.sin(angle),distance)*(1+car.speed*car.chassis.steerFade)/(car.chassis.steerAngle*Math.sqrt(car.spec.handling)),-1,1);
    if(Math.abs(angle)>.6||Math.abs(here.offset)>edge+.5)desired=Math.min(desired,8);
    const error=desired-car.speed;
    u.input={throttle:clamp(error*.25+.16,0,1),brake:error<-1?clamp(-error*.25,0,1):0,steer,handbrake:desired<.5&&car.speed<1,up:false,down:false};
  }
  postStep(dt:number) {
    if(!this.active)return;
    for(const u of this.units) {
      if(!u.car.body.isEnabled())continue;
      const c=u.car,v=u.visual;c.postStep(dt);v.root.position.copy(c.position);v.root.quaternion.copy(c.rotation);
      for(let i=0;i<4;i++){v.steers[i].position.y=.03-(c.controller.wheelSuspensionLength(i)??.3);v.steers[i].rotation.y=i<2?c.steering:0;v.wheels[i].rotation.x=c.wheelSpin;}
      const flash=Math.floor(this.clock*9)%2;u.red.color.setHex(flash?0xff2444:0x48101a);u.blue.color.setHex(flash?0x092846:0x178aff);
      v.brake.emissiveIntensity=c.braking>.1?4:.6;
    }
  }
}
