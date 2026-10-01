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
  private queue: { pose: Pose; at: number }[] = [];
  private position = new T.Vector3();
  private rotation = new T.Quaternion();
  private target = new T.Vector3();
  private targetRotation = new T.Quaternion();
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
    this.latest = pose;
    const previous = this.queue[this.queue.length-1];
    const delta=previous?Math.hypot(pose.p[0]-previous.pose.p[0],pose.p[2]-previous.pose.p[2]):0,seconds=previous?(now-previous.at)/1000:0;
    this.speed=previous&&seconds>0&&seconds<=.5&&delta<=80&&previous.pose.car===pose.car?T.MathUtils.clamp(delta/seconds,0,140):0;
    this.receivedAt=now;
    if (previous && (previous.pose.car !== pose.car || delta*delta+(pose.p[1]-previous.pose.p[1])**2 > 6400)) this.queue.length = 0;
    this.queue.push({pose, at:now});
    if (this.queue.length > 8) this.queue.shift();
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
    const latest = this.latest, car = this.visual, q = this.queue;
    this.root.visible = !!(visible && latest?.active && car && q.length && now-q[q.length-1].at < 5000);
    if (!this.root.visible || !car || !latest) return;
    this.sample(now,this.position,this.rotation);
    const a=q[0], b=q[1]||a, alpha=a===b?1:T.MathUtils.clamp((now-100-a.at)/Math.max(1,b.at-a.at),0,1);
    this.root.position.copy(this.position); this.root.quaternion.copy(this.rotation);
    const spec=CARS.find(c=>c.id===latest.car)!;
    if(isBike(spec)) this.root.rotateZ(T.MathUtils.lerp(a.pose.lean,b.pose.lean,alpha));
    car.body.position.y=-(chassisFor(spec).radius+.18);
    car.body.rotation.x=T.MathUtils.lerp(a.pose.pitch,b.pose.pitch,alpha);
    for(let i=0;i<4;i++) {
      car.steers[i].position.y=-.23;
      car.steers[i].rotation.y=i<2?T.MathUtils.lerp(a.pose.steer,b.pose.steer,alpha):0;
      car.wheels[i].rotation.x=T.MathUtils.lerp(a.pose.spin,b.pose.spin,alpha);
    }
    car.brake.emissiveIntensity=latest.brake>.1?4:.6;
    this.marker.position.y=3.5+Math.sin(now*.003)*.12;
    this.root.visible=this.position.distanceToSquared(local)<1400*1400;
  }
  /** Same timeline for wheel visuals and solid peer proxies; stale peers cannot block the road. */
  sample(now:number,position:T.Vector3,rotation:T.Quaternion,maxAge=5000) {
    const q=this.queue;if(!this.latest?.active||!q.length||now-q[q.length-1].at>maxAge)return false;
    const renderTime = now-100;
    while (q.length > 2 && q[1].at < renderTime) q.shift();
    const a=q[0], b=q[1]||a, alpha=a===b?1:T.MathUtils.clamp((renderTime-a.at)/Math.max(1,b.at-a.at),0,1);
    position.fromArray(a.pose.p); this.target.fromArray(b.pose.p); position.lerp(this.target,alpha);
    rotation.fromArray(a.pose.q).normalize(); this.targetRotation.fromArray(b.pose.q).normalize(); rotation.slerp(this.targetRotation,alpha);
    return true;
  }
  reset() { this.root.visible=false; this.queue.length=0; this.latest=undefined;this.speed=0;this.receivedAt=-Infinity; }
}
