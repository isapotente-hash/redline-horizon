import {raceCondition} from '../core/Weather';
import * as T from "three";
import { RoadNetwork,surfaceBank } from "../world/RoadNetwork";
import { PhysicsWorld, VehiclePhysics } from "../physics/VehiclePhysics";
import { TrafficManager } from "../vehicles/TrafficManager";
import {recoverVehicle} from "../vehicles/Recovery";
import {RouteId,routeRoad} from "./RouteCatalog";
import { clamp, damp, wrap } from "../core/math";
export class RaceManager {
  route:import("../world/RoadNetwork").Road;routeId:RouteId="horizon";practice=false;
  get totalLength(){return this.route.closed?this.route.length:this.route.length-this.startDistance-16;}
  routeDistance(progress:number){return this.route.closed?wrap(this.startDistance+progress,this.route.length):Math.min(this.route.length-16,this.startDistance+progress);}
  recover(car:VehiclePhysics){const progress=Math.min(this.totalLength,(this.checkpoint%this.count)*this.totalLength/this.count);const ok=recoverVehicle(car,this.route,this.routeDistance(progress));if(ok&&this.active&&this.countdown<=0&&!this.networkRace)this.elapsed+=3;return ok;}
  networkRace=false;
  playerProgress=0;
  networkCount=2;
  localSlot=0;
  opponents=new Map<number,{progress:number;finished:boolean;time:number;connected:boolean}>();
  configurePlayers(slots:number[],local:number){
    this.networkCount=slots.length;this.localSlot=local;this.opponents.clear();
    for(const slot of slots)if(slot!==local)this.opponents.set(slot,{progress:0,finished:false,time:0,connected:true});
  }
  updateOpponent(slot:number,progress:number,finished:boolean,time:number){
    const opponent=this.opponents.get(slot);if(!opponent)return;
    Object.assign(opponent,{progress,finished,time});this.rankNetwork();
  }
  updateRoster(slots:number[]){
    for(const [slot,p] of this.opponents)p.connected=slots.includes(slot);
    this.rankNetwork();
  }
  rankNetwork(){
    if(!this.networkRace)return;
    this.position=1;
    for(const [slot,p] of this.opponents){
      if(this.finished){if(p.finished&&(p.time<this.resultTime||(p.time===this.resultTime&&slot<this.localSlot)))this.position++;}
      else if(p.finished||(p.connected&&(p.progress>this.playerProgress||(p.progress===this.playerProgress&&slot<this.localSlot))))this.position++;
    }
  }
  get networkResult(){
    let finished=0,dnf=0;
    for(const p of this.opponents.values()){if(p.finished)finished++;else if(!p.connected)dnf++;}
    return `${finished}/${this.networkCount-1} OPPONENTS FINISHED${dnf?` · ${dnf} DISCONNECTED`:''}${finished+dnf<this.networkCount-1?' · POSITION PROVISIONAL':''}`;
  }
  get standings(){
    return [{slot:this.localSlot,finished:this.finished,time:this.resultTime,connected:true,progress:this.playerProgress},...Array.from(this.opponents,([slot,p])=>({slot,...p}))]
      .sort((a,b)=>Number(b.finished)-Number(a.finished)||(a.finished?a.time-b.time:Number(b.connected)-Number(a.connected)||b.progress-a.progress)||a.slot-b.slot);
  }
  condition:"dry"|"wet"="dry";
  active = false;
  finished = false;
  elapsed = 0;
  lapSerial=0;lastLapTime=0;lastLapNumber=0;lastLapAssisted=false;assistUsed=false;
  private lapStartedAt=0;private readonly gateForward=new T.Vector3();private readonly gateDelta=new T.Vector3();
  countdown = 0;
  checkpoint = 0;
  count = 19;
  laps = 1;
  get lap() { return Math.min(this.laps,1+Math.floor(this.checkpoint/this.count)); }
  finish = new T.Group();
  position = 8;
  best = 0;
  startDistance = 120;
  ai: TrafficManager;
  gate = new T.Group();
  progress: number[] = [];
  resultTime = 0;
  rewardEarned=0;
  private rewardClaimed=false;
  claimReward() {
    if(this.networkRace)return 0;
    if(!this.finished||this.checkpoint<this.count*this.laps||this.rewardClaimed)return 0;
    this.rewardClaimed=true;
    this.rewardEarned=(50+(8-clamp(this.position,1,8))*10)*this.laps;
    return this.rewardEarned;
  }
  constructor(
    public roads: RoadNetwork,
    physics: PhysicsWorld,
  ) {
    this.route=roads.main;this.count = Math.ceil(roads.main.length / 380);
    this.ai = new TrafficManager(roads, physics, 7);
    this.ai.root.visible = false;
    this.ai.active = false;
    this.ai.cars.forEach(car=>car.body.setEnabled(false));
    const mat = new T.MeshStandardMaterial({
      color: "#b81830",
      emissive: "#9d051f",
      emissiveIntensity: 0.25,
    });
    for (const s of [-1, 1]) {
      const post = new T.Mesh(new T.CylinderGeometry(0.13, 0.13, 5, 8), mat);
      post.position.set(s * 7.6, 2.5, 0);
      this.gate.add(post);
      const flag = new T.Mesh(new T.BoxGeometry(0.7, 1.6, 0.025), mat);
      flag.position.set(s * 7.6, 3.5, 0);
      this.gate.add(flag);
    }
    this.gate.visible = false;
    // A persistent start/finish gantry and road stripe, with no invisible collider.
    const black=new T.MeshStandardMaterial({color:0x141a23}),white=new T.MeshStandardMaterial({color:0xf2eee1});
    const square=new T.PlaneGeometry(.9,.9),tile=new T.BoxGeometry(.9,.65,.07);
    for(let x=0;x<18;x++)for(let row=0;row<2;row++) {
      const mat=(x+row)%2?black:white;
      const floor=new T.Mesh(square,mat);floor.rotation.x=-Math.PI/2;floor.position.set((x-8.5)*.9,.035,(row-.5)*.9);this.finish.add(floor);
      const banner=new T.Mesh(tile,mat);banner.position.set((x-8.5)*.9,5.3+row*.65,0);this.finish.add(banner);
    }
    for(const side of [-1,1]){const pole=new T.Mesh(new T.CylinderGeometry(.12,.12,6.2,8),white);pole.position.set(side*8.7,3.1,0);this.finish.add(pole);}
    const line=roads.at(roads.main,this.startDistance);this.finish.position.copy(line.p);this.finish.rotation.y=Math.atan2(line.t.x,line.t.z);this.finish.visible=false;
  }
  start(car: VehiclePhysics, laps=1, network=false,routeId:RouteId="horizon") {
    this.condition=raceCondition(car.settings);
    this.routeId=routeId;this.route=routeRoad(this.roads,routeId);this.practice=false;this.startDistance=this.route.closed?120:80;this.count=Math.ceil(this.totalLength/380);
    this.networkRace=network;this.playerProgress=0;this.configurePlayers([0,1],0);
    this.rewardClaimed=false;this.rewardEarned=0;
    this.laps=this.route.closed&&laps===3?3:1;this.finish.visible=true;
    const line=this.roads.at(this.route,this.route.closed?this.startDistance:this.route.length-16);this.finish.position.copy(line.p);this.finish.rotation.set(-Math.asin(clamp(line.t.y,-1,1)),Math.atan2(line.t.x,line.t.z),surfaceBank(line),"YXZ");this.finish.scale.x=this.route.width/16;
    this.active = true;
    this.finished = false;
    this.elapsed = 0;
    this.lapStartedAt=0;this.lastLapTime=0;this.lastLapNumber=0;this.assistUsed=false;
    this.countdown = 3;
    this.checkpoint = 0;
    this.position = network?1:8;
    this.resultTime = 0;
    this.ai.root.visible = !network;
    this.ai.active = !network;
    this.progress = this.ai.cars.map((c, i) => {
      if(network){c.body.setEnabled(false);return 0;}
      c.road=this.route;c.turn=undefined;c.d = this.startDistance + 12 + Math.floor(i / 2) * 7;
      c.lane = (i % 2 ? .32 : -.10)*this.route.width;
      c.direction = 1;
      c.speed = 0;
      c.target = 53 + i * 0.8;
      c.body.setEnabled(true);this.ai.recover(c);
      return c.d - this.startDistance;
    });
    car.teleport(this.route, this.startDistance);
    this.placeGate();
  }
  cancel() {
    this.networkRace=false;
    this.active = false;
    this.finished = false;
    this.ai.root.visible = false;
    this.gate.visible = false;
    this.finish.visible=false;this.ai.active=false;
    this.ai.cars.forEach((c, i) => {c.body.setEnabled(false);c.body.setTranslation({ x: 0, y: -2000 - i * 3, z: 0 }, false);});
  }
  placeGate() {
    const a = this.roads.at(
      this.route,
      this.routeDistance(((this.checkpoint + 1) * this.totalLength) / this.count),
    );
    this.gate.position.copy(a.p);
    this.gate.rotation.set(-Math.asin(clamp(a.t.y,-1,1)),Math.atan2(a.t.x,a.t.z),surfaceBank(a),"YXZ");this.gate.scale.x=this.route.width/16;
    this.gate.visible = true;
  }
  update(dt: number, car: VehiclePhysics) {
    if (!this.active) return;
    if(!this.networkRace)this.countdown -= dt;
    if (this.countdown > 0) return;
    if(!this.networkRace)this.elapsed += dt;
    const length = this.totalLength;
    for (let i = 0; !this.networkRace && i < this.ai.cars.length; i++) {
      const c = this.ai.cars[i];
      if(this.ai.crashStep(c,dt,car.position))continue;
      const
        a = this.roads.at(this.route, c.d),
        b = this.roads.at(this.route, c.d + 70),
        turn = a.t.angleTo(b.t),
        target =
          Math.min(c.target, Math.sqrt((9.8 * 70) / Math.max(0.02, turn))) *
          (0.88 + i * 0.015);
      c.speed = damp(c.speed, Math.min(target, 10 + this.elapsed * 9), 1.8, dt);
      this.progress[i] += c.speed * dt;
      c.d = this.routeDistance(this.progress[i]);
      this.ai.pose(c, dt);
    }
    const next = this.gate.position;
    const gateForward=this.gateForward.set(0,0,1).applyQuaternion(this.gate.quaternion);
    if (car.position.distanceTo(next) < 19 && this.gateDelta.copy(car.position).sub(next).dot(gateForward)>=-1) {
      this.checkpoint++;
      if(this.route.closed&&this.checkpoint%this.count===0){
        this.lastLapTime=this.elapsed-this.lapStartedAt;this.lapStartedAt=this.elapsed;
        this.lastLapNumber=this.checkpoint/this.count;this.lastLapAssisted=this.assistUsed;this.assistUsed=false;this.lapSerial++;
      }
      if (this.checkpoint >= this.count*this.laps) {
        this.playerProgress=length*this.laps;
        if(!this.networkRace)this.position=1+this.progress.filter(v=>v>length*this.laps).length;
        this.active = false;
        this.finished = true;
        this.resultTime = this.elapsed;
        this.rankNetwork();
        if(!this.networkRace)this.best = this.best
          ? Math.min(this.best, this.elapsed)
          : this.elapsed;
        this.gate.visible = false;
        return;
      }
      this.placeGate();
    }
    const n = this.roads.nearest(car.position.x, car.position.z,false,this.route),
      since = this.route.closed?wrap(n.sample.d-this.startDistance-(this.checkpoint*length)/this.count,length):Math.max(0,n.sample.d-this.startDistance-(this.checkpoint*length)/this.count),
      playerProgress =
        (this.checkpoint * length) / this.count +
        clamp(since, 0, length / this.count);
    this.playerProgress=playerProgress;
    if(this.networkRace){
      if(this.route.closed&&this.checkpoint===0&&since>length-50)this.playerProgress=0;
      this.rankNetwork();
    }else this.position = 1 + this.progress.filter((v) => v > playerProgress).length;
  }
}
