import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSave,normalizeSave} from '../src/core/saveSchema.js';
import * as Special from '../src/core/arenaV41Specialties.js';
import * as Bonus from '../src/core/forgeBonuses.js';
import {createRun} from '../src/core/forge.js';
import {reroll,rollCandidates} from '../src/core/cards.js';
import {contourPreview} from '../src/core/edge.js';

const school=(id,levels=[1])=>{
  const s=makeSave();
  s.arena.school[id]={cleared:levels};
  s.forgeBonus.equippedId='specialty_'+id;
  return s;
};
test('six specializations unlock at actual school 1/2/4 milestones only',()=>{
  for(const spec of Special.SPECIALTIES){
    const fresh=school(spec.id,[]);assert.equal(Special.specialtyLevel(fresh,spec.bonusId),0);
    assert.equal(Bonus.bonusListFor(fresh).find(b=>b.id===spec.bonusId).unlocked,false);
    for(const [levels,lvl] of [[[1],1],[[1,2],2],[[1,2,4],3]]){
      const state=school(spec.id,levels);
      assert.equal(Special.specialtyLevel(state,spec.bonusId),lvl);
      assert.equal(Special.specialtySnapshot(state,spec.bonusId).boost,spec.benefits[lvl-1]);
    }
  }
});
test('old combo-hint equipment migrates to free reroll without deleting discovered knowledge',()=>{
  const legacy=makeSave();legacy.forgeBonus.equippedId='combo_insight';
  legacy.codex.combo={found_mystery:123};
  const restored=normalizeSave(legacy);
  assert.equal(restored.forgeBonus.equippedId,'extra_reroll');
  assert.equal(restored.forgeBonus.knowledgeMigrated,true);
  assert.equal(restored.codex.combo.found_mystery,123);
  assert.equal(Bonus.bonusListFor(restored).some(x=>x.id==='combo_insight'),false);
});
test('precise stage picker cannot select a stage without a legal stat card',()=>{
  const a=Special.normalizeSpecialtyOptions('specialty_precise',{stat:'craft',stages:['S99','S4']});
  assert.ok(a.stages.length>=1);
  for(const stage of a.stages)assert.ok(Special.validStatStages('craft').includes(stage));
  assert.equal(new Set(a.stages).size,a.stages.length);
});
test('color and resonance only prefer matching legal cards; never modify all alternatives',()=>{
  const s=school('quench');
  const sp=Special.specialtySnapshot(s,'specialty_quench');
  const run=createRun({seed:27,specialistSnapshot:sp});
  run.stageId='S5';
  assert.equal(Special.matchSpecialtyCard(run,{tags:['cold'],rarity:'common'}),true);
  assert.equal(Special.matchSpecialtyCard(run,{tags:['heat'],rarity:'common'}),false);
  const p=Special.activeRollSpecialty(run,[{tags:['cold']},{tags:['heat']}]);
  assert.equal(p.active,true);
  const comp=school('composite');
  const r=createRun({seed:19,specialistSnapshot:Special.specialtySnapshot(comp,'specialty_composite')});
  r.stageId='S5';
  assert.equal(Special.matchSpecialtyCard(r,{tags:['precision']}),false);
  r.ledger.entries.push({stage:'S2',tags:['precision']});
  assert.equal(Special.matchSpecialtyCard(r,{tags:['precision']}),true);
  rollCandidates(r);
  assert.equal(r.specialist.remaining,0,'one candidate group consumes level-one resonance');
});
test('successful high-risk draw empowers next rarity roll just once',()=>{
  const save=school('overload');
  const r=createRun({seed:99,specialistSnapshot:Special.specialtySnapshot(save,'specialty_overload')});
  assert.equal(Special.noteSafeRisk(r,.099),false);
  assert.equal(Special.noteSafeRisk(r,.1),true);
  assert.equal(Special.noteSafeRisk(r,.3),false);
  r.stageId='S2';rollCandidates(r);
  assert.equal(r.specialist.consumed,true);
  assert.equal(r.specialist.ready,false);
  assert.equal(Special.activeRollSpecialty(r,[]).rarityBoost,0);
});
test('extra free reroll on later stage spends no CR and no paid budget',()=>{
  const r=createRun({seed:100,cr:1000});
  assert.equal(reroll(r).cost,0);
  r.freeRerollOverride=true;
  const before=r.cr;
  const a=reroll(r);
  assert.equal(a.ok,true);assert.equal(a.cost,0);
  assert.equal(r.cr,before);
  assert.equal(r.paidRerollsUsed,0);
});
test('second contour attempt inherits specialist multiplier without input delay or third-attempt buff',()=>{
  const samples=[];
  const base=contourPreview(samples,2);
  const boosted=contourPreview(samples,2,{id:'edge',boost:1.12});
  assert.equal(boosted.multiplier,1.12);
  assert.ok(boosted.multiplier>=base.multiplier);
  assert.equal(contourPreview(samples,3,{id:'edge',boost:1.12}).multiplier,
    contourPreview(samples,3).multiplier);
});
