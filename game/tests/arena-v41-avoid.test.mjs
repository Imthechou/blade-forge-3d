import test from 'node:test';
import assert from 'node:assert/strict';
import {createChallenge,tick,beginSwipe,swipe,finish} from '../src/core/arenaChallenge.js';
import {cutImpact} from '../src/ui/arenaImpact.js';
import {sampleBlade} from '../tools/arena-v3-simulate.mjs';

function reachAvoidTarget(seed=1267){
 const {run}=createChallenge(sampleBlade(100),{mode:'quick',seed});
 let avoid=null;
 for(let i=0;i<340&&!run.done&&!avoid;i++){
   tick(run,.125);
   avoid=run.targets.find(t=>t.alive&&t.avoid);
 }
 return {run,avoid};
}
test('quick stream delivers a visible authored dodge opportunity without replacing material physics',()=>{
 const {run,avoid}=reachAvoidTarget();
 assert.ok(avoid,'no dodge in first 42.5 seconds');
 assert.equal(avoid.type,'metal');
 assert.equal(avoid.layout,'stream');
 assert.equal(avoid.id,'target-20');
 assert.ok(run.elapsed>=8);
 assert.equal(avoid.armorLeft>=0,true);
 assert.equal(run.mode,'quick');
 assert.equal(run.done,false);
});
test('cutting dodge marker only interrupts combo; it does not score, wear, fracture, or double-penalize',()=>{
 const {run,avoid}=reachAvoidTarget(191);
 assert.ok(avoid);
 run.streak=7;run.combo=3;run.gestureKills=3;
 const score=run.score,health=run.health,misses=run.misses;
 beginSwipe(run);
 // Short straight stroke through the seal, without hitting adjacent rows.
 const x=avoid.x,y=avoid.y;
 const result=swipe(run,{x:x-.028,y},{x:x+.028,y},{duration:.10});
 assert.ok(result.hits.some(h=>h.target.id===avoid.id&&h.contactEvent==='avoid-hit'));
 assert.equal(avoid.alive,false);
 assert.equal(run.avoidHits,1);
 assert.equal(run.combo,0);
 assert.equal(run.streak,0);
 assert.equal(run.score,score);
 assert.equal(run.health,health);
 assert.equal(run.misses,misses);
 assert.equal(run.fractured,false);
 const imp=cutImpact({target:avoid,contactEvent:'avoid-hit'});
 assert.equal(imp.particleCount,0);
 const scored=finish(run,'time');
 assert.equal(scored.avoidHits,1);
 assert.equal(scored.score,score);
});
test('letting an avoid opportunity expire is not treated as missed regular target',()=>{
 const {run,avoid}=reachAvoidTarget(741);
 assert.ok(avoid);
 const score=run.score,misses=run.misses;
 // Keep other ordinary expirations from polluting this focused assertion.
 for(const t of run.targets)if(t!==avoid&&t.alive)t.createdAt=run.elapsed;
 avoid.createdAt=run.elapsed-10;
 tick(run,.125);
 assert.equal(avoid.alive,false);
 assert.equal(run.avoidCleared,1);
 assert.equal(run.avoidHits||0,0);
 assert.equal(run.misses,misses);
 assert.equal(run.score,score);
});
