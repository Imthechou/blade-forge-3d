import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../src/core/forge.js';
import { rollCandidates, reroll, nextRerollCost } from '../src/core/cards.js';
import { makeSave,normalizeSave } from '../src/core/saveSchema.js';
import * as G from '../src/core/arenaV41Growth.js';

test('ten-level workshop growth thresholds and additive old save migration',()=>{
  for(const [i,xp] of G.XP_THRESHOLDS.entries()){
    assert.equal(G.workshopLevel(xp),i+1);
  }
  assert.equal(G.workshopLevel(999999),10);
  const legacy=makeSave();delete legacy.workshopV41;
  legacy.unlockedCardIds=['S4_card_legacy'];
  const loaded=normalizeSave(legacy);
  assert.equal(loaded.workshopV41.xp,0);
  assert.deepEqual(loaded.unlockedCardIds,legacy.unlockedCardIds);
  assert.equal(G.workshopSnapshot(loaded).level,1);
  assert.equal(G.workshopSnapshot({workshopV41:{xp:4600}}).rarity,'C');
});
test('same workshop reward can only be credited once',()=>{
  const save=makeSave();
  assert.equal(G.awardWorkshopXp(save,80,'forge:a').credited,80);
  assert.equal(G.awardWorkshopXp(save,80,'forge:a').credited,0);
  assert.equal(G.workshopSnapshot(save).level,2);
  assert.equal(G.awardWorkshopXp(save,140,'match:a').level,3);
});
test('rarity levels preserve common and fine weights; higher rarity is still weighted and not admission-locked',()=>{
  const a=G.workshopSnapshot({workshopV41:{xp:220}});
  const c=G.workshopSnapshot({workshopV41:{xp:4600}});
  assert.equal(G.rarityMultiplier(c,'common'),1);
  assert.equal(G.rarityMultiplier(c,'fine'),1);
  assert.ok(G.rarityMultiplier(c,'mythic')>G.rarityMultiplier(a,'mythic'));
  const low=createRun({seed:31,workshopSnapshot:a,unlockedCardIds:[]});
  const high=createRun({seed:31,workshopSnapshot:c,unlockedCardIds:[]});
  assert.equal(low.candidatePool.size,high.candidatePool.size);
  assert.equal(high.candidates.length,3);
  assert.equal(new Set(high.candidates.map(c=>c.id)).size,3);
});
test('S1 free redraw and six paid redraws are separate, discounted cost never reaches zero',()=>{
  const workshop=G.workshopSnapshot({workshopV41:{xp:4600}});
  const run=createRun({seed:101,cr:100000,workshopSnapshot:workshop});
  assert.equal(nextRerollCost(run),0);
  assert.equal(reroll(run).cost,0);
  assert.equal(run.paidRerollsUsed,0);
  for(let i=0;i<6;i++) {
    const result=reroll(run);assert.equal(result.ok,true);
    assert.ok(result.cost>=1);
  }
  assert.equal(run.paidRerollsUsed,6);
  assert.equal(reroll(run).ok,false);
  const stage2={...run,stageId:'S2',rerollCountByStage:{...run.rerollCountByStage}};
  assert.equal(reroll(stage2).cost,0);
  assert.equal(reroll(stage2).ok,false,'paid cap persists across stages after a free stage reroll');
});
test('risk protection is relative, retains displayed risk, capped at twenty percent',()=>{
  const workshop=G.workshopSnapshot({workshopV41:{xp:4600}});
  assert.ok(Math.abs(G.effectiveRiskScale(workshop,0)-.90)<1e-9);
  assert.ok(Math.abs(G.effectiveRiskScale(workshop,.12)-.80)<1e-9);
  assert.equal(G.discountedRerollCost(10,workshop),9);
  assert.equal(G.discountedRerollCost(1,workshop),1);
});

test('legacy verified milestones grant XP once without changing CR or permanent blades',()=>{
  const legacy=makeSave();
  delete legacy.workshopV41;
  legacy.stats.forgeCount=8;
  legacy.arena.school={edge:{cleared:[0,1,2]}};
  legacy.arena.history=[{id:'old-national',tier:'national',result:{champion:true}}];
  legacy.collection=[{id:'legacy-knife',stats:{strength:80,toughness:70,sharpness:100,
    craft:95,design:85,spirit:60},score:123,visualRecipe:[]}];
  const first=normalizeSave(legacy);
  assert.equal(first.workshopV41.xp,8*10+50+75+110+200);
  assert.equal(first.workshopV41.receipts['first:school:edge:2'],110);
  assert.equal(first.workshopV41.migration.applied,true);
  assert.equal(first.cr,legacy.cr);
  assert.equal(first.collection[0].score,123);
  const twice=normalizeSave(first);
  assert.equal(twice.workshopV41.xp,first.workshopV41.xp);
  assert.deepEqual(twice.workshopV41.receipts,first.workshopV41.receipts);
  assert.deepEqual(twice.collection[0].stats,first.collection[0].stats);
});
