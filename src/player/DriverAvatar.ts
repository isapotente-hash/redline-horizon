import * as T from 'three';
import {GLTFLoader,GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {CarVisual} from '../vehicles/CarModel';
import {CarSpec,isBike} from '../vehicles/CarCatalog';
import {modelLoaded} from '../core/Loading';

type Fit={hip:number[];hand:number[];foot:number[];knee:number[];lean:number};
export function driverFit(spec:CarSpec):Fit {
 if(isBike(spec))return {hip:[0,.94,.31],hand:[.555,1.303,.085],foot:[.305,.26,-.23],knee:[.32,.6,.04],lean:spec.kit==='sportbike'?-.15:-.10};
 if(spec.kit==='pickup')return {hip:[-.43,1.16,.20],hand:[.16,1.35,-.17],foot:[.15,.64,-.60],knee:[.17,1.05,-.20],lean:-.20};
 if(spec.kit==='roadster')return {hip:[-.43,.85,.30],hand:[.16,1.0,-.17],foot:[.14,.40,-.60],knee:[.15,.76,-.12],lean:-.25};
 if(spec.kit==='supercar')return {hip:[-.40,.38,.30],hand:[.15,.77,-.28],foot:[.14,.28,-.77],knee:[.14,.48,-.16],lean:-.63};
 return {hip:[-.44,.49,.28],hand:[.15,.79,-.27],foot:[.14,.29,-.72],knee:[.14,.46,-.17],lean:-.55};
}
/** Bounded asset transfers; reconstructed once during startup, never in gameplay. */
export async function loadRacerData(urls:readonly string[],fetcher:typeof fetch=fetch,onProgress=(loaded:number,total:number)=>modelLoaded(3,{loaded,total,lengthComputable:true} as ProgressEvent)) {
 const data=new Uint8Array(3580584);let next=0,loaded=0;
 const worker=async()=>{while(next<urls.length){const index=next++,response=await fetcher(urls[index]);if(!response.ok)throw Error('Racer download failed: '+response.status);const bytes=new Uint8Array(await response.arrayBuffer()),expected=Math.min(120000,data.length-index*120000);if(bytes.length!==expected)throw Error('Incomplete racer model part '+index);data.set(bytes,index*120000);loaded+=bytes.length;onProgress(loaded,data.length);}};
 await Promise.all(Array.from({length:Math.min(6,urls.length)},worker));
 if(loaded!==data.length)throw Error('Incomplete racer model');return data.buffer;
}
export async function loadDriverAvatar() {
 const urls=[
  new URL('../../assets/characters/racer-parts/racer-00.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-01.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-02.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-03.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-04.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-05.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-06.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-07.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-08.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-09.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-10.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-11.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-12.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-13.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-14.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-15.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-16.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-17.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-18.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-19.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-20.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-21.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-22.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-23.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-24.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-25.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-26.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-27.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-28.bin',import.meta.url).href,
  new URL('../../assets/characters/racer-parts/racer-29.bin',import.meta.url).href
 ];
 const gltf=await new GLTFLoader().parseAsync(await loadRacerData(urls),'');modelLoaded(3);return new DriverAvatar(gltf);
}
/** One render entity. Reparent it on possession changes rather than cloning a person. */
export class DriverAvatar {
 readonly root=new T.Group();readonly model:T.Group;
 readonly mixer:T.AnimationMixer;readonly idle:T.AnimationAction;readonly walk:T.AnimationAction;
 readonly bones:T.Bone[]=[];private rest:{position:T.Vector3;rotation:T.Quaternion}[]=[];
 private readonly skeletons:T.Skeleton[]=[];
 private readonly seated:{skin:T.SkinnedMesh;mesh:T.Mesh;normals:T.Matrix3[]}[]=[];
 private seatedFit='';
 private seat?:CarVisual;private spec?:CarSpec;private walking=false;private blend=0;
 private previous=new T.Vector3();private foot?:T.Group;
 private readonly p=new T.Vector3();private readonly q=new T.Quaternion();
 private readonly from=new T.Vector3();private readonly to=new T.Vector3();
 constructor(gltf:GLTF) {
  this.root.name='PLAYER_AVATAR';this.model=gltf.scene;this.root.add(this.model);this.model.rotation.y=Math.PI;
  this.mixer=new T.AnimationMixer(this.model);
  this.idle=this.mixer.clipAction(gltf.animations.find(a=>a.name==='Idle')!);this.walk=this.mixer.clipAction(gltf.animations.find(a=>a.name==='Walking')!);
  this.idle.play();this.walk.play().setEffectiveWeight(0);this.mixer.setTime(0);
  this.root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(this.model,true),scale=1.78/(box.max.y-box.min.y);this.model.scale.setScalar(scale);
  this.root.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(this.model,true),hip=this.bone('Joints_01').getWorldPosition(new T.Vector3());
  this.model.position.set(-hip.x,-bounds.min.y,-hip.z);this.root.updateMatrixWorld(true);
  this.model.traverse(o=>{if(o instanceof T.Bone){this.bones.push(o);this.rest.push({position:o.position.clone(),rotation:o.quaternion.clone()});}if(o instanceof T.Mesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;}if(o instanceof T.SkinnedMesh&&!this.skeletons.includes(o.skeleton))this.skeletons.push(o.skeleton);});
  this.model.traverse(o=>{if(o instanceof T.SkinnedMesh){
   const geometry=o.geometry.clone();geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');
   const mesh=new T.Mesh(geometry,o.material);mesh.name='SEATED_RACER_'+o.name;mesh.castShadow=mesh.receiveShadow=true;mesh.frustumCulled=false;
   this.seated.push({skin:o,mesh,normals:o.skeleton.bones.map(()=>new T.Matrix3())});
  }});
 }
 /** The seat pose is fixed. Bake it once per vehicle fit, keeping the original rig for walking. */
 private showSeatedPose(spec:CarSpec){
  this.root.updateWorldMatrix(true,false);this.root.updateMatrixWorld(true);
  const bake=this.seatedFit!==spec.id,vertex=new T.Vector3(),normal=new T.Vector3(),sum=new T.Vector3(),matrix=new T.Matrix4();
  for(const {skin,mesh,normals} of this.seated){
   mesh.position.copy(skin.position);mesh.quaternion.copy(skin.quaternion);mesh.scale.copy(skin.scale);mesh.layers.mask=skin.layers.mask;
   if(bake){
    for(let b=0;b<normals.length;b++)normals[b].setFromMatrix4(matrix.copy(skin.bindMatrixInverse).multiply(skin.skeleton.bones[b].matrixWorld).multiply(skin.skeleton.boneInverses[b]).multiply(skin.bindMatrix));
    const source=skin.geometry.attributes,target=mesh.geometry.attributes;
    for(let v=0;v<source.position.count;v++){
     skin.getVertexPosition(v,vertex);target.position.setXYZ(v,vertex.x,vertex.y,vertex.z);
     for(const name of ['normal','tangent'])if(source[name]){
      normal.fromBufferAttribute(source[name],v);sum.set(0,0,0);
      for(let i=0;i<4;i++){const weight=source.skinWeight.getComponent(v,i);if(weight)sum.addScaledVector(vertex.copy(normal).applyMatrix3(normals[source.skinIndex.getComponent(v,i)]),weight);}
      sum.normalize();target[name].setXYZ(v,sum.x,sum.y,sum.z);
     }
    }
    target.position.needsUpdate=true;target.normal.needsUpdate=true;if(target.tangent)target.tangent.needsUpdate=true;
    mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
   }
   skin.visible=false;skin.parent!.add(mesh);mesh.visible=true;
  }
  this.seatedFit=spec.id;
 }
 bone(name:string){const b=this.model.getObjectByName(name);if(!(b instanceof T.Bone))throw Error('Racer skeleton missing '+name);return b;}
 private resetPose(){for(let i=0;i<this.bones.length;i++){this.bones[i].position.copy(this.rest[i].position);this.bones[i].quaternion.copy(this.rest[i].rotation);}this.root.updateMatrixWorld(true);}
 /** Rotate a joint in its parent space toward a world-space target, preserving bind twist. */
 private aim(bone:T.Bone,child:T.Bone,target:T.Vector3) {
  bone.getWorldPosition(this.p);child.getWorldPosition(this.from).sub(this.p).normalize();this.to.copy(target).sub(this.p).normalize();
  const delta=new T.Quaternion().setFromUnitVectors(this.from,this.to),world=bone.getWorldQuaternion(new T.Quaternion());
  world.premultiply(delta);bone.parent!.getWorldQuaternion(this.q).invert();bone.quaternion.copy(this.q).multiply(world);this.root.updateMatrixWorld(true);
 }
 private chain(aName:string,bName:string,cName:string,end:T.Vector3,bend:T.Vector3) {
  const a=this.bone(aName),b=this.bone(bName),c=this.bone(cName),start=a.getWorldPosition(new T.Vector3()),mid=b.getWorldPosition(new T.Vector3()),finish=c.getWorldPosition(new T.Vector3());
  const l1=start.distanceTo(mid),l2=mid.distanceTo(finish),delta=end.clone().sub(start),distance=T.MathUtils.clamp(delta.length(),Math.abs(l1-l2)+.001,l1+l2-.001);delta.normalize();
  const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
  const normal=bend.clone().sub(start);normal.addScaledVector(delta,-normal.dot(delta));if(normal.lengthSq()<1e-8)normal.set(0,0,1);normal.normalize();
  const knee=start.clone().addScaledVector(delta,along).addScaledVector(normal,height);this.aim(a,b,knee);this.aim(b,c,start.addScaledVector(delta,distance));
 }
 occupy(car:CarVisual,spec:CarSpec) {
  this.seat=car;this.spec=spec;this.walking=false;this.foot=undefined;
  if(car.occupant)car.occupant.visible=false;
  car.body.add(this.root);this.root.position.set(0,0,0);this.root.rotation.set(0,0,0);this.root.scale.setScalar(isBike(spec)||spec.kit==='pickup'||spec.kit==='roadster'?1:.9);this.resetPose();
  const fit=driverFit(spec),hips=this.bone('Joints_01').getWorldPosition(new T.Vector3());
  // Solve against body-space targets, preserving its scene placement.
  // All fitting targets are authored in body space, independent of road yaw or banking.
  car.body.updateWorldMatrix(true,true);const localHip=car.body.worldToLocal(hips.clone());
  this.root.position.set(fit.hip[0]-localHip.x,fit.hip[1]-localHip.y,fit.hip[2]-localHip.z);this.root.updateMatrixWorld(true);
  const spine=this.bone('Joints_1_02'),neck=this.bone('Joints_5_06'),spinePosition=car.body.worldToLocal(spine.getWorldPosition(new T.Vector3())),height=spine.getWorldPosition(new T.Vector3()).distanceTo(neck.getWorldPosition(new T.Vector3()));
  const target=car.body.localToWorld(spinePosition.clone().add(new T.Vector3(0,Math.cos(fit.lean)*height,Math.sin(fit.lean)*height)));
  this.aim(spine,neck,target);
  for(const side of [-1,1]) {
   // Source left/right names are mirrored after rotating the character to face -Z.
   const left=side<0,hand=new T.Vector3(fit.hip[0]+side*fit.hand[0],fit.hand[1],fit.hand[2]);
   if(isBike(spec))hand.x=side*fit.hand[0];
   const elbow=new T.Vector3(fit.hip[0]+side*.34,fit.hand[1]-.16,fit.hand[2]+.20);
   this.chain(left?'Joints_8_09':'Joints_32_033',left?'Joints_9_010':'Joints_33_034',left?'Joints_10_011':'Joints_34_035',car.body.localToWorld(hand),car.body.localToWorld(elbow));
   const foot=new T.Vector3(fit.hip[0]+side*fit.foot[0],fit.foot[1],fit.foot[2]),knee=new T.Vector3(fit.hip[0]+side*fit.knee[0],fit.knee[1],fit.knee[2]);
   this.chain(left?'Joints_55_055':'Joints_60_060',left?'Joints_56_056':'Joints_61_061',left?'Joints_57_057':'Joints_62_062',car.body.localToWorld(foot),car.body.localToWorld(knee));
   const ankle=this.bone(left?'Joints_57_057':'Joints_62_062'),toe=this.bone(left?'Joints_58_058':'Joints_63_063'),flat=car.body.worldToLocal(ankle.getWorldPosition(new T.Vector3())).add(new T.Vector3(0,-.04,-.14));this.aim(ankle,toe,car.body.localToWorld(flat));
  }
  this.showSeatedPose(spec);this.root.visible=true;
 }
 onFoot(root:T.Group) {
  for(const {skin,mesh} of this.seated){mesh.removeFromParent();skin.visible=true;}
  this.walking=true;this.foot=root;root.add(this.root);this.root.position.set(0,-.83,0);this.root.rotation.set(0,0,0);this.root.scale.setScalar(1);this.resetPose();
  this.blend=0;this.idle.setEffectiveWeight(1);this.walk.setEffectiveWeight(0);this.mixer.setTime(0);this.previous.copy(root.position);this.root.visible=true;
 }
 returnToSeat(){if(this.seat&&this.spec)this.occupy(this.seat,this.spec);}
 update(dt:number,animate=true) {
  if(this.walking&&this.foot&&animate&&dt>0){
   const distance=this.foot.position.distanceTo(this.previous);this.previous.copy(this.foot.position);const speed=Math.min(4.5,distance/dt),target=speed>.15?1:0;
   this.blend=T.MathUtils.damp(this.blend,target,16,dt);this.idle.setEffectiveWeight(1-this.blend);this.walk.setEffectiveWeight(this.blend).setEffectiveTimeScale(T.MathUtils.clamp(speed/2.5,.7,1.8));this.mixer.update(dt);
  }
  // The renderer caches skinning by render-pass frame. An alternating shadow
  // pass can leave that cache one frame ahead of the next main pass, so refresh
  // explicitly after vehicle/foot interpolation, including seated and paused poses.
  this.root.updateWorldMatrix(true,false);
  this.root.updateMatrixWorld(true); // SkinnedMesh refreshes its attached bind inverse here.
  for(const skeleton of this.skeletons)skeleton.update();
 }
}
