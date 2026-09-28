import * as T from "three";
import { CarVisual } from "./CarModel";
import { CarSpec } from "./CarCatalog";
export function fitCarPackage(car:CarVisual,spec:CarSpec) {
  const old=car.body.getObjectByName("vehicle-package");
  if(old){old.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();if(o.material!==car.paint)(o.material as T.Material).dispose()}});car.body.remove(old);}
  const kit=new T.Group();kit.name="vehicle-package";car.body.add(kit);
  const part=(w:number,h:number,d:number,x:number,y:number,z:number,color?:number)=>{
    const mat=color===undefined?car.paint:new T.MeshStandardMaterial({color,roughness:.4,metalness:.5});
    const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;kit.add(m);return m;
  };
  if(spec.kit==="gt") {
    for(const x of [-.65,.65])part(.055,.4,.12,x,1.15,1.78,0x171b20);
    part(2.05,.065,.43,0,1.37,1.8,0x191d24);
    for(const x of [-1,1])part(.055,.25,.48,x,1.4,1.8);
    part(1.95,.07,.46,0,.31,-1.9,0x171b20);
    for(const x of [-.98,.98])part(.09,.09,2.4,x,.32,0,0x171b20);
  }
  if(spec.kit==="rally") {
    part(1.1,.075,.15,0,1.5,-.25,0x15191e);
    for(const x of [-.4,-.13,.13,.4]) {
      const lamp=new T.Mesh(new T.CylinderGeometry(.11,.11,.08,16),new T.MeshStandardMaterial({color:0xe9fbff,emissive:0x94e4ff,emissiveIntensity:1.5}));
      lamp.rotation.x=Math.PI/2;lamp.position.set(x,1.55,-.3);kit.add(lamp);
    }
    for(const x of [-.92,.92])for(const z of [-1.03,1.85])part(.28,.3,.04,x,.29,z,0x25262a);
    part(1.35,.04,.38,0,1.0,1.8,0x25262a);
  }
}
