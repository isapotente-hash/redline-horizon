import {LANDMARKS} from "./RoadLandmarks";
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {RoadNetwork} from './RoadNetwork';
import {TerrainSampler} from './TerrainSampler';
import {SceneryObstacle} from './SceneryCollider';
import {rng} from '../core/math';
import {sceneryFinish} from '../rendering/SceneryMaterials';

export const REGION_LABELS:[string,number,number][]=[['AZURE COAST',100,-650],['REDWOOD RIDGE',-1200,-2350],['SUMMIT PEAKS',-3100,-5300],['DRY MESA',-4850,-4100],['COPPER DUNES',-6800,-2600],['NOVA CITY',-1900,200],['MORROW VALLEY',-4700,1150],['CEDAR SUBURBS',-2750,2050],['ZENITH INDUSTRIAL',-1100,2300],['SOUTH COAST',-1700,3670],['PORT ZENITH',100,1800]];
export class RegionalScenery {
  box=new T.BoxGeometry(1,1,1);
  roof=new T.ConeGeometry(.72,1,4).rotateY(Math.PI/4);
  cactus:T.BufferGeometry;
  bush=new T.IcosahedronGeometry(1,1);
  materials={hedge:new T.MeshStandardMaterial({color:"#726a3d",roughness:1}),wood:new T.MeshStandardMaterial({color:"#756044",roughness:1}),foundation:new T.MeshStandardMaterial({color:'#777b77',roughness:1}),plaster:new T.MeshStandardMaterial({color:'#dbd3ba',roughness:.88}),roof:new T.MeshStandardMaterial({color:'#784d44',roughness:.85}),glass:new T.MeshStandardMaterial({color:'#486d7d',metalness:.3,roughness:.3}),metal:new T.MeshStandardMaterial({color:'#788b94',metalness:.4,roughness:.6}),brick:new T.MeshStandardMaterial({color:'#a67852',roughness:.95}),field:new T.MeshStandardMaterial({color:'#a79950',roughness:1}),cactus:new T.MeshStandardMaterial({color:'#697849',roughness:1})};
  constructor(public roads:RoadNetwork,public terrain:TerrainSampler){
    sceneryFinish(this.materials.brick,'brick');sceneryFinish(this.materials.plaster,'plaster');sceneryFinish(this.materials.metal,'metal');sceneryFinish(this.materials.glass,'glass');
    const parts=[new T.CylinderGeometry(.23,.32,4,6).translate(0,2,0),new T.CylinderGeometry(.16,.2,1.8,6).translate(-.8,2.3,0),new T.CylinderGeometry(.14,.18,1.5,6).translate(.8,2.9,0),new T.BoxGeometry(1.9,.27,.28).translate(0,1.55,0)];
    this.cactus=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());
  }
  build(x:number,z:number,obstacles:SceneryObstacle[]){const work=this.buildSteps(x,z,obstacles);let next=work.next();while(!next.done)next=work.next();return next.value;}
  *buildSteps(x:number,z:number,obstacles:SceneryObstacle[]):Generator<void,T.Group,void>{
    const root=new T.Group(),random=rng((x*16807)^(z*48271)^91),matrix=new T.Object3D();
    const batches=new Map<string,{g:T.BufferGeometry;m:T.Material;matrices:T.Matrix4[]}>();
    const place=(key:keyof RegionalScenery['materials'],px:number,py:number,pz:number,w:number,h:number,d:number,yaw=0,shape:'box'|'roof'|'cactus'|'bush'='box',solid=false)=>{
      matrix.position.set(px,py,pz);matrix.rotation.set(0,yaw,0);matrix.scale.set(w,h,d);matrix.updateMatrix();
      const id=key+shape;let batch=batches.get(id);if(!batch){batch={g:shape==='roof'?this.roof:shape==='cactus'?this.cactus:shape==='bush'?this.bush:this.box,m:this.materials[key],matrices:[]};batches.set(id,batch);}batch.matrices.push(matrix.matrix.clone());
      if(solid)obstacles.push({kind:'box',matrix:matrix.matrix.clone()});
    };
    // Sample the entire footprint, including its edges. A level plinth extends
    // below the lowest ground point, so sloped sites never leave floating walls.
    const foundation=(px:number,pz:number,w:number,d:number,yaw:number)=>{
      let low=Infinity,high=-Infinity;const c=Math.cos(yaw),s=Math.sin(yaw);
      for(let iz=-1;iz<=1;iz++)for(let ix=-1;ix<=1;ix++){
        const dx=ix*w/2,dz=iz*d/2,y=this.terrain.groundHeight(px+dx*c+dz*s,pz-dx*s+dz*c);
        low=Math.min(low,y);high=Math.max(high,y);
      }
      if(high-low>9)return null;
      const floor=high+.15,base=low-.4;
      place('foundation',px,(floor+base)/2,pz,w,floor-base,d,yaw,'box',true);
      return floor;
    };
    for(let i=0;i<32;i++){
      if(i%8===0)yield;
      const px=(x+random())*256,pz=(z+random())*256,region=this.roads.region(px,pz),near=this.roads.nearest(px,pz),h=this.terrain.groundHeight(px,pz);
      if(h<3||near.distance>150)continue;
      const yaw=Math.atan2(near.sample.t.x,near.sample.t.z);
      if(region==='COPPER DUNES'||region==='DRY MESA'){
        if(!this.terrain.vegetationClear(px,pz,2))continue;place('cactus',px,h,pz,1,1,1,random()*6,'cactus');
      }else if(region==='CEDAR SUBURBS'&&i<20){
        if(!this.terrain.vegetationClear(px,pz,13))continue;
        const floor=foundation(px,pz,10,14,yaw);if(floor===null)continue;
        const tall=5+random()*2;place('plaster',px,floor+tall/2,pz,10,tall,14,yaw,'box',true);place('roof',px,floor+tall+1.4,pz,11,3,15,yaw,'roof');place('glass',px,floor+3,pz,10.08,.7,14.08,yaw);
        const gx=px+Math.cos(yaw)*12,gz=pz-Math.sin(yaw)*12;
        if(this.terrain.vegetationClear(gx,gz,7)){const gf=foundation(gx,gz,7,9,yaw);if(gf!==null)place('plaster',gx,gf+2,gz,7,4,9,yaw,'box',true);}
      }else if(region==='ZENITH INDUSTRIAL'&&i<10){
        if(!this.terrain.vegetationClear(px,pz,29))continue;
        const floor=foundation(px,pz,30,38,yaw);if(floor===null)continue;
        place('metal',px,floor+5,pz,30,10,38,yaw,'box',true);place('glass',px,floor+7,pz,30.08,1.5,38.08,yaw);
        const cx=px+Math.cos(yaw)*24,cz=pz-Math.sin(yaw)*24;
        if(this.terrain.vegetationClear(cx,cz,8)){const cf=foundation(cx,cz,12,4,yaw);if(cf!==null)place('brick',cx,cf+1.6,cz,12,3.2,4,yaw,'box',true);}
      }else if(region==='MORROW VALLEY'&&i<5){
        if(!this.terrain.vegetationClear(px,pz,48))continue;
        const step=TerrainSampler.CELL_SIZE,field=new T.Mesh(this.terrain.geometry(Math.floor((px-32)/step)*step,Math.floor((pz-32)/step)*step,step*6,6,-.018),this.materials.field);field.receiveShadow=true;field.userData.streamGeometry=true;root.add(field);
        if(i%2===0){const floor=foundation(px,pz,12,18,yaw);if(floor!==null){place('brick',px,floor+3,pz,12,6,18,yaw,'box',true);place('roof',px,floor+7,pz,13,3,19,yaw,'roof');}}
      }else if(region==='SOUTH COAST'&&i<5){
        if(!this.terrain.vegetationClear(px,pz,14))continue;
        const floor=foundation(px,pz,10,12,yaw);if(floor===null)continue;
        place('plaster',px,floor+2.4,pz,10,4.8,12,yaw,'box',true);place('roof',px,floor+5.6,pz,11,2,13,yaw,'roof');
      }
    }
    // Irregular roadside hedgerows and bare patches: batches share geometry/materials.
    for(let i=0;i<90;i++){
      if(i%10===0)yield;
      const px=(x+random())*256,pz=(z+random())*256,near=this.roads.nearest(px,pz),region=this.roads.region(px,pz);
      if(near.distance>80||['COPPER DUNES','DRY MESA','NOVA CITY','ZENITH INDUSTRIAL','SUMMIT PEAKS'].includes(region)||!this.terrain.vegetationClear(px,pz,1.6))continue;
      const patch=Math.sin(px*.031+Math.sin(pz*.021)*2);if(patch<.12)continue;
      const h=this.terrain.groundHeight(px,pz);if(h<3||h>320)continue;
      for(let j=0;j<3;j++){
        const tx=px+(random()-.5)*4,tz=pz+(random()-.5)*4;if(!this.terrain.vegetationClear(tx,tz,1.6))continue;
        const y=this.terrain.groundHeight(tx,tz),w=.6+random()*1.2,tall=.4+random()*.7;
        place('hedge',tx,y+tall*.4,tz,w,tall,w*.7,random()*6,'bush');
      }
    }
    for(const landmark of LANDMARKS){
      yield;
      const road=this.roads.roads.find(r=>r.name===landmark.road);if(!road)continue;
      const a=this.roads.at(road,landmark.distance),side=landmark.side,center=a.p.clone().addScaledVector(a.r,side*(road.width/2+42));
      if(Math.floor(center.x/256)!==x||Math.floor(center.z/256)!==z)continue;
      const yaw=Math.atan2(a.t.x,a.t.z);
      if(landmark.kind==='lookout'){
        const h=this.terrain.groundHeight(center.x,center.z);place('foundation',center.x,h+1.1,center.z,3.5,2.2,3.5,yaw,'box',true);
        place('wood',center.x,h+2.35,center.z,4,.22,4,yaw);place('metal',center.x,h+2.9,center.z,.5,1,.5,yaw);
      }else if(this.terrain.vegetationClear(center.x,center.z,18)){
        const floor=foundation(center.x,center.z,landmark.kind==='mill'?12:19,15,yaw);
        if(floor!==null){
          place('brick',center.x,floor+3.4,center.z,landmark.kind==='mill'?12:19,6.8,15,yaw,'box',true);
          place('roof',center.x,floor+8,center.z,landmark.kind==='mill'?13:20,3.7,16,yaw,'roof');
          place('wood',center.x,floor+2,center.z,4,4,15.08,yaw);
          if(landmark.kind==='mill')place('foundation',center.x,floor+5.5,center.z,5,11,5,yaw,'box',true);
        }
      }
      // Open farm entrances have gateposts beside the opening, never across the road.
      for(const along of [-10,10]){
        const post=a.p.clone().addScaledVector(a.r,side*(road.width/2+2.6)).addScaledVector(a.t,along);
        const h=this.terrain.groundHeight(post.x,post.z);place('wood',post.x,Math.max(h,a.p.y)+.65,post.z,.24,1.3,.24,yaw);
      }
    }
    for(const batch of batches.values()){
      const mesh=new T.InstancedMesh(batch.g,batch.m,batch.matrices.length);batch.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
    }
    return root;
  }
}
