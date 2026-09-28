import {Controls} from '../input/InputManager';
import {VehiclePhysics} from '../physics/VehiclePhysics';
import {clamp} from '../core/math';
export type DriftPhase='grip'|'initiate'|'hold'|'recover';
export type DriftCorner={curvature:number;offset:number;width:number;clear:boolean;full:boolean};
/** Uses the real rear-wheel handbrake and tyre forces, never a scripted yaw impulse. */
export class AutopilotDrift {
  phase:DriftPhase='grip';time=0;cooldown=0;direction=0;initiations=0;
  reset(){this.phase='grip';this.time=0;this.cooldown=0;this.direction=0;}
  update(car:VehiclePhysics,input:Controls,corner:DriftCorner,dt:number){
    this.cooldown=Math.max(0,this.cooldown-dt);
    if(!corner.full){this.reset();return;}
    const safe=!car.bike&&car.spec.kit!=='pickup'&&car.settings.weather!=='rain'&&car.surface==='ASPHALT'&&car.contacts>=3&&car.crashCooldown===0&&Math.abs(car.right.y)<.16&&Math.abs(corner.offset)<corner.width/2-2.5&&corner.clear;
    const k=Math.abs(corner.curvature),direction=Math.sign(corner.curvature);
    if(this.phase==='grip'){
      if(!safe||this.cooldown>0||car.speed<14||car.speed>42||k<.006||k>.035||car.speed*car.speed*k<2.8||Math.abs(car.slip)>.16||input.brake>.25)return;
      this.phase='initiate';this.time=0;this.direction=direction;this.initiations++;
    }
    this.time+=dt;
    if(!safe||Math.abs(car.slip)>.38||car.speed<10||direction!==this.direction||k<.0025){if(this.phase!=='recover'){this.phase='recover';this.time=0;}}
    // End the entry flick as soon as the path follower asks for counter-steer.
    if(this.phase==='initiate'&&input.steer*this.direction<0){this.phase='hold';this.time=0;}
    const yawCorrection=clamp((car.body.angvel().y-car.speed*corner.curvature)*.5,-.35,.35);
    if(this.phase==='initiate'){
      input.handbrake=this.time<.45&&Math.abs(car.slip)<.12;
      input.throttle=Math.min(input.throttle,.45);
      input.steer=clamp(input.steer+this.direction*.45,-1,1);
      if(!input.handbrake){this.phase='hold';this.time=0;}
    }else if(this.phase==='hold'){
      input.handbrake=false;
      input.steer=clamp(input.steer-(car.slip-this.direction*.08)*1.15-yawCorrection,-1,1);
      input.throttle=Math.min(input.throttle,Math.abs(car.slip)>.24?.28:.72);
      if(this.time>.9||input.brake>.4){this.phase='recover';this.time=0;}
    }else if(this.phase==='recover'){
      input.handbrake=false;input.steer=clamp(input.steer-car.slip*1.25-yawCorrection,-1,1);
      if(Math.abs(car.slip)>.22)input.throttle=Math.min(input.throttle,.25);
      if(this.time>.35&&Math.abs(car.slip)<.12||this.time>1.2){this.phase='grip';this.cooldown=3.5;this.time=0;}
    }
  }
}
