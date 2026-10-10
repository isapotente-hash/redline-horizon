import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDrawnTrack} from '../src/racing/DrawnTrack';
import {EventEmitter} from 'node:events';
import {RaceConnection,DataLink,PeerClient} from '../src/multiplayer/RaceConnection';
import {validPose,validCode,normalizeCode,roomCode,Pose,ROOM_PREFIX} from '../src/multiplayer/Protocol';
import {RemoteVehicle} from '../src/multiplayer/RemoteVehicle';
import {PoseTimeline} from '../src/multiplayer/PoseTimeline';
import {MovementChannel} from '../src/multiplayer/MovementChannel';
import {RaceManager} from '../src/racing/RaceManager';
import {RoadNetwork} from '../src/world/RoadNetwork';
import {PhysicsWorld,VehiclePhysics} from '../src/physics/VehiclePhysics';
import {defaults} from '../src/core/SaveManager';
import * as T from 'three';

const pose=():Pose=>({t:'state',seq:1,car:'pulse',paint:'#26c4c5',active:true,p:[10,24,20],q:[0,0,0,1],steer:.2,spin:3,lean:.15,pitch:.05,brake:0,race:'ABCD-1',progress:12,finished:false,time:3});
class Channel extends EventTarget {
  readyState='connecting';bufferedAmount=0;ordered=false;maxRetransmits=0;other!:Channel;
  onopen?:()=>void;onclose?:()=>void;onerror?:()=>void;onmessage?: (event:{data:string})=>void;
  sent:string[]=[];drop=false;hold=false;pending:string[]=[];
  constructor(public label:string){super();}
  send(data:string){if(this.readyState!=='open')throw Error('closed');this.sent.push(data);if(this.drop)return;if(this.hold){this.pending.push(data);return;}queueMicrotask(()=>{if(this.other.readyState==='open')this.other.onmessage?.({data});});}
  close(){if(this.readyState==='closed')return;this.readyState='closed';this.onclose?.();if(this.other?.readyState!=='closed'){this.other.readyState='closed';this.other.onclose?.();}}
}
class PC extends EventTarget {
  other!:PC;channels:Channel[]=[];
  private handler:((event:any)=>void)|null=null;
  get ondatachannel(){return this.handler;}
  set ondatachannel(fn:((event:any)=>void)|null){if(this.handler)this.removeEventListener('datachannel',this.handler);this.handler=fn;if(fn)this.addEventListener('datachannel',fn);}
  createDataChannel(label:string,options:RTCDataChannelInit){
    const a=new Channel(label),b=new Channel(label);a.other=b;b.other=a;
    a.ordered=b.ordered=options.ordered??true;a.maxRetransmits=b.maxRetransmits=options.maxRetransmits??-1;
    this.channels.push(a);this.other.channels.push(b);
    queueMicrotask(()=>{const event=new Event('datachannel');Object.assign(event,{channel:b});this.other.dispatchEvent(event);if(b.readyState==='closed')return;a.readyState=b.readyState='open';a.onopen?.();b.onopen?.();});return a as unknown as RTCDataChannel;
  }
}
class Link extends EventEmitter implements DataLink {
  open=false;bufferSize=0;dataChannel={bufferedAmount:0};other!:Link;peerConnection=new PC() as unknown as RTCPeerConnection;sent:any[]=[];
  constructor(public peer:string,public metadata:any){super();}
  send(data:any){if(!this.open)throw Error('closed');this.sent.push(structuredClone(data));const copy=structuredClone(data);queueMicrotask(()=>{if(this.other.open)this.other.emit('data',copy);});}
  close(){if(!this.open)return;this.open=false;this.emit('close');if(this.other.open){this.other.open=false;this.other.emit('close');}}
}
class Peer extends EventEmitter implements PeerClient {
  static peers=new Map<string,Peer>();static counter=0;
  links:Link[]=[];id:string;destroyed=false;
  constructor(id?:string){super();this.id=id||`guest-${Peer.counter++}`;const collision=Peer.peers.has(this.id);if(!collision)Peer.peers.set(this.id,this);queueMicrotask(()=>{if(!this.destroyed)this.emit(collision?'error':'open',collision?{type:'unavailable-id'}:this.id);});}
  connect(id:string,options:any){const a=new Link(id,options.metadata),target=Peer.peers.get(id);this.links.push(a);if(!target){queueMicrotask(()=>this.emit('error',{type:'peer-unavailable'}));return a;}const b=new Link(this.id,options.metadata);a.other=b;b.other=a;(a.peerConnection as unknown as PC).other=b.peerConnection as unknown as PC;(b.peerConnection as unknown as PC).other=a.peerConnection as unknown as PC;target.links.push(b);queueMicrotask(()=>{target.emit('connection',b);a.open=b.open=true;a.emit('open');b.emit('open');});return a;}
  destroy(){this.destroyed=true;if(Peer.peers.get(this.id)===this)Peer.peers.delete(this.id);this.links.forEach(l=>l.close());this.emit('close');}
}
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('PeerJS handler remains assigned to control when a movement channel arrives',async()=>{
  const hostPC=new PC(),guestPC=new PC();hostPC.other=guestPC;guestPC.other=hostPC;
  let controls=0;const original=()=>controls++;
  hostPC.ondatachannel=original;
  const host=new MovementChannel(hostPC as unknown as RTCPeerConnection,true,()=>{},()=>{});
  const guest=new MovementChannel(guestPC as unknown as RTCPeerConnection,false,()=>{},()=>{});
  try{
    guest.start();await flush();assert.ok(host.ready&&guest.ready);assert.equal(controls,0);
    guestPC.createDataChannel('reliable-control',{ordered:true});await flush();assert.equal(controls,1);
    assert.ok(host.ready,'forwarding control does not replace movement');
  }finally{host.close();guest.close();}
  assert.equal(hostPC.ondatachannel,original);
});
test('movement stays separate from reliable control under congestion, loss and reordering',async()=>{
  const host=new RaceConnection(async()=>Peer,()=>100000),guest=new RaceConnection(async()=>Peer,()=>100000);
  const received:number[]=[];host.onPose=p=>received.push(p.seq);
  try{
    await host.open(true);await flush();await guest.open(false,host.code);await flush();
    const member=Array.from((guest as any).members.values())[0] as any;
    const channel=(member.link.peerConnection as PC).channels[0];
    assert.equal(channel.ordered,false);assert.equal(channel.maxRetransmits,0);
    member.link.bufferSize=99;member.link.dataChannel.bufferedAmount=100000;
    assert.equal(guest.send(pose(),true),true);await flush();assert.deepEqual(received,[1]);
    assert.ok(!member.link.sent.some((p:any)=>p.t==='state'),'movement never enters reliable queue');
    channel.bufferedAmount=1;assert.equal(guest.send({...pose(),seq:2},true),false);channel.bufferedAmount=0;
    channel.drop=true;guest.send({...pose(),seq:3},true);await flush();assert.deepEqual(received,[1]);
    channel.drop=false;channel.hold=true;
    guest.send({...pose(),seq:4},true);guest.send({...pose(),seq:5},true);
    for(const data of channel.pending.reverse())channel.other.onmessage?.({data});assert.deepEqual(received,[1,5]);
    channel.other.onmessage?.({data:JSON.stringify({t:'room-settings',ghost:false})});assert.equal(host.ghost,true);
    member.link.send({...pose(),seq:99});await flush();assert.deepEqual(received,[1,5],'control stream cannot smuggle movement');
  }finally{guest.leave();host.leave();}
});
test('race finishes survive total movement loss and still unlock a rematch',async()=>{
  const host=new RaceConnection(async()=>Peer,()=>100000),guest=new RaceConnection(async()=>Peer,()=>100000);
  try{
    await host.open(true);await flush();await guest.open(false,host.code);await flush();host.requestRace(1);await flush();
    const received:Pose[]=[];host.onPose=p=>received.push(p);
    for(const client of [host,guest])for(const m of (client as any).members.values())(m.link.peerConnection as PC).channels[0].drop=true;
    guest.send({...pose(),race:guest.session,finished:true,time:42},true);
    host.send({...pose(),race:host.session,finished:true,time:43},true);await flush();
    assert.equal(received.length,1);assert.equal(received[0].time,42);assert.ok(!host.raceLocked&&!guest.raceLocked);
    guest.send({...pose(),seq:2,race:guest.session,finished:true,time:42},true);await flush();assert.equal(received.length,1);
    host.requestRace(1);await flush();assert.ok(host.raceLocked&&guest.raceLocked);
  }finally{guest.leave();host.leave();}
});
test('movement stream recreates after closure without disrupting its reliable room',async()=>{
  const host=new RaceConnection(async()=>Peer),guest=new RaceConnection(async()=>Peer);
  try{
    await host.open(true);await flush();await guest.open(false,host.code);await flush();
    const m=Array.from((guest as any).members.values())[0] as any;
    (m.link.peerConnection as PC).channels[0].close();assert.equal(guest.ready,false);assert.ok(guest.connected);
    (guest as any).tick();await flush();assert.ok(host.ready&&guest.ready);
    let seq=0;host.onPose=p=>seq=p.seq;guest.send(pose(),true);await flush();assert.equal(seq,1);
  }finally{guest.leave();host.leave();}
});
test('adaptive prediction covers short gaps, holds on outages and rejects older snapshots',()=>{
  const timeline=new PoseTimeline(),p=new T.Vector3(),q=new T.Quaternion();
  for(let i=0;i<25;i++)timeline.receive({...pose(),seq:i+1,sentAt:i*50,p:[i,24,20]},1000+i*50);
  assert.ok(timeline.delay<65);timeline.sample(2300,p,q);assert.ok(p.x>24&&p.x<26,'short gap keeps moving');
  timeline.sample(3000,p,q);const held=p.clone();timeline.sample(3500,p,q);assert.ok(p.distanceTo(held)<.001,'prediction stops after 120 ms');
  assert.equal(timeline.receive({...pose(),seq:2,sentAt:50},3510),false);assert.equal(timeline.latest?.seq,25);
  assert.equal(timeline.sample(3500,p,q,750),false,'stale car cannot provide a collision proxy');
  timeline.receive({...pose(),seq:26,sentAt:4000,p:[200,24,20]},5000);timeline.sample(5050,p,q);assert.equal(p.x,200,'outage recovery snaps safely');
  timeline.reset();assert.equal(timeline.sample(6000,p,q),false);
});
test('jitter raises the buffer, source timestamps withstand bursts, correction stays continuous',()=>{
  const timeline=new PoseTimeline(),p=new T.Vector3(),q=new T.Quaternion();
  for(let i=0;i<25;i++)timeline.receive({...pose(),seq:i+1,sentAt:i*50,p:[i,24,20]},1000+i*50);
  const stableDelay=timeline.delay;
  for(let i=25;i<45;i++)timeline.receive({...pose(),seq:i+1,sentAt:i*50,p:[i,24,20]},1000+i*50+(i%2?45:0));
  assert.ok(timeline.delay>stableDelay+20);assert.ok(timeline.delay<=180);
  timeline.sample(3270,p,q);const before=p.clone();
  timeline.receive({...pose(),seq:46,sentAt:2250,p:[44.5,24,20]},3270);timeline.sample(3270,p,q);
  assert.ok(p.distanceTo(before)<.001,'new snapshot does not pop the rendered position');assert.ok(Math.abs(q.length()-1)<.001);
  timeline.receive({...pose(),seq:47,sentAt:2300,p:[500,24,20]},3320);timeline.sample(3320,p,q);assert.equal(p.x,500,'teleport does not interpolate through the road');
});
test('playback clock adapts when a route becomes consistently slower',()=>{
  const timeline=new PoseTimeline(),p=new T.Vector3(),q=new T.Quaternion();
  for(let i=0;i<25;i++)timeline.receive({...pose(),seq:i+1,sentAt:i*50,p:[i,24,20]},1000+i*50);
  for(let i=25;i<145;i++)timeline.receive({...pose(),seq:i+1,sentAt:i*50,p:[i,24,20]},1250+i*50);
  timeline.sample(1250+144*50,p,q);
  assert.ok(p.x>142&&p.x<145,'playback returns to interpolation after sustained latency change');
});
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
    (member.link.peerConnection as PC).channels[0].bufferedAmount=40000;assert.equal(clients[1].send(pose(),true),false);(member.link.peerConnection as PC).channels[0].bufferedAmount=0;
    host.requestRace(3);await flush();assert.equal(starts.size,count);
    for(let i=0;i<count;i++){assert.equal(starts.get(i)?.[0],starts.get(0)?.[0]);assert.equal(starts.get(i)?.[1]-starts.get(0)?.[1],i*1200);assert.equal(starts.get(i)?.[2],3);assert.equal(clients[i].racers.length,count);}
    await late.open(false,host.code);await flush();assert.equal(late.connected,false);assert.match(late.status,count===5?/Room full/:/Race in progress/);
    host.send({...pose(),seq:5,race:host.session,finished:true,time:120},true);
    host.send({...pose(),seq:6,race:'',finished:false},true);
    for(const c of clients.slice(1))c.send({...pose(),seq:5,race:c.session,finished:true,time:120},true);
    await flush();assert.equal(host.raceLocked,false,'completed room can admit new players');assert.ok(clients.every(c=>!c.raceLocked),'guests unlock rematches too');
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
  assert.equal(remote.root.visible,true);assert.ok(Math.abs(remote.root.position.x-15)<1);
  let seq=2;for(const car of ['vanta','kestrel','apex','pulse','spectre','atlas','comet']){remote.receive({...pose(),seq:++seq,car},1200);remote.update(1300,true,local);assert.ok(remote.root.visible);assert.ok(Number.isFinite(remote.root.quaternion.w));}
  remote.receive({...pose(),seq:++seq,p:[200,24,20]},1400);remote.update(1450,true,local);assert.equal(remote.root.position.x,200);
  remote.update(6500,true,local);assert.equal(remote.root.visible,false);remote.reset();assert.equal(remote.latest,undefined);
});
test('shared circuit disables AI colliders, preserves checkpoints and gives no solo finish reward',async()=>{
  const roads=new RoadNetwork(),physics=await new PhysicsWorld().init(),car=new VehiclePhysics(physics,roads,{...defaults}),race=new RaceManager(roads,physics);
  try {
    race.start(car,1,true);assert.equal(race.ai.active,false);assert.ok(race.ai.cars.every(c=>!c.body.isEnabled()));
    race.configurePlayers([0,1,2,3,4],0);
    race.updateOpponent(1,500,true,115);race.updateOpponent(2,450,true,123);race.updateOpponent(3,300,false,119);race.updateOpponent(4,300,false,118);
    race.updateOpponent(1,400,false,110);assert.ok(race.opponents.get(1)?.finished,'late movement cannot undo a reliable finish');assert.equal(race.opponents.get(1)?.time,115);
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

test('driver names, host weather rules and safe reconnection survive a lost guest link',async()=>{
 const host=new RaceConnection(async()=>Peer),guest=new RaceConnection(async()=>Peer);host.setName('Host Racer');guest.setName('<Guest>');
 try{await host.open(true);await flush();await guest.open(false,host.code);await flush();await flush();assert.equal(host.drivers.get(0)?.name,'Host Racer');assert.equal(host.drivers.get(1)?.name,'Guest');assert.equal(guest.drivers.get(0)?.name,'Host Racer');
  assert.equal(host.setRaceSettings({route:'coast',laps:1,vehicleClass:'all',startRule:'grid',weather:'rain'}),true);await flush();assert.equal(guest.raceSettings.weather,'rain');assert.equal(guest.setRaceSettings({...host.raceSettings,weather:'clear'}),false);
  const code=host.code;const link=Peer.peers.get(ROOM_PREFIX+code)!.links.find(l=>l.open)!;link.close();await flush();assert.equal(guest.connected,false);assert.equal(guest.lastRoom,code);assert.equal(host.playerCount,1);assert.equal(guest.raceLocked,false);await guest.open(false,guest.lastRoom);await flush();await flush();assert.equal(guest.connected,true);assert.equal(host.playerCount,2);assert.equal(host.drivers.get(guest.slot)?.name,'Guest');assert.equal(guest.raceSettings.weather,'rain');
 }finally{host.leave();guest.leave();}
});

test('five-player custom courses are shared identically, wait for preparation and support rematches',async()=>{
 const clients=Array.from({length:5},()=>new RaceConnection(async()=>Peer)),host=clients[0];
 const track=makeDrawnTrack([[.2,.2],[.8,.2],[.8,.8],[.2,.8]],'Friends circuit',16);let prepared=0,started=0;
 clients.forEach(c=>{c.prepareRace=settings=>{assert.deepEqual(settings.track,track);prepared++;return true;};c.onStart=(_id,_at,laps,settings)=>{assert.equal(laps,3);assert.deepEqual(settings.track,track);started++;};});
 try{
  assert.ok(host.setRaceSettings({...host.raceSettings,route:'custom',track,laps:3}));await host.open(true);await flush();
  for(const guest of clients.slice(1)){await guest.open(false,host.code);await flush();assert.deepEqual(guest.raceSettings.track,track);}
  clients.forEach(c=>c.setReady(true));await flush();host.requestRace(3);await flush();assert.equal(prepared,5);assert.equal(started,5);
  clients.forEach(c=>c.send({...pose(),race:c.session,seq:11,finished:true,time:120},true));await flush();assert.ok(clients.every(c=>!c.raceLocked));
  host.requestRace(3);await flush();assert.equal(started,10);assert.equal(prepared,10);
 }finally{clients.forEach(c=>c.leave());}
});
