import * as T from "three";
import { RoadNetwork, Road } from "./RoadNetwork";
import { SaveManager } from "../core/SaveManager";
import { VehiclePhysics } from "../physics/VehiclePhysics";
/** Coins use a swept trigger, so fast cars cannot jump over a pickup. */
export class CoinManager {
  root = new T.Group();
  items: {id:string;position:T.Vector3;active:boolean;road:Road;d:number;offset:number}[] = [];
  mesh: T.InstancedMesh;
  private dummy = new T.Object3D();
  private elapsed = 0;
  constructor(roads:RoadNetwork,public save:SaveManager) {
    roads.roads.forEach((road,r)=>{
      for(let d=155,n=0;d<road.length-25;d+=65,n++) {
        const position=roads.at(road,d).p.clone();position.y+=1.05;
        if(this.items.some(c=>c.position.distanceToSquared(position)<64))continue;
        const id=`road-${r}-coin-${n}`;
        this.items.push({id,position,active:!save.collectedCoins.has(id),road,d,offset:0});
      }
    });
    const g=new T.CylinderGeometry(.48,.48,.12,24);g.rotateX(Math.PI/2);
    this.mesh=new T.InstancedMesh(g,new T.MeshStandardMaterial({color:0xffcf54,metalness:.75,roughness:.23,emissive:0xff9c12,emissiveIntensity:.24}),this.items.length);
    this.mesh.castShadow=true;this.mesh.frustumCulled=false;this.root.add(this.mesh);
    this.animate(0);
  }
  animate(dt:number,position?:T.Vector3) {
    this.elapsed+=dt;
    let visible=0;
    for(let i=0;i<this.items.length;i++) {
      const c=this.items[i];if(!c.active||(position&&c.position.distanceToSquared(position)>450**2))continue;this.dummy.position.copy(c.position);
      this.dummy.position.y+=Math.sin(this.elapsed*2.6+i*.6)*.14;
      this.dummy.rotation.set(0,this.elapsed*2+i*.4,0);
      this.dummy.scale.setScalar(c.active?1:0);this.dummy.updateMatrix();this.mesh.setMatrixAt(visible++,this.dummy.matrix);
    }
    this.mesh.count=visible;this.mesh.instanceMatrix.needsUpdate=true;
  }
  collect(car:VehiclePhysics) {
    let amount=0;
    const a=car.previousPosition,b=car.position,dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
    if(car.contacts<1)return 0;
    for(const c of this.items) {
      if(!c.active || Math.abs(c.position.x-b.x)>5 || Math.abs(c.position.z-b.z)>5)continue;
      const t=len>1e-8?T.MathUtils.clamp(((c.position.x-a.x)*dx+(c.position.z-a.z)*dz)/len,0,1):1;
      if(Math.hypot(c.position.x-a.x-dx*t,c.position.z-a.z-dz*t)<1.35 && Math.abs(c.position.y-T.MathUtils.lerp(a.y,b.y,t))<1.5) {
        c.active=false;if(this.save.collectCoin(c.id))amount+=5;
      }
    }
    return amount;
  }
}
