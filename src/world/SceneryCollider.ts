import * as T from "three";
import { PhysicsWorld, R } from "../physics/VehiclePhysics";
export type SceneryObstacle = {kind:"tree"|"rock"|"box";matrix:T.Matrix4; height?:number};
export function sceneryCollider(physics:PhysicsWorld,obstacle:SceneryObstacle,rock:T.BufferGeometry) {
  let desc;
  if(obstacle.kind==="box"){
    const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();obstacle.matrix.decompose(p,q,s);
    desc=R.ColliderDesc.cuboid(s.x/2,s.y/2,s.z/2).setTranslation(p.x,p.y,p.z).setRotation(q);
  }else if(obstacle.kind==="tree") {
    const p=new T.Vector3(),q=new T.Quaternion(),s=new T.Vector3();obstacle.matrix.decompose(p,q,s);
    const h=(obstacle.height||8)*s.y;
    desc=R.ColliderDesc.cylinder(h/2,.36*s.x).setTranslation(p.x,p.y+h/2,p.z);
  } else {
    const vertices=rock.getAttribute("position"),points=new Float32Array(vertices.count*3),v=new T.Vector3();
    for(let i=0;i<vertices.count;i++){v.fromBufferAttribute(vertices,i).applyMatrix4(obstacle.matrix);points.set([v.x,v.y,v.z],i*3);}
    desc=R.ColliderDesc.convexHull(points);
  }
  if(!desc)throw new Error("Invalid scenery collision geometry");
  return physics.world.createCollider(desc.setFriction(.7).setRestitution(.08));
}
