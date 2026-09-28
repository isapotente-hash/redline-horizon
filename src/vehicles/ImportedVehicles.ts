import {modelLoaded} from '../core/Loading';
import {addMotorcycleRider} from './MotorcycleRider';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {CarVisual,addHeadlights} from './CarModel';
import {CarSpec,isBike,chassisFor} from './CarCatalog';
const templates=new Map<string,T.Group>();
/** Load once during the loading screen. Instances share immutable geometry/textures. */
export async function loadImportedVehicles() {
  const loader=new GLTFLoader();
  const [car,bike]=await Promise.all([
    loader.loadAsync(new URL('../../assets/cars/REVUELTO.glb',import.meta.url).href,e=>modelLoaded(1,e)).then(g=>{modelLoaded(1);return g;}),
    loader.loadAsync(new URL('../../assets/cars/MOTORCYCLE.glb',import.meta.url).href,e=>modelLoaded(2,e)).then(g=>{modelLoaded(2);return g;}),
  ]);
  templates.set('supercar',car.scene);templates.set('bike',bike.scene);
}
export function importedVehicle(spec:CarSpec):CarVisual|undefined {
  const template=templates.get(isBike(spec)?'bike':spec.kit);if(!template)return;
  return createImportedVehicle(template,spec);
}
export function createImportedVehicle(template:T.Group,spec:CarSpec):CarVisual {
  const root=template.clone(true),body=root.getObjectByName('body') as T.Group;
  const materials=new Map<T.Material,T.Material>();
  const paint=new T.MeshPhysicalMaterial({name:'paint',color:spec.color,metalness:.65,roughness:.25,clearcoat:1});
  const alloy=new T.MeshStandardMaterial({name:'alloy',color:0x9ba3ae,metalness:.9,roughness:.27});
  const glass=new T.MeshPhysicalMaterial({name:'glass',color:0x163040,roughness:.15,metalness:.4,clearcoat:1});
  const brake=new T.MeshStandardMaterial({name:'brake_led',color:0xff1830,emissive:0xff1020,emissiveIntensity:.6});
  const head=new T.MeshStandardMaterial({name:'head_led',color:0xe6f5ff,emissive:0xbce8ff,emissiveIntensity:1.8});
  root.traverse(o=>{if(o instanceof T.Mesh){
    const convert=(m:T.Material)=>{
      if(materials.has(m))return materials.get(m)!;
      let result:T.Material=m;
      if(m.name==='paint'||m.name.startsWith('Moto')) {if(m instanceof T.MeshStandardMaterial&&m.map&&!paint.map)paint.map=m.map;result=paint;}
      else if(m.name==='alloy')result=alloy;
      else if(m.name==='glass')result=glass;
      else if(m.name.includes('Material.006'))result=brake;
      else if(m.name.includes('Material.078')){if(m instanceof T.MeshStandardMaterial)head.map=m.map;result=head;}
      materials.set(m,result);return result;
    };
    o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);o.castShadow=o.receiveShadow=true;
  }});
  const chassis=chassisFor(spec),steers:T.Object3D[]=[],wheels:T.Object3D[]=[];
  for(let i=0;i<4;i++) {
    const suffix=['FL','FR','RL','RR'][i];
    let pivot=root.getObjectByName('steer_'+suffix),wheel=root.getObjectByName('wheel_'+suffix);
    if(!pivot){pivot=new T.Group();root.add(pivot);wheel=new T.Group();pivot.add(wheel);pivot.visible=false;}
    pivot.name='steer_'+suffix;wheel!.name='wheel_'+suffix;
    pivot.position.set(isBike(spec)?0:(i%2?1:-1)*chassis.halfWidth,chassis.radius,i<2?-chassis.halfLength:chassis.halfLength);
    steers.push(pivot);wheels.push(wheel!);
  }
  const steering=new T.Group();body.add(steering);
  const car={root,body,steers,wheels,steering,paint,alloy,glass,brake,head,lights:[] as T.SpotLight[]};
  if(isBike(spec))addMotorcycleRider(body);
  else {
    // Visible LED inserts follow the original lamp recesses and existing brake controls.
    for(const side of [-1,1]) {
      const tail=new T.Mesh(new T.BoxGeometry(.31,.025,.02),brake);tail.position.set(side*.66,.74,2.24);body.add(tail);
    }
  }
  addHeadlights(car);root.name=spec.name;return car;
}
