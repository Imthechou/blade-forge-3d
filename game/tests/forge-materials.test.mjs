import test from 'node:test';
import assert from 'node:assert/strict';
import * as Materials from '../src/core/forgeMaterials.js';
import { BY_STAGE } from '../src/data/cards.js';
import { makeSave,normalizeSave } from '../src/core/saveSchema.js';
import { createRun,confirmCard } from '../src/core/forge.js';
import { FORGE_FLOW_VERSION } from '../src/core/forgeChapters.js';
import { selectableRecipes,pinRecipeChoice,guaranteedRecipes } from '../src/core/forgeRecipeAccess.js';
const offRollStockRun=(cardId,inventory)=>{
  for(let seed=1;seed<=400;seed++){
    const run=createRun({seed,flowVersion:FORGE_FLOW_VERSION,workshopSnapshot:{level:1},materialInventory:inventory});
    if(!run.naturalCandidateIds.includes(cardId))return run;
  }
  throw Error('cannot find seeded off-roll candidate');
};

test('legacy saves migrate empty material stock without deleting any other progress',()=>{
  const old={cr:521,unlockedCardIds:['S1_01'],collection:[],workshopV41:{version:1,xp:100,receipts:{}}};
  const save=normalizeSave(old);
  assert.deepEqual(save.materialsV1,Materials.makeMaterialsV1());
  assert.equal(save.cr,521);
  assert.deepEqual(save.unlockedCardIds,['S1_01']);
  assert.equal(save.workshopV41.xp,100);
});
test('material drop is deterministic, bounded, and replay receipt cannot duplicate',()=>{
  const save=makeSave();
  const first=Materials.grantMaterial(save,'material:formal:M102','national');
  assert.equal(first.ok,true);
  assert.equal(first.credited,1);
  assert.equal(first.cardId,Materials.materialDropFor('material:formal:M102','national')?.id);
  assert.equal(Materials.grantMaterial(save,'material:formal:M102','national').duplicate,true);
  assert.equal(Materials.stockedCount(save,first.cardId),1);
  for(let n=0;n<160;n++)Materials.grantMaterial(save,'material:formal:'+n,'apex');
  assert.ok(Object.values(save.materialsV1.counts).every(x=>x>=0&&x<=9));
  assert.ok(Object.values(save.materialsV1.counts).reduce((a,b)=>a+b,0)<=60);
  assert.ok(BY_STAGE.S1.some(c=>c.id===first.cardId));
});
test('rare material stock allows reliable one-use pick; random rolls and learned recipes remain free',()=>{
  const saved=makeSave();
  const drop=Materials.grantMaterial(saved,'material:formal:rare-test','national');
  assert.equal(drop.ok,true);
  const run=offRollStockRun(drop.cardId,saved.materialsV1.counts);
  const chosen=selectableRecipes(run).find(c=>c.id===drop.cardId);
  assert.ok(chosen,'stocked rare material can be selected directly');
  assert.equal(run.recipeChoiceIds.includes(chosen.id),false,'rare stock is not permanent blueprint');
  const first=pinRecipeChoice(run,chosen.id);
  assert.equal(first.ok,true);
  assert.equal(first.requiresMaterial,true);
  assert.equal(run.materialReservation,chosen.id);
  assert.equal(Materials.stockedCount(saved,chosen.id),1,'preview does not spend resources');
  const spent=Materials.spendMaterialInDraft(saved,chosen.id);
  assert.equal(spent.remaining,0);
  assert.equal(Materials.stockedCount(saved,chosen.id),0);
  assert.equal(Materials.spendMaterialInDraft(saved,chosen.id).ok,false);
  const before=run.stats.strength;
  assert.equal(confirmCard(run,chosen).ok,true);
  assert.ok(run.stats.strength>=before);
  assert.equal(run.stageId,'S2');
  const legacy=createRun({seed:42,flowVersion:FORGE_FLOW_VERSION,workshopSnapshot:{level:1},unlockedCardIds:[chosen.id]});
  assert.ok(guaranteedRecipes(1,[chosen.id]).includes(chosen.id));
  assert.equal(pinRecipeChoice(legacy,chosen.id).requiresMaterial,false,'old permanent unlock never consumes stock');
});
test('corrupted stock cannot create phantom items or negative counts',()=>{
  const first=BY_STAGE.S1.find(c=>['fine','rare','epic','legend'].includes(c.rarity));
  assert.ok(first);
  const normalized=Materials.normalizeMaterialsV1({counts:{[first.id]:300,'__proto__':10,'S2_01':7,'other':-10}});
  assert.equal(normalized.counts[first.id],9);
  assert.equal(normalized.counts.S2_01,undefined);
  assert.equal(Materials.spendMaterialInDraft({materialsV1:normalized},'S2_01').ok,false);
});

test('full inventory does not claim new loot or permit retroactive replay after spending',()=>{
  const save=makeSave();
  const key='material:formal:full-storage';
  const card=Materials.materialDropFor(key,'apex');
  save.materialsV1.counts[card.id]=9;
  const result=Materials.grantMaterial(save,key,'apex');
  assert.equal(result.credited,0);
  assert.equal(save.materialsV1.receipts[key],'none:'+card.id);
  Materials.spendMaterialInDraft(save,card.id);
  assert.equal(Materials.stockedCount(save,card.id),8);
  const again=Materials.grantMaterial(save,key,'apex');
  assert.equal(again.duplicate,true);
  assert.equal(again.credited,0);
  assert.equal(again.cardId,card.id);
  assert.equal(Materials.stockedCount(save,card.id),8);
  const normalized=Materials.normalizeMaterialsV1(save.materialsV1);
  assert.equal(normalized.receipts[key],'none:'+card.id);
});

test('repeated forced recipe selection never turns paid stock into a free random candidate',()=>{
  const save=makeSave(),drop=Materials.grantMaterial(save,'material:formal:rare-test','national');
  const run=offRollStockRun(drop.cardId,save.materialsV1.counts);
  assert.ok(!run.naturalCandidateIds.includes(drop.cardId),'this test must exercise an off-roll stock');
  assert.equal(pinRecipeChoice(run,drop.cardId).requiresMaterial,true);
  assert.equal(pinRecipeChoice(run,drop.cardId).requiresMaterial,true,'re-pinning the inserted card cannot waive stock');
  assert.equal(run.materialReservation,drop.cardId);
  const other=selectableRecipes(run).find(c=>c.id!==drop.cardId && run.recipeChoiceIds.includes(c.id));
  assert.ok(other);
  assert.equal(pinRecipeChoice(run,other.id).requiresMaterial,false,'a permanent selection cancels reservation');
  assert.equal(pinRecipeChoice(run,drop.cardId).requiresMaterial,true,'switching back to stock does not make it free');
});
test('materials randomly appearing in the three original choices remain free even if stocked',()=>{
  let roll,card;
  for(let seed=1;seed<=300;seed++){
    const candidate=createRun({seed,flowVersion:FORGE_FLOW_VERSION,workshopSnapshot:{level:1}});
    const found=candidate.candidates.find(c=>['fine','rare','epic','legend','mythic'].includes(c.rarity)&&!candidate.recipeChoiceIds.includes(c.id));
    if(found){roll=candidate;card=found;break;}
  }
  assert.ok(card,'need a natural nonpermanent material candidate');
  roll.materialInventory[card.id]=1;
  assert.ok(roll.naturalCandidateIds.includes(card.id));
  assert.equal(pinRecipeChoice(roll,card.id).requiresMaterial,false);
  assert.equal(roll.materialReservation,null);
});
test('invalid or cross-stage cards never mutate forging state',()=>{
  const run=createRun({seed:246,flowVersion:FORGE_FLOW_VERSION});
  const before=JSON.stringify({history:run.history,stats:run.stats,risk:run.risk,skin:run.pendingSkin});
  assert.equal(confirmCard(run,BY_STAGE.S2[0]).ok,false);
  assert.equal(confirmCard(run,{...run.candidates[0],stage:'S9'}).ok,false);
  assert.equal(JSON.stringify({history:run.history,stats:run.stats,risk:run.risk,skin:run.pendingSkin}),before);
});
