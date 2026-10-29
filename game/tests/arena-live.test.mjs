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
      if(id==='cutting') { assert.ok(task.sequence?.length>=6, '切割题目不能为空'); assert.equal(task.rule.seconds,45); }
      const submitted = Formal.submitTest(match,{measure:.78,detail:{source:'arenaChallenge',score:3000,duration:45}});
      assert.ok(submitted.ok, id+' 分项结算失败');
    }
    assert.ok(match.done);
    assert.equal(match.result.projectScores.length, def.tests.length);
  }
});

test('V4.1 有效时钟不被随机强化中断，暂停时逻辑时间停止',()=>{
  const r=Challenge.createChallenge(blade,{seed:12}).run;
  assert.equal(r.phase,'warmup');
  assert.equal(r.augments,false);
  assert.deepEqual(r.offers,[]);
  advanceArenaClock(r,12,Challenge.tick);
  assert.equal(r.elapsed,12);
  Challenge.setPaused(r,true);
  const freeze=JSON.stringify([r.elapsed,r.health,r.targets]);
  advanceArenaClock(r,40,Challenge.tick);
  assert.equal(JSON.stringify([r.elapsed,r.health,r.targets]),freeze);
  Challenge.setPaused(r,false);
  advanceArenaClock(r,40,Challenge.tick);
  assert.equal(r.elapsed,45);assert.equal(r.remaining,0);
  assert.equal(r.done,true);assert.equal(r.choicesMade,0);
  assert.equal(Challenge.finish(r),r.result);
});

test('正式赛同引擎的45秒任务保留实际切割与临时受损，不改永久成刀',()=>{
  const initial=JSON.stringify(blade);
  const r=Challenge.createChallenge(blade,{seed:15,mode:'formal',seconds:45,augments:false}).run;
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
  const empty=Challenge.createChallenge(blade,{seed:14,mode:'formal',seconds:45,augments:false}).run;
  Challenge.finish(empty,'time');
  assert.equal(formalCutPayload(empty).measure,0,'不滑切必须是0操作分');
});
