import {clamp} from '../core/math';
type DriftCar={speed:number;signedSpeed:number;slip:number;contacts:number;surface:string;crashSerial:number;crashCooldown?:number};
/** Rewards a sustained handbrake slide only after a controlled, grounded exit. */
export class DriftSystem {
  active=false;charge=0;settling=false;rewardFlash=0;rewardSerial=0;
  private lost=0;private exitTime=0;private stable=0;private crash=-1;
  reset(){this.active=false;this.charge=0;this.settling=false;this.lost=this.exitTime=this.stable=this.rewardFlash=0;this.crash=-1;}
  update(dt:number,car:DriftCar,handbrake:boolean,steer:number):boolean {
    dt=clamp(Number.isFinite(dt)?dt:0,0,.1);this.rewardFlash=Math.max(0,this.rewardFlash-dt);
    const hit=this.crash>=0&&this.crash!==car.crashSerial;this.crash=car.crashSerial;
    const angle=Math.abs(car.slip),safe=car.contacts>=3&&car.signedSpeed>8&&car.speed>8&&angle<1.05&&(car.surface==='ASPHALT'||car.surface==='WET ROAD')&&!hit&&(car.crashCooldown??0)<=0;
    if(!safe){this.active=false;this.charge=0;this.settling=false;this.lost=this.exitTime=this.stable=0;return false;}
    const sliding=handbrake&&Math.abs(steer)>.16&&angle>=.14;
    if(!this.active){if(!sliding)return false;this.active=true;this.charge=0;this.lost=this.exitTime=this.stable=0;}
    if(sliding){this.settling=false;this.lost=0;this.exitTime=this.stable=0;this.charge=Math.min(1,this.charge+dt/1.4);return false;}
    if(handbrake){this.lost+=dt;if(this.lost>.25){this.active=false;this.charge=0;}return false;}
    this.settling=true;this.exitTime+=dt;this.stable=angle<.14?this.stable+dt:0;
    if(this.stable>=.25){const earned=this.charge>=1;this.active=false;this.charge=0;this.settling=false;if(earned){this.rewardSerial++;this.rewardFlash=1;return true;}}
    else if(this.exitTime>2){this.active=false;this.charge=0;this.settling=false;}
    return false;
  }
}
