import test from 'node:test';import assert from 'node:assert/strict';import {loadingProgress,modelLoaded} from '../src/core/Loading';
test('loading percentage is monotonic and reaches 100 only when every startup stage completes',()=>{
 const bar={value:0},label={textContent:''};Object.defineProperty(globalThis,'document',{configurable:true,value:{getElementById:(id:string)=>id==='startup-bar'?bar:id==='startup-percent'?label:null}});
 loadingProgress('physics',1);assert.equal(bar.value,8);modelLoaded(0,{loaded:100,total:200} as ProgressEvent);const before=bar.value;modelLoaded(0,{loaded:25,total:200} as ProgressEvent);assert.ok(bar.value>=before);for(let i=0;i<4;i++)modelLoaded(i);
 for(const stage of ['world','terrain','vehicles'] as const)loadingProgress(stage,1);assert.equal(bar.value,92);loadingProgress('shaders',1);assert.equal(bar.value,100);assert.equal(label.textContent,'100%');
});
