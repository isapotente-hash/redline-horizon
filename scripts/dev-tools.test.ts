import test from 'node:test';
import assert from 'node:assert/strict';
import {DevTools} from '../src/core/DevTools';
import {SaveManager,defaults} from '../src/core/SaveManager';
import {CARS} from '../src/vehicles/CarCatalog';
import {UPGRADES} from '../src/vehicles/UpgradeCatalog';
import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';
import {RoadNetwork} from '../src/world/RoadNetwork';
import {PoliceManager} from '../src/police/PoliceManager';
function fresh(){const data=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>data.get(key)||null,setItem:(key:string,value:string)=>data.set(key,value)}});const save=new SaveManager();return {save,dev:new DevTools(save),data};}
test('password gate rejects all cheat actions, supports leading zero, and locks again',()=>{
  const {save,dev}=fresh();let resets=0;dev.onReset=()=>resets++;
  for(const action of ['coins','unlock-all','unlimited-coins','boost','no-police','reset-car'])assert.match(dev.execute(action,'1000'),/password/);
  assert.equal(save.coins,0);assert.equal(resets,0);assert.equal(dev.unlock('922'),false);assert.equal(dev.unlock('0922'),true);
  dev.execute('coins','1000');assert.equal(save.coins,1000);dev.lock();dev.execute('coins','1000');assert.equal(save.coins,1000);
});
test('repeated custom grants persist, invalid amounts do not corrupt the save',()=>{
  const {save,dev}=fresh();dev.unlock('0922');
  for(let i=0;i<30;i++)dev.execute('coins','1000000000');
  assert.equal(save.coins,30000000000);
  for(const amount of ['','-100','NaN','Infinity','1.2'])dev.execute('coins',amount);
  assert.equal(save.coins,30000000000);assert.equal(new SaveManager().coins,save.coins);
});
test('unlimited spending buys cars and parts at zero balance without corrupting saved coins',()=>{
  const {save,dev}=fresh();dev.unlock('0922');dev.execute('unlimited-coins',true);
  assert.equal(save.buyOrSelect('apex'),'bought');assert.equal(save.buyUpgrade('engine-race'),'bought');assert.equal(save.payFine(50),0);assert.equal(save.coins,0);
  const loaded=new SaveManager();assert.equal(loaded.coins,0);assert.equal(loaded.unlimitedCoins,false);assert.ok(loaded.ownedCars.has('apex'));assert.ok(loaded.ownsUpgrade('engine-race'));
  dev.execute('disable');assert.equal(save.buyUpgrade('gearing-long'),'insufficient');
});
test('unlock everything persists across every vehicle; max power preserves handling setup',()=>{
  const {save,dev}=fresh();dev.unlock('0922');dev.execute('unlock-all');
  save.buyUpgrade('tyres-terrain');dev.execute('max-power');
  const loaded=new SaveManager();
  for(const car of CARS){assert.ok(loaded.ownedCars.has(car.id));for(const part of UPGRADES)assert.ok(loaded.ownedUpgrades[car.id].includes(part.id));}
  assert.equal(loaded.loadout.engine,'engine-race');assert.equal(loaded.loadout.gearing,'gearing-long');assert.equal(loaded.loadout.tyres,'tyres-terrain');
  dev.execute('boost',true);dev.execute('no-police',true);dev.execute('disable');assert.equal(dev.infiniteBoost,false);assert.equal(dev.noPolice,false);assert.equal(save.ownedCars.size,CARS.length);
});
test('infinite boost survives five seconds; disabling resumes normal orb countdown; disabled police cannot start pursuit',async()=>{
  const {save}=fresh(),physics=await new PhysicsWorld().init(),roads=new RoadNetwork();
  const car=new VehiclePhysics(physics,roads,{...defaults}),police=new PoliceManager(roads,physics,save);
  const control={throttle:0,brake:0,steer:0,handbrake:false,up:false,down:false};
  car.teleport(roads.main,120);car.infiniteBoost=true;
  for(let i=0;i<720;i++)car.preStep(control,1/120);
  assert.equal(car.boostRemaining,5);car.infiniteBoost=false;
  for(let i=0;i<720;i++)car.preStep(control,1/120);
  assert.equal(car.boostRemaining,0);car.activateBoost();car.preStep(control,1/120);assert.ok(car.boostRemaining<5&&car.boostRemaining>4.9);
  car.speed=40;police.disabled=true;for(let i=0;i<300;i++)police.preStep(1/120,car,false);assert.equal(police.active,false);
  police.rules.active=true;police.rules.impound=5;police.clearWanted();assert.equal(police.active,false);assert.equal(police.rules.impound,0);assert.ok(police.units.every(u=>!u.car.body.isEnabled()));
  police.disabled=false;car.contacts=4;police.preStep(2,car,false);assert.equal(police.active,true);
  physics.world.free();
});
