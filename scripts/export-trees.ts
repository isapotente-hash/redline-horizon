import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {treeAssetScene} from '../src/world/TreeModel';
import {mkdir,writeFile} from 'node:fs/promises';
class Reader{result:any;onloadend:(()=>void)|null=null;async readAsArrayBuffer(blob:Blob){this.result=await blob.arrayBuffer();this.onloadend?.()}async readAsDataURL(blob:Blob){this.result=`data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;this.onloadend?.()}}
Object.assign(globalThis,{FileReader:Reader});
const scene=treeAssetScene();scene.updateMatrixWorld(true);
const bytes=await new GLTFExporter().parseAsync(scene,{binary:true});
await mkdir('assets/environment',{recursive:true});
await writeFile('assets/environment/Coastal_Trees.glb',Buffer.from(bytes as ArrayBuffer));
console.log('Exported three improved tree models.');
