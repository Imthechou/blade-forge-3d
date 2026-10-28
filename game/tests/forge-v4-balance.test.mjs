import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../src/data/cards.js';
import {RARITY_BUDGET,SPECIALIST_CARD} from '../src/data/forgeStatBalance.js';
import {createRun,confirmCard,hammerStrike,submitEdge} from '../src/core/forge.js';
import * as Edge from '../src/core/edge.js';
import * as Hammer from '../src/core/hammer.js';
import {breakChance} from '../src/core/risk.js';
const ranks=['common','fine','rare','epic','legend','mythic'];
test('rarity budgets grow and cards leave specialist stats to S4/S7',()=>{
 for(let i=1;i<ranks.length;i++){
   assert.ok(RARITY_BUDGET[ranks[i]]>RARITY_BUDGET[ranks[i-1]]);
   assert.ok(SPECIALIST_CARD[ranks[i]]>SPECIALIST_CARD[ranks[i-1]]);
 }
 for(const c of CARDS){
   if(c.stage!=='S4')assert.equal(c.statDelta.strength??0,0,c.id);
   if(c.stage!=='S7')assert.equal(c.statDelta.sharpness??0,0,c.id);
   if(c.stage==='S4')assert.ok(c.statDelta.strength>0,c.id);
   if(c.stage==='S7')assert.ok(c.statDelta.sharpness>0,c.id);
 }
});

test('n-th hammer grants +n, ten safe strikes then steep risk',()=>{
 const r=createRun({seed:124});r.stageIndex=3;r.stageId='S4';r.phase='select';
 confirmCard(r,CARDS.find(c=>c.stage==='S4'));r.rng=()=>.999999;
 const risks=[0,0,0,1,2,3,5,7,9,11,15,21,29,39,51,65,81,99];
 const p=[0,0,0,0,0,0,0,0,0,0,.02,.02,.05,.10,.18,.30,.45,.60];
 for(let i=0;i<18;i++){
  const hit=hammerStrike(r);
  assert.equal(hit.strike.statGain,i+1);
  assert.equal(hit.strike.breakChance,p[i]);
  assert.equal(r.risk.current,risks[i]);
  assert.equal(r.hammer.statGained,(i+1)*(i+2)/2);
 }
 assert.equal(Hammer.progressOf(30),30);
 assert.equal(breakChance(12),0);
 assert.equal(breakChance(13),.02);
 assert.equal(breakChance(25),.05);
 assert.equal(breakChance(99),.60);
});
test('S7 is continuous fit only, 3 attempts with early bonus',()=>{
 const results=[];
 for(const attempt of [1,2,3]){
  const r=createRun({seed:324});r.stageIndex=6;r.stageId='S7';r.phase='select';
  confirmCard(r,CARDS.find(c=>c.stage==='S7'));r.rng=()=>.999999;
  const before=r.stats.sharpness;
  const samples=Array.from({length:48},(_,i)=>({index:i,value:.5}));
  const out=submitEdge(r,samples,{projected:true,attemptsUsed:attempt});
  assert.equal(out.edge.fit,1);
  assert.equal(out.edge.attempts,attempt);
  assert.equal(out.edge.sharp,r.stats.sharpness-before);
  results.push(out.edge);
 }
 assert.deepEqual(results.map(x=>x.sharp),[134,127,120]);
 assert.deepEqual(results.map(x=>x.multiplier),[1.12,1.06,1]);
 const inaccurate=Edge.contourPreview(Array.from({length:48},(_,index)=>({index,value:.65})),1);
 assert.ok(inaccurate.fit>.65&&inaccurate.fit<.75);
 assert.ok(inaccurate.sharp>0&&inaccurate.sharp<134);
 assert.equal(Edge.contourPreview(Array.from({length:10},(_,index)=>({index,value:.5})),1).sharp,0);
});
