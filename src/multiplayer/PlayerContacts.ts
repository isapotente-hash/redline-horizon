import * as T from 'three';
import {PhysicsWorld,VehiclePhysics,R} from '../physics/VehiclePhysics';
import {carSpec,chassisFor} from '../vehicles/CarCatalog';
import {MAX_PLAYERS} from './Protocol';
import {RemoteVehicle} from './RemoteVehicle';
/** Reused kinematic proxies. Each client simulates contact against the same interpolated peer poses. */
export class PlayerContacts {
  private position=new T.Vector3();private rotation=new T.Quaternion();
  private localCenter=new T.Vector3();private peerCenter=new T.Vector3();
  private peers:{body:InstanceType<typeof R.RigidBody>;collider:InstanceType<typeof R.Collider>;model:string;armed:boolean}[]=[];
  readonly hooks={
    filterContactPair:(a:number,b:number)=>a===this.player.collider.handle||b===this.player.collider.handle?R.SolverFlags.COMPUTE_IMPULSE:null,
    filterIntersectionPair:()=>false,
  };
  constructor(private physics:PhysicsWorld,private player:VehiclePhysics) {
    for(let i=0;i<MAX_PLAYERS;i++){
      const body=physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0,-1000,0));
      const collider=physics.world.createCollider(R.ColliderDesc.cuboid(.88,.2,2.1).setTranslation(0,-.06,0).setFriction(.12).setRestitution(.05).setActiveHooks(R.ActiveHooks.FILTER_CONTACT_PAIRS),body);
      physics.peerColliderHandles.add(collider.handle);
      body.setEnabled(false);this.peers.push({body,collider,model:'',armed:false});
    }
  }
  update(now:number,enabled:boolean,remotes:RemoteVehicle[]) {
    for(let i=0;i<this.peers.length;i++){
      const peer=this.peers[i],remote=remotes[i];
      if(!enabled||!remote?.sample(now,this.position,this.rotation,750)||this.position.distanceToSquared(this.player.position)>250*250){peer.body.setEnabled(false);peer.armed=false;continue;}
      const id=remote.latest!.car,c=chassisFor(carSpec(id));
      if(peer.model!==id){peer.collider.setShape(new R.Cuboid(c.halfBody[0],c.halfBody[1],c.halfBody[2]));peer.model=id;peer.armed=false;}
      const old=peer.body.translation(),jump=Math.hypot(old.x-this.position.x,old.y-this.position.y,old.z-this.position.z)>12;
      if(!peer.armed||jump){
        peer.body.setEnabled(false);peer.body.setTranslation(this.position,true);peer.body.setRotation(this.rotation,true);
        // Wait until separated when toggling contact or respawning on top of someone.
        this.localCenter.set(0,-.06,0).applyQuaternion(this.player.rotation).add(this.player.position);
        this.peerCenter.set(0,-.06,0).applyQuaternion(this.rotation).add(this.position);
        if(this.player.collider.shape.intersectsShape(this.localCenter,this.player.rotation,peer.collider.shape,this.peerCenter,this.rotation)){peer.armed=false;continue;}
        peer.armed=true;peer.body.setEnabled(true);
      }
      peer.body.setNextKinematicTranslation(this.position);peer.body.setNextKinematicRotation(this.rotation);
    }
  }
  clear(){for(const p of this.peers){p.body.setEnabled(false);p.armed=false;}}
}
