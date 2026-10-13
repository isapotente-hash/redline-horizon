import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Only use for scenery that stays fixed in world space. Instance matrices,
 * visibility and materials can still change without rebuilding world transforms. */
export function freezeScenery(root:T.Object3D){
 root.updateWorldMatrix(true,true);
 root.traverse(o=>{o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;});
}

/** Combine unnamed, opaque leaf parts within the same animation pivot.
 * Named parts, riders, wheels, lights and transparent sorting remain independent. */
export function batchStaticParts(root:T.Object3D){
 for(const parent of [root,...collectParents(root)]){
  const buckets=new Map<string,T.Mesh[]>();
  for(const child of parent.children){
   if(!(child instanceof T.Mesh)||child instanceof T.SkinnedMesh||child instanceof T.InstancedMesh||child.name||child.children.length||!child.visible||Array.isArray(child.material)||child.material.transparent||Object.keys(child.userData).length)continue;
   const geometry=child.geometry;
   if(Object.keys(geometry.morphAttributes).length||geometry.drawRange.start!==0||geometry.drawRange.count!==Infinity)continue;
   const layout=Object.keys(geometry.attributes).sort().map(name=>{const a=geometry.attributes[name];return `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`;}).join('|');
   const key=`${child.material.uuid}:${child.castShadow}:${child.receiveShadow}:${child.layers.mask}:${child.renderOrder}:${layout}`;
   const bucket=buckets.get(key)??[];bucket.push(child);buckets.set(key,bucket);
  }
  for(const parts of buckets.values()){
   if(parts.length<2)continue;
   const geometry=parts.map(part=>{part.updateMatrix();return (part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone()).applyMatrix4(part.matrix);});
   const merged=mergeGeometries(geometry,false);geometry.forEach(g=>g.dispose());if(!merged)continue;
   const first=parts[0],mesh=new T.Mesh(merged,first.material);
   mesh.name='Batched static vehicle parts';mesh.castShadow=first.castShadow;mesh.receiveShadow=first.receiveShadow;mesh.layers.mask=first.layers.mask;mesh.renderOrder=first.renderOrder;
   parent.remove(...parts);parent.add(mesh);
  }
 }
}
function collectParents(root:T.Object3D){const parents:T.Object3D[]=[];root.traverse(o=>{if(o!==root&&o.children.length)parents.push(o);});return parents;}
