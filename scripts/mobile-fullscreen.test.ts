import test from 'node:test';
import assert from 'node:assert/strict';
import {startMobileFullscreen} from '../src/input/MobileFullscreen';

function host(options:{active?:boolean;denied?:boolean;legacy?:boolean;unsupported?:boolean;standalone?:boolean;disabled?:boolean}={}) {
  const windowListeners=new Map<string,Function>(),documentListeners=new Map<string,Function>(),calls:any[]=[];
  const request=(...args:any[])=>{calls.push(args);return options.denied?Promise.reject(new Error('denied')):Promise.resolve();};
  const doc:any={documentElement:options.unsupported?{}:options.legacy?{webkitRequestFullscreen:request}:{requestFullscreen:request},
    fullscreenEnabled:!options.disabled,hidden:false,fullscreenElement:null,
    addEventListener:(name:string,fn:Function)=>documentListeners.set(name,fn),removeEventListener:(name:string)=>documentListeners.delete(name)};
  const nav={userActivation:{isActive:options.active??false},standalone:options.standalone??false};
  Object.assign(globalThis,{window:{addEventListener:(name:string,fn:Function)=>windowListeners.set(name,fn),removeEventListener:(name:string)=>windowListeners.delete(name)},document:doc,matchMedia:()=>({matches:false})});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:nav});
  return {doc,nav,calls,windowListeners,documentListeners,tap:(name='pointerup',trusted=true)=>windowListeners.get(name)?.({isTrusted:trusted})};
}
test('mobile waits for a trusted activation, requests the whole page synchronously, and keeps the tap available to controls',()=>{
  const h=host();startMobileFullscreen(true);assert.equal(h.calls.length,0);assert.equal(h.windowListeners.size,3);
  h.tap('pointerup',false);h.tap();assert.equal(h.calls.length,0);
  h.nav.userActivation.isActive=true;h.tap();assert.deepEqual(h.calls,[[{navigationUI:'hide'}]]);
  assert.equal(h.windowListeners.size,0);assert.equal(h.documentListeners.size,0);
  h.tap('touchend');h.tap('click');assert.equal(h.calls.length,1);
});
test('activation on arrival enters immediately; desktop and unsupported, blocked or standalone mobile launches install no handlers',()=>{
  let h=host({active:true});startMobileFullscreen(true);assert.equal(h.calls.length,1);assert.equal(h.windowListeners.size,0);
  for(const options of [{active:true},{unsupported:true},{disabled:true},{standalone:true}]){
    h=host(options);startMobileFullscreen(options.active?false:true);assert.equal(h.calls.length,0);assert.equal(h.windowListeners.size,0);assert.equal(h.documentListeners.size,0);
  }
});
test('rejected fullscreen stays nonfatal, removes automatic retries, and preserves a manual exit',async()=>{
  const h=host({denied:true});startMobileFullscreen(true);h.nav.userActivation.isActive=true;h.tap();await Promise.resolve();await Promise.resolve();
  assert.equal(h.calls.length,1);assert.equal(h.windowListeners.size,0);h.doc.fullscreenElement=null;h.tap();assert.equal(h.calls.length,1);
});
test('legacy WebKit uses its page API; hidden documents do not attempt fullscreen',()=>{
  const h=host({legacy:true});h.doc.fullscreenEnabled=false;startMobileFullscreen(true);h.nav.userActivation.isActive=true;h.doc.hidden=true;h.tap();assert.equal(h.calls.length,0);
  h.doc.hidden=false;h.tap('touchend');assert.deepEqual(h.calls,[[]]);assert.equal(h.windowListeners.size,0);
});
test('external fullscreen entry and explicit cleanup detach every listener without requests',()=>{
  let h=host();startMobileFullscreen(true);h.doc.fullscreenElement=h.doc.documentElement;h.documentListeners.get('fullscreenchange')!();assert.equal(h.calls.length,0);assert.equal(h.windowListeners.size,0);assert.equal(h.documentListeners.size,0);
  h=host();const stop=startMobileFullscreen(true);stop();stop();h.nav.userActivation.isActive=true;h.tap();assert.equal(h.calls.length,0);assert.equal(h.windowListeners.size,0);assert.equal(h.documentListeners.size,0);
});
