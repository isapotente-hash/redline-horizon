import * as T from "three";
import { VehiclePhysics, R } from "../physics/VehiclePhysics";
import { Controls } from "../input/InputManager";
import { clamp, damp, lerp } from "../core/math";
export const cameraNames = ["CHASE","WIDE CHASE","BUMPER","HOOD","COCKPIT","ORBIT","FREE CAMERA"];
const CAR_SEATS = [[0,.1,-2.36],[0,.34,-1.33],[-.44,.53,-.06]];
const BIKE_SEATS = [[0,.15,-1.08],[0,.6,-.65],[0,1.4,-.26]];
const PICKUP_SEATS = [[0,.25,-2.55],[0,.65,-1.55],[-.48,1,-.35]];
/** Exact critically damped spring; scratch velocity is relative to car translation. */
function spring(p:T.Vector3,target:T.Vector3,v:T.Vector3,dt:number){
  const w=16,e=Math.exp(-w*dt),x=p.x-target.x,y=p.y-target.y,z=p.z-target.z;
  const jx=v.x+w*x,jy=v.y+w*y,jz=v.z+w*z;
  p.set(target.x+(x+jx*dt)*e,target.y+(y+jy*dt)*e,target.z+(z+jz*dt)*e);
  v.set((v.x-w*jx*dt)*e,(v.y-w*jy*dt)*e,(v.z-w*jz*dt)*e);
}
/** Runs once per render, after physics and visual interpolation. Never tracks raw body translation. */
export class CameraManager {
  onFoot=false;
  private footInputEnabled=true;
  mode=0; orbitYaw=.6; orbitPitch=.21; distance=8.5; photoFov=50; roll=0;
  drag=false; lastX=0; lastY=0;
  target=new T.Vector3(); freePosition=new T.Vector3(); freeYaw=0; freePitch=0; photo=false;
  private teleportSerial=-1;
  private lastMode=-1;
  private following=false;
  private speed=0;
  private readonly lastPosition=new T.Vector3();
  private readonly movement=new T.Vector3();
  private readonly forward=new T.Vector3();
  private readonly right=new T.Vector3();
  private readonly desired=new T.Vector3();
  private readonly aim=new T.Vector3();
  private readonly offset=new T.Vector3();
  private readonly from=new T.Vector3();
  private readonly direction=new T.Vector3();
  private readonly up=new T.Vector3(0,1,0);
  private readonly positionVelocity=new T.Vector3();private readonly aimVelocity=new T.Vector3();
  private readonly shakeOffset=new T.Vector3();private readonly shakeBase=new T.Vector3();private shakeTime=0;private shakePulse=0;
  private lastBoost=-1;private lastCrash=-1;
  private readonly ray=new R.Ray(this.from,this.direction);
  private readonly events=new AbortController();
  constructor(public camera:T.PerspectiveCamera, private canvas:HTMLCanvasElement, private mobile=false) {
    const signal=this.events.signal;
    canvas.addEventListener('pointerdown',e=>{
      if(this.onFoot){
        if(!this.footInputEnabled||this.mobile||e.pointerType==='touch'||e.button!==0)return;
      }
      if(this.onFoot||this.photo||this.mode>=5){
        this.drag=true;this.lastX=e.clientX;this.lastY=e.clientY;
        // Pointer capture must precede lock: browsers reject capture while locked.
        if(!this.onFoot||typeof document==='undefined'||document.pointerLockElement!==canvas)canvas.setPointerCapture(e.pointerId);
      }
      if(this.onFoot){try {const request=canvas.requestPointerLock?.();request?.catch(()=>{});}catch{}}
    },{signal});
    canvas.addEventListener('pointermove',e=>{
      if(this.onFoot){
        if(!this.footInputEnabled||this.mobile)return;
        if(typeof document!=='undefined'&&document.pointerLockElement===canvas){this.lookFoot(e.movementX,e.movementY);return;}
      }
      if(!this.drag)return;
      this.orbitYaw-=(e.clientX-this.lastX)*.006;
      this.orbitPitch=clamp(this.orbitPitch+(e.clientY-this.lastY)*.004,-.15,1.35);
      this.lastX=e.clientX;this.lastY=e.clientY;
    },{signal});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{this.drag=false;},{signal});
    canvas.addEventListener('wheel',e=>{
      if(this.onFoot||this.photo||this.mode>=5){this.distance=clamp(this.distance+e.deltaY*.01,2.5,40);e.preventDefault();}
    },{passive:false,signal});
  }
  dispose(){this.setFootInputEnabled(false);this.events.abort();this.drag=false;}
  lookFoot(x:number,y:number){
    if(!this.onFoot||!this.footInputEnabled)return;
    this.orbitYaw-=x*.006;this.orbitPitch=clamp(this.orbitPitch+y*.004,-.15,1.35);
  }
  setFootInputEnabled(enabled:boolean){
    this.footInputEnabled=enabled;
    if(!enabled){this.drag=false;if(typeof document!=='undefined'&&document.pointerLockElement===this.canvas)document.exitPointerLock();}
  }
  setMode(i:number){
    this.mode=((Math.trunc(i)%7)+7)%7;this.drag=false;
    if(this.mode===6){
      this.freePosition.copy(this.camera.position);
      this.camera.getWorldDirection(this.direction);
      this.orbitYaw=Math.atan2(-this.direction.x,-this.direction.z);
      this.orbitPitch=Math.asin(clamp(-this.direction.y,-1,1));
    }
  }
  /** Static environment only: moving traffic/peer proxies must not pump the chase distance. */
  private constrain(car:VehiclePhysics,p:T.Vector3,position:T.Vector3){
    this.from.copy(p);this.from.y+=.55;
    this.direction.subVectors(position,this.from);
    const length=this.direction.length();if(length<.001)return;
    this.direction.multiplyScalar(1/length);
    const hit=car.physics.world.castRay(this.ray,length,true,
      R.QueryFilterFlags.EXCLUDE_DYNAMIC|R.QueryFilterFlags.EXCLUDE_KINEMATIC|R.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,undefined,car.body);
    if(hit){position.copy(this.from).addScaledVector(this.direction,Math.max(0,hit.timeOfImpact-.35));return true;}return false;
  }
  startFoot(visual:T.Object3D){
    this.onFoot=true;this.footInputEnabled=true;this.drag=false;this.following=false;this.orbitYaw=Math.atan2(this.camera.position.x-visual.position.x,this.camera.position.z-visual.position.z);this.orbitPitch=.25;this.distance=3.6;
  }
  stopFoot(){this.setFootInputEnabled(false);this.onFoot=false;this.following=false;this.setMode(0);}
  updateFoot(dt:number,visual:T.Object3D,car:VehiclePhysics){
    this.camera.position.sub(this.shakeOffset);this.shakeOffset.set(0,0,0);this.shakePulse=0;
    const p=visual.position,instant=!this.following;
    if(!instant){this.movement.subVectors(p,this.lastPosition);this.camera.position.add(this.movement);this.target.add(this.movement);}
    this.desired.copy(p).add(this.offset.set(Math.sin(this.orbitYaw)*Math.cos(this.orbitPitch),Math.sin(this.orbitPitch),Math.cos(this.orbitYaw)*Math.cos(this.orbitPitch)).multiplyScalar(this.distance));
    this.desired.y+=.65;this.right.set(Math.cos(this.orbitYaw),0,-Math.sin(this.orbitYaw));this.desired.addScaledVector(this.right,.5);
    this.aim.copy(p);this.aim.y+=.45;
    const alpha=instant?1:-Math.expm1(-14*dt);
    this.camera.position.lerp(this.desired,alpha);this.target.lerp(this.aim,alpha);this.constrain(car,p,this.camera.position);this.camera.lookAt(this.target);
    if(this.camera.fov!==58){this.camera.fov=58;this.camera.updateProjectionMatrix();}
    this.lastPosition.copy(p);this.following=true;
  }
  update(dt:number,car:VehiclePhysics,visual:T.Object3D,state:string,t:number,input:Controls){
    dt=Number.isFinite(dt)?clamp(dt,0,.1):0;
    this.camera.position.sub(this.shakeOffset);this.shakeOffset.set(0,0,0);
    const q=visual.quaternion,p=visual.position,forward=this.forward,desired=this.desired,aim=this.aim;
    forward.set(0,0,-1).applyQuaternion(q);
    let fov=62,instant=this.teleportSerial!==car.teleportSerial||this.lastMode!==this.mode;
    this.teleportSerial=car.teleportSerial;this.lastMode=this.mode;
    this.speed=instant?car.speed:damp(this.speed,car.speed,8,dt);
    let chase=false;
    if(state==='menu'||state==='statistics'||state==='leaderboard'||state==='dev'||state==='activities'||state==='garage'){
      const yaw=Math.atan2(-forward.x,-forward.z)+Math.PI*.84+Math.sin(t*.07)*.16,d=state==='garage'?7.3:8.6;
      desired.copy(p).add(this.offset.set(Math.sin(yaw)*d,2.2,Math.cos(yaw)*d));
      aim.copy(p);aim.y+=.1;
      this.direction.subVectors(aim,desired).normalize();this.right.crossVectors(this.direction,this.up);
      aim.addScaledVector(this.right,state==='garage'?-1.05:-1.75);fov=43;instant=true;
    }else if(this.photo||state==='photo'||this.mode===5){
      desired.copy(p).add(this.offset.set(Math.sin(this.orbitYaw)*Math.cos(this.orbitPitch),Math.sin(this.orbitPitch),Math.cos(this.orbitYaw)*Math.cos(this.orbitPitch)).multiplyScalar(this.distance));
      aim.copy(p);fov=this.photoFov;instant=true;
    }else if(this.mode===6){
      this.direction.set(-Math.sin(this.orbitYaw),0,-Math.cos(this.orbitYaw));
      this.right.set(Math.cos(this.orbitYaw),0,-Math.sin(this.orbitYaw));
      this.freePosition.addScaledVector(this.direction,(input.throttle-input.brake)*dt*25).addScaledVector(this.right,-input.steer*dt*25);
      this.freePosition.y+=((input.up?1:0)-(input.down?1:0))*dt*18;
      desired.copy(this.freePosition);
      aim.copy(desired).add(this.offset.set(-Math.sin(this.orbitYaw)*Math.cos(this.orbitPitch),-Math.sin(this.orbitPitch),-Math.cos(this.orbitYaw)*Math.cos(this.orbitPitch)));
      instant=true;
    }else if(this.mode>=2){
      const a=(car.bike?BIKE_SEATS:car.spec.kit==='pickup'?PICKUP_SEATS:CAR_SEATS)[this.mode-2];
      desired.copy(p).add(this.offset.set(a[0],a[1],a[2]).applyQuaternion(q));
      aim.copy(desired).addScaledVector(forward,20);fov=this.mode===4?70:66;instant=true;
    }else{
      chase=true;instant ||= !this.following;
      // Transport both endpoints by the SAME interpolated car displacement. Smooth only
      // the trailing offset / direction, so camera lag cannot oscillate relative to the car.
      if(!instant){
        this.movement.subVectors(p,this.lastPosition);
        this.camera.position.add(this.movement);this.target.add(this.movement);
      }
      desired.copy(p).addScaledVector(forward,-(this.mode===0?(car.bike?3.6:4.8)+this.speed*.006:11));
      desired.y+=this.mode===0?(car.bike?2.7:3.2):3.9;
      aim.copy(p).addScaledVector(forward,this.mode===0?(car.bike?1.2:1.8):7+this.speed*.075);aim.y+=this.mode===0?.45:.75;
      fov=lerp(62,79,clamp(this.speed/85,0,1))+(car.boosting?3:0)+clamp(car.slipstreamStrength||0,0,1);
    }
    const alpha=instant?1:-Math.expm1(-6.5*dt);
    if(chase&&!instant){spring(this.camera.position,desired,this.positionVelocity,dt);spring(this.target,aim,this.aimVelocity,dt);}
    else {this.camera.position.lerp(desired,alpha);this.target.lerp(aim,alpha);this.positionVelocity.set(0,0,0);this.aimVelocity.set(0,0,0);}
    // Clamp the final smoothed segment too: interpolation must not pass through a wall.
    if(chase&&this.constrain(car,p,this.camera.position))this.positionVelocity.set(0,0,0);
    this.camera.lookAt(this.target);
    const boost=car.boostSerial||0,crash=car.crashSerial||0;
    if(chase&&state==='drive'&&!instant){
      if(this.lastBoost>=0&&boost!==this.lastBoost)this.shakePulse=Math.max(this.shakePulse,.018);
      if(this.lastCrash>=0&&crash!==this.lastCrash)this.shakePulse=Math.max(this.shakePulse,.045*clamp(car.crashSeverity||.4,0,1));
      this.shakePulse*=Math.exp(-7*dt);this.shakeTime+=dt;
      const rough=(car.surface==='GRASS'||car.surface==='GRAVEL')&&car.contacts>0?clamp(this.speed/65,0,1)*.016:0;
      const amplitude=Math.min(.045,rough+this.shakePulse+(car.impact||0)*.012+(car.scrape||0)*.012)*(car.settings?.cameraMotion??1);
      if(amplitude>.0001){
        this.shakeOffset.set(Math.sin(this.shakeTime*67)*amplitude,Math.sin(this.shakeTime*83)*amplitude*.65,0).applyQuaternion(this.camera.quaternion);
        this.shakeBase.copy(this.camera.position);this.camera.position.add(this.shakeOffset);this.constrain(car,p,this.camera.position);this.shakeOffset.subVectors(this.camera.position,this.shakeBase);this.camera.lookAt(this.target);
        this.camera.rotateZ(Math.sin(this.shakeTime*55)*amplitude*.045);
      }
    }else this.shakePulse=0;
    this.lastBoost=boost;this.lastCrash=crash;
    if(state==='photo')this.camera.rotateZ(this.roll);
    const nextFov=instant?fov:damp(this.camera.fov,fov,8,dt);
    if(Math.abs(nextFov-this.camera.fov)>1e-5){this.camera.fov=nextFov;this.camera.updateProjectionMatrix();}
    this.lastPosition.copy(p);this.following=chase;
  }
}
