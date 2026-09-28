import test from "node:test";
import assert from "node:assert/strict";
import {SaveManager,defaults} from "../src/core/SaveManager";
import {STOCK,tuneFor} from "../src/vehicles/UpgradeCatalog";
import {PhysicsWorld,VehiclePhysics} from "../src/physics/VehiclePhysics";
import {RoadNetwork} from "../src/world/RoadNetwork";
const coast={throttle:0,brake:0,steer:0,handbrake:false,up:false,down:false};
function storage(){const data=new Map<string,string>();Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v)}});return data;}
test("upgrade purchases are per car, reversible for free, persisted, and reject invalid or unaffordable parts",()=>{
  storage();const save=new SaveManager();
  assert.equal(save.buyUpgrade("tyres-sport"),"insufficient");assert.deepEqual(save.loadout,STOCK);
  save.coins=500;assert.equal(save.buyUpgrade("tyres-sport"),"bought");assert.equal(save.coins,415);
  assert.equal(save.buyUpgrade(STOCK.tyres),"equipped");assert.equal(save.buyUpgrade("tyres-sport"),"equipped");assert.equal(save.coins,415);
  assert.equal(save.buyUpgrade("bad"),"invalid");save.buyOrSelect("kestrel");assert.deepEqual(save.loadout,STOCK);
  assert.equal(save.ownsUpgrade("tyres-sport"),false);save.buyUpgrade("suspension-rally");
  const restored=new SaveManager();assert.equal(restored.selectedCar,"kestrel");assert.equal(restored.loadout.suspension,"suspension-rally");
  restored.buyOrSelect("vanta");assert.equal(restored.loadout.tyres,"tyres-sport");assert.equal(restored.loadout.suspension,STOCK.suspension);
});
test("old balances survive migration; corrupted or unowned loadout entries cannot be fitted",()=>{
  const data=storage();data.set("redline-horizon-v1",JSON.stringify({coins:60,loadouts:{vanta:{tyres:"tyres-sport",brakes:"suspension-rally"}},ownedUpgrades:{vanta:["invalid"]},challengeRecords:{"coast-speed":{best:null,medal:3}}}));
  const save=new SaveManager();assert.equal(save.coins,60);assert.deepEqual(save.loadout,STOCK);
});
async function physicsFixture(){
  const p=await new PhysicsWorld().init();p.box(0,-.1,0,2000,.2,2000);
  const car=new VehiclePhysics(p,new RoadNetwork(),{...defaults});car.setPosition(0,.6,0,0);
  const step=(input=coast)=>{car.preStep(input,1/120);p.world.step();car.postStep(1/120);};
  for(let i=0;i<180;i++)step();return{p,car,step};
}
test("track brakes shorten an actual physics stop and trade away steering while braking",async()=>{
  const distances:number[]=[];
  for(const kit of [STOCK.brakes,"brakes-track"]){
    const {p,car,step}=await physicsFixture();car.applyLoadout({...STOCK,brakes:kit});car.body.setLinvel({x:0,y:0,z:-30},true);
    const start=car.position.clone();for(let i=0;i<1000&& (i===0||car.speed>.5);i++)step({...coast,brake:1});
    distances.push(car.position.distanceTo(start));assert.equal(car.crashSerial,0);p.world.free();
  }
  console.log({stockStopMetres:distances[0],trackStopMetres:distances[1]});
  assert.ok(distances[1]<distances[0]*.9);
  assert.ok(tuneFor({...STOCK,brakes:"brakes-track"}).brakeTurn<1);
  assert.ok(tuneFor({...STOCK,brakes:"brakes-rotation"}).brakeRearGrip<1);
});
test("tyre trade-offs reach Rapier contact grip; suspension changes real spring stiffness and travel",async()=>{
  const {p,car,step}=await physicsFixture();
  car.applyLoadout({...STOCK,tyres:"tyres-sport",suspension:"suspension-track"});step();
  const dry=car.controller.wheelFrictionSlip(0)!;car.settings.weather="rain";step();const wet=car.controller.wheelFrictionSlip(0)!;
  assert.ok(dry>2.8);assert.ok(wet<1.75);assert.ok(Math.abs(car.controller.wheelMaxSuspensionTravel(0)!-.12)<1e-6);
  assert.equal(car.controller.wheelSuspensionStiffness(0),62);
  car.applyLoadout({...STOCK,tyres:"tyres-drift",suspension:"suspension-rally"});step();
  assert.ok(car.controller.wheelFrictionSlip(2)!<car.controller.wheelFrictionSlip(0)!*.8);
  assert.equal(car.controller.wheelSuspensionStiffness(0),34);assert.ok(Math.abs(car.controller.wheelMaxSuspensionTravel(0)!-.29)<1e-6);
  const terrain=tuneFor({...STOCK,tyres:"tyres-terrain"});assert.ok(terrain.dry<1&&terrain.loose>1&&terrain.rolling>1);
  p.world.free();
});
