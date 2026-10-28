import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/core/arenaChallenge.js';
import {createEncounter, phaseMaterialPool, MATERIAL_ORDER, PHASES} from '../src/core/arenaEncounters.js';
import {advanceArenaClock} from '../src/core/arenaCutBridge.js';
const blade={id:'encounter',stats:Object.fromEntries(['strength','toughness','sharpness','craft','design','spirit'].map(k=>[k,100]))};
const tournament=[...Array.from({length:5},(_,gradient)=>({tier:'school',gradient})),...Array.from({length:5},(_,round)=>({tier:'national',round})),...Array.from({length:3},(_,round)=>({tier:'apex',round}))];
test('13 档赛事提高出场压力，六种靶具本体始终不变，始终保留可选软靶',()=>{
  const before=JSON.stringify(C.MATERIALS);
  let lastRank=-1,lastQuota=0;
  for(const spec of tournament) {
    const config=createEncounter(spec);
    const quota=PHASES.reduce((n,p)=>n+config.stages[p].quota,0);
    assert.ok(config.rank>lastRank); assert.ok(quota>=lastQuota);
    lastRank=config.rank;lastQuota=quota;
    const r=C.createChallenge(blade,{seed:178,mode:'formal',encounter:spec}).run;
    while(!r.done) {
      if(r.phase==='buff-choice')C.chooseAugment(r,r.offers[0]);
      advanceArenaClock(r,.25,C.tick);
      assert.ok(r.targets.filter(t=>t.alive).length<=6);
    }
    assert.equal(r.elapsed,45);
    for(const p of PHASES) {
      const h=r.encounterHistory[p];
      assert.ok(h.spawned>=1,`${config.label}/${p}`);
      assert.equal(h.spawned,Object.values(h.materials).reduce((a,b)=>a+b,0));
      assert.ok(phaseMaterialPool(config,p).includes('foam'));
    }
    assert.ok(r.targets.every(t=>t.difficulty===1));
  }
  assert.equal(JSON.stringify(C.MATERIALS),before);
});
test('低阶延迟高级材料，高阶开放六种；六流派材料权重互异',()=>{
  assert.deepEqual(phaseMaterialPool(createEncounter({gradient:0}),'warmup'),['foam','rope']);
  assert.ok(!phaseMaterialPool(createEncounter({gradient:0}),'finale').includes('metal'));
  assert.deepEqual(phaseMaterialPool(createEncounter({tier:'apex',round:2}),'finale'),MATERIAL_ORDER);
  const fingerprints=['press','edge','precise','quench','composite','overload'].map(styleId=>{
    const r=C.createChallenge(blade,{seed:88,mode:'formal',augments:false,encounter:{tier:'national',round:4,styleId}}).run;
    while(!r.done)C.tick(r,.25);
    return JSON.stringify(r.encounterHistory);
  });
  assert.equal(new Set(fingerprints).size,6);
});
test('同刀同材料的护甲、切入和损耗不随赛事档位变化；正式赛不可重开刷卡',()=>{
  for(const type of MATERIAL_ORDER) {
    const runs=[{tier:'school',gradient:0},{tier:'apex',round:2}].map(encounter=>{
      const r=C.createChallenge(blade,{mode:'formal',augments:false,seed:17,encounter}).run;
      r.targets=[{...r.targets[0],id:'fixed',type,x:.5,y:.5,armorLeft:C.MATERIALS[type].armor*.6,progress:0,alive:true,difficulty:1,cuts:[]}];
      C.beginSwipe(r);assert.ok(C.swipe(r,{x:.3,y:.5},{x:.7,y:.5},{duration:.17}).hits.length);
      return r;
    });
    assert.equal(runs[0].targets[0].armorLeft,runs[1].targets[0].armorLeft);
    assert.equal(runs[0].targets[0].progress,runs[1].targets[0].progress);
    assert.equal(runs[0].health,runs[1].health);
    assert.equal(C.restartChallenge(runs[0]).ok,false);
  }
});
