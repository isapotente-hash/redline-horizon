import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {SaveManager,defaults} from "../src/core/SaveManager";
import {DrivingRewards} from "../src/core/DrivingRewards";
import {STOCK} from "../src/vehicles/UpgradeCatalog";
import {PhysicsWorld,VehiclePhysics} from "../src/physics/VehiclePhysics";
import {RoadNetwork} from "../src/world/RoadNetwork";
import {RaceManager} from "../src/racing/RaceManager";
const coast={throttle:0,brake:0,steer:0,handbrake:false,up:false,down:false};
function storage(){const data=new Map<string,string>();Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v)}});return data;}

test("mileage rewards repeat, retain partial progress across reloads and reject invalid distances",()=>{
  storage();let save=new SaveManager();
  for(let i=0;i<125;i++)save.addRewardDistance(10);
  assert.equal(save.coins,20);assert.equal(save.rewardMeters,250);save.save();
  save=new SaveManager();assert.equal(save.rewardMeters,250);
  for(let i=0;i<75;i++)save.addRewardDistance(10);
  assert.equal(save.coins,40);assert.equal(save.rewardMeters,0);
  for(const n of [NaN,Infinity,-1,10000])assert.equal(save.addRewardDistance(n),0);
  assert.equal(save.coins,40);assert.equal(save.rewardMeters,0);
});
test("driving rewards exclude teleports, air, stationary movement and disabled simulation",()=>{
  storage();const save=new SaveManager(),rewards=new DrivingRewards(save);
  const car={position:new T.Vector3(0,0,1),previousPosition:new T.Vector3(),contacts:4,speed:30,signedSpeed:30,teleportSerial:0} as VehiclePhysics;
  rewards.update(1/30,car,true);assert.equal(save.rewardMeters,0);
  rewards.update(1/30,car,true);assert.equal(save.rewardMeters,1);
  rewards.update(1/30,car,false);car.teleportSerial++;rewards.update(1/30,car,true);
  car.contacts=0;rewards.update(1/30,car,true);car.contacts=4;car.signedSpeed=0;rewards.update(1/30,car,true);
  car.signedSpeed=30;car.position.z=200;rewards.update(1/30,car,true);
  assert.equal(save.rewardMeters,1);
});
test("engine and gearbox purchases persist per car and bonuses stack",()=>{
  storage();const save=new SaveManager();save.coins=1000;
  assert.equal(save.buyUpgrade("engine-race"),"bought");assert.equal(save.buyUpgrade("gearing-long"),"bought");
  const reload=new SaveManager();assert.equal(reload.coins,440);assert.equal(reload.loadout.engine,"engine-race");assert.equal(reload.loadout.gearing,"gearing-long");
  reload.buyOrSelect("kestrel");assert.equal(reload.loadout.engine,STOCK.engine);
});
test("race rewards require a full ordered finish, pay once and repeat in the next race",async()=>{
  const p=await new PhysicsWorld().init(),roads=new RoadNetwork(),car=new VehiclePhysics(p,roads,{...defaults}),race=new RaceManager(roads,p);
  try {
    for(const laps of [1,3]) {
      race.start(car,laps);assert.equal(race.claimReward(),0);race.update(3.1,car);
      for(let i=0;i<race.count*laps;i++){const g=race.gate.position;car.setPosition(g.x,g.y+.6,g.z,0);race.update(15,car);}
      assert.equal(race.finished,true);const expected=(50+(8-race.position)*10)*laps;
      assert.equal(race.claimReward(),expected);assert.equal(race.claimReward(),0);assert.equal(race.rewardEarned,expected);
    }
    race.start(car);race.cancel();assert.equal(race.claimReward(),0);
  } finally {p.world.free();}
});
test("speed upgrades increase simulated straight-line top speed; tall gearing reduces launch acceleration",async()=>{
  const results:{speed:number;launch:number}[]=[];
  for(const loadout of [STOCK,{...STOCK,gearing:"gearing-long"},{...STOCK,engine:"engine-race",gearing:"gearing-long"}]) {
    const p=await new PhysicsWorld().init();p.box(0,-.1,0,400, .2, 30000);
    const roads=new RoadNetwork(),hit=roads.nearest(0,0);
    // A straight asphalt test strip isolates the drivetrain from terrain and bends.
    roads.nearest=()=>({...hit,distance:0});
    const car=new VehiclePhysics(p,roads,{...defaults});car.setPosition(0,.6,0,0);car.applyLoadout(loadout);
    const step=(input=coast)=>{car.preStep(input,1/120);p.world.step();car.postStep(1/120);};
    try {
      for(let i=0;i<240;i++)step();let launch=0;
      for(let i=0;i<120*90;i++){step({...coast,throttle:1});if(i===239)launch=car.speed;}
      results.push({speed:car.speed*3.6,launch});assert.ok(car.contacts>=2);
    } finally {p.world.free();}
  }
  console.log({drivetrainResults:results});
  assert.ok(results[1].launch<results[0].launch);
  assert.ok(results[1].speed>results[0].speed+2,"tall gearing must improve sustained speed");
  assert.ok(results[2].speed>results[0].speed+30,"full tuning must give a substantial real speed increase");
});
