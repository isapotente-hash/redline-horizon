import * as T from 'three';
import {PhysicsWorld,VehiclePhysics,R} from '../physics/VehiclePhysics';
import {FootControls} from '../input/InputManager';
import {DriverAvatar} from './DriverAvatar';
/** A single pooled character controller: enabled only while the car is parked. */
export class OnFootPlayer {
  active=false;
  readonly root=new T.Group();
  readonly position=new T.Vector3();
  readonly previousPosition=new T.Vector3();
  readonly body:InstanceType<typeof R.RigidBody>;
  readonly collider:InstanceType<typeof R.Collider>;
  readonly controller:InstanceType<typeof R.KinematicCharacterController>;
  readonly enterRadius=2.8;
  private velocityY=0;
  private readonly desired=new T.Vector3();
  private readonly next=new T.Vector3();
  private readonly origin=new T.Vector3();
  private readonly down=new T.Vector3(0,-1,0);
  private readonly ray=new R.Ray(this.origin,this.down);
  private readonly sightRay=new R.Ray(this.origin,this.desired);
  private readonly identity=new T.Quaternion();
  private readonly shape=new R.Capsule(.55,.28);
  private blocked=false;
  private readonly markBlocked=()=>{this.blocked=true;return false;};
  constructor(private physics:PhysicsWorld,private avatar?:DriverAvatar){
    this.body=physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0,-1000,0));
    this.collider=physics.world.createCollider(R.ColliderDesc.capsule(.55,.28).setFriction(0).setRestitution(0),this.body);
    this.controller=physics.world.createCharacterController(.025);
    this.controller.enableAutostep(.25,.2,false);this.controller.enableSnapToGround(.35);
    this.controller.setMaxSlopeClimbAngle(Math.PI/4);this.controller.setMinSlopeSlideAngle(Math.PI/3);
    this.controller.setApplyImpulsesToDynamicBodies(false);
    this.root.name='ON_FOOT_PLAYER';this.root.visible=false;this.body.setEnabled(false);
  }
  exit(car:VehiclePhysics){
    if(this.active||car.contacts<2)return false;
    // Shape clearance includes the car, walls, rails and nearby vehicles. Floor ray
    // starts below tunnel roofs and cannot choose a lower bridge deck several metres away.
    let found=false;
    for(const side of [1,-1]){
      for(const along of [0,-.6,.6]){
        this.next.copy(car.position).addScaledVector(car.right,side*(car.chassis.halfBody[0]+.65)).addScaledVector(car.forward,along*car.chassis.halfLength);
        this.origin.copy(this.next);this.origin.y+=.8;
        const floor=this.physics.world.castRayAndGetNormal(this.ray,2.6,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC|R.QueryFilterFlags.EXCLUDE_KINEMATIC|R.QueryFilterFlags.EXCLUDE_SENSORS);
        if(!floor||floor.normal.y<.65)continue;
        this.next.y=this.origin.y-floor.timeOfImpact+.88;
        this.blocked=false;
        this.physics.world.intersectionsWithShape(this.next,this.identity,this.shape,this.markBlocked,R.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.collider);
        if(!this.blocked){found=true;break;}
      }
      if(found)break;
    }
    if(!found)return false;
    car.body.setLinvel({x:0,y:0,z:0},true);car.body.setAngvel({x:0,y:0,z:0},true);
    car.body.resetForces(true);car.body.resetTorques(true);car.body.setBodyType(R.RigidBodyType.Fixed,true);
    car.speed=car.signedSpeed=car.throttle=car.boostRemaining=car.nitroRemaining=car.slipstreamStrength=car.wheelie=car.lean=0;car.drift.reset();car.braking=1;car.gear=1;car.rpm=850;car.beforeVelocity.set(0,0,0);
    car.previousPosition.copy(car.position);car.previousRotation.copy(car.rotation);
    this.body.setTranslation(this.next,true);this.body.setNextKinematicTranslation(this.next);this.body.setEnabled(true);
    this.position.copy(this.next);this.previousPosition.copy(this.next);this.root.position.copy(this.next);
    this.root.rotation.y=Math.atan2(-car.forward.x,-car.forward.z);
    this.velocityY=0;this.active=true;this.root.visible=true;this.avatar?.onFoot(this.root);return true;
  }
  canEnter(car:VehiclePhysics){
    if(!this.active||this.position.distanceToSquared(car.position)>this.enterRadius*this.enterRadius)return false;
    this.origin.copy(this.position);this.desired.subVectors(car.position,this.origin);const distance=this.desired.length();
    if(distance<.01)return true;
    this.desired.multiplyScalar(1/distance);
    return !this.physics.world.castRay(this.sightRay,distance,true,R.QueryFilterFlags.EXCLUDE_SENSORS,undefined,this.collider,car.body);
  }
  enter(car:VehiclePhysics,force=false){
    if(!this.active||(!force&&!this.canEnter(car)))return false;
    this.active=false;this.root.visible=false;this.body.setEnabled(false);this.avatar?.returnToSeat();
    car.body.setBodyType(R.RigidBodyType.Dynamic,true);car.body.setLinvel({x:0,y:0,z:0},true);car.body.setAngvel({x:0,y:0,z:0},true);
    car.previousPosition.copy(car.position);car.previousRotation.copy(car.rotation);car.teleportSerial++;
    return true;
  }
  preStep(input:FootControls,yaw:number,dt:number){
    this.previousPosition.copy(this.position);
    const forward=input.forward,side=input.right,length=Math.max(1,Math.hypot(forward,side));
    this.desired.set((-Math.sin(yaw)*forward+Math.cos(yaw)*side)*4.5*dt/length,0,(-Math.cos(yaw)*forward-Math.sin(yaw)*side)*4.5*dt/length);
    // Stop at an unloaded edge rather than walking into an absent terrain collider.
    this.origin.copy(this.position).add(this.desired);this.origin.y+=.3;
    if(!this.physics.world.castRay(this.ray,1.9,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC|R.QueryFilterFlags.EXCLUDE_KINEMATIC|R.QueryFilterFlags.EXCLUDE_SENSORS))this.desired.x=this.desired.z=0;
    this.velocityY=this.controller.computedGrounded()?-1:Math.max(-20,this.velocityY-9.81*dt);
    this.desired.y=this.velocityY*dt;
    this.controller.computeColliderMovement(this.collider,this.desired,R.QueryFilterFlags.EXCLUDE_SENSORS);
    this.next.copy(this.position).add(this.controller.computedMovement());this.body.setNextKinematicTranslation(this.next);
    if(forward||side)this.root.rotation.y=Math.atan2(-this.desired.x,-this.desired.z);
  }
  postStep(){const p=this.body.translation();this.position.set(p.x,p.y,p.z);}
  render(alpha:number){this.root.position.lerpVectors(this.previousPosition,this.position,alpha);}
}
