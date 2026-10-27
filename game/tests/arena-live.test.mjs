import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFormalDefinition, BRANCH_FORMAT_LIST } from '../src/data/arena/formalTests.js';
import * as Formal from '../src/core/arenaFormal.js';
import * as Challenge from '../src/core/arenaChallenge.js';
import { advanceArenaClock, formalCutPayload } from '../src/core/arenaCutBridge.js';

const blade = {
  id: 'arena-test-blade', bladeName: '测试唐刀', knifeTypeId: 'tang',
  score: 320, fractured: false, canEnterArena: true, traits: [], combos: [], tags: {},
  stats: { strength: 130, toughness: 125, sharpness: 130, craft: 115, design: 110, spirit: 110 },
};

test('六流派 × 五档：所有项目规则必须可按项目 ID 检索，切割不可空靶', () => {
  for (const branch of BRANCH_FORMAT_LIST) for (let gradient=0; gradient<5; gradient++) {
    const def = buildFormalDefinition({ branchId:branch.id, gradient, seed:20261027 });
    assert.ok(def.ok, branch.id);
    assert.equal(def.rules.length, def.tests.length);
    for(const projectId of def.tests) {
      const rule = def.rules.find(r=>r.projectId===projectId);
      assert.ok(rule, `${branch.id} /${projectId} 项目规则丢失`);
      assert.ok(rule.kind, `${projectId} 操作种类丢失`);
    }
    const created = Formal.createFormalMatch({blade, styleId:branch.id, gradient, seed:20261027});
    assert.ok(created.ok);
    const match=created.match;
    for(const id of def.tests) {
      const task = Formal.testTask(match);
      assert.equal(task.kind,id);
      assert.ok(task.rule?.kind, id+' 缺规则');
      if(id==='cutting') assert.ok(task.sequence?.length>=6, '切割题目不能为空');
      const submitted = Formal.submitTest(match,{measure:0.78});
      assert.ok(submitted.ok, id+' 分项结算失败');
    }
    assert.ok(match.done);
    assert.equal(match.result.projectScores.length, def.tests.length);
  }
});

test('45 秒时钟在低帧率/大帧时间下不丢时间，路线和压轴各冻结一次', () => {
  const run=Challenge.createChallenge(blade,{seed:12});
  assert.ok(run.ok);
  const r=run.run;
  advanceArenaClock(r, 8.5, Challenge.tick);
  assert.equal(r.phase,'route-choice');
  assert.ok(r.elapsed>=8 && r.elapsed<8.2);
  const freeze=r.elapsed;
  advanceArenaClock(r,10,Challenge.tick);
  assert.equal(r.elapsed,freeze,'选择时应冻结倒计时');
  assert.ok(Challenge.chooseRoute(r,'soft').ok);
  advanceArenaClock(r,25,Challenge.tick);
  assert.equal(r.phase,'finale-choice');
  assert.ok(r.elapsed>=30 && r.elapsed<30.2);
  assert.ok(Challenge.chooseFinale(r,'safe').ok);
  advanceArenaClock(r,30,Challenge.tick);
  assert.equal(r.done,true);
  assert.equal(r.phase,'result');
  assert.equal(r.remaining,0);
});

test('暂停/后台冻结与重新开始时钟不能导致多次结算',()=>{
  const r=Challenge.createChallenge(blade,{seed:13}).run;
  advanceArenaClock(r,2,Challenge.tick);
  Challenge.setPaused(r,true);
  const v=r.elapsed;
  advanceArenaClock(r,40,Challenge.tick);
  assert.equal(r.elapsed,v);
  Challenge.setPaused(r,false);
  advanceArenaClock(r,6,Challenge.tick);
  assert.equal(r.phase,'route-choice');
});

test('正式赛同引擎的45秒任务保留实际切割与临时受损，不改永久成刀',()=>{
  const initial=JSON.stringify(blade);
  const r=Challenge.createChallenge(blade,{seed:15,mode:'formal',seconds:45}).run;
  assert.equal(r.total,45);
  assert.equal(r.targets.length,3);
  const target=r.targets.find(t=>t.type==='rope') || r.targets[0];
  Challenge.beginSwipe(r);
  const z=Challenge.swipe(r,{x:target.x-.15,y:target.y},{x:target.x+.15,y:target.y},{duration:0.15});
  assert.ok(z.ok);
  assert.ok(z.hits.length>0);
  Challenge.finish(r,'time');
  const p=formalCutPayload(r);
  assert.ok(p);
  assert.equal(p.detail.source,'arenaChallenge');
  assert.equal(p.detail.duration,45);
  assert.ok(p.measure>=0 && p.measure<=1);
  assert.ok(p.temporaryDamage>=0 && p.temporaryDamage<=1);
  assert.equal(JSON.stringify(blade),initial);
  const empty=Challenge.createChallenge(blade,{seed:14,mode:'formal',seconds:45}).run;
  Challenge.finish(empty,'time');
  assert.equal(formalCutPayload(empty).measure,0,'不滑切必须是0操作分');
});
