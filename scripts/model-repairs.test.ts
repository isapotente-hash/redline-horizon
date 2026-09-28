import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';
import {makeCar} from '../src/vehicles/CarModel';import {addMotorcycleRider,RIDER_FIT} from '../src/vehicles/MotorcycleRider';
for(const hero of [true,false])test(`car ${hero?'hero':'traffic'} shell is visible from both sides, nose and tail`,()=>{
 const car=makeCar(hero);car.root.updateMatrixWorld(true);const rays=[[[3,.5,0],[-1,0,0]],[[-3,.5,0],[1,0,0]],[[0,.59,-4],[0,0,1]],[[0,.61,4],[0,0,-1]],[[0,3,-1.7],[0,-1,0]],[[0,-1,0],[0,1,0]]];
 for(const [p,d] of rays){const ray=new T.Raycaster(new T.Vector3(...p),new T.Vector3(...d));const hits=ray.intersectObject(car.body,true);assert.ok(hits.length,`hole from ${p}`);const first=hits[0];assert.ok(first.distance<3.0,`ray only reached far side from ${p}`);}
});
test('motorcycle rider sits on seat and gloves/boots meet measured model contact points',()=>{
 const body=new T.Group(),rider=addMotorcycleRider(body);body.updateMatrixWorld(true);
 const pelvis=new T.Box3().setFromObject(rider.getObjectByName('rider-pelvis')!);assert.ok(Math.abs(pelvis.min.y-RIDER_FIT.seat[1])<.015);
 const gloves=rider.children.filter(c=>c.name==='rider-glove');assert.equal(gloves.length,2);for(const g of gloves){assert.equal(Math.abs(g.position.x),RIDER_FIT.grip[0]);assert.equal(g.position.y,RIDER_FIT.grip[1]);assert.equal(g.position.z,RIDER_FIT.grip[2]);}
 const boots=rider.children.filter(c=>c.name==='rider-boot');for(const b of boots){const box=new T.Box3().setFromObject(b);assert.ok(Math.abs(box.min.y-RIDER_FIT.peg[1])<.015);}
 const visor=new T.Box3().setFromObject(rider.getObjectByName('rider-visor')!);assert.ok(visor.max.z<.32,'visor faces forward');
});
