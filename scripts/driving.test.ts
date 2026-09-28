import test from "node:test";
import assert from "node:assert/strict";
import { PhysicsWorld, VehiclePhysics } from "../src/physics/VehiclePhysics";
import { RoadNetwork } from "../src/world/RoadNetwork";
import { defaults } from "../src/core/SaveManager";
import { Controls } from "../src/input/InputManager";
import { RaceManager } from "../src/racing/RaceManager";
import { roadRibbon } from "../src/world/roadGeometry";
const coast: Controls = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  up: false,
  down: false,
};
async function fixture() {
  const p = await new PhysicsWorld().init();
  p.box(0, -0.1, 0, 4000, 0.2, 4000);
  const roads = new RoadNetwork(),
    car = new VehiclePhysics(p, roads, { ...defaults });
  car.setPosition(0, 0.6, 0, 0);
  function step(seconds: number, input = coast) {
    for (let i = 0; i < Math.round(seconds * 120); i++) {
      car.preStep(input, 1 / 120);
      p.world.step();
      car.postStep(1 / 120);
    }
  }
  step(2);
  return { p, roads, car, step };
}
test("suspension settles, throttle accelerates forward, automatic shifts, brakes slow the chassis", async () => {
  const { p, car, step } = await fixture();
  try {
    assert.ok(
      car.position.y > 0.5 && car.position.y < 0.68,
      `settled height ${car.position.y}`,
    );
    assert.equal(car.contacts, 4);
    step(4, { ...coast, throttle: 1 });
    assert.ok(car.position.z < -40, `forward z ${car.position.z}`);
    assert.ok(
      car.speed * 3.6 > 90 && car.speed * 3.6 < 180,
      `speed ${car.speed * 3.6}`,
    );
    assert.ok(car.gear >= 2);
    const speed = car.speed;
    step(1, { ...coast, brake: 1 });
    assert.ok(car.speed < speed * 0.7, `brake from ${speed} to ${car.speed}`);
    console.log(
      JSON.stringify({
        speedAfterBrakeKmh: car.speed * 3.6,
        gear: car.gear,
        height: car.position.y,
      }),
    );
  } finally {
    p.world.free();
  }
});
test("left steering turns left and reverse travels backwards", async () => {
  const { p, car, step } = await fixture();
  try {
    step(2, { ...coast, throttle: 0.7 });
    step(0.6, { ...coast, throttle: 0.3, steer: 0.65 });
    assert.ok(car.position.x < -0.3, `left x ${car.position.x}`);
    car.setPosition(0, 0.6, 0, 0);
    step(1);
    step(2, { ...coast, brake: 1 });
    assert.ok(car.position.z > 2, `reverse z ${car.position.z}`);
    assert.equal(car.reverse, true);
  } finally {
    p.world.free();
  }
});
test("circuit requires ordered checkpoints and completes one full lap", async () => {
  const { p, roads, car } = await fixture();
  try {
    const race = new RaceManager(roads, p);
    race.start(car);
    race.update(3.1, car);
    const n = race.count,
      s = roads.at(
        roads.main,
        race.startDistance + (roads.main.length * 5) / n,
      );
    car.setPosition(s.p.x, s.p.y + 0.6, s.p.z, 0);
    race.update(0.1, car);
    assert.equal(race.checkpoint, 0);
    for (let i = 0; i < n; i++) {
      const g = race.gate.position;
      car.setPosition(g.x, g.y + 0.6, g.z, 0);
      race.update(15, car);
    }
    assert.equal(race.checkpoint, n);
    assert.equal(race.finished, true);
    assert.equal(race.active, false);
    assert.ok(race.resultTime > n * 14);
    assert.ok(Number.isFinite(race.best));
    console.log(
      JSON.stringify({
        circuitMeters: roads.main.length,
        checkpoints: n,
        time: race.resultTime,
      }),
    );
  } finally {
    p.world.free();
  }
});

test("graded road faces upward and countdown braking holds the car still", async () => {
  const p = await new PhysicsWorld().init(),
    roads = new RoadNetwork(),
    g = roadRibbon(roads.main, 0, roads.main.samples.length - 1, -8, 8);
  const normals = g.getAttribute("normal");
  for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > 0.9);
  try {
    p.mesh(g);
    const car = new VehiclePhysics(p, roads, { ...defaults });
    for (let i = 0; i < 240; i++) {
      car.preStep({ ...coast, brake: 1, handbrake: true }, 1 / 120);
      p.world.step();
      car.postStep(1 / 120);
    }
    const height =
      car.position.y - roads.nearest(car.position.x, car.position.z).height;
    assert.equal(car.contacts, 4);
    assert.ok(height > 0.5 && height < 0.68);
    assert.ok(car.speed < 0.15, `idle speed ${car.speed}`);
    assert.equal(car.reverse, false);
    console.log(
      JSON.stringify({
        roadClearance: height,
        roadContacts: car.contacts,
        idleSpeed: car.speed,
      }),
    );
  } finally {
    p.world.free();
    g.dispose();
  }
});

test("road pickups grant five seconds of extra speed, recharge, and reset safely", async () => {
  const normal = await fixture(), boosted = await fixture();
  try {
    const { BoostManager } = await import('../src/world/BoostManager');
    const pads = new BoostManager(boosted.roads), pad = pads.pickups[0];
    assert.ok(pads.pickups.length > 20);
    const car = boosted.car;
    car.position.copy(pad.position);
    car.position.y += .6;
    car.contacts = 4; car.signedSpeed = 5;
    const target = car.position.clone();
    const road = boosted.roads.nearest(pad.position.x, pad.position.z);
    car.position.copy(road.sample.p); car.position.y += .6;
    assert.equal(pads.update(1 / 120, car), false, "Driving down the center must miss a side orb");
    assert.equal(car.boostRemaining, 0);
    car.position.copy(target);
    assert.equal(pads.update(1 / 120, car), true);
    assert.equal(car.boostRemaining, 5);
    assert.equal(pad.mesh.visible, false);
    car.boostRemaining = 3;
    assert.equal(pads.update(1, car), false);
    assert.equal(car.boostRemaining, 3);
    car.setPosition(0, .6, 0, 0);
    assert.equal(car.boostRemaining, 0);
    boosted.step(1); normal.step(1);
    car.activateBoost();
    boosted.step(2, {...coast, throttle: 1});
    normal.step(2, {...coast, throttle: 1});
    assert.ok(car.speed > normal.car.speed * 1.2, `boost ${car.speed}, normal ${normal.car.speed}`);
    assert.ok(Math.abs(car.boostRemaining - 3) < 1e-8);
    boosted.step(3.01, {...coast, throttle: 1});
    assert.equal(car.boostRemaining, 0);
    car.position.copy(pad.position); car.position.y += .6;
    car.signedSpeed = 5; car.contacts = 4;
    assert.equal(pads.update(12, car), true);
    assert.equal(car.boostRemaining, 5);
  } finally { normal.p.world.free(); boosted.p.world.free(); }
});


test("autopilot follows bends, respects target speed, and switches off", async () => {
  const { Autopilot } = await import('../src/vehicles/Autopilot');
  const physics = await new PhysicsWorld().init(), roads = new RoadNetwork();
  const geometry = roadRibbon(roads.main, 0, roads.main.samples.length - 1, -8, 8);
  physics.mesh(geometry);
  const car = new VehiclePhysics(physics, roads, {...defaults}), pilot = new Autopilot(roads);
  try {
    for (let i=0;i<180;i++) { car.preStep({...coast,brake:1,handbrake:true},1/120);physics.world.step();car.postStep(1/120); }
    pilot.toggle(car);
    let maxOffset=0;
    for (let i=0;i<45*120;i++) {
      car.preStep(pilot.controls(car,90),1/120);physics.world.step();car.postStep(1/120);
      if(i%120===0)maxOffset=Math.max(maxOffset,roads.nearest(car.position.x,car.position.z,true).distance);
    }
    assert.ok(car.distance>650, `travel ${car.distance}`);
    assert.ok(maxOffset<7.5, `road deviation ${maxOffset}`);
    assert.ok(car.speed*3.6<105, `target 90 actual ${car.speed*3.6}`);
    for(let i=0;i<8*120;i++){car.preStep(pilot.controls(car,35),1/120);physics.world.step();car.postStep(1/120);}
    assert.ok(car.speed*3.6<45, `lower speed target ${car.speed*3.6}`);
    pilot.toggle(car);assert.equal(pilot.enabled,false);
    assert.equal(pilot.controls(car,180).throttle,0);
    console.log(JSON.stringify({autopilotDistance:car.distance,maxOffset,speedAt35:car.speed*3.6}));
  } finally {physics.world.free();geometry.dispose();}
});

test("partial autopilot assists only the selected controls and allows the others", async () => {
  const { Autopilot, autopilotOverride } = await import('../src/vehicles/Autopilot');
  const { p, roads, car } = await fixture();
  try {
    const pilot = new Autopilot(roads);
    car.teleport(roads.main, 120);
    pilot.toggle(car);
    car.rpm = 8200;
    const pedals = {...coast, throttle: .7, brake: .25, handbrake: true};
    const steeringOnly = pilot.controls(car, 180, 'steering', pedals);
    assert.equal(steeringOnly.throttle, pedals.throttle);
    assert.equal(steeringOnly.brake, pedals.brake);
    assert.equal(steeringOnly.handbrake, true);
    assert.equal(car.gear, 1, 'steering assistance must not shift gears');
    assert.equal(autopilotOverride('steering', pedals), false);
    assert.equal(autopilotOverride('steering', {...coast,steer:.5}), true);
    const manualSteer = {...coast, steer: -.65};
    const speedOnly = pilot.controls(car, 90, 'speed', manualSteer);
    assert.equal(speedOnly.steer, -.65);
    assert.ok(speedOnly.throttle > 0);
    assert.equal(autopilotOverride('speed', manualSteer), false);
    assert.equal(autopilotOverride('speed', {...coast,brake:1}), true);
    car.speed = 40;
    assert.ok(pilot.controls(car, 35, 'speed', manualSteer).brake > 0);
    pilot.disable();
    assert.deepEqual(pilot.controls(car, 90, 'speed', pedals), pedals);
  } finally { p.world.free(); }
});

test("autopilot collects small orbs and passes a blocking opponent without contact", async () => {
  const { Autopilot } = await import('../src/vehicles/Autopilot');
  const { BoostManager } = await import('../src/world/BoostManager');
  const physics = await new PhysicsWorld().init(), roads = new RoadNetwork();
  const geometry = roadRibbon(roads.main, 0, roads.main.samples.length - 1, -8, 8);
  physics.mesh(geometry);
  const car = new VehiclePhysics(physics, roads, {...defaults}), pilot = new Autopilot(roads), boosts = new BoostManager(roads);
  const opponent = {d:320,lane:3.68,speed:0,direction:1};
  const sample = roads.at(roads.main, opponent.d), position = sample.p.clone().addScaledVector(sample.r,opponent.lane);
  physics.box(position.x,position.y+.55,position.z,2,1.1,4.6,Math.atan2(-sample.t.x,-sample.t.z));
  try {
    for(let i=0;i<180;i++){car.preStep({...coast,brake:1,handbrake:true},1/120);physics.world.step();car.postStep(1/120);}
    pilot.toggle(car);
    let collected=0,minClearance=Infinity,maxOffset=0;
    for(let i=0;i<42*120;i++){
      car.preStep(pilot.controls(car,90,'full',coast,{orbs:boosts.pickups,cars:[opponent]}),1/120);
      physics.world.step();car.postStep(1/120);
      if(boosts.update(1/120,car))collected++;
      minClearance=Math.min(minClearance,Math.hypot(car.position.x-position.x,car.position.z-position.z));
      if(i%120===0)maxOffset=Math.max(maxOffset,roads.nearest(car.position.x,car.position.z,true).distance);
    }
    console.log(JSON.stringify({orbsCollected:collected,opponentClearance:minClearance,maxOffset,distance:car.distance}));
    assert.ok(collected>=2, `collected ${collected}`);
    assert.ok(minClearance>2.7, `opponent clearance ${minClearance}`);
    assert.ok(maxOffset<7.5, `road offset ${maxOffset}`);
    assert.ok(car.distance>800, `must pass opponent: ${car.distance}`);
  } finally {physics.world.free();geometry.dispose();}
});

test("navigation rejects a blocked orb route and yields to an oncoming car", async () => {
  const { navigate } = await import('../src/vehicles/AutopilotNavigation');
  const roads = new RoadNetwork(), road=roads.main;
  const orb = {road,d:180,offset:-4.48,cooldown:0};
  const clear=navigate(road,120,1,20,3.68,3.68,{orbs:[orb]});
  assert.equal(clear.lane,orb.offset);
  const blocked=navigate(road,120,1,20,3.68,3.68,{orbs:[orb],cars:[{d:180,lane:-4.48,speed:0,direction:1}]});
  assert.ok(Math.abs(blocked.lane+4.48)>=3.2, `blocked lane ${blocked.lane}`);
  const oncoming=navigate(road,120,1,20,3.68,3.68,{cars:[{d:150,lane:3.68,speed:20,direction:-1}]});
  assert.ok(Math.abs(oncoming.lane-3.68)>2.5);
  assert.equal(oncoming.speedLimit,0);
});
