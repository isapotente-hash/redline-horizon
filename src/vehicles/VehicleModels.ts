import {importedVehicle} from './ImportedVehicles';
import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {CarVisual,makeCar,addHeadlights} from './CarModel';
import {CarSpec,isBike,chassisFor} from './CarCatalog';

/** Original, self-contained vehicle geometry. All models share the animation pivots. */
export function makeVehicle(spec:CarSpec):CarVisual {
  const imported=importedVehicle(spec);if(imported)return imported;
  if(isBike(spec))return makeMotorbike(spec);
  const car=makeCar(false,spec.color),body=car.body;
  const geometry=new Set<T.BufferGeometry>();body.traverse(o=>{if(o instanceof T.Mesh)geometry.add(o.geometry)});
  body.clear();for(const g of geometry)g.dispose();
  const black=new T.MeshStandardMaterial({color:0x151b21,roughness:.62}),trim=new T.MeshStandardMaterial({color:0x343e47,metalness:.7,roughness:.3});
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material=car.paint)=>{const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(.07,h/4)),m);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;body.add(mesh);return mesh;};
  if(spec.kit==='pickup') {
    box(2.16,.52,5.05,0,.75,0);box(2.02,.4,1.32,0,1.08,-1.66);
    box(1.92,.85,1.9,0,1.56,-.4,car.glass);box(2.08,.13,2.08,0,2.04,-.4);
    for(const x of [-.98,.98]){box(.13,.93,.13,x,1.56,-1.32);box(.15,.93,.15,x,1.56,.50);box(.16,.58,1.85,x,1.27,1.48);box(.2,.09,2.2,x*1.1,.47,-.13,black);}
    box(1.84,.09,1.76,0,1.02,1.49,black);box(1.99,.58,.12,0,1.27,2.4);box(2.16,.22,.19,0,.55,-2.54,trim);box(2.16,.22,.19,0,.55,2.53,trim);
    box(1.15,.24,.07,0,1.04,-2.34,black);
    for(const x of [-.76,.76]){box(.45,.20,.08,x,1.12,-2.36,car.head);box(.2,.3,.08,x,1.13,2.47,car.brake);box(.19,.14,.3,x*1.4,1.6,-1.0,black);}
    for(let j=0;j<5;j++)box(.05,.24,.08,-.44+j*.22,1.04,-2.4,trim);
  } else {
    box(1.88,.35,4.1,0,.54,0);box(1.78,.21,1.48,0,.77,-1.25);box(1.74,.19,1.14,0,.78,1.39);
    box(1.62,.15,1.42,0,.68,.1,black);
    const windshield=box(1.52,.46,.045,0,1.02,-.6,car.glass);windshield.rotation.x=-.2;
    for(const x of [-.79,.79]){const pillar=box(.055,.48,.055,x,1.02,-.6,trim);pillar.rotation.x=-.2;box(.14,.33,1.5,x, .81,.24);}
    for(const x of [-.43,.43]){box(.51,.12,.52,x,.77,.28,black);const seat=box(.48,.53,.16,x,1.04,.55,black);seat.rotation.x=-.15;box(.32,.1,.1,x,1.28,.75,trim);}
    for(const x of [-.61,.61]){box(.43,.065,.06,x,.77,-2.05,car.head);box(.44,.05,.04,x,.78,2.05,car.brake);}
    box(1.38,.10,.10,0,.4,-2.08,black);box(1.4,.10,.10,0,.4,2.08,black);
  }
  car.steering=new T.Group();car.steering.position.set(-.43,spec.kit==='pickup'?1.35:1.0,-.25);body.add(car.steering);
  car.steering.add(new T.Mesh(new T.TorusGeometry(.16,.025,8,24),black));
  const chassis=chassisFor(spec);
  for(let i=0;i<4;i++){car.steers[i].position.set((i%2?1:-1)*chassis.halfWidth,chassis.radius,i<2?-chassis.halfLength:chassis.halfLength);car.wheels[i].scale.setScalar(chassis.radius/.365);}
  car.root.name=spec.name;addHeadlights(car);return car;
}

export function makeMotorbike(spec:CarSpec):CarVisual {
  const root=new T.Group(),body=new T.Group();root.name=spec.name;body.name='body';root.add(body);
  const paint=new T.MeshPhysicalMaterial({name:'paint',color:spec.color,metalness:.55,roughness:.23,clearcoat:1});
  const alloy=new T.MeshStandardMaterial({name:'alloy',color:0x9eabb7,metalness:.9,roughness:.24});
  const glass=new T.MeshPhysicalMaterial({name:'glass',color:0x173549,metalness:.4,roughness:.12,transparent:true,opacity:.83});
  const black=new T.MeshStandardMaterial({color:0x161b22,roughness:.65}),rubber=new T.MeshStandardMaterial({color:0x101217,roughness:.9});
  const head=new T.MeshStandardMaterial({color:0xe8faff,emissive:0xa1e9ff,emissiveIntensity:2.4}),brake=new T.MeshStandardMaterial({color:0xff2442,emissive:0xff102a,emissiveIntensity:.7});
  const add=(geo:T.BufferGeometry,mat:T.Material,x:number,y:number,z:number,parent:T.Object3D=body)=>{const o=new T.Mesh(geo,mat);o.position.set(x,y,z);o.castShadow=o.receiveShadow=true;parent.add(o);return o;};
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,m:T.Material=paint,p:T.Object3D=body)=>add(new RoundedBoxGeometry(w,h,d,2,Math.min(.045,h/4)),m,x,y,z,p);
  const link=(a:number[],b:number[],r:number,mat:T.Material,parent:T.Object3D=body)=>{const from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.sub(from),mesh=add(new T.CylinderGeometry(r,r,delta.length(),10),mat,0,0,0,parent);mesh.position.copy(from).addScaledVector(delta,.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return mesh;};
  box(.45,.39,.59,0,.70,-.05,black);box(.53,.33,.65,0,1.02,-.16);
  box(.45,.1,.67,0,.99,.43,black);box(.35,.2,.43,0,1.03,.84);box(.29,.055,.065,0,1.10,1.08,brake);
  for(const x of [-.22,.22]){link([x,.52,.53],[x,1.0,-.43],.045,alloy);link([x,.52,.53],[x,.38,.87],.05,black);link([x,.75,.23],[x,.48,.68],.035,paint);}
  for(let i=0;i<5;i++)box(.49,.035,.3,0,.59+i*.065,0,alloy);
  const exhaust=add(new T.CylinderGeometry(.08,.1,.66,12),alloy,.3,.46,.6);exhaust.rotation.x=Math.PI/2;
  const sport=spec.kit==='sportbike';
  if(sport){for(const x of [-.27,.27]){const panel=box(.09,.58,.80,x,.75,-.38);panel.rotation.z=x>0?-.16:.16;}box(.45,.27,.40,0,1.0,-.69);const screen=box(.39,.3,.055,0,1.24,-.59,glass);screen.rotation.x=-.35;}
  else {const lamp=add(new T.CylinderGeometry(.15,.15,.13,20),head,0,1.02,-.68);lamp.rotation.x=Math.PI/2;}
  if(sport)for(const x of [-.15,.15])box(.19,.045,.055,x,1.05,-.9,head);
  const steering=new T.Group();steering.name='steering_wheel';steering.position.set(0,1.17,-.5);body.add(steering);
  link([-.42,0,0],[.42,0,0],.025,alloy,steering);
  for(const x of [-.39,.39])box(.14,.05,.075,x,0,0,black,steering);
  for(const x of [-.16,.16])link([x,1.13,-.49],[x,.33,-.87],.027,alloy);
  const steers:T.Object3D[]=[],wheels:T.Object3D[]=[];
  for(let i=0;i<4;i++){
    const pivot=new T.Group(),wheel=new T.Group();pivot.name='steer_'+['FL','FR','RL','RR'][i];wheel.name='wheel_'+['FL','FR','RL','RR'][i];
    pivot.position.set(0,.33,i<2?-.87:.87);root.add(pivot);pivot.add(wheel);steers.push(pivot);wheels.push(wheel);
    if(i%2){pivot.visible=false;continue;}
    const tyre=add(new T.TorusGeometry(.245,.085,12,40),rubber,0,0,0,wheel);tyre.rotation.y=Math.PI/2;tyre.scale.z=i<2?1.1:1.45;
    const rim=add(new T.CylinderGeometry(.225,.225,.09,24),black,0,0,0,wheel);rim.rotation.z=Math.PI/2;
    for(const side of [-1,1]) {
      const lip=add(new T.TorusGeometry(.219,.014,6,32),alloy,side*.06,0,0,wheel);lip.rotation.y=Math.PI/2;
      const disc=add(new T.CylinderGeometry(.16,.16,.018,24),alloy,side*.07,0,0,wheel);disc.rotation.z=Math.PI/2;
      for(let j=0;j<5;j++){const angle=j*Math.PI*2/5;link([side*.08,0,0],[side*.08,Math.cos(angle)*.21,Math.sin(angle)*.21],.013,alloy,wheel);}
    }
  }
  // Seated rider: helmet/visor, jacket, gloves, articulated legs and boots.
  const suit=new T.MeshStandardMaterial({color:0x25303c,roughness:.78}),helmet=new T.MeshStandardMaterial({color:0xebeff0,roughness:.28,metalness:.1});
  const torso=box(.43,.49,.27,0,1.38,.18,suit);torso.rotation.x=.32;
  const skull=add(new T.SphereGeometry(.19,20,14),helmet,0,1.77,-.03);skull.scale.set(1,1.1,1.05);
  const visor=add(new T.SphereGeometry(.195,20,10,Math.PI*.58,Math.PI*.84,Math.PI*.32,Math.PI*.38),glass,0,1.77,-.03);visor.rotation.y=Math.PI;
  for(const side of [-1,1]) {
    link([side*.2,1.54,.11],[side*.32,1.31,-.22],.075,suit);link([side*.32,1.31,-.22],[side*.37,1.17,-.5],.06,suit);box(.11,.09,.12,side*.37,1.17,-.5,black);
    link([side*.19,1.04,.35],[side*.31,.75,-.07],.095,suit);link([side*.31,.75,-.07],[side*.26,.43,.34],.074,suit);box(.14,.12,.29,side*.27,.41,.27,black);
  }
  const light=new T.SpotLight(0xd9f3ff,0,110,.32,.6,1.2);light.position.set(0,1.01,-.85);light.target.position.set(0,.35,-35);body.add(light,light.target);
  return {root,body,steers,wheels,steering,paint,alloy,glass,brake,head,lights:[light]};
}
