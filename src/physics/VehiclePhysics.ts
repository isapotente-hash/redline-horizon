import { CarSpec, CARS, isBike, chassisFor } from "../vehicles/CarCatalog";
import { BASE_TUNE, HandlingTune, Loadout, tuneFor } from "../vehicles/UpgradeCatalog";
import RAPIER from "@dimforge/rapier3d-compat";
import * as T from "three";
import { clamp, damp, lerp } from "../core/math";
import { Settings } from "../core/SaveManager";
import { Controls } from "../input/InputManager";
import { RoadNetwork, Road } from "../world/RoadNetwork";
import {DriftSystem} from '../vehicles/DriftSystem';
import {traitsFor} from '../vehicles/VehicleTraits';
import {roadHeight,surfaceBank} from '../world/RoadNetwork';
export const R = RAPIER;
export class PhysicsWorld {
  world!: RAPIER.World;
  peerColliderHandles=new Set<number>();
  async init() {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 120;
    this.world.numSolverIterations = 6;
    return this;
  }
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    yaw = 0,
  ) {
    const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
    return this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
        .setTranslation(x, y, z)
        .setRotation(q)
        .setFriction(0.6)
        .setRestitution(0.05),
    );
  }
  mesh(g: T.BufferGeometry) {
    const a = g.getAttribute("position"),
      vertices = new Float32Array(a.array),
      indices = g.index
        ? new Uint32Array(g.index.array)
        : Uint32Array.from({ length: a.count }, (_, i) => i);
    return this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(vertices, indices, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES | RAPIER.TriMeshFlags.DELETE_DEGENERATE_TRIANGLES).setFriction(0.8).setRestitution(0),
    );
  }
}
const ratios = [3.8, 2.62, 1.98, 1.58, 1.29, 1.08, 0.92, 0.79],
  curve = [
    [850, 270],
    [2000, 430],
    [4000, 570],
    [5500, 620],
    [7000, 605],
    [8200, 574],
    [8600, 470],
  ];
function torque(rpm: number) {
  for (let i = 1; i < curve.length; i++)
    if (rpm < curve[i][0])
      return lerp(
        curve[i - 1][1],
        curve[i][1],
        clamp((rpm - curve[i - 1][0]) / (curve[i][0] - curve[i - 1][0]), 0, 1),
      );
  return 400;
}
export class VehiclePhysics {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  private _spec:CarSpec=CARS[0];
  chassis=chassisFor(CARS[0]);
  traits=traitsFor(CARS[0]);
  wheelie=0;
  lean=0;
  get bike(){return isBike(this._spec);}
  get spec(){return this._spec;}
  set spec(spec:CarSpec) {
    this._spec=spec;this.chassis=chassisFor(spec);this.traits=traitsFor(spec);this.wheelie=this.lean=0;
    const c=this.chassis;
    this.collider.setShape(new RAPIER.Cuboid(c.halfBody[0],c.halfBody[1],c.halfBody[2]));
    this.collider.setMass(c.mass);this.body.recomputeMassPropertiesFromColliders();
    for(let i=0;i<4;i++) {
      this.controller.setWheelChassisConnectionPointCs(i,{x:(i%2?1:-1)*c.halfWidth,y:.03,z:i<2?-c.halfLength:c.halfLength});
      this.controller.setWheelRadius(i,c.radius);
    }
  }
  tune:HandlingTune={...BASE_TUNE};
  teleportSerial=0;
  applyLoadout(loadout:Loadout) {
    this.tune=tuneFor(loadout);
    for(let i=0;i<4;i++) {
      this.controller.setWheelSuspensionStiffness(i,this.tune.stiffness);
      this.controller.setWheelSuspensionCompression(i,this.tune.compression);
      this.controller.setWheelSuspensionRelaxation(i,this.tune.relaxation);
      this.controller.setWheelMaxSuspensionTravel(i,this.tune.travel);
    }
  }
  crashSerial=0;
  crashSeverity=0;
  crashCooldown=0;
  readonly beforeVelocity=new T.Vector3();
  controller: RAPIER.DynamicRayCastVehicleController;
  position = new T.Vector3();
  rotation = new T.Quaternion();
  previousPosition = new T.Vector3();
  previousRotation = new T.Quaternion();
  forward = new T.Vector3(0, 0, -1);
  right = new T.Vector3(1, 0, 0);
  boostRemaining = 0;
  nitroRemaining=0;boostSerial=0;slipstreamStrength=0;
  readonly drift=new DriftSystem();
  private lastHandbrake=false;private lastSteer=0;
  get boosting(){return this.boostRemaining>0||this.nitroRemaining>0;}
  infiniteBoost = false;
  activateBoost() { this.boostRemaining = 5;this.boostSerial++; }
  activateNitro() {this.nitroRemaining=2.2;this.boostSerial++;}
  speed = 0;
  signedSpeed = 0;
  rpm = 850;
  gear = 1;
  reverse = false;
  steering = 0;
  wheelSpin = 0;
  slip = 0;
  surface = "ASPHALT";
  contacts = 4;
  distance = 0;
  driftScore = 0;
  impact = 0;
  scrape=0;private scrapeTick=0;
  private readonly scrapeManifold=(m:RAPIER.TempContactManifold)=>{
    if(m.numSolverContacts()>0&&Math.abs(m.normal().y)<.45)this.scrape=Math.max(this.scrape,clamp(this.speed/55,0,1));
  };
  private readonly scrapeContact=(other:RAPIER.Collider)=>{
    if(other.isSensor())return;const body=other.parent();if(body&&!body.isFixed())return;
    this.physics.world.contactPair(this.collider,other,this.scrapeManifold);
  };
  shiftTimer = 0;
  shiftSerial=0;
  braking = 0;
  throttle = 0;
  roll = 0;
  pitch = 0;
  constructor(
    public physics: PhysicsWorld,
    public roads: RoadNetwork,
    public settings: Settings,
  ) {
    const w = physics.world;
    this.body = w.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, 26, 0)
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setLinearDamping(0.03)
        .setAngularDamping(0.65),
    );
    this.collider=w.createCollider(
      RAPIER.ColliderDesc.cuboid(0.88, 0.2, 2.1)
        .setTranslation(0, -0.06, 0)
        .setMass(1550)
        .setFriction(0.14)
        .setRestitution(0.07),
      this.body,
    );
    this.controller = w.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    this.controller.setIndexForwardAxis = 2;
    for (let i = 0; i < 4; i++) {
      this.controller.addWheel(
        { x: i % 2 === 0 ? -0.95 : 0.95, y: 0.03, z: i < 2 ? -1.43 : 1.43 },
        { x: 0, y: -1, z: 0 },
        { x: 1, y: 0, z: 0 },
        0.3,
        0.365,
      );
      this.controller.setWheelSuspensionStiffness(i, 44);
      this.controller.setWheelSuspensionCompression(i, 4.4);
      this.controller.setWheelSuspensionRelaxation(i, 5.5);
      this.controller.setWheelMaxSuspensionTravel(i, 0.19);
      this.controller.setWheelMaxSuspensionForce(i, 14000);
      this.controller.setWheelFrictionSlip(i, 2.8);
      this.controller.setWheelSideFrictionStiffness(i, 1.1);
    }
    this.teleport(roads.main, 120);
  }
  shift(direction: number) {
    if (this.shiftTimer <= 0) {
      this.gear = clamp(this.gear + direction, 1, 8);
      this.shiftTimer = 0.18;
      this.shiftSerial++;
    }
  }
  teleport(
    road: Road,
    d: number,
    offset = road.width > 14 ? 5.5 : road.width * 0.24,
  ) {
    const s = this.roads.at(road, d),
      p = s.p.clone().addScaledVector(s.r, offset);
    this.setPosition(p.x,roadHeight(s,offset)+this.chassis.rideHeight,p.z,Math.atan2(-s.t.x,-s.t.z),Math.asin(clamp(s.t.y,-1,1)),surfaceBank(s));
  }
  setPosition(x: number, y: number, z: number, yaw: number, pitch=0,bank=0) {
    this.teleportSerial++;
    const q = new T.Quaternion().setFromEuler(new T.Euler(pitch,yaw,bank,"YXZ"));
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation(q, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.position.set(x, y, z);
    this.rotation.copy(q);
    this.previousPosition.copy(this.position);
    this.previousRotation.copy(q);
    this.forward.set(0, 0, -1).applyQuaternion(q);
    this.right.set(1, 0, 0).applyQuaternion(q);
    this.boostRemaining = 0;
    this.nitroRemaining=0;this.slipstreamStrength=0;this.scrape=0;this.drift.reset();
    this.wheelie=this.lean=0;
    this.crashCooldown=.5;this.impact=0;this.beforeVelocity.set(0,0,0);
    this.speed = 0;
    this.signedSpeed = 0;
    this.gear = 1;
    this.rpm = 850;
  }
  reset() {
    const n = this.roads.nearest(this.position.x, this.position.z, true);
    this.teleport(n.road, Number.isFinite(n.distance) ? n.sample.d : 120);
  }
  // Retain controller ray tests every physics tick; cache only unchanged configuration.
  private readonly wheelValues = new Float64Array(24).fill(NaN);
  private readonly wheelFilter = (c:RAPIER.Collider) => c.parent()?.handle !== this.body.handle && !this.physics.peerColliderHandles.has(c.handle);
  private setWheelValue(kind:number, wheel:number, value:number) {
    const index=kind*4+wheel;
    if(this.wheelValues[index]===value)return;
    this.wheelValues[index]=value;
    switch(kind){
      case 0:this.controller.setWheelMaxSuspensionForce(wheel,value);break;
      case 1:this.controller.setWheelEngineForce(wheel,value);break;
      case 2:this.controller.setWheelSteering(wheel,value);break;
      case 3:this.controller.setWheelBrake(wheel,value);break;
      case 4:this.controller.setWheelFrictionSlip(wheel,value);break;
      case 5:this.controller.setWheelSideFrictionStiffness(wheel,value);break;
    }
  }
  preStep(input: Controls, dt: number) {
    this.boostRemaining = this.infiniteBoost ? 5 : Math.max(0,this.boostRemaining-dt);
    this.nitroRemaining=Math.max(0,this.nitroRemaining-dt);this.lastHandbrake=input.handbrake;this.lastSteer=input.steer;
    this.previousPosition.copy(this.position);
    this.previousRotation.copy(this.rotation);
    const b = this.body,
      v = b.linvel(),
      q = b.rotation();
    this.beforeVelocity.set(v.x,v.y,v.z);
    this.crashCooldown=Math.max(0,this.crashCooldown-dt);
    this.rotation.set(q.x, q.y, q.z, q.w);
    this.forward.set(0, 0, -1).applyQuaternion(this.rotation);
    this.right.set(1, 0, 0).applyQuaternion(this.rotation);
    this.signedSpeed =
      v.x * this.forward.x + v.y * this.forward.y + v.z * this.forward.z;
    this.speed = Math.hypot(v.x, v.z);
    const lateral = v.x * this.right.x + v.z * this.right.z;
    this.slip = Math.atan2(lateral, Math.max(Math.abs(this.signedSpeed), 2));
    const road = this.roads.nearest(this.position.x, this.position.z),
      off = road.distance > road.road.width / 2 + 1;
    this.surface = off
      ? road.distance < road.road.width / 2 + 6
        ? "GRAVEL"
        : "GRASS"
      : this.settings.weather === "rain"
        ? "WET ROAD"
        : "ASPHALT";
    let grip = off
      ? this.surface === "GRAVEL"
        ? 1.05
        : 0.75
      : this.settings.weather === "rain"
        ? 1.75
        : 2.8;
    this.reverse =
      !input.handbrake &&
      input.brake > 0.1 &&
      this.signedSpeed < 0.7 &&
      input.throttle === 0;
    this.throttle = this.reverse ? input.brake : input.throttle;
    this.braking = this.reverse ? 0 : input.brake;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    const wheelRpm = (Math.abs(this.signedSpeed) / (this.chassis.radius * Math.PI * 2)) * 60;
    const rpmTarget = Math.max(
      850 + input.throttle * 1500,
      wheelRpm * ratios[this.gear - 1] * this.tune.finalDrive * this.traits.finalDrive,
    );
    this.rpm = damp(this.rpm, clamp(rpmTarget, 850, 8650), 12, dt);
    if (this.settings.automatic && !this.reverse && this.shiftTimer === 0) {
      if (this.rpm > this.traits.redline && this.gear < 8) this.shift(1);
      else if (this.rpm < 3300 && this.gear > 1) this.shift(-1);
    }
    let force =
      ((torque(Math.max(this.rpm, input.throttle * 3500)) *
        ratios[this.gear - 1] *
        this.tune.finalDrive * this.traits.finalDrive *
        0.9) /
        this.chassis.radius) *
      input.throttle *
      (1 - clamp((this.speed - (this.spec.topSpeed + this.tune.engineSpeed + this.tune.gearingSpeed + (this.nitroRemaining>0?26:this.boostRemaining>0?23:0)+5*this.slipstreamStrength)) / 4, 0, 1));
    force *= this.spec.power * this.tune.enginePower * this.chassis.forceScale;
    if(off && this.spec.kit==='pickup')grip*=1.65;
    if(off && this.spec.kit==='sportbike')grip*=.82;
    grip *= this.spec.handling * (off?this.tune.loose*this.traits.loose:this.settings.weather==="rain"?this.tune.wet*this.traits.wet:this.tune.dry);
    if (this.shiftTimer > 0) force *= 0.12;
    if (this.settings.traction)
      force *= 1 - clamp((Math.abs(this.slip) - 0.12) * 1.5, 0, 0.75);
    if (this.reverse)
      force = -6000 * this.chassis.forceScale * input.brake * (1 - clamp((this.speed - 8) / 6, 0, 1));
    this.steering = damp(
      this.steering,
      (input.steer * this.chassis.steerAngle * Math.sqrt(this.spec.handling) * lerp(1,this.tune.brakeTurn,this.braking)) / (1 + this.speed * this.chassis.steerFade),
      this.tune.response*this.chassis.response,
      dt,
    );
    b.resetForces(true);
    b.resetTorques(true);
    const drag =
        0.5 * 1.225 * 0.32 * 1.95 * this.chassis.dragScale * this.speed * this.speed * (1-.32*this.slipstreamStrength) +
        (this.speed > 0.05 ? 145*this.chassis.mass/1550*this.tune.rolling : 0) +
        (off ? 38 * this.chassis.mass/1550 * this.speed : 0),
      sign = Math.sign(this.signedSpeed);
    b.addForce(
      {
        x: -this.forward.x * drag * sign,
        y: -Math.min(10500, 1.3 * this.speed * this.speed) * this.traits.aero,
        z: -this.forward.z * drag * sign,
      },
      true,
    );
    if (this.boosting && this.contacts >= 2 && !off && !this.reverse && input.brake < .1 && !input.handbrake && this.signedSpeed >= 0) {
      const thrust = 10500 * (this.nitroRemaining>0?1.45:1) * this.chassis.mass/1550 * (1 - clamp((this.speed - (this.spec.topSpeed + this.tune.engineSpeed + this.tune.gearingSpeed + (this.nitroRemaining>0?26:20))) / 7, 0, 1));
      b.addForce({ x: this.forward.x * thrust, y: 0, z: this.forward.z * thrust }, true);
    }
    if(this.slipstreamStrength>0&&this.contacts>=2&&!off&&!this.reverse&&input.throttle>0&&input.brake<.1&&!input.handbrake){
      const pull=this.chassis.mass*1.2*this.slipstreamStrength*clamp((this.spec.topSpeed+this.tune.engineSpeed+this.tune.gearingSpeed+5-this.speed)/5,0,1);
      b.addForce({x:this.forward.x*pull,y:0,z:this.forward.z*pull},true);
    }
    if(this.bike) {
      const a=b.angvel(),mass=this.chassis.mass;
      const lifting=!!input.down && this.signedSpeed>4 && this.speed<75 && this.contacts>=2 && input.brake<.1 && !input.handbrake && this.crashCooldown===0;
      this.wheelie=damp(this.wheelie,lifting?.43:0,lifting?3.5:6,dt);
      const grade=road.distance<road.road.width/2+3?Math.asin(clamp(road.sample.t.y,-.3,.3))*Math.sign(this.forward.dot(road.sample.t)):0;
      const pitchError=grade+this.wheelie-Math.asin(clamp(this.forward.y,-1,1));
      const pitchRate=a.x*this.right.x+a.y*this.right.y+a.z*this.right.z;
      const rollError=Math.asin(clamp(this.right.y,-1,1));
      const rollRate=-(a.x*this.forward.x+a.y*this.forward.y+a.z*this.forward.z);
      const rearBalance=mass*9.81*this.chassis.halfLength*Math.cos(this.wheelie)*clamp(this.wheelie/.2,0,1);
      const pitchTorque=clamp(pitchError*mass*60-pitchRate*mass*9+rearBalance,-mass*22,mass*22);
      const rollTorque=clamp(rollError*mass*35+rollRate*mass*6,-mass*20,mass*20);
      const yawTarget=this.contacts>=2?clamp(this.speed*Math.tan(this.steering)/(2*this.chassis.halfLength),-1.5,1.5):a.y;
      b.addTorque({x:this.right.x*pitchTorque+this.forward.x*rollTorque,y:(yawTarget-a.y)*mass*1.6,z:this.right.z*pitchTorque+this.forward.z*rollTorque},true);
      this.lean=damp(this.lean,clamp(input.steer*this.speed*.025,-.48,.48)*(this.wheelie>.12?.45:1),7,dt);
    } else if (this.settings.stability) {
      const a = b.angvel();
      b.addTorque(
        {
          x: -a.x * 1900,
          y: -a.y * (input.handbrake ? 70 : 250),
          z: -a.z * 1900,
        },
        true,
      );
    }
    // Progressive rear grip and physical yaw damping arrest a developing spin while
    // retaining the entry slide. Short handbrake flicks keep their original response.
    const driftRecovery=!this.bike&&input.handbrake?clamp((Math.abs(this.slip)-.18)/.4,0,1):0;
    if(driftRecovery>0&&this.contacts>=3){
      const yaw=this.body.angvel().y;
      b.addTorque({x:0,y:-(yaw*12+this.slip*35)*this.chassis.mass*driftRecovery,z:0},true);
    }
    for (let i = 0; i < 4; i++) {
      this.setWheelValue(0,i,14000*this.chassis.mass/1550*(this.bike&&i<2?1-clamp(this.wheelie/.12,0,1):1));
      this.setWheelValue(1,i, this.traits.drive==="AWD"?force*(i<2?.20:.30):i >= 2 ? force / 2 : 0);
      this.setWheelValue(2,i, i < 2 ? this.steering : 0);
      this.setWheelValue(3,
        i,
        (this.braking * 4700 * this.chassis.mass/1550 * this.tune.brakeForce * this.traits.brakes * 2 * (i<2?this.tune.frontBias:1-this.tune.frontBias) + (input.handbrake && i >= 2 ? 12500*this.chassis.mass/1550 : 0)) * dt,
      );
      this.setWheelValue(4,
        i,
        grip * (i>=2?this.tune.rearGrip*lerp(1,this.tune.brakeRearGrip,this.braking):1) * (input.handbrake && i >= 2 ? lerp(.28,.68,driftRecovery) : 1),
      );
      this.setWheelValue(5,
        i,
        input.handbrake && i >= 2 ? 0.45 : 1.1,
      );
    }
    this.controller.updateVehicle(
      dt,
      undefined,
      undefined,
      this.wheelFilter,
    );
    this.wheelSpin -= (this.signedSpeed * dt) / this.chassis.radius;
    this.roll = damp(this.roll, clamp(-lateral * 0.005, -0.035, 0.035)*this.tune.bodyRoll*this.traits.roll, 4, dt);
    this.pitch = damp(
      this.pitch,
      (this.braking - input.throttle) * 0.008,
      3,
      dt,
    );
  }
  postStep(dt: number) {
    const p = this.body.translation(),
      q = this.body.rotation();
    this.position.set(p.x, p.y, p.z);
    this.rotation.set(q.x, q.y, q.z, q.w);
    const v = this.body.linvel(),
      next = Math.hypot(v.x, v.z);
    this.impact = Math.max(
      this.impact * Math.exp(-8 * dt),
      clamp((this.speed - next - 1.1) / 5, 0, 1),
    );
    if(!this.bike){const longitudinal=(next-this.speed)/Math.max(1/240,dt);this.pitch=damp(this.pitch,clamp(-longitudinal*.003+this.braking*.012,-.05,.04)*this.tune.bodyRoll*this.traits.roll,6,dt);}
    this.speed = next;
    this.contacts = 0;
    for (let i = 0; i < 4; i++)
      if (this.controller.wheelIsInContact(i)) this.contacts++;
    this.scrape*=Math.exp(-10*dt);this.scrapeTick=(this.scrapeTick+1)&1;
    if(this.scrapeTick===0&&this.speed>15&&this.contacts>=2)this.physics.world.contactPairsWith(this.collider,this.scrapeContact);
    const delta=Math.hypot(v.x-this.beforeVelocity.x,v.y-this.beforeVelocity.y,v.z-this.beforeVelocity.z);
    if(this.crashCooldown===0 && delta>2.5) {
      let solidContact=false;
      this.physics.world.contactPairsWith(this.collider,()=>{solidContact=true});
      const landing=this.beforeVelocity.y < -7 && v.y-this.beforeVelocity.y>2.5 && (this.contacts>0||solidContact);
      const impact=solidContact && Math.hypot(this.beforeVelocity.x,this.beforeVelocity.z)>12 && delta>4;
      if(landing||impact) {
        this.crashSerial++;this.crashSeverity=clamp(delta/22,.35,1);
        this.crashCooldown=1.8;this.impact=1;
      }
    }
    this.distance += this.speed * dt;
    if (this.contacts > 2 && this.speed > 10 && Math.abs(this.slip) > 0.17)
      this.driftScore += Math.abs(this.slip) * this.speed * dt * 10;
    if(this.drift.update(dt,this,this.lastHandbrake,this.lastSteer))this.activateNitro();
  }
}
