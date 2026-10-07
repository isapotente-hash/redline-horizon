import test from 'node:test';
import assert from 'node:assert/strict';
import {driftPresentation} from '../src/ui/DriftSignal';
const idle={active:false,charge:0,settling:false,rewardFlash:0,rewardSerial:0};
test('drift feedback follows charging, ready, clean exit and earned reward; cancelled charge disappears',()=>{
 assert.equal(driftPresentation(idle).phase,'idle');
 assert.equal(driftPresentation(idle,true).hint,'KEEP IT SIDEWAYS');
 assert.equal(driftPresentation({...idle,active:true,charge:.6}).phase,'charge');
 assert.equal(driftPresentation({...idle,active:true,charge:1}).hint,'RELEASE HANDBRAKE');
 assert.equal(driftPresentation({...idle,active:true,charge:1,settling:true}).title,'BANK IT');
 assert.equal(driftPresentation({...idle,active:true,charge:.4,settling:true}).hint,'CLEAN EXIT');
 const earned=driftPresentation({...idle,rewardFlash:.9,rewardSerial:1},true);
 assert.equal(earned.phase,'reward');assert.equal(earned.title,'NITRO!');assert.equal(earned.charge,1);
 assert.equal(driftPresentation({...idle,charge:.8}).phase,'idle');
});
test('invalid and overshooting drift charge stays within the progress range',()=>{
 for(const [input,expected] of [[NaN,0],[-.3,0],[2,1],[.4,.4]])assert.equal(driftPresentation({...idle,active:true,charge:input}).charge,expected);
});
