import {makeVehicle} from './VehicleModels';
import {CARS,chassisFor,isBike} from './CarCatalog';
import * as T from "three";
import { RoadNetwork, Road,roadHeight,surfaceBank } from "../world/RoadNetwork";
import { PhysicsWorld, VehiclePhysics, R } from "../physics/VehiclePhysics";
import { makeCar } from "./CarModel";
import { clamp, damp, wrap } from "../core/math";
import {trafficRange} from './TrafficRange';
export type TrafficCar = {
  road:Road;
  root: T.Group;
  detail: T.Group;
  low: T.Group;
  body: ReturnType<PhysicsWorld["world"]["createRigidBody"]>;
  collider: ReturnType<PhysicsWorld['world']['createCollider']>;
  crashTime:number;
  spawnRetry?:number;
  halfWidth:number;
  bodyHeight:number;
  turn?:{curve:T.CubicBezierCurve3;length:number;travel:number;road:Road;d:number;direction:number;lane:number};
  bike:boolean;
  radius:number;
  d: number;
  speed: number;
  target: number;
  lane: number;
  direction: number;
  wheels: T.Object3D[];
  brake: T.MeshStandardMaterial;
  paint: T.MeshPhysicalMaterial;
};
export class TrafficManager {
  cars: TrafficCar[] = [];
  root = new T.Group();
  template = makeCar(false);
  active = true;
  private p=new T.Vector3();private tangent=new T.Vector3();private right=new T.Vector3();private up=new T.Vector3();private back=new T.Vector3();private matrix=new T.Matrix4();

  constructor(
    public roads: RoadNetwork,
    public physics: PhysicsWorld,
    public capacity = 24,
  ) {
    const colors = [
      "#e0ded4",
      "#35434f",
      "#a0917c",
      "#15392c",
      "#a4382e",
      "#b4b9c1",
    ];
    const variants=[this.template,makeVehicle(CARS.find(c=>c.id==='atlas')!),makeVehicle(CARS.find(c=>c.id==='pulse')!),makeVehicle(CARS.find(c=>c.id==='comet')!)];
    for (let i = 0; i < capacity; i++) {
      const kind=i%8===2?1:i%8===5?2:i%8===7?3:0;
      const source=variants[kind],spec=CARS.find(c=>c.id===(kind===1?'atlas':kind===2?'pulse':kind===3?'comet':'vanta'))!,chassis=chassisFor(spec);
      const detail = source.root.clone(true),
        root = new T.Group(),
        low = new T.Group(),
        paint = source.paint.clone(),
        brake = source.brake.clone();
      paint.color.set(colors[i % 6]);
      root.add(detail, low);
      low.visible = false;
      const simpleBody = new T.Mesh(new T.BoxGeometry(1.95, 0.54, 4.5), paint);
      simpleBody.position.y = 0.56;
      low.add(simpleBody);
      const cabin = new T.Mesh(
        new T.BoxGeometry(1.46, 0.43, 1.8),
        source.glass,
      );
      cabin.position.set(0, 1.02, 0.1);
      low.add(cabin);
      const tyreMat = new T.MeshStandardMaterial({
        color: "#17191b",
        roughness: 0.85,
      });
      for (let j = 0; j < 4; j++) {
        const wheel = new T.Mesh(
          new T.CylinderGeometry(0.36, 0.36, 0.21, 8),
          tyreMat,
        );
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(j % 2 ? 1 : -1, 0.36, j < 2 ? -1.43 : 1.43);
        low.add(wheel);
      }
      detail.traverse((o) => {
        if (o instanceof T.Mesh) {
          if (o.material === source.paint) o.material = paint;
          if (o.material === source.brake) o.material = brake;
        }
      });
      root.scale.set(
        i % 3 === 0 ? 1.04 : 1,
        i % 3 === 0 ? 1.09 : 1,
        i % 4 === 0 ? 1.06 : 1,
      );
      const body = physics.world.createRigidBody(
        R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -1000, 0),
      );
      const collider=physics.world.createCollider(
        R.ColliderDesc.cuboid(chassis.halfBody[0]+.05,isBike(spec)?.5:spec.kit==="pickup"?.8:.5,chassis.halfBody[2]+.15).setMass(chassis.mass).setFriction(0.6).setRestitution(.15),
        body,
      );
      body.setEnabled(false);root.visible=false;
      this.root.add(root);
      this.cars.push({
        road:this.roads.main,
        root,
        detail,
        low,
        body,collider,crashTime:0,halfWidth:chassis.halfBody[0],bodyHeight:spec.kit==="pickup"?.85:.55,bike:isBike(spec),radius:chassis.radius,
        d: 800 + i * 140,
        speed: 27,
        target: 24 + (i % 5) * 3,
        lane: i % 4 === 0 ? -5.5 : i % 2 === 0 ? 2 : 5.5,
        direction: i % 4 === 0 ? -1 : 1,
        wheels: ["FL", "FR", "RL", "RR"].map(
          (n) => root.getObjectByName("wheel_" + n)!,
        ),
        brake,
        paint,
      });
    }
  }
  collisions(player:VehiclePhysics) {
    this.physics.world.contactPairsWith(player.collider,(other)=>{
      const c=this.cars.find(c=>c.collider.handle===other.handle);
      if(!c||c.crashTime>0||!c.body.isEnabled())return;
      const v=player.beforeVelocity,a=this.roads.at(c.road,c.d),relative=Math.hypot(v.x-a.t.x*c.speed*c.direction,v.z-a.t.z*c.speed*c.direction);
      if(relative<2 && player.impact<.08)return;
      c.crashTime=4;c.turn=undefined;c.body.setBodyType(R.RigidBodyType.Dynamic,true);c.body.enableCcd(true);
      c.body.setLinearDamping(1.1);c.body.setAngularDamping(2.5);
      c.body.setLinvel({x:a.t.x*c.speed*c.direction*.5+v.x*.35,y:0,z:a.t.z*c.speed*c.direction*.5+v.z*.35},true);
      if(relative>10 && player.crashCooldown===0){player.crashSerial++;player.crashSeverity=clamp(relative/35,.35,1);player.crashCooldown=1.8;}
    });
  }
  recover(c:TrafficCar) {
    c.crashTime=0;c.turn=undefined;c.speed=0;c.body.setBodyType(R.RigidBodyType.KinematicPositionBased,true);
    this.pose(c,0);c.body.setTranslation(this.p,true);c.body.setRotation(c.root.quaternion,true);
    c.body.setEnabled(true);c.root.visible=true;
  }
  crashStep(c:TrafficCar,dt:number,player:T.Vector3,allowRecovery=true) {
    if(c.crashTime<=0)return false;
    c.crashTime=Math.max(.001,c.crashTime-dt);
    const p=c.body.translation(),q=c.body.rotation();c.root.quaternion.set(q.x,q.y,q.z,q.w);this.up.set(0,c.bodyHeight,0).applyQuaternion(c.root.quaternion);c.root.position.set(p.x,p.y,p.z).sub(this.up);c.brake.emissiveIntensity=4;
    // Race opponents retain their existing recovery. Streamed traffic recycles out of sight.
    if(allowRecovery&&c.crashTime<=.001&&c.root.position.distanceTo(player)>35)this.recover(c);
    return true;
  }
  pose(c: TrafficCar, dt: number) {
    c.lane=clamp(c.lane,-c.road.width/2+c.halfWidth+.65,c.road.width/2-c.halfWidth-.65);
    if(c.turn){const f=clamp(c.turn.travel/c.turn.length,0,1);c.turn.curve.getPointAt(f,this.p);c.turn.curve.getTangentAt(f,this.tangent);}
    else {
      const a=this.roads.at(c.road,c.d),before=this.roads.at(c.road,c.d-1),after=this.roads.at(c.road,c.d+1);
      this.p.copy(a.p).addScaledVector(a.r,c.lane);this.p.y=roadHeight(a,c.lane);
      this.tangent.copy(after.p).addScaledVector(after.r,c.lane).sub(before.p).addScaledVector(before.r,-c.lane);
      this.tangent.y=roadHeight(after,c.lane)-roadHeight(before,c.lane);this.tangent.normalize().multiplyScalar(c.direction);
    }
    this.right.set(-this.tangent.z,0,this.tangent.x).normalize();this.up.crossVectors(this.right,this.tangent).normalize();this.back.copy(this.tangent).negate();
    this.matrix.makeBasis(this.right,this.up,this.back);c.root.quaternion.setFromRotationMatrix(this.matrix);c.root.position.copy(this.p);
    if(!c.turn){const a=this.roads.at(c.road,c.d);c.root.rotateZ(surfaceBank(a)*c.direction);this.up.set(0,1,0).applyQuaternion(c.root.quaternion);}
    this.p.addScaledVector(this.up,c.bodyHeight);c.body.setNextKinematicTranslation(this.p);c.body.setNextKinematicRotation(c.root.quaternion);
    for(const w of c.wheels)if(w)w.rotation.x-=(c.speed*dt)/c.radius;
    c.brake.emissiveIntensity=c.speed<c.target-4?4:.6;
  }
  private beginTurn(c:TrafficCar){
    const end=c.direction>0?c.road.samples.at(-1)!:c.road.samples[0],heading=end.t.clone().multiplyScalar(c.direction);
    let best:{road:Road;d:number;direction:number;angle:number}|undefined;
    for(const road of this.roads.roads){if(road===c.road)continue;
      const hit=this.roads.nearest(end.p.x,end.p.z,false,road);if(hit.distance>3)continue;
      for(const direction of [-1,1]){
        const d=hit.sample.d+direction*18;if(!road.closed&&(d<5||d>road.length-5))continue;
        const angle=heading.angleTo(hit.sample.t.clone().multiplyScalar(direction));
        if(!best||angle<best.angle)best={road,d,direction,angle};
      }
    }
    if(!best)return;
    const lane=best.direction*(best.road.width>14?5.5:best.road.width*.25),a=this.roads.at(c.road,c.d),b=this.roads.at(best.road,best.d);
    const start=a.p.clone().addScaledVector(a.r,c.lane),finish=b.p.clone().addScaledVector(b.r,lane),reach=Math.min(16,start.distanceTo(finish)*.5);
    const curve=new T.CubicBezierCurve3(start,start.clone().addScaledVector(a.t,c.direction*reach),finish.clone().addScaledVector(b.t,-best.direction*reach),finish);
    c.turn={curve,length:curve.getLength(),travel:0,road:best.road,d:best.d,direction:best.direction,lane};
  }
  private spawn(c:TrafficCar,index:number,player:T.Vector3,view:T.Vector3,range:ReturnType<typeof trafficRange>,nearest:ReturnType<RoadNetwork['nearest']>) {
    // Try valid road positions; never clamp an out-of-range candidate onto a nearby road end.
    for(const road of [nearest.road,...this.roads.roads.filter(r=>r!==nearest.road)]) {
      const hit=road===nearest.road?nearest:this.roads.nearest(player.x,player.z,false,road);
      if(!Number.isFinite(hit.distance)||hit.distance>range.retain)continue;
      for(let attempt=0;attempt<8;attempt++) {
        const side=(index+attempt)%2?1:-1;
        const distance=range.spawn+((index*37+attempt*43)%120);
        const d=hit.sample.d+side*distance;
        if(!road.closed&&(d<35||d>road.length-35))continue;
        const candidate=road.closed?wrap(d,road.length):d;
        const direction=index%4===0?-1:1;
        const lane=direction*(road.width>14?(index%2?5.5:2):road.width*.25);
        const a=this.roads.at(road,candidate),position=a.p.clone().addScaledVector(a.r,lane);
        const separation=position.distanceTo(player);
        if(separation<range.spawn||separation>range.retain-15||position.distanceTo(view)<range.spawn)continue;
        if(this.cars.some(other=>other!==c&&other.body.isEnabled()&&other.root.position.distanceToSquared(position)<32*32))continue;
        c.road=road;c.d=candidate;c.direction=direction;c.lane=lane;c.turn=undefined;c.crashTime=0;c.speed=c.target;
        c.body.setBodyType(R.RigidBodyType.KinematicPositionBased,true);
        this.pose(c,0);c.body.setTranslation(this.p,true);c.body.setRotation(c.root.quaternion,true);
        c.body.setEnabled(true);return true;
      }
    }
    return false;
  }
  update(dt: number, player: T.Vector3, _quality: string, simulationDistance=1200, renderDistance=1600, view=player, playerSpeed=0) {
    const range=trafficRange(playerSpeed,simulationDistance,renderDistance);
    const count = this.active
        ? this.cars.length
        : 0,
      nearest = this.roads.nearest(player.x, player.z);
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      if (i >= count) {
        c.root.visible=false;c.body.setEnabled(false);
        continue;
      }
      if(c.body.isEnabled()&&this.crashStep(c,dt,player,false)) {
        c.root.visible=c.root.position.distanceTo(view)<range.visible;
        if(c.root.position.distanceTo(player)<=range.retain||c.root.position.distanceTo(view)<=range.visible+80)continue;
      }
      // The unload buffer prevents toggling at a distance boundary or after Auto changes tier.
      // Never recycle a car that either the driver or the free camera can still see.
      if(!c.body.isEnabled()||(c.root.position.distanceTo(player)>range.retain&&c.root.position.distanceTo(view)>range.visible+80)) {
        c.root.visible=false;c.body.setEnabled(false);
        c.spawnRetry=Math.max(0,(c.spawnRetry||0)-dt);
        if(c.spawnRetry>0)continue;
        if(!this.spawn(c,i,player,view,range,nearest)){c.spawnRetry=.5+i*.02;continue;}
      }
      const a = this.roads.at(c.road, c.d),
        ahead = this.roads.at(c.road, c.d + c.direction * 50),
        angle = a.t.angleTo(ahead.t);
      if(!c.road.closed&&!c.turn && (c.direction>0?c.road.length-c.d:c.d)<25)this.beginTurn(c);
      let desired = Math.min(
        c.target,
        Math.sqrt((9.8 * 50) / Math.max(0.02, angle)),
      );
      if(c.turn)desired=Math.min(desired,10);
      else if(!c.road.closed)desired=Math.min(desired,Math.sqrt(4*Math.max(0,(c.direction>0?c.road.length-c.d:c.d)-7)));
      const toPlayer = player.clone().sub(c.root.position),
        f = a.t.clone().multiplyScalar(c.direction),
        along = toPlayer.dot(f),
        side = Math.abs(toPlayer.dot(a.r));
      if (along > 0 && along < 65 && side < 2.1)
        desired = Math.min(desired, Math.max(0, (along - 8) * 0.7));
      for (let j = 0; j < count; j++) {
        if (i === j || !this.cars[j].body.isEnabled()) continue;
        const other = this.cars[j],
          gap = c.road.closed?wrap((other.d - c.d)*c.direction,c.road.length):(other.d-c.d)*c.direction;
        if (other.road===c.road && other.direction===c.direction && Math.abs(other.lane-c.lane)<1 && gap>0 && gap < 50)
          desired = Math.min(
            desired,
            Math.max(0, other.speed + (gap - 15) * 0.5),
          );
      }
      c.speed = damp(c.speed, desired, 1.6, dt);
      if(c.turn){c.turn.travel+=c.speed*dt;if(c.turn.travel>=c.turn.length){const turn=c.turn;c.road=turn.road;c.d=turn.d;c.direction=turn.direction;c.lane=turn.lane;c.turn=undefined;}}
      else {const next=c.d+c.speed*c.direction*dt;c.d=c.road.closed?wrap(next,c.road.length):clamp(next,0,c.road.length);}
      this.pose(c, dt);
      const distance=c.root.position.distanceTo(view);
      c.root.visible=distance<(c.root.visible?range.visible+60:range.visible);
      const detailDistance=c.root.position.distanceTo(view);
      c.detail.visible=c.bike||detailDistance<(c.detail.visible?180:150);
      c.low.visible=!c.detail.visible;
    }
  }
}
