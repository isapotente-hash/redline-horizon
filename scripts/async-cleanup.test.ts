import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPeerJS} from '../src/multiplayer/RaceConnection';
import {World} from '../src/world/World';

test('failed PeerJS downloads detach handlers and late callbacks cannot invalidate a retry',async()=>{
 const scripts:any[]=[];
 (globalThis as any).window={};
 (globalThis as any).document={createElement:()=>({remove(){}}),head:{append(s:any){scripts.push(s);}}};
 const first=loadPeerJS();const lateError=scripts[0].onerror;scripts[0].onerror();await assert.rejects(first);
 assert.equal(scripts[0].onload,null);assert.equal(scripts[0].onerror,null);
 const retry=loadPeerJS();lateError();assert.equal(loadPeerJS(),retry);
 class Peer{}
 (globalThis as any).window.Peer=Peer;scripts[1].onload();assert.equal(await retry,Peer);
 assert.equal(scripts[1].onload,null);assert.equal(scripts[1].onerror,null);
});

test('terrain streaming failures back off instead of allocating and logging every update',async()=>{
 const world=Object.create(World.prototype) as any;world.streamFailures=0;world.nextStreamAt=0;
 let attempts=0,logs=0;world.buildChunkAsync=async()=>{attempts++;throw new Error('test failure');};
 const old=console.error;console.error=()=>{logs++;};
 try{
  world.queueChunk(0,0);await world.streaming.catch(()=>{});assert.equal(attempts,1);assert.equal(logs,1);assert.ok(world.nextStreamAt>performance.now());
  for(let i=0;i<100;i++)world.queueChunk(0,0);assert.equal(attempts,1);assert.equal(world.streaming,undefined);
  world.nextStreamAt=0;world.queueChunk(0,0);await world.streaming.catch(()=>{});assert.equal(attempts,2);assert.equal(logs,1);
  world.nextStreamAt=0;world.buildChunkAsync=async()=>{attempts++;};world.queueChunk(0,0);await world.streaming;assert.equal(world.streamFailures,0);
 }finally{console.error=old;}
});

test('startup fade removes its listener and ignores unrelated transition properties',async()=>{
 const {finishStartup}=await import('../src/core/Loading');
 class Screen extends EventTarget {
  listeners=0;removed=false;classList={add:()=>{}};querySelector(){return null;}
  addEventListener(type:string,callback:any,options?:any){super.addEventListener(type,callback,options);this.listeners++;}
  removeEventListener(type:string,callback:any,options?:any){super.removeEventListener(type,callback,options);this.listeners--;}
  remove(){this.removed=true;}
 }
 for(let i=0;i<2;i++){
  const screen=new Screen();(globalThis as any).document={getElementById:()=>screen};const finish=finishStartup();
  await new Promise(resolve=>setTimeout(resolve,0));
  const unrelated=new Event('transitionend');Object.assign(unrelated,{propertyName:'transform'});screen.dispatchEvent(unrelated);assert.equal(screen.removed,false);
  const fade=new Event('transitionend');Object.assign(fade,{propertyName:'opacity'});screen.dispatchEvent(fade);await finish;
  assert.equal(screen.listeners,0);assert.equal(screen.removed,true);
 }
});
