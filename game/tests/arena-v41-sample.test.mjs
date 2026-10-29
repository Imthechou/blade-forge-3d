import test from 'node:test';
import assert from 'node:assert/strict';
import {on,EVENTS} from '../src/platform/bus.js';
import {createChallenge,tick,finish,SAMPLE_MATERIALS} from '../src/core/arenaChallenge.js';
import {sampleBlade} from '../tools/arena-v3-simulate.mjs';

test('collection sample is fixed six-family test, 12 seconds, same seed for every blade',()=>{
 assert.deepEqual([...SAMPLE_MATERIALS],['foam','rope','plastic','wood','ice','metal']);
 const create=()=>createChallenge(sampleBlade(100),{mode:'sample',seed:81241}).run;
 const first=create(),again=create();
 assert.equal(first.total,12);
 assert.equal(first.mode,'sample');
 assert.deepEqual(first.targets.map(t=>t.type),SAMPLE_MATERIALS.slice(0,3));
 assert.deepEqual(first.targets.map(t=>t.type),again.targets.map(t=>t.type));
 for(let i=0;i<100&&!first.done;i++)tick(first,.125);
 assert.equal(first.done,true);
 assert.equal(first.targetSerial,SAMPLE_MATERIALS.length,'short trial must not become endless soft-target quick mode');
 assert.equal(first.result.sampleTotal,6);
 assert.equal(first.result.reward,0);
 assert.ok(first.result.primaryContacts>=0);
 assert.ok(first.result.elapsedSeconds<=12);
});
test('trial cannot emit quick challenge completion event or mint CR, even on early finish',()=>{
 let quickEvents=0;
 const unsubscribe=on(EVENTS.QUICK_CHALLENGE_FINISHED,()=>quickEvents++);
 try{
   const run=createChallenge(sampleBlade(90),{mode:'sample',seed:81241}).run;
   const result=finish(run,'sample-complete');
   assert.equal(result.mode,'sample');
   assert.equal(result.reward,0);
   assert.equal(quickEvents,0);
   assert.equal(finish(run,'sample-complete'),result);
   assert.equal(quickEvents,0);
 }finally{unsubscribe();}
});
