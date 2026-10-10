import {PoseTimeline} from './PoseTimeline';
import * as T from 'three';
import { CarVisual, makeCar } from '../vehicles/CarModel';
import { CARS, chassisFor, isBike } from '../vehicles/CarCatalog';
import { makeVehicle } from '../vehicles/VehicleModels';
import { fitCarPackage } from '../vehicles/CarCustomization';
import { Pose } from './Protocol';

/** Interpolated peer model; PlayerContacts supplies optional physics proxies. */
export class RemoteVehicle {
  root = new T.Group();
  private models = new Map<string, CarVisual>();
  private visual?: CarVisual;
  private timeline=new PoseTimeline();
  private position = new T.Vector3();
  private rotation = new T.Quaternion();
  private marker: T.Mesh;
  latest?: Pose;
  speed=0;receivedAt=-Infinity;
  constructor(color=0x65fff1) {
    this.root.name = 'REMOTE_PLAYER'; this.root.visible = false;
    this.marker = new T.Mesh(new T.ConeGeometry(.32,.65,4), new T.MeshBasicMaterial({color}));
    this.marker.rotation.z = Math.PI; this.marker.position.y = 3.5;
    this.root.add(this.marker);
  }
  receive(pose: Pose, now = performance.now()) {
    if(!this.timeline.receive(pose,now))return;
    this.latest = pose;this.speed=this.timeline.speed;this.receivedAt=now;
    if (!this.models.has(pose.car)) {
      const spec = CARS.find(c=>c.id===pose.car)!;
      const car = isBike(spec) || spec.kit==='pickup' || spec.kit==='roadster' || spec.kit==='supercar' ? makeVehicle(spec) : makeCar(false);
      if (!isBike(spec) && spec.kit !== 'pickup' && spec.kit !== 'roadster' && spec.kit !== 'supercar') fitCarPackage(car,spec);
      car.root.visible = false;
      car.lights.forEach(light=>light.intensity=0);
      this.models.set(spec.id,car); this.root.add(car.root);
    }
    if (this.visual) this.visual.root.visible = false;
    this.visual = this.models.get(pose.car)!; this.visual.root.visible = true;
    this.visual.paint.color.set(pose.paint);
  }
  update(now: number, visible: boolean, local: T.Vector3) {
    const latest = this.latest, car = this.visual;
    this.root.visible = !!(visible && latest?.active && car && now-this.receivedAt < 5000);
    if (!this.root.visible || !car || !latest) return;
    this.sample(now,this.position,this.rotation);
    this.timeline.visualAt(now);
    const a=this.timeline.visualA!,b=this.timeline.visualB!,alpha=this.timeline.visualAlpha;
    this.root.position.copy(this.position); this.root.quaternion.copy(this.rotation);
    const spec=CARS.find(c=>c.id===latest.car)!;
    if(isBike(spec)) this.root.rotateZ(T.MathUtils.lerp(a.lean,b.lean,alpha));
    car.body.position.y=-(chassisFor(spec).radius+.18);
    car.body.rotation.x=T.MathUtils.lerp(a.pitch,b.pitch,alpha);
    for(let i=0;i<4;i++) {
      car.steers[i].position.y=-.23;
      car.steers[i].rotation.y=i<2?T.MathUtils.lerp(a.steer,b.steer,alpha):0;
      car.wheels[i].rotation.x=T.MathUtils.lerp(a.spin,b.spin,alpha);
    }
    if(car.occupant)car.occupant.visible=latest.occupied!==false;
    car.brake.emissiveIntensity=latest.brake>.1?4:.6;
    this.marker.position.y=3.5+Math.sin(now*.003)*.12;
    this.root.visible=this.position.distanceToSquared(local)<1400*1400;
  }
  /** Same timeline for wheel visuals and solid peer proxies; stale peers cannot block the road. */
  sample(now:number,position:T.Vector3,rotation:T.Quaternion,maxAge=5000) {
    return this.timeline.sample(now,position,rotation,maxAge);
  }
  reset() { this.root.visible=false; this.timeline.reset(); this.latest=undefined;this.speed=0;this.receivedAt=-Infinity; }
}
