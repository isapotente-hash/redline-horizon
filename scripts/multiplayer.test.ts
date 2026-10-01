import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {RaceConnection,DataLink,PeerClient} from '../src/multiplayer/RaceConnection';
import {validPose,validCode,normalizeCode,roomCode,Pose,ROOM_PREFIX} from '../src/multiplayer/Protocol';
import {RemoteVehicle} from '../src/multiplayer/RemoteVehicle';
import {RaceManager} from '../src/racing/RaceManager';
import {RoadNetwork} from '../src/world/RoadNetwork';
import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';
import {defaults} from '../src/core/SaveManager';
import * as T from 'three';

const pose=():Pose=>({t:'state',seq:1,car:'pulse',paint:'#26c4c5',active:true,p:[10,24,20],q:[0,0,0,1],steer:.2,spin:3,lean:.15,pitch:.05,brake:0,race:'ABCD-1',progress:12,finished:false,time:3});
class Link extends EventEmitter implements DataLink {
  open=false;bufferSize=0;dataChannel={bufferedAmount:0};other!:Link;
  constructor(public peer:string,public metadata:any){super();}
  send(data:any){if(!this.open)throw Error('closed');const copy=structuredClone(data);queueMicrotask(()=>{if(this.other.open)this.other.emit('data',copy);});}
  close(){if(!this.open)return;this.open=false;this.emit('close');if(this.other.open){this.other.open=false;this.other.emit('close');}}
}
class Peer extends EventEmitter implements PeerClient {
  static peers=new Map<string,Peer>();static counter=0;
  links:Link[]=[];id:string;destroyed=false;
  constructor(id?:string){super();this.id=id||`guest-${Peer.counter++}`;const collision=Peer.peers.has(this.id);if(!collision)Peer.peers.set(this.id,this);queueMicrotask(()=>{if(!this.destroyed)this.emit(collision?'error':'open',collision?{type:'unavailable-id'}:this.id);});}
  connect(id:string,options:any){const a=new Link(id,options.metadata),target=Peer.peers.get(id);this.links.push(a);if(!target){queueMicrotask(()=>this.emit('error',{type:'peer-unavailable'}));return a;}const b=new Link(this.id,options.metadata);a.other=b;b.other=a;target.links.push(b);queueMicrotask(()=>{target.emit('connection',b);a.open=b.open=true;a.emit('open');b.emit('open');});return a;}
  destroy(){this.destroyed=true;if(Peer.peers.get(this.id)===this)Peer.peers.delete(this.id);this.links.forEach(l=>l.close());this.emit('close');}
}
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('four-letter room codes normalize and reject biased random bytes',()=>{
  assert.equal(normalizeCode(' abCd '),'ABCD');assert.equal(validCode('ABCD'),true);
  for(const bad of ['ABC','ABCDE','A123','AB C','<img'])assert.equal(validCode(bad),false);
  assert.equal(roomCode(new Uint8Array([255,234,0,1,2,3])),'ABCD');
});
test('pose validation rejects invalid transforms, unknown models and HTML values',()=>{
  assert.equal(validPose(pose()),true);
  for(const change of [{p:[NaN,0,0]},{q:[0,0,0,0]},{car:'not-a-car'},{paint:'<img>'},{time:-1},{seq:1.4},{p:[0,0,0,0]},{active:'true'},{race:'<script>'}])assert.equal(validPose({...pose(),...change}),false);
});

for(const count of [2,3,4,5])test(`${count}-player room relays all poses, synchronizes every start and rejects late joiners`,async()=>{
  const clients=Array.from({length:count},(_,i)=>new RaceConnection(async()=>Peer,()=>100000+i*1200));
  const late=new RaceConnection(async()=>Peer);
  const starts=new Map<number,any[]>(),received=clients.map(()=>new Map<number,Pose>());
  clients.forEach((c,i)=>{c.onPose=(p,slot)=>received[i].set(slot,p);c.onStart=(...args)=>starts.set(i,args);});
  const host=clients[0];
  try{
    await host.open(true);await flush();assert.match(host.code,/^[A-Z]{4}$/);
    for(const guest of clients.slice(1)){await guest.open(false,host.code.toLowerCase());await flush();}
    for(let i=0;i<count;i++){
      assert.deepEqual(clients[i].players,Array.from({length:count},(_,j)=>j));
      assert.equal(clients[i].slot,i);assert.equal(clients[i].ready,true);
      if(i)assert.equal(clients[i].clockOffset,-i*1200);
      clients[i].send({...pose(),p:[i*10,24,20]},true);
    }
    await flush();
    for(let i=0;i<count;i++){
      assert.equal(received[i].size,count-1);
      for(let j=0;j<count;j++)if(i!==j)assert.equal(received[i].get(j)?.p[0],j*10);
    }
    // Reject stale/invalid data and never trust a guest's claimed sender slot.
    clients[1].send({...pose(),seq:0,p:[900,24,20]},true);
    clients[1].send({...pose(),seq:2,p:[Infinity,0,0]},true);await flush();
    assert.equal(received[0].get(1)?.seq,1);
    clients[1].send({...pose(),seq:3,slot:0,p:[88,24,20]},true);await flush();
    assert.equal(received[0].get(1)?.p[0],88);assert.equal(received[0].has(0),false);
    const member=Array.from((clients[1] as any).members.values())[0] as any;
    member.link.dataChannel.bufferedAmount=40000;assert.equal(clients[1].send(pose(),true),false);member.link.dataChannel.bufferedAmount=0;
    host.requestRace(3);await flush();assert.equal(starts.size,count);
    for(let i=0;i<count;i++){assert.equal(starts.get(i)?.[0],starts.get(0)?.[0]);assert.equal(starts.get(i)?.[1]-starts.get(0)?.[1],i*1200);assert.equal(starts.get(i)?.[2],3);assert.equal(clients[i].racers.length,count);}
    await late.open(false,host.code);await flush();assert.equal(late.connected,false);assert.match(late.status,count===5?/Room full/:/Race in progress/);
    host.send({...pose(),seq:5,race:host.session,finished:true,time:120},true);
    host.send({...pose(),seq:6,race:'',finished:false},true);
    for(const c of clients.slice(1))c.send({...pose(),seq:5,race:c.session,finished:true,time:120},true);
    await flush();assert.equal(host.raceLocked,false,'completed room can admit new players');
    host.leave();await flush();assert.ok(clients.every(c=>!c.connected));assert.equal(Peer.peers.size,0);
  }finally{clients.forEach(c=>c.leave());late.leave();}
});
test('five-player capacity, guest departure, slot reuse and isolated stale connections',async()=>{
  let now=100000;
  const clients=Array.from({length:5},()=>new RaceConnection(async()=>Peer,()=>now)),extra=new RaceConnection(async()=>Peer,()=>now),host=clients[0];
  try{
    await host.open(true);await flush();
    for(const guest of clients.slice(1)){await guest.open(false,host.code);await flush();}
    await extra.open(false,host.code);await flush();assert.match(extra.status,/Room full/);assert.equal(host.playerCount,5);
    clients[2].send({...pose(),seq:99},true);await flush();clients[2].leave();await flush();
    for(const c of [clients[0],clients[1],clients[3],clients[4]]){assert.ok(c.connected);assert.deepEqual(c.players,[0,1,3,4]);}
    await extra.open(false,host.code);await flush();assert.equal(extra.slot,2);
    let fresh:Pose|undefined;clients[1].onPose=(p,s)=>{if(s===2)fresh=p;};extra.send(pose(),true);await flush();assert.equal(fresh?.seq,1,'reused slot accepts new sequence');
    // One silent member must not tear down the other data channels.
    const members=Array.from((host as any).members.values()) as any[];members.find(m=>m.slot===3).seen=now-21000;
    (host as any).tick();await flush();assert.equal(host.playerCount,4);assert.ok(host.connected&&clients[1].connected&&extra.connected);
  }finally{clients.forEach(c=>c.leave());extra.leave();}
});
test('all-player ready barrier cancels for an unready or departing guest',async()=>{
  const clients=Array.from({length:4},()=>new RaceConnection(async()=>Peer)),host=clients[0];
  try{
    await host.open(true);await flush();for(const guest of clients.slice(1)){await guest.open(false,host.code);await flush();}
    let started=0;clients.forEach(c=>c.onStart=()=>started++);clients[3].canStart=()=>false;
    host.requestRace(1);await flush();assert.equal(started,0);assert.ok(clients.every(c=>!c.pendingRace));assert.match(host.status,/not ready/);
    clients[3].canStart=()=>true;host.requestRace(1);clients[2].leave();await flush();assert.equal(started,0);assert.ok(!host.pendingRace);assert.equal(host.playerCount,3);
    host.requestRace(1);await flush();assert.equal(started,3);
  }finally{clients.forEach(c=>c.leave());}
});
test('invalid room, canceled load, missing peer, and refused race recover without affecting solo play',async()=>{
  const invalid=new RaceConnection(async()=>Peer);
  await invalid.open(false,'12');assert.match(invalid.status,/four letters/);assert.equal(invalid.busy,false);
  await invalid.open(false,'ZZZZ');await flush();assert.match(invalid.status,/Room not found/);assert.equal(invalid.busy,false);
  let resolve!:(p:typeof Peer)=>void;const canceled=new RaceConnection(()=>new Promise(r=>resolve=r));const loading=canceled.open(true);canceled.leave();resolve(Peer);await loading;assert.equal(Peer.peers.size,0);
  const host=new RaceConnection(async()=>Peer),guest=new RaceConnection(async()=>Peer);
  try {await host.open(true);await flush();await guest.open(false,host.code);await flush();guest.canStart=()=>false;host.requestRace(1);await flush();assert.equal(host.pendingRace,false);assert.match(host.status,/police pursuit/);assert.equal(host.session,'');}
  finally{host.leave();guest.leave();invalid.leave();canceled.leave();}
});
test('ghost interpolates poses, supports all vehicle shapes, snaps after reset, hides when stale',()=>{
  const remote=new RemoteVehicle(),local=new T.Vector3(10,24,20);
  remote.receive(pose(),1000);remote.receive({...pose(),seq:2,p:[20,24,20]},1100);remote.update(1150,true,local);
  assert.equal(remote.root.visible,true);assert.equal(remote.root.position.x,15);
  for(const car of ['vanta','kestrel','apex','pulse','spectre','atlas','comet']){remote.receive({...pose(),car},1200);remote.update(1300,true,local);assert.ok(remote.root.visible);assert.ok(Number.isFinite(remote.root.quaternion.w));}
  remote.receive({...pose(),p:[200,24,20]},1400);remote.update(1450,true,local);assert.equal(remote.root.position.x,200);
  remote.update(6500,true,local);assert.equal(remote.root.visible,false);remote.reset();assert.equal(remote.latest,undefined);
});
test('shared circuit disables AI colliders, preserves checkpoints and gives no solo finish reward',async()=>{
  const roads=new RoadNetwork(),physics=await new PhysicsWorld().init(),car=new VehiclePhysics(physics,roads,{...defaults}),race=new RaceManager(roads,physics);
  try {
    race.start(car,1,true);assert.equal(race.ai.active,false);assert.ok(race.ai.cars.every(c=>!c.body.isEnabled()));
    race.configurePlayers([0,1,2,3,4],0);
    race.updateOpponent(1,500,true,115);race.updateOpponent(2,450,true,123);race.updateOpponent(3,300,false,119);race.updateOpponent(4,300,false,118);
    race.updateRoster([0,1,2,3]);assert.equal(race.networkCount,5);
    race.countdown=0;race.elapsed=120;
    for(let i=0;i<race.count;i++){car.position.copy(race.gate.position);race.update(1/120,car);}
    assert.ok(race.finished);assert.equal(race.resultTime,120);assert.equal(race.claimReward(),0);assert.equal(race.best,0);
    assert.equal(race.position,2);assert.match(race.networkResult,/1 DISCONNECTED/);
    race.updateOpponent(3,roads.main.length,true,118);assert.equal(race.position,3);assert.match(race.networkResult,/3\/4 OPPONENTS FINISHED/);
    race.cancel();race.start(car);assert.equal(race.networkRace,false);assert.ok(race.ai.active);assert.ok(race.ai.cars.every(c=>c.body.isEnabled()));
  }finally{physics.world.free();}
});

test('host ghost rule synchronizes with 2–5 drivers, late joiners and cannot be changed by guests',async()=>{
 const clients=Array.from({length:5},()=>new RaceConnection(async()=>Peer)),host=clients[0];
 try {
  assert.equal(host.setGhost(false),true);await host.open(true);await flush();assert.equal(host.ghost,false);
  for(const guest of clients.slice(1)){await guest.open(false,host.code);await flush();assert.equal(guest.ghost,false);}
  assert.equal(clients[1].setGhost(true),false);
  clients[1].send({t:'room-settings',ghost:true});await flush();assert.ok(clients.every(c=>!c.ghost));
  host.setGhost(true);await flush();assert.ok(clients.every(c=>c.ghost));
  host.setGhost(false);await flush();assert.ok(clients.every(c=>!c.ghost));
  clients[4].leave();assert.equal(clients[4].ghost,true);await flush();await clients[4].open(false,host.code);await flush();assert.equal(clients[4].ghost,false);
  host.requestRace(1);await flush();assert.ok(clients.every(c=>!c.ghost));
  host.leave();await flush();assert.ok(clients.every(c=>c.ghost&&!c.connected));
 }finally{clients.forEach(c=>c.leave());}
});

test('lobby rules are host controlled, reset readiness and await route preparation on every peer',async()=>{
 const host=new RaceConnection(async()=>Peer,()=>100000),guest=new RaceConnection(async()=>Peer,()=>101000);let releaseHost!:(ok:boolean)=>void,releaseGuest!:(ok:boolean)=>void;
 const starts:any[]=[];
 try{
  host.setCar('pulse');guest.setCar('spectre');await host.open(true);await flush();await guest.open(false,host.code);await flush();
  const settings={route:'bracken',laps:1,vehicleClass:'bikes',startRule:'rolling'} as const;
  assert.equal(guest.setRaceSettings(settings),false);assert.equal(host.setRaceSettings(settings),true);await flush();
  assert.deepEqual(guest.raceSettings,settings);assert.equal(host.raceReady,false);host.requestRace(1);await flush();assert.equal(host.pendingRace,false);
  host.setReady(true);guest.setReady(true);await flush();assert.equal(host.raceReady,true);
  host.prepareRace=()=>new Promise(resolve=>releaseHost=resolve);guest.prepareRace=()=>new Promise(resolve=>releaseGuest=resolve);
  host.onStart=(...args)=>starts.push(args);guest.onStart=(...args)=>starts.push(args);
  host.requestRace(1);await flush();assert.ok(host.pendingRace&&guest.pendingRace);assert.equal(starts.length,0);
  releaseGuest(true);await flush();assert.equal(starts.length,0,'host terrain must also finish loading');
  releaseHost(true);await flush();assert.equal(starts.length,2);assert.deepEqual(starts[0][3],settings);assert.deepEqual(starts[1][3],settings);assert.equal(Math.abs(starts[0][1]-starts[1][1]),1000);
  assert.equal(host.setGhost(false),false);assert.equal(host.setRaceSettings({...settings,route:'coast'}),false,'active race settings stay locked');
 }finally{host.leave();guest.leave();}
});
test('incompatible vehicle classes and failed route loads cannot start a room race',async()=>{
 const host=new RaceConnection(async()=>Peer),guest=new RaceConnection(async()=>Peer);let starts=0;
 try{
  await host.open(true);await flush();await guest.open(false,host.code);await flush();
  host.setRaceSettings({route:'coast',laps:1,vehicleClass:'bikes',startRule:'grid'});await flush();assert.equal(host.setReady(true),false);assert.equal(guest.setReady(true),false);host.requestRace(1);await flush();assert.equal(host.pendingRace,false);
  host.setCar('pulse');guest.setCar('pulse');host.setReady(true);guest.setReady(true);await flush();
  host.onStart=guest.onStart=()=>starts++;guest.prepareRace=()=>false;host.requestRace(1);await flush();assert.equal(starts,0);assert.equal(host.pendingRace,false);assert.equal(guest.pendingRace,false);
  assert.equal(host.setRaceSettings({route:'coast',laps:3,vehicleClass:'all',startRule:'grid'} as any),false);
  assert.equal(host.setRaceSettings({route:'missing',laps:1,vehicleClass:'all',startRule:'grid'} as any),false);
 }finally{host.leave();guest.leave();}
});
