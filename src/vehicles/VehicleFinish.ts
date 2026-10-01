import * as T from 'three';
import {CarVisual} from './CarModel';
import {chassisFor,CarSpec,isBike} from './CarCatalog';
import {Livery,cleanPlate} from './CosmeticCatalog';
/** One shader/plate allocation per visual, reused on paint changes, impacts and rendering. */
export class VehicleFinish{
 private inverse={value:new T.Matrix4()};private style={value:0};private damage={value:new T.Vector4()};private texture:T.CanvasTexture;private canvas:HTMLCanvasElement;private plate:T.Mesh;private last='';damageAmount=0;private scratch=new T.Vector3();private q=new T.Quaternion();
 constructor(private car:CarVisual){const prior=car.paint.onBeforeCompile;car.paint.onBeforeCompile=(shader,renderer)=>{prior.call(car.paint,shader,renderer);shader.uniforms.finishInverse=this.inverse;shader.uniforms.finishStyle=this.style;shader.uniforms.finishDamage=this.damage;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 finishWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nfinishWorld=(modelMatrix*vec4(transformed,1.)).xyz;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform mat4 finishInverse;uniform float finishStyle;uniform vec4 finishDamage;varying vec3 finishWorld;').replace('#include <color_fragment>',`#include <color_fragment>
 vec3 fp=(finishInverse*vec4(finishWorld,1.)).xyz;
 float stripe=finishStyle<1.5?1.-smoothstep(.15,.19,abs(fp.x)):finishStyle<2.5?(1.-smoothstep(.06,.09,abs(abs(fp.x)-.22))):(1.-smoothstep(.13,.17,abs(fp.x+.32)));
 if(finishStyle>.5)diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.83,.88,.86),stripe*.92);
 float scar=exp(-length(fp.xz-finishDamage.xy)*2.)*finishDamage.w;
 diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.13,.12,.11),scar*.7);`);};car.paint.customProgramCacheKey=()=> 'redline-finish-v1';car.paint.needsUpdate=true;
 this.canvas=document.createElement('canvas');this.canvas.width=256;this.canvas.height=64;this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;this.plate=new T.Mesh(new T.PlaneGeometry(.54,.14),new T.MeshStandardMaterial({map:this.texture,roughness:.65}));this.plate.name='Custom number plate';car.root.add(this.plate);}
 apply(spec:CarSpec,livery:Livery,plate:string){this.style.value=['factory','stripe','twin','race'].indexOf(livery);const c=chassisFor(spec);this.plate.position.set(0,-c.radius+.24,c.halfBody[2]+.045);this.plate.visible=true;this.plate.scale.setScalar(isBike(spec)?.5:1);const text=cleanPlate(plate)||'REDLINE';if(text!==this.last){this.last=text;const ctx=this.canvas.getContext('2d')!;ctx.fillStyle='#e8e7da';ctx.fillRect(0,0,256,64);ctx.fillStyle='#161c24';ctx.font='bold 37px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,128,34);this.texture.needsUpdate=true;}}
 impact(car:import('../physics/VehiclePhysics').VehiclePhysics,severity:number){this.damageAmount=Math.min(1,this.damageAmount+severity*.35);this.scratch.copy(car.beforeVelocity).sub(car.body.linvel() as T.Vector3).applyQuaternion(this.q.copy(car.rotation).invert());const c=car.chassis;this.damage.value.set(Math.sign(this.scratch.x)*c.halfBody[0],Math.sign(this.scratch.z)*c.halfBody[2],0,this.damageAmount);}
 repair(){this.damageAmount=0;this.damage.value.set(0,0,0,0);}
 update(){this.inverse.value.compose(this.car.root.position,this.car.root.quaternion,this.car.root.scale).invert();}
}
