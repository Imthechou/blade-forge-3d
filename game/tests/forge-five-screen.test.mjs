import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, confirmCard, endHammer, submitEdge, snapshot } from '../src/core/forge.js';
import { FORGE_FLOW_VERSION,FORGE_CHAPTERS,chapterState,isFiveScreen,forgeStageStatDelta } from '../src/core/forgeChapters.js';
import { specialtyFlowCue } from '../src/core/arenaV41Specialties.js';
import { BY_STAGE } from '../src/data/cards.js';
import { previewPick } from '../src/core/cards.js';
import * as Attr from '../src/core/attributes.js';
import { makeSave, normalizeSave } from '../src/core/saveSchema.js';
import { workshopSnapshot } from '../src/core/arenaV41Growth.js';

test('five screens contain exactly the complete original stage contract without duplicates',()=>{
  assert.equal(FORGE_CHAPTERS.length,5);
  const stages=FORGE_CHAPTERS.flatMap(x=>x.stages);
  assert.deepEqual(stages,['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10']);
  assert.deepEqual(FORGE_CHAPTERS.map(x=>x.name),
    ['开炉配方','锻打成型','刀身精制','刀柄装配','名刀鉴定']);
});
test('real nine-stage risk, stats, tags and material recipe survive inside five screens',()=>{
  const saved=normalizeSave(makeSave());
  const run=createRun({seed:7371,flowVersion:FORGE_FLOW_VERSION,workshopSnapshot:workshopSnapshot(saved)});
  run.rng=()=>.999999; // never fracture: exercise every real risk checkpoint.
  assert.equal(isFiveScreen(run),true);
  let prevRisk=0;
  const chapters=[];
  for(let stage=1;stage<=9;stage++){
    assert.equal(run.stageId,'S'+stage);
    const current=chapterState(run);
    chapters.push(current.number);
    const first=run.candidates[0];
    assert.ok(first,'every original craft remains selectable');
    const done=confirmCard(run,first);
    assert.equal(done.ok,true);
    if(stage===1)assert.equal(run.lastRiskCheck,undefined);
    if(stage===2){
      assert.equal(run.lastRiskCheck,undefined,'preparation does not crack a blade');
      prevRisk=run.risk.current;
    }
    if(stage===3)assert.equal(run.lastRiskCheck?.stageId,'S3');
    if(stage===4){
      assert.equal(run.phase,'hammer');
      assert.equal(endHammer(run).ok,true);
    }
    if(stage===7){
      assert.equal(run.phase,'edge');
      assert.equal(submitEdge(run,null,{skipped:true}).ok,true);
    }
    assert.ok(run.risk.peak>=prevRisk);
    prevRisk=run.risk.peak;
  }
  assert.deepEqual(chapters,[1,1,2,2,3,3,3,4,4]);
  assert.equal(run.stageId,'S10');
  assert.equal(run.phase,'appraise');
  assert.equal(snapshot(run).chapter.number,5);
  assert.equal(run.history.length,9);
  assert.equal(run.visualRecipe.length,9);
  assert.ok(run.stats.strength>=0);
  assert.ok(run.risk.peak>=run.risk.current);
});
test('old run and daily forge still perform S2 risk check',()=>{
  for(const options of [{seed:12},{seed:12,mode:'daily'}]){
    const run=createRun(options);run.rng=()=>.999999;
    assert.equal(isFiveScreen(run),false);
    assert.equal(confirmCard(run,run.candidates[0]).ok,true);
    assert.equal(confirmCard(run,run.candidates[0]).ok,true);
    assert.equal(run.lastRiskCheck?.stageId,'S2');
  }
});

test('five-screen payouts preserve authored rarity budgets and shift stage-specific roles',()=>{
  const run=createRun({seed:98123,flowVersion:FORGE_FLOW_VERSION});
  const old=createRun({seed:98123});
  const side=['toughness','craft','design','spirit'];
  for(const stage of ['S1','S2','S3','S4','S5','S6','S7','S8','S9']){
    run.stageId=stage;old.stageId=stage;
    for(const card of (BY_STAGE[stage]||[]).slice(0,8)){
      const adapted=forgeStageStatDelta(run,card);
      const legacy=forgeStageStatDelta(old,card);
      assert.equal(legacy,card.statDelta,'legacy balances do not change');
      const sum=x=>side.reduce((a,k)=>a+(Number(x[k])||0),0);
      assert.ok(Math.abs(sum(adapted)-sum(card.statDelta))<.011,stage+' must retain total side-stat budget');
      assert.equal(adapted.strength,card.statDelta.strength);
      assert.equal(adapted.sharpness,card.statDelta.sharpness);
      const projected=previewPick(run,card);
      const expected=Attr.make();Attr.apply(expected,adapted);
      for(const k of side)assert.ok(Math.abs((projected.stats[k]||0)-(expected[k]||0))<.011);
    }
  }
  const specimen=BY_STAGE.S8[0];
  run.stageId='S8';
  const assembled=forgeStageStatDelta(run,specimen);
  assert.ok(assembled.design>assembled.toughness,'assembly increases design emphasis');
  run.stageId='S5';
  const quenched=forgeStageStatDelta(run,BY_STAGE.S5[0]);
  assert.ok(quenched.toughness>quenched.design,'quench increases toughness emphasis');
});
test('all six specialists map to their real forge operation, without stacking bonus',()=>{
  const run={stageId:'S4',specialist:{id:'press',level:1,boost:.05,options:{}}};
  assert.equal(specialtyFlowCue(run).active,true);
  run.stageId='S5';assert.equal(specialtyFlowCue(run).active,false);
  run.specialist={id:'edge',level:2,boost:1.10,options:{}};
  run.stageId='S7';assert.equal(specialtyFlowCue(run).active,true);
  run.specialist={id:'precise',level:1,boost:.10,options:{stages:['S2','S8'],stat:'design'}};
  run.stageId='S2';assert.equal(specialtyFlowCue(run).active,true);
  run.specialist={id:'quench',level:1,boost:.15,options:{}};
  run.stageId='S6';assert.equal(specialtyFlowCue(run).active,true);
  run.specialist={id:'composite',level:1,boost:.15,options:{}};
  run.stageId='S8';assert.equal(specialtyFlowCue(run).active,true);
  run.specialist={id:'overload',level:1,boost:.10,options:{}};
  run.stageId='S3';assert.equal(specialtyFlowCue(run).active,true);
});
