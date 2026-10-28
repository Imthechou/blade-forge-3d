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
test('the first ten hammer strikes are safe, then gains and risk grow',()=>{
 const r=createRun({seed:124});r.stageIndex=3;r.stageId='S4';r.phase='select';
 const card=CARDS.find(c=>c.stage==='S4');confirmCard(r,card);
 r.rng=()=>0;
 for(let i=0;i<10;i++){
   const a=hammerStrike(r);assert.equal(a.fractured,false,'strike '+(i+1));
   assert.equal(a.strike.breakChance,0);
 }
 assert.equal(r.hammer.count,10);
 assert.ok(r.stats.strength>=50 && r.stats.strength<=85);
 assert.ok(Hammer.progressOf(11)>Hammer.progressOf(10));
 assert.ok(Hammer.progressOf(19)>=Hammer.progressOf(18),'late risky hammers cannot earn less Strength');
 assert.ok(Hammer.progressOf(30)>=Hammer.progressOf(19),'late cap never reverses the gamble');
 assert.ok(Hammer.progressOf(30)<=15,'late payout stays bounded');
 assert.ok(Hammer.nextRiskDelta(10)>Hammer.nextRiskDelta(9));
 assert.ok(breakChance(20)<breakChance(60));
});
test('3D projected sharpening uses only coverage and proximity',()=>{
 assert.equal(Edge.tierOf(Edge.projectedQuality(.99,.30)).id,'miss');
 assert.equal(Edge.tierOf(Edge.projectedQuality(.47,.65)).id,'good');
 assert.equal(Edge.tierOf(Edge.projectedQuality(.70,.83)).id,'great');
 assert.equal(Edge.tierOf(Edge.projectedQuality(.95,.98)).id,'perfect');
 const r=createRun({seed:324});r.stageIndex=6;r.stageId='S7';r.phase='select';
 confirmCard(r,CARDS.find(c=>c.stage==='S7'));r.rng=()=>.9999;
 const samples=Array.from({length:24},(_,i)=>({index:i,value:.5}));
 const before=r.stats.sharpness;
 const result=submitEdge(r,samples,{projected:true});
 assert.equal(result.edge.tier,'perfect');
 assert.ok(r.stats.sharpness-before>=128);
});
