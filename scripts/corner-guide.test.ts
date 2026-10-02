import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {RoadNetwork,Road,Sample} from '../src/world/RoadNetwork';import {roadRibbon} from '../src/world/roadGeometry';import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';import {defaults,SaveManager} from '../src/core/SaveManager';import {CornerGuide} from '../src/vehicles/CornerGuide';import {Autopilot} from '../src/vehicles/Autopilot';import {STOCK} from '../src/vehicles/UpgradeCatalog';import {CARS} from '../src/vehicles/CarCatalog';
// Real 16m-wide road: 250m approach, 50m-radius corner, exit straight.
function fixture() {
 const radius=50,start=250,end=start+Math.PI*radius/2,length=end+150;
 const at=(d:number):Sample=>{d=Math.max(0,Math.min(length,d));let p:T.Vector3,t:T.Vector3;if(d<=start){p=new T.Vector3(0,0,-d);t=new T.Vector3(0,0,-1);}else if(d<end){const a=(d-start)/radius;p=new T.Vector3(radius*(1-Math.cos(a)),0,-start-radius*Math.sin(a));t=new T.Vector3(Math.sin(a),0,-Math.cos(a));}else{p=new T.Vector3(radius+d-end,0,-start-radius);t=new T.Vector3(1,0,0);}return {p,t,r:new T.Vector3(-t.z,0,t.x),d,bank:0};};
 const samples:Sample[]=[];for(let d=0;d<length;d+=2)samples.push(at(d));samples.push(at(length));
 const road:Road={name:'Physics calibration corner',samples,width:16,length,closed:false,curve:new T.CatmullRomCurve3(samples.map(s=>s.p))};
 const grid=new Map<string,{road:Road;i:number}[]>();for(let i=0;i<samples.length-1;i++){const a=samples[i].p,b=samples[i+1].p;for(let x=Math.floor(Math.min(a.x,b.x)/100)-1;x<=Math.floor(Math.max(a.x,b.x)/100)+1;x++)for(let z=Math.floor(Math.min(a.z,b.z)/100)-1;z<=Math.floor(Math.max(a.z,b.z)/100)+1;z++){const key=x+','+z,list=grid.get(key)||[];list.push({road,i});grid.set(key,list);}}
 const proto=RoadNetwork.prototype,roads={main:road,roads:[road],ready:true,grid,at:proto.at,sampleIndex:proto.sampleIndex,nearest:proto.nearest,inJunction:()=>false} as unknown as RoadNetwork;return {road,roads,start,end};
}
const coast={throttle:0,brake:0,steer:0,handbrake:false,up:false,down:false};
test('corner guidance starts off in fresh/older saves and preserves an explicit preference',()=>{
 const data=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v)}});assert.equal(defaults.cornerGuide,'off');assert.equal(new SaveManager().settings.cornerGuide,'off');const save=new SaveManager();save.settings.cornerGuide='markers';save.save();assert.equal(new SaveManager().settings.cornerGuide,'markers');const key=[...data.keys()][0],old=JSON.parse(data.get(key)!);delete old.settings.cornerGuide;data.set(key,JSON.stringify(old));assert.equal(new SaveManager().settings.cornerGuide,'off');
});
test('guide stays silent for feasible bends, warns at the braking point and clears immediately after slowing',async()=>{
 const f=fixture(),physics=await new PhysicsWorld().init(),car=new VehiclePhysics(physics,f.roads,{...defaults,cornerGuide:'markers'}),guide=new CornerGuide(f.roads),pose=(d:number,speed:number)=>{car.teleport(f.road,d,0);car.speed=car.signedSpeed=speed;car.contacts=4;};try{
 pose(220,32);guide.update(car,true,f.road);assert.equal(guide.visible,false,'old guide warned despite ample dry grip');pose(100,45);guide.update(car,true,f.road);assert.equal(guide.visible,false,'distant bend is not a brake-now warning');pose(232,45);guide.update(car,true,f.road);assert.equal(guide.visible,true);assert.equal(guide.brake,true);assert.equal(guide.root.visible,true);const dry=guide.recommended;
 car.speed=car.signedSpeed=30;guide.update(car,true,f.road);assert.equal(guide.visible,false);assert.equal(guide.brake,false);assert.equal(guide.root.visible,false);car.settings.weather='rain';car.settings.rainIntensity=1;car.speed=car.signedSpeed=45;guide.update(car,true,f.road);assert.equal(guide.visible,true);assert.ok(guide.recommended<dry);car.applyLoadout({...STOCK,tyres:'tyres-sport'});car.settings.weather='clear';guide.update(car,true,f.road);assert.ok(!guide.visible||guide.recommended>dry);car.contacts=0;guide.update(car,true,f.road);assert.equal(guide.visible,false);car.contacts=4;guide.update(car,false,f.road);assert.equal(guide.visible,false);
 }finally{physics.world.free();}
});
test('dry corner flagged by the old comfort-speed estimate is driveable at 32m/s without braking or a warning',async()=>{
 const f=fixture(),physics=await new PhysicsWorld().init(),g=roadRibbon(f.road,0,f.road.samples.length-1,-8,8);physics.mesh(g);g.dispose();const car=new VehiclePhysics(physics,f.roads,{...defaults,cornerGuide:'hud'}),guide=new CornerGuide(f.roads),pilot=new Autopilot(f.roads);try{
 car.teleport(f.road,170,3);for(let i=0;i<120;i++){car.preStep({...coast,brake:1},1/120);physics.world.step();car.postStep(1/120);}car.body.setLinvel({x:car.forward.x*32,y:0,z:car.forward.z*32},true);car.speed=car.signedSpeed=32;pilot.toggle(car);let samples=0,maxOffset=0,completed=false;
 for(let i=0;i<1200;i++){const input=pilot.controls(car,115.2,'steering',coast,{},1/120);input.throttle=T.MathUtils.clamp((32-car.speed)*.5+.12,0,1);assert.equal(input.brake,0);car.preStep(input,1/120);physics.world.step();car.postStep(1/120);const hit=f.roads.nearest(car.position.x,car.position.z);maxOffset=Math.max(maxOffset,Math.abs(hit.offset));if(i%12===0){guide.update(car,true,f.road);assert.equal(guide.visible,false,`false warning at ${hit.sample.d.toFixed(1)}m / ${(car.speed*3.6).toFixed(1)}km/h`);samples++;}assert.ok(hit.distance<7,'car left road');assert.ok(car.position.y>.2,'lost road support');assert.equal(car.crashSerial,0);if(hit.sample.d>f.end+30){completed=true;break;}}
 assert.ok(completed);assert.ok(samples>40);console.log({noBrakeCornerSamples:samples,maxOffset});
 }finally{physics.world.free();}
});
test('vehicle grip/steering capacity and helpful banking change the physical corner limit',async()=>{
 const f=fixture(),physics=await new PhysicsWorld().init(),car=new VehiclePhysics(physics,f.roads,{...defaults}),guide=new CornerGuide(f.roads);try{car.teleport(f.road,232,0);car.speed=45;car.contacts=4;guide.update(car,true,f.road);const stock=guide.recommended;assert.ok(guide.visible);car.spec=CARS.find(c=>c.id==='pulse')!;car.teleport(f.road,232,0);car.speed=45;car.contacts=4;guide.update(car,true,f.road);assert.equal(guide.visible,false,'bike has more grip and steering capacity');car.spec=CARS[0];for(const s of f.road.samples)if(s.d>f.start&&s.d<f.end)s.bank=-.18;car.teleport(f.road,232,0);car.speed=45;car.contacts=4;guide.update(car,true,f.road);assert.ok(guide.recommended>stock||!guide.visible);}finally{physics.world.free();}
});

test('overspeed corners physically leave the road without braking; responding to the wet warning completes it safely',async()=>{
 const f=fixture();
 const run=async(respond:boolean,weather:typeof defaults.weather="rain")=>{
  const physics=await new PhysicsWorld().init(),g=roadRibbon(f.road,0,f.road.samples.length-1,-8,8);physics.mesh(g);g.dispose();const car=new VehiclePhysics(physics,f.roads,{...defaults,weather,rainIntensity:1,cornerGuide:'hud'}),guide=new CornerGuide(f.roads),pilot=new Autopilot(f.roads);
  try{car.teleport(f.road,170,3);for(let i=0;i<120;i++){car.preStep({...coast,brake:1},1/120);physics.world.step();car.postStep(1/120);}car.body.setLinvel({x:car.forward.x*45,y:0,z:car.forward.z*45},true);car.speed=car.signedSpeed=45;pilot.toggle(car);let target=45,warned=false,completed=false,leftRoad=false;
   for(let i=0;i<1800;i++){if(i%12===0){guide.update(car,true,f.road);if(guide.visible){warned=true;if(respond)target=Math.min(target,guide.recommended/3.6);}}
    const input=pilot.controls(car,162,'steering',coast,{},1/120);input.throttle=T.MathUtils.clamp((target-car.speed)*.4+.12,0,1);input.brake=respond?T.MathUtils.clamp((car.speed-target)*.3,0,1):0;if(input.brake>.1)input.throttle=0;
    car.preStep(input,1/120);physics.world.step();car.postStep(1/120);const hit=f.roads.nearest(car.position.x,car.position.z);if(hit.distance>7||car.position.y<.2||car.crashSerial){leftRoad=true;break;}if(hit.sample.d>f.end+30){completed=true;break;}
   }return {warned,completed,leftRoad};
  }finally{physics.world.free();}
 };
 const ignored=await run(false),responded=await run(true),dry=await run(false,"clear");console.log({ignoredWetWarning:ignored,respondedWetWarning:responded,dry45:dry});assert.ok(dry.warned&&dry.leftRoad);assert.ok(ignored.warned&&ignored.leftRoad);assert.ok(responded.warned&&responded.completed&&!responded.leftRoad);
});
