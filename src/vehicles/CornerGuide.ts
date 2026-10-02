import * as T from 'three';
import {RoadNetwork,Road,roadHeight,surfaceBank} from '../world/RoadNetwork';
import {VehiclePhysics} from '../physics/VehiclePhysics';

/** Optional braking warning, not a suggested racing line or an autopilot speed target. */
export class CornerGuide {
  root=new T.Group();readonly markers:T.Mesh[]=[];
  visible=false;recommended=0;distance=0;brake=false;direction=0;
  private readonly a=new T.Vector3();private readonly b=new T.Vector3();
  constructor(private roads:RoadNetwork) {
    const g=new T.ConeGeometry(.22,.6,8),m=new T.MeshBasicMaterial({color:'#ffda85'});
    for(let i=0;i<6;i++){const mesh=new T.Mesh(g,m);this.markers.push(mesh);this.root.add(mesh);}
    this.root.visible=false;
  }
  update(car:VehiclePhysics,active:boolean,route?:Road) {
    this.visible=this.brake=this.root.visible=false;
    if(!active||car.reverse||car.speed<5||car.contacts<3||car.drift.active)return;
    const hit=this.roads.nearest(car.position.x,car.position.z,false,route),road=hit.road;
    // A road-path warning is unreliable while recovering from the verge or facing across it.
    const alignment=car.forward.dot(hit.sample.t);
    if(hit.distance>road.width/2-car.chassis.halfWidth||Math.abs(alignment)<.85)return;
    const sign=alignment>=0?1:-1,start=hit.sample.d;
    const grip=car.roadGrip*Math.min(1,car.tune.rearGrip);
    const mass=car.chassis.mass,drag=.5*1.225*.32*1.95*car.chassis.dragScale/mass*(1-.32*car.slipstreamStrength);
    const rolling=145/1550*car.tune.rolling;
    // 4 wheel brake impulses, normalized by mass, match VehiclePhysics.preStep.
    const brakePower=4*4700/1550*car.tune.brakeForce*car.traits.brakes;
    const normal=9.81+Math.min(10500,1.3*car.speed*car.speed)*car.traits.aero/mass;
    const biasEfficiency=Math.min(1,.5/Math.max(car.tune.frontBias,1-car.tune.frontBias));
    const brakeDecel=Math.min(brakePower,grip*normal*biasEfficiency);
    const look=Math.min(450,Math.max(80,car.speed*5)),offset=hit.offset;
    let urgency=-Infinity,where=0,entry=0,turn=0,braking=0;
    for(let d=8;d<=look;d+=8) {
      const at=start+sign*d;
      if(!road.closed&&(at<12||at>road.length-12))break;
      const s=this.roads.at(road,at);
      // No speculative warnings for a branch the driver has not committed to.
      if(!route&&d>16&&this.roads.inJunction(s.p.x,s.p.z))break;
      const before=this.roads.at(road,at-sign*8),after=this.roads.at(road,at+sign*8);
      this.a.copy(before.t).setY(0).normalize();this.b.copy(after.t).setY(0).normalize();
      const signed=Math.atan2(this.a.x*this.b.z-this.a.z*this.b.x,this.a.dot(this.b));
      const span=Math.max(1,Math.hypot(after.p.x-before.p.x,after.p.z-before.p.z));
      const k=signed/span,curve=Math.abs(k)/Math.max(.35,1-k*sign*offset);
      if(curve<.0001)continue;
      const bank=surfaceBank(s),bankAssist=-9.81*Math.sin(bank)*Math.sign(k)*sign;
      // Solve the actual tyre/load and speed-sensitive steering limits; no low comfort-speed cap.
      let lo=0,hi=160;
      for(let i=0;i<18;i++) {
        const speed=(lo+hi)/2;
        const load=9.81*Math.sqrt(Math.max(0,1-s.t.y*s.t.y))*Math.cos(bank)+Math.min(10500,1.3*speed*speed)*car.traits.aero/mass;
        const rack=car.setup.steering*car.chassis.steerAngle*Math.sqrt(car.spec.handling)/(1+speed*car.chassis.steerFade);
        const steerCurve=Math.tan(rack)/(2*car.chassis.halfLength);
        if(speed*speed*curve<=grip*load+bankAssist&&curve<=steerCurve)lo=speed;else hi=speed;
      }
      const safe=lo;
      // Ignore negligible excess, and bends reachable just by lifting the accelerator.
      if(car.speed<=safe+Math.max(2,safe*.07))continue;
      const grade=9.81*s.t.y*sign,coastBase=rolling+grade;
      const coastSpeedSq=(car.speed*car.speed+coastBase/drag)*Math.exp(-2*drag*d)-coastBase/drag;
      if(coastSpeedSq<=safe*safe)continue;
      const decel=Math.max(.5,brakeDecel+rolling+grade);
      const stopping=Math.log((decel+drag*car.speed*car.speed)/(decel+drag*safe*safe))/(2*Math.max(1e-6,drag));
      const deadline=stopping+car.speed*.35-d;
      if(deadline>=0&&deadline>urgency){urgency=deadline;where=d;entry=safe;turn=Math.sign(k);braking=stopping;}
    }
    if(!where)return;
    this.visible=this.brake=true;this.recommended=Math.floor(entry*3.6);this.distance=Math.round(where);this.direction=turn;
    this.root.visible=car.settings.cornerGuide==='markers';
    if(this.root.visible)for(let i=0;i<6;i++) {
      const d=Math.min(where,Math.max(6,where-braking)+(i>>1)*10),s=this.roads.at(road,start+sign*d);
      const o=(i%2?1:-1)*(road.width/2-.8);
      this.markers[i].position.set(s.p.x+s.r.x*o,roadHeight(s,o)+.4,s.p.z+s.r.z*o);
    }
  }
}
