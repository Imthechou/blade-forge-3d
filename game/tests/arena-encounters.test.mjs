import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, createChallenge, restartChallenge, beginSwipe, swipe, tick, chooseRoute, chooseFinale } from '../src/core/arenaChallenge.js';
import { createEncounter, phaseMaterialPool, MATERIAL_ORDER, PHASES } from '../src/core/arenaEncounters.js';
import { advanceArenaClock } from '../src/core/arenaCutBridge.js';

const blade={
  id:'level-probe-knife',bladeName:'关卡用刀',knifeTypeId:'tang',score:300,
  canEnterArena:true,fractured:false,tags:{},combos:[],traits:[],
  stats:{strength:100,toughness:100,sharpness:100,craft:100,design:100,spirit:100},
};
const tournament=[
  {tier:'school',gradient:0},{tier:'school',gradient:1},{tier:'school',gradient:2},
  {tier:'school',gradient:3},{tier:'school',gradient:4},
  ...Array.from({length:5},(_,round)=>({tier:'national',round})),
  ...Array.from({length:3},(_,round)=>({tier:'apex',round})),
];
function play(config,seed=1) {
  const result=createChallenge(blade,{mode:'formal',seconds:45,seed,encounter:config});
  assert.ok(result.ok);
  const run=result.run;
  const targets=[...run.targets];
  advanceArenaClock(run,8.1,tick);
  assert.equal(run.phase,'route-choice');
  assert.ok(chooseRoute(run,'mixed').ok);
  advanceArenaClock(run,15,tick);
  assert.equal(run.phase,'speed');
  advanceArenaClock(run,7,tick);
  assert.equal(run.phase,'finale-choice');
  assert.ok(chooseFinale(run,'rush').ok);
  advanceArenaClock(run,15.1,tick);
  assert.equal(run.done,true);
  assert.equal(run.remaining,0);
  return {run,targets};
}
test('所有赛事难度按顺序增加投放数量，不改变六种靶子固有强度',()=>{
  const before=JSON.stringify(MATERIALS);
  let lastTotal=0,lastRank=-1;
  for(const spec of tournament) {
    const config=createEncounter(spec);
    assert.ok(config.rank>lastRank);
    const quota=PHASES.reduce((n,phase)=>n+config.stages[phase].quota,0);
    assert.ok(quota>=lastTotal,JSON.stringify(spec)+' quota '+quota);
    lastTotal=quota;lastRank=config.rank;
    const {run}=play(spec,178);
    const counted=PHASES.reduce((n,phase)=>n+run.encounterHistory[phase].spawned,0);
    assert.ok(counted>25,'赛事投放量不能接近空场');
    assert.ok(counted<=quota,'实际生成数不得超过阶段预算');
    for(const phase of PHASES) {
      const h=run.encounterHistory[phase],s=config.stages[phase];
      assert.ok(h.spawned>=1,JSON.stringify(spec)+' '+phase+' 无靶具');
      assert.ok(h.spawned<=s.quota,JSON.stringify(spec)+' '+phase+' 超出计划投放数');
      assert.equal(h.spawned,Object.values(h.materials).reduce((a,b)=>a+b,0));
      for(const type of Object.keys(h.materials)) {
        assert.ok(MATERIALS[type],type);
        assert.ok(phaseMaterialPool(config,phase,phase==='route'?'mixed':null,phase==='finale'?'rush':null).includes(type),
          `${JSON.stringify(spec)} ${phase} 错误材料 ${type}`);
      }
    }
    assert.ok(run.targets.every(t=>t.difficulty===1),'单靶强度倍率不得随赛级上升');
    assert.ok(run.targets.every(t=>t.armorLeft===MATERIALS[t.type].armor*.6),'每个材料的破甲值必须恒定');
  }
  assert.equal(JSON.stringify(MATERIALS),before,'任何赛事不能修改材质本体');
});
test('低阶赛先出软靶，冰块和金属延迟，高阶赛则逐阶段开放全部六种',()=>{
  const low=createEncounter({tier:'school',gradient:0});
  assert.deepEqual(phaseMaterialPool(low,'warmup'),['foam','rope']);
  assert.ok(!phaseMaterialPool(low,'finale',null,'rush').includes('metal'));
  assert.ok(!phaseMaterialPool(low,'finale',null,'rush').includes('ice'));
  const mid=createEncounter({tier:'school',gradient:2});
  assert.ok(phaseMaterialPool(mid,'finale',null,'rush').includes('metal'));
  const elite=createEncounter({tier:'apex',round:2});
  assert.ok(phaseMaterialPool(elite,'route','mixed').includes('metal'));
  assert.ok(phaseMaterialPool(elite,'finale',null,'rush').includes('ice'));
  assert.deepEqual(MATERIAL_ORDER,['foam','rope','wood','plastic','ice','metal']);
});
test('正式赛选择软/硬路线只改变靶具名单，不改变硬度；重开继承赛级',()=>{
  const encounter={tier:'national',round:4};
  const a=createEncounter(encounter);
  const soft=phaseMaterialPool(a,'route','soft');
  const hard=phaseMaterialPool(a,'route','hard');
  assert.ok(soft.includes('rope'));
  assert.ok(hard.includes('metal'));
  const created=createChallenge(blade,{mode:'formal',seconds:45,seed:36,encounter});
  assert.ok(created.ok);
  const run=created.run;
  advanceArenaClock(run,8.01,tick);
  assert.ok(chooseRoute(run,'hard').ok);
  const old=JSON.stringify(run.encounter);
  const rerun=restartChallenge(run);
  assert.ok(rerun.ok);
  assert.equal(JSON.stringify(rerun.run.encounter),old);
});

test('同一种靶具面对同一把刀，在学徒/巅峰赛的破甲、进度与刀损完全一致',()=>{
  for(const type of MATERIAL_ORDER) {
    const lo=createChallenge(blade,{mode:'formal',seconds:45,seed:17,encounter:{tier:'school',gradient:0}}).run;
    const hi=createChallenge(blade,{mode:'formal',seconds:45,seed:17,encounter:{tier:'apex',round:2}}).run;
    for(const r of [lo,hi]) {
      r.targets=[{...r.targets[0],id:'comparison',type,armorLeft:MATERIALS[type].armor*.6,
        progress:0,alive:true,difficulty:1,cuts:[],layer:0}];
      beginSwipe(r);
      const hit=swipe(r,{x:r.targets[0].x-.15,y:r.targets[0].y},
        {x:r.targets[0].x+.15,y:r.targets[0].y},{duration:.17});
      assert.ok(hit.ok && hit.hits.length>0,type);
    }
    assert.equal(hi.targets[0].armorLeft,lo.targets[0].armorLeft,type+' 护甲被赛事等级修改');
    assert.equal(hi.targets[0].progress,lo.targets[0].progress,type+' 切入效率被赛事等级修改');
    assert.equal(hi.health,lo.health,type+' 单靶反作用损伤被赛事等级修改');
  }
});
