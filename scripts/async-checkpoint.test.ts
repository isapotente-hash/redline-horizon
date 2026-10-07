import test from 'node:test';import assert from 'node:assert/strict';
import {SaveManager} from '../src/core/SaveManager';import {SAVE_KEY,BACKUP_KEY} from '../src/core/SaveStorage';
import {AsyncProfileStore,IndexedDBProfileStore} from '../src/core/AsyncProfileStore';
function storage(profile:any=null){
 const data=new Map<string,string>(profile?[[SAVE_KEY,JSON.stringify(profile)]]:[]);let writes=0;
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return data.size;},key:(i:number)=>[...data.keys()][i]??null,getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{writes++;data.set(k,v);}}});
 return {data,writes:()=>writes};
}
class MemoryStore implements AsyncProfileStore{
 data:any=null;writes:any[]=[];async read(){return structuredClone(this.data);}
 async write(profile:unknown){this.data=structuredClone(profile);this.writes.push(this.data);}
}
const seed=()=>({schemaVersion:4,layoutVersion:2,savedAt:Date.now()-10000,coins:50,settings:{quality:'high'},selectedCar:'pulse'});

test('the periodic game checkpoint performs no synchronous storage I/O, even with slow disk transactions',async()=>{
 const local=storage(seed()),backend=new MemoryStore();let release!:()=>void;
 backend.write=async p=>{await new Promise<void>(r=>release=r);backend.data=structuredClone(p);};const save=new SaveManager(backend),before=local.writes();
 const game={save,vehicle:{distance:420,position:{x:1,y:2,z:3},forward:{x:0,z:-1}}};
 save.savePosition(game.vehicle,true);assert.equal(local.writes(),before);assert.equal(save.distance,420);assert.deepEqual(save.position,{x:1,y:2,z:3,yaw:-0});
 // The next animation/input work continues before the transaction is acknowledged.
 let nextFrame=false;await Promise.resolve().then(()=>{nextFrame=true;});assert.equal(nextFrame,true);assert.equal(backend.data,null);
 release();await (save as any).writing;assert.equal(backend.data.distance,420);assert.equal(local.writes(),before);
 save.savePosition(game.vehicle);assert.equal(JSON.parse(local.data.get(SAVE_KEY)!).distance,420);assert.ok(local.data.has(BACKUP_KEY));
});
test('pending checkpoint writes coalesce to the latest full profile and restore before gameplay',async()=>{
 storage(seed());const backend=new MemoryStore();let release!:()=>void;let first=true;
 const write=backend.write.bind(backend);backend.write=async p=>{if(first){first=false;await new Promise<void>(r=>release=r);}await write(p);};
 const save=new SaveManager(backend);save.distance=10;const task=save.saveAsync();
 save.distance=20;save.coins=100;assert.equal(save.saveAsync(),task);save.distance=30;save.settings.quality='medium';save.statistics.drivingSeconds=77;save.collectedCoins.add('checkpoint-coin');save.saveAsync();
 release();assert.equal(await task,true);assert.equal(backend.writes.length,2);assert.equal(backend.data.distance,30);
 const restored=new SaveManager(backend);assert.equal(await restored.restoreCheckpoint(),true);assert.equal(restored.distance,30);assert.equal(restored.coins,100);assert.equal(restored.settings.quality,'medium');assert.equal(restored.statistics.drivingSeconds,77);assert.ok(restored.collectedCoins.has('checkpoint-coin'));assert.equal(restored.selectedCar,'pulse');
});
test('a completed stale disk checkpoint cannot overwrite newer purchases/settings in the primary profile',async()=>{
 storage(seed());const backend=new MemoryStore();let release!:()=>void;
 backend.write=async p=>{await new Promise<void>(r=>release=r);backend.data=structuredClone(p);};
 const save=new SaveManager(backend);save.coins=300;const pending=save.saveAsync();save.coins=175;save.settings.quality='low';assert.equal(save.save(),true);release();await pending;
 const restored=new SaveManager(backend);assert.equal(await restored.restoreCheckpoint(),false);assert.equal(restored.coins,175);assert.equal(restored.settings.quality,'low');
});
test('a setting change during checkpoint loading wins over an older asynchronous read',async()=>{
 storage(seed());const backend=new MemoryStore();let release!:(data:unknown)=>void;backend.read=()=>new Promise(r=>release=r);
 const save=new SaveManager(backend),loading=save.restoreCheckpoint();save.settings.quality='low';save.save();release({...seed(),savedAt:Date.now()+10,settings:{quality:'ultra'}});assert.equal(await loading,false);assert.equal(save.settings.quality,'low');
});
test('corrupt checkpoint fields use existing validation; future schemas and disk errors are nonfatal',async()=>{
 const local=storage(seed()),backend=new MemoryStore();backend.data={...seed(),savedAt:Date.now(),coins:-5,position:{x:NaN,y:0,z:0,yaw:0},settings:{quality:'bad',simulationDistance:0}};
 const save=new SaveManager(backend);assert.equal(await save.restoreCheckpoint(),true);assert.equal(save.coins,0);assert.equal(save.position,null);assert.equal(save.settings.simulationDistance,10);
 backend.data={...backend.data,schemaVersion:99};const before=local.data.get(SAVE_KEY),future=new SaveManager(backend);assert.equal(await future.restoreCheckpoint(),false);assert.equal(await future.saveAsync(),false);assert.equal(future.save(),false);assert.equal(local.data.get(SAVE_KEY),before);
 storage(seed());const failure=new SaveManager({read:async()=>{throw Error('denied');},write:async()=>{throw Error('quota');}});let errors=0;failure.onError=()=>errors++;assert.equal(await failure.restoreCheckpoint(),false);assert.equal(await failure.saveAsync(),false);assert.equal(await failure.saveAsync(),false);assert.equal(errors,1);
});
test('gameplay coins, rewards and fines also save asynchronously, while lifecycle flushes remain immediately durable',async()=>{
 const local=storage(seed()),backend=new MemoryStore(),save=new SaveManager(backend),before=local.writes();save.background=true;
 assert.equal(save.collectCoin('road-coin'),true);save.rewardMeters=995;save.addRewardDistance(10);save.payFine(10);
 assert.equal(local.writes(),before);await (save as any).writing;assert.equal(backend.data.coins,65);assert.ok(backend.data.collectedCoins.includes('road-coin'));
 save.savePosition({distance:100,position:{x:1,y:2,z:3},forward:{x:0,z:-1}});assert.ok(local.writes()>before);assert.equal(JSON.parse(local.data.get(SAVE_KEY)!).coins,65);
});
test('a transient database open failure is retried so later checkpoints remain available',async()=>{
 const prior=Object.getOwnPropertyDescriptor(globalThis,'indexedDB');let attempts=0;
 const db={close(){},transaction(){const tx:any={objectStore:()=>({get:()=>({result:{coins:42}})})};queueMicrotask(()=>tx.oncomplete());return tx;}};
 Object.defineProperty(globalThis,'indexedDB',{configurable:true,value:{open(){const request:any={result:db,error:new Error('temporary')};queueMicrotask(()=>{if(++attempts===1)request.onerror();else request.onsuccess();});return request;}}});
 try{const store=new IndexedDBProfileStore();await assert.rejects(store.read(),/temporary/);assert.deepEqual(await store.read(),{coins:42});assert.equal(attempts,2);}finally{if(prior)Object.defineProperty(globalThis,'indexedDB',prior);else delete (globalThis as any).indexedDB;}
});
