import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun, confirmCard, endHammer, submitEdge, snapshot } from '../src/core/forge.js';
import { FORGE_FLOW_VERSION,FORGE_CHAPTERS,chapterState,isFiveScreen } from '../src/core/forgeChapters.js';
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
