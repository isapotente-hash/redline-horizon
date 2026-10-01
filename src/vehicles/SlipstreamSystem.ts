import * as T from 'three';
import {R,VehiclePhysics} from '../physics/VehiclePhysics';
import type {TrafficCar} from './TrafficManager';
import type {RemoteVehicle} from '../multiplayer/RemoteVehicle';
import type {Controls} from '../input/InputManager';
import {clamp,damp} from '../core/math';
export class SlipstreamSystem {
  strength=0;private following=0;
  private readonly from=new T.Vector3();private readonly direction=new T.Vector3();
  private readonly ray=new R.Ray(this.from,this.direction);
  reset(){this.strength=this.following=0;}
  private candidate(car:VehiclePhysics,p:T.Vector3,q:T.Quaternion,speed:number,height=0){
    if(speed<10)return 0;
    const dx=p.x-car.position.x,dy=p.y+height-car.position.y,dz=p.z-car.position.z;
    if(Math.abs(dy)>2.5||dx*dx+dz*dz>42*42)return 0;
    const ahead=dx*car.forward.x+dz*car.forward.z,side=Math.abs(dx*car.right.x+dz*car.right.z);
    if(ahead<6||ahead>40||side>2.2+ahead*.025)return 0;
    const fx=-2*(q.x*q.z+q.w*q.y),fz=-(1-2*(q.x*q.x+q.y*q.y));
    if(fx*car.forward.x+fz*car.forward.z<.9)return 0;
    this.from.copy(car.position);this.from.y+=.25;this.direction.set(dx,dy,dz);const length=this.direction.length();this.direction.multiplyScalar(1/length);
    if(car.physics.world.castRay(this.ray,length,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC|R.QueryFilterFlags.EXCLUDE_KINEMATIC|R.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,car.body))return 0;
    return clamp(1-(ahead-6)/42,.15,1)*(1-side/(2.2+ahead*.025));
  }
  update(dt:number,car:VehiclePhysics,input:Controls,traffic:readonly TrafficCar[],peers:readonly RemoteVehicle[],now:number){
    if(car.speed<12||car.signedSpeed<12||car.contacts<2||input.brake>.1||input.handbrake||car.surface==='GRASS'||car.surface==='GRAVEL'){this.reset();car.slipstreamStrength=0;return;}
    let best=0;
    for(let i=0;i<traffic.length;i++){const c=traffic[i];if(c.crashTime>0||!c.body.isEnabled())continue;best=Math.max(best,this.candidate(car,c.root.position,c.root.quaternion,c.speed,c.bodyHeight));}
    for(let i=0;i<peers.length;i++){const c=peers[i];if(!c.root.visible||!c.latest?.active||now-c.receivedAt>350)continue;best=Math.max(best,this.candidate(car,c.root.position,c.root.quaternion,c.speed));}
    this.following=best>0?this.following+dt:0;
    this.strength=damp(this.strength,this.following>.5?best:0,best>0?3:7,dt);
    car.slipstreamStrength=this.strength;
  }
}
