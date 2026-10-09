import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {World} from '../src/world/World';import {PhysicsWorld,VehiclePhysics,R} from '../src/physics/VehiclePhysics';
import {OnFootPlayer} from '../src/player/OnFootPlayer';import {RoadNetwork} from '../src/world/RoadNetwork';
import {CARS} from '../src/vehicles/CarCatalog';import {SaveManager,defaults} from '../src/core/SaveManager';import {SAVE_KEY} from '../src/core/SaveStorage';
import {RenderSystem} from '../src/rendering/RenderSystem';import {DryGrass} from '../src/world/DryGrass';import {TrafficManager} from '../src/vehicles/TrafficManager';
const stopped={throttle:0,brake:1,steer:0,handbrake:true,up:false,down:false};
const context=new Proxy({createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),measureText:()=>({width:10})},{get:(o,k)=>k in o?(o as any)[k]:()=>{}});
function dom(){(globalThis as any).document={createElement:()=>({getContext:()=>context})};}
function storage(settings:any){const values=new Map([[SAVE_KEY,JSON.stringify({settings})]]);Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)}});}
function teleportFoot(foot:OnFootPlayer,x:number,y:number,z:number){foot.position.set(x,y,z);foot.previousPosition.copy(foot.position);foot.body.setTranslation(foot.position,true);foot.body.setNextKinematicTranslation(foot.position);foot.root.position.copy(foot.position);}

test('Very Low and 10 m render/10 m simulation limits save and reload; existing presets/defaults remain valid',()=>{
 storage({quality:'very-low',renderDistance:10,simulationDistance:10});const save=new SaveManager();assert.equal(save.settings.quality,'very-low');assert.equal(save.settings.renderDistance,10);assert.equal(save.settings.simulationDistance,10);save.save();const again=new SaveManager();assert.deepEqual(again.settings,save.settings);
 for(const quality of ['low','medium','high','ultra']){storage({quality,renderDistance:525,simulationDistance:275});const s=new SaveManager();assert.equal(s.settings.quality,quality);assert.equal(s.settings.renderDistance,525);assert.equal(s.settings.simulationDistance,275);}
 storage({quality:'invalid',renderDistance:-1,simulationDistance:0});const invalid=new SaveManager();assert.equal(invalid.settings.quality,defaults.quality);assert.equal(invalid.settings.renderDistance,10);assert.equal(invalid.settings.simulationDistance,10);
});
test('Low presets reduce grass density and higher presets restore the existing instances',()=>{
 const grass=new DryGrass(),mesh=grass.batch(1);grass.plant(mesh,0,0,0,0,1);mesh.computeBoundingSphere();mesh.userData.fieldCount=1;
 for(const quality of ['very-low','low','medium','high','ultra'] as const){grass.update({...defaults,quality,renderDistance:100});assert.equal(grass.visible(mesh,new T.Vector3()),true);assert.equal(mesh.count,quality==='very-low'||quality==='low'?0:1);assert.equal(grass.visible(mesh,new T.Vector3(0,0,200)),false);}
 mesh.dispose();grass.material.dispose();grass.geometry.dispose();
});
test('all eight vehicles allow walking across front/rear and along both sides, retain solid contact and have no leftover seated collider',async()=>{
 const p=await new PhysicsWorld().init();p.world.timestep=1/60;p.box(0,-.1,0,100,.2,100);const car=new VehiclePhysics(p,new RoadNetwork(),{...defaults}),foot=new OnFootPlayer(p);const bodyCount=p.world.bodies.len();let walks=0;
 try{for(const spec of CARS){car.spec=spec;car.setPosition(0,car.chassis.rideHeight,0,0);for(let n=0;n<120;n++){car.preStep(stopped,1/60);p.world.step();car.postStep(1/60);}assert.ok(foot.exit(car),spec.id);const cx=car.position.x,cz=car.position.z;const width=Math.max(car.chassis.halfBody[0],car.chassis.halfWidth)+.65,length=Math.max(car.chassis.halfBody[2],car.chassis.halfLength+car.chassis.radius)+.65;
  for(const z of [-length,length]){teleportFoot(foot,cx+width,.88,cz+z);p.world.step();for(let n=0;n<Math.ceil(2*width/4.5*60)+12;n++){foot.preStep({forward:0,right:-1},0,1/60);p.world.step();foot.postStep();}assert.ok(foot.position.x<cx-width+.1,spec.id+' front/rear passage');assert.ok(foot.position.y>.7);walks++;}
  for(const x of [-width,width]){teleportFoot(foot,cx+x,.88,cz+length);p.world.step();for(let n=0;n<Math.ceil(2*length/4.5*60)+12;n++){foot.preStep({forward:1,right:0},0,1/60);p.world.step();foot.postStep();}assert.ok(foot.position.z<cz-length+.1,spec.id+' side passage '+JSON.stringify({position:foot.position.toArray(),width,length,parked:car.position.toArray(),rotation:car.rotation.toArray()}));assert.ok(foot.position.y>.7);walks++;}
  teleportFoot(foot,cx+width,.88,cz);p.world.step();for(let n=0;n<90;n++){foot.preStep({forward:0,right:-1},0,1/60);p.world.step();foot.postStep();}assert.ok(foot.position.x>cx+car.chassis.halfBody[0],spec.id+' real vehicle stays solid');assert.equal(p.world.bodies.len(),bodyCount);assert.ok(foot.enter(car,true));assert.equal(foot.body.isEnabled(),false);
 }console.log({vehiclePerimeterPassages:walks});}finally{p.world.free();}
});
test('terrain collision covers neighboring tile edges/corners at 10 m, so actual walking and driving cross the previous invisible stopping line',async()=>{
 dom();const p=await new PhysicsWorld().init();p.world.timestep=1/60;const roads=new RoadNetwork(),settings={...defaults,quality:'very-low' as const,renderDistance:10,simulationDistance:10},world=new World(roads,p,settings),focus=new T.Vector3(-2,28,-300);
 try{world.update(focus,true);p.world.step();assert.equal(world.visualRadius,1);assert.ok(world.chunks.size<=9);const floor=(x:number,z:number)=>{const hit=p.world.castRay(new R.Ray({x,y:1000,z},{x:0,y:-1,z:0}),2000,true,R.QueryFilterFlags.EXCLUDE_DYNAMIC|R.QueryFilterFlags.EXCLUDE_KINEMATIC|R.QueryFilterFlags.EXCLUDE_SENSORS);assert.ok(hit,`ground at ${x},${z}`);return 1000-hit.timeOfImpact;};
  for(const x of [-.5,.5,2])floor(x,-300);
  const foot=new OnFootPlayer(p);foot.active=true;foot.body.setEnabled(true);teleportFoot(foot,-.9,floor(-.9,-300)+.88,-300);p.world.step();
  for(let n=0;n<45;n++){foot.preStep({forward:0,right:1},0,1/60);p.world.step();foot.postStep();}assert.ok(foot.position.x>1.5,'walk crosses x=0 tile boundary');assert.ok(foot.position.y>floor(foot.position.x,foot.position.z)+.7);foot.body.setEnabled(false);
  world.update(new T.Vector3(-.5,28,-512.5),true);p.world.step();for(const x of [-.5,.5])for(const z of [-512.5,-511.5])floor(x,z);
  world.update(focus,true);p.world.step();const car=new VehiclePhysics(p,roads,settings);car.spec=CARS.find(c=>c.id==='pulse')!;car.setPosition(-4,floor(-4,-300)+.65,-300,-Math.PI/2);
  for(let n=0;n<120;n++){car.preStep(stopped,1/60);p.world.step();car.postStep(1/60);}for(let n=0;n<480&&car.position.x<3;n++){if(n%6===0)world.update(car.position,true);car.preStep({...stopped,throttle:1,brake:0,handbrake:false},1/60);p.world.step();car.postStep(1/60);assert.ok(car.position.y>floor(car.position.x,car.position.z)+.2);}
  assert.ok(car.position.x>2,'motorcycle drives across tile boundary without a barrier or fall');
  const terrainCount=[...world.chunks.values()].filter(c=>c.collider).length;settings.simulationDistance=10;world.update(new T.Vector3(-300,30,-300),true);p.world.step();assert.ok(!world.chunks.get('0,-2')?.collider,'distant collision unloads');console.log({minimumSimulationMeters:10,terrainCount,crossingX:car.position.x});
 }finally{p.world.free();}
});
test('traffic retains a safety buffer at minimum distances and inactive cars leave no barriers; scenery still culls',async()=>{
 dom();const p=await new PhysicsWorld().init(),roads=new RoadNetwork(),traffic=new TrafficManager(roads,p,12),player=roads.at(roads.main,120).p;
 try{traffic.update(1/60,player,'very-low',1000,100);p.world.step();assert.ok(traffic.cars.filter(c=>c.body.isEnabled()).length<=traffic.cars.length);for(const c of traffic.cars)if(c.root.position.distanceTo(player)<100&&c.body.isEnabled())assert.equal(c.root.visible,true);traffic.update(1/60,player,'very-low',10,10);p.world.step();for(const c of traffic.cars)if(c.body.isEnabled()){assert.ok(c.root.position.distanceTo(player)<480);if(c.root.position.distanceTo(player)<240)assert.ok(c.root.visible);}traffic.active=false;traffic.update(1/60,player,'very-low',10,10);assert.ok(traffic.cars.every(c=>!c.body.isEnabled()&&!c.root.visible));
  const settings={...defaults,quality:'very-low' as const,renderDistance:500,simulationDistance:50},world=new World(roads,p,settings);const near={group:new T.Group(),center:player.clone(),radius:10},far={group:new T.Group(),center:player.clone().add(new T.Vector3(300,0,0)),radius:10};world.roadSectors.push(near,far);world.update(player,true);assert.equal(far.group.visible,true);settings.renderDistance=10;world.update(player,true);assert.equal(near.group.visible,true);assert.equal(far.group.visible,false);
 }finally{p.world.free();}
});

test('a short simulation range keeps nearby visible scenery solid and unloads distant scenery inside the same terrain tile',async()=>{
 dom();const p=await new PhysicsWorld().init(),world=new World(new RoadNetwork(),p,{...defaults,quality:'very-low',renderDistance:10,simulationDistance:10}),focus=new T.Vector3(64,40,-300);
 try{world.update(focus,true);const chunk=world.chunks.get('0,-2')!;const obstacle=(x:number)=>({kind:'box' as const,matrix:new T.Matrix4().compose(new T.Vector3(x,45,-300),new T.Quaternion(),new T.Vector3(2,2,2))}),near=obstacle(73),far=obstacle(184);chunk.obstacles.push(near,far);world.update(focus,true);p.world.step();assert.ok(chunk.obstacleColliders.has(near));assert.equal(chunk.obstacleColliders.has(far),false);const collider=chunk.obstacleColliders.get(near)!;const ray=new R.Ray({x:71,y:45,z:-300},{x:1,y:0,z:0});assert.ok(p.world.castRay(ray,4,true,undefined,undefined,undefined,undefined,c=>c.handle===collider.handle),'nearby scenery has real collision');world.update(new T.Vector3(180,40,-300),true);p.world.step();assert.equal(chunk.obstacleColliders.has(near),false);assert.ok(chunk.obstacleColliders.has(far),'approaching scenery becomes solid before reaching it');
 }finally{p.world.free();}
});
