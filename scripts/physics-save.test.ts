import test from 'node:test';
import assert from 'node:assert/strict';
import {PhysicsClock} from '../src/core/PhysicsClock';
import {SaveManager,defaults} from '../src/core/SaveManager';
import {SAVE_KEY,BACKUP_KEY} from '../src/core/SaveStorage';
import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';
import {RoadNetwork} from '../src/world/RoadNetwork';
import {CARS} from '../src/vehicles/CarCatalog';
import {Autopilot} from '../src/vehicles/Autopilot';
import {roadRibbon} from '../src/world/roadGeometry';
function storage(entries:Record<string,string>={}) {
 const data=new Map(Object.entries(entries));
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return data.size;},key:(i:number)=>[...data.keys()][i]??null,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});
 return data;
}
test('fixed simulation is frame-independent at 30/60/144 Hz; stalls and CPU budget never accumulate debt',()=>{
 for(const hz of [30,60,144]){const clock=new PhysicsClock();let steps=0;for(let i=0;i<hz*10;i++){clock.begin(1/hz,0);while(clock.take(0))steps++;assert.ok(clock.alpha>=0&&clock.alpha<=1);}assert.equal(steps,600);}
 const clock=new PhysicsClock();clock.begin(20,0);let steps=0;while(clock.take(0))steps++;assert.equal(steps,2);assert.ok(clock.accumulator<clock.step);
 clock.begin(1/30,0);assert.equal(clock.take(0),true);assert.equal(clock.take(7),false);assert.ok(clock.accumulator<clock.step);
 clock.begin(1/60,10);assert.equal(clock.take(10),true);assert.equal(clock.take(10),false);
 clock.reset();clock.begin(NaN,0);assert.equal(clock.take(0),false);
});
test('legacy profile restores balance, car, parts, settings and statistics before first use and migrates once',()=>{
 const legacy=JSON.stringify({layoutVersion:2,coins:825,ownedCars:['kestrel'],selectedCar:'kestrel',loadouts:{kestrel:{tyres:'tyres-sport'}},ownedUpgrades:{kestrel:['tyres-sport']},settings:{quality:'medium',volume:.2},statistics:{racesCompleted:12,drivingSeconds:123,topSpeedKmh:200},unlockedTracks:['coast'],best:1200});
 const data=storage({'redline-horizon-v1':legacy});const save=new SaveManager();
 assert.equal(save.coins,825);assert.equal(save.selectedCar,'kestrel');assert.equal(save.loadout.tyres,'tyres-sport');assert.equal(save.statistics.racesCompleted,12);assert.equal(save.settings.volume,.2);assert.equal(save.best,1200);assert.deepEqual(save.unlockedTracks,['coast']);
 assert.equal(data.get('redline-horizon-v1'),legacy);assert.equal(JSON.parse(data.get(SAVE_KEY)!).schemaVersion,4);
 save.payFine(50);data.set('redline-horizon-v1',JSON.stringify({coins:9999}));assert.equal(new SaveManager().coins,775,'stale migration must not resurrect spent coins');
});
test('migration checks key variants, wrapped state and timestamps without combining balances',()=>{
 storage({'redline-horizon-v1':JSON.stringify({coins:100,savedAt:1}),'redline_horizon_edition_4_save':JSON.stringify({state:{cash:275,savedAt:2,unlockedCars:['apex'],currentCar:'apex'}})});
 const save=new SaveManager();assert.equal(save.coins,275);assert.equal(save.selectedCar,'apex');
});
test('corrupt primary recovers backup or legacy; invalid settings/loadouts cannot poison initialization',()=>{
 storage({[SAVE_KEY]:'broken',[BACKUP_KEY]:JSON.stringify({coins:333,settings:{quality:'invalid',volume:999,paint:'bad'},position:{x:null},loadouts:{vanta:{tyres:'tyres-sport'}},ownedUpgrades:{vanta:['not-a-part']}})});
 const save=new SaveManager();assert.equal(save.coins,333);assert.equal(save.settings.quality,defaults.quality);assert.equal(save.settings.volume,1);assert.equal(save.settings.paint,defaults.paint);assert.equal(save.position,null);assert.notEqual(save.loadout.tyres,'tyres-sport');
 storage({[SAVE_KEY]:'[]',[BACKUP_KEY]:'null','redlineHorizonSave':JSON.stringify({coins:48})});assert.equal(new SaveManager().coins,48);
});
test('all economy transactions and explicit settings/statistics saves are immediately reloadable',()=>{
 storage();let save=new SaveManager();save.coins=500;save.save();save.buyOrSelect('kestrel');save=new SaveManager();assert.equal(save.coins,380);assert.equal(save.selectedCar,'kestrel');
 save.buyUpgrade('tyres-sport');save=new SaveManager();assert.equal(save.coins,295);assert.equal(save.loadout.tyres,'tyres-sport');
 save.collectCoin('test-coin');save=new SaveManager();assert.equal(save.coins,300);assert.equal(save.collectCoin('test-coin'),false);
 save.rewardMeters=995;save.addRewardDistance(10);assert.equal(new SaveManager().coins,320);
 save.settings.autopilotMode='steering';save.statistics.racesCompleted++;save.save();save=new SaveManager();assert.equal(save.settings.autopilotMode,'steering');assert.equal(save.statistics.racesCompleted,1);
});
test('denied storage and quota errors are nonfatal; future schemas are never overwritten',()=>{
 const data=storage({[SAVE_KEY]:JSON.stringify({schemaVersion:99,coins:999})});const before=data.get(SAVE_KEY);const future=new SaveManager();assert.equal(future.save(),false);assert.equal(data.get(SAVE_KEY),before);
 storage();const save=new SaveManager();let errors=0;save.onError=()=>errors++;(globalThis.localStorage as any).setItem=()=>{throw new Error('quota');};assert.equal(save.save(),false);assert.equal(save.save(),false);assert.equal(errors,1);
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('denied');}});assert.doesNotThrow(()=>new SaveManager());
});
const stopped={throttle:0,brake:1,steer:0,handbrake:true,up:false,down:false};
const drive={...stopped,throttle:1,brake:0,handbrake:false};
test('60 Hz runtime keeps every chassis grounded and brakes safely; bikes retain wheelies',async()=>{
 const roads=new RoadNetwork();
 for(const spec of CARS){
  const physics=await new PhysicsWorld().init();physics.world.timestep=1/60;physics.box(0,23.9,0,10000,.2,10000);
  const car=new VehiclePhysics(physics,roads,{...defaults});car.spec=spec;car.setPosition(0,25,0,0);
  const step=(input=drive,n=1)=>{for(let i=0;i<n;i++){car.preStep(input,1/60);physics.world.step();car.postStep(1/60);}};
  step(stopped,60);assert.equal(car.contacts,4,spec.id);step(drive,300);assert.ok(car.speed>12,spec.id+' accelerates');
  assert.ok(car.position.y>24.3&&car.position.y<25.8,spec.id+' stable');
  if(spec.id==='pulse'){step({...drive,throttle:.4,down:true},150);assert.ok(car.forward.y>.2,'wheelie');step({...drive,throttle:0},120);assert.ok(Math.abs(car.forward.y)<.1,'wheelie recovery');}
  step(stopped,300);assert.ok(car.speed<1,spec.id+' brakes');assert.equal(car.contacts,4);physics.world.free();
 }
});
test('60 Hz autopilot follows curves without leaving the paved road',async()=>{
 const roads=new RoadNetwork(),physics=await new PhysicsWorld().init();physics.world.timestep=1/60;
 physics.mesh(roadRibbon(roads.main,0,roads.main.samples.length-1,-10.3,10.3));
 const car=new VehiclePhysics(physics,roads,{...defaults});car.teleport(roads.main,120);
 for(let i=0;i<60;i++){car.preStep(stopped,1/60);physics.world.step();car.postStep(1/60);}
 const pilot=new Autopilot(roads);pilot.toggle(car);let worst=0;
 for(let i=0;i<3000;i++){car.preStep(pilot.controls(car,100,'full',drive,{},1/60),1/60);physics.world.step();car.postStep(1/60);worst=Math.max(worst,roads.nearest(car.position.x,car.position.z).distance);}
 assert.ok(car.distance>500);assert.ok(worst<8,`road deviation ${worst}`);assert.ok(car.contacts>=2);physics.world.free();
});
