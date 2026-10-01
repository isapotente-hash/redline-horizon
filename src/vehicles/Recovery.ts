import * as T from 'three';
import {VehiclePhysics,R} from '../physics/VehiclePhysics';
import {Road,roadHeight,surfaceBank} from '../world/RoadNetwork';
import {clamp} from '../core/math';

/** Finds a clear, upright road pose before moving the chassis. Never spawns in traffic/walls. */
export function recoverVehicle(car:VehiclePhysics,road?:Road,distance?:number,direction?:number){
 const hit=car.roads.nearest(car.position.x,car.position.z,true,road),route=road||hit.road;
 if(!Number.isFinite(hit.distance)&&!road)return false;
 const d=distance??hit.sample.d,sign=direction??(car.forward.dot(hit.sample.t)>=0?1:-1),edge=route.width/2-car.chassis.halfWidth-.55;
 const lane=clamp(sign*Math.min(5.5,route.width*.24),-edge,edge),size=car.chassis.halfBody,shape=new R.Cuboid(size[0],size[1],size[2]);
 for(const delta of [0,-12,12,-24,24,-40,40])for(const offset of [lane,0,-lane]){
  const at=car.roads.at(route,clamp(d+delta,route.closed?-Infinity:12,route.closed?Infinity:route.length-12));
  const yaw=Math.atan2(-at.t.x*sign,-at.t.z*sign),pitch=Math.asin(clamp(at.t.y,-1,1))*sign,bank=surfaceBank(at)*sign;
  const q=new T.Quaternion().setFromEuler(new T.Euler(pitch,yaw,bank,'YXZ'));
  const p=at.p.clone().addScaledVector(at.r,offset);p.y=roadHeight(at,offset)+car.chassis.rideHeight;
  const center=p.clone().add(new T.Vector3(0,-.06,0).applyQuaternion(q));
  const blocked=car.physics.world.intersectionWithShape(center,q,shape,undefined,undefined,undefined,car.body,c=>!c.isSensor());
  if(blocked)continue;
  car.setPosition(p.x,p.y,p.z,yaw,pitch,bank);return true;
 }
 return false;
}
