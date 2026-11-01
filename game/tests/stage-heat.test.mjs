import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HEAT_COLORS, STAGE_HEAT, canCarryHeat, heatForStage, heatStateFor,
} from '../src/render/stageHeat.js';

test('B1: furnace models carry heat; blades only glow while quenching',()=>{
  for(const m of ['ore_small','molten_sphere_small','blank_ingot_small']){
    assert.equal(canCarryHeat(m),true,m+' should be heatable');
    assert.equal(canCarryHeat(m,'S7'),true,m+' st+ays heatable by model');
  }
  /* ★ 淬火是把通红刀身插入冷却液：S5 的刀身必须可以炽热。 */
  assert.equal(canCarryHeat('knife_straight','S5'),true,'a blade must glow while quenching');
  /* 其余阶段的刀身一律冷钢，绝不变成发光棒。 */
  for(const stage of ['S1','S2','S3','S4','S6','S7','S8','S9','S10']){
    assert.equal(canCarryHeat('knife_straight',stage),false,stage+' blade must stay cold');
  }
  assert.equal(canCarryHeat('knife_straight'),false,'blades are cold without a stage context');
  assert.equal(canCarryHeat(''),false);
  assert.equal(canCarryHeat('Unknown'),false);
});

test('B1: every stage has an explicit recipe; unknown stages fall back to cold',()=>{
  for(const id of ['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10']){
    const r=heatForStage(id);
    assert.ok(r && typeof r.intensity==='number', id+' must have a recipe');
    assert.ok(HEAT_COLORS[r.color]!==undefined, id+' must reference a real heat colour');
  }
  const unknown=heatForStage('S99');
  assert.equal(unknown.intensity,0,'unknown stage must not glow');
  assert.equal(unknown.heat,'cold');
});

test('B1: melting is hottest, quenching keeps a red-hot blade, then everything cools',()=>{
  assert.ok(STAGE_HEAT.S2.intensity>0.4,'molten must be clearly visible');
  assert.ok(STAGE_HEAT.S2.intensity>STAGE_HEAT.S3.intensity,'S2 hotter than S3');
  assert.ok(STAGE_HEAT.S3.intensity>STAGE_HEAT.S4.intensity,'S3 hotter than S4');
  /* ★ 淬火时刀身入液仍然通红：强度必须明显，否则淬火毫无表现。 */
  assert.ok(STAGE_HEAT.S5.intensity>=0.35,'quenching must show a red-hot blade');
  assert.equal(STAGE_HEAT.S5.color,'red','quenching is red heat, not warm grey');
  /* 回火之后是常温：表面氧化色不是自发光。 */
  for(const id of ['S6','S7','S8','S9','S10']){
    assert.equal(STAGE_HEAT[id].intensity,0,id+' must not self-illuminate');
  }
  assert.equal(STAGE_HEAT.S2.heat,'molten');
  assert.equal(STAGE_HEAT.S5.heat,'quenching');
  assert.equal(STAGE_HEAT.S6.heat,'tempering');
});

test('B1: heat is only applied to a heatable model on a hot stage',()=>{
  const molten=heatStateFor({stageId:'S2',modelId:'molten_sphere_small'});
  assert.equal(molten.apply,true);
  assert.equal(molten.colorHex,HEAT_COLORS.orange);
  assert.ok(molten.intensity>0.4&&molten.intensity<=1);

  const quench=heatStateFor({stageId:'S5',modelId:'knife_straight'});
  assert.equal(quench.apply,true,'the blade must glow while quenching');
  assert.equal(quench.colorHex,HEAT_COLORS.red);
  assert.ok(quench.intensity>=0.35);

  const coldStage=heatStateFor({stageId:'S7',modelId:'molten_sphere_small'});
  assert.equal(coldStage.apply,false,'S7 must not glow even on a heatable model');
  assert.equal(coldStage.intensity,0);

  const bladeAfterQuench=heatStateFor({stageId:'S6',modelId:'knife_straight'});
  assert.equal(bladeAfterQuench.apply,false,'a blade must be cold steel after quenching');
});

test('B1: intensity stays bounded and pulse is deterministic per time',()=>{
  for(let t=0;t<6000;t+=137){
    const s=heatStateFor({stageId:'S2',modelId:'molten_sphere_small',timeMs:t});
    assert.ok(s.intensity>0,'pulse must never go dark');
    assert.ok(s.intensity<=1,'pulse must never exceed 1');
  }
  const a=heatStateFor({stageId:'S2',modelId:'molten_sphere_small',timeMs:1234});
  const b=heatStateFor({stageId:'S2',modelId:'molten_sphere_small',timeMs:1234});
  assert.deepEqual(a,b,'same time must give the same result');
  const samples=new Set();
  for(let t=0;t<2400;t+=200){
    samples.add(heatStateFor({stageId:'S2',modelId:'molten_sphere_small',timeMs:t}).intensity);
  }
  assert.ok(samples.size>3,'molten heat should breathe over time');
});

test('B1: reduced motion keeps a steady, non-pulsing temperature',()=>{
  const a=heatStateFor({stageId:'S2',modelId:'molten_sphere_small',reducedMotion:true,timeMs:0});
  const b=heatStateFor({stageId:'S2',modelId:'molten_sphere_small',reducedMotion:true,timeMs:1800});
  assert.equal(a.intensity,b.intensity,'reduced motion must not pulse');
  assert.ok(a.intensity>0.4,'reduced motion still shows the heat');
});

test('B1: heat recipes are immutable data (no accidental mutation)',()=>{
  const snapshot=JSON.stringify({HEAT_COLORS,STAGE_HEAT});
  const s=heatStateFor({stageId:'S2',modelId:'molten_sphere_small',timeMs:900});
  s.intensity=0.99;
  assert.equal(JSON.stringify({HEAT_COLORS,STAGE_HEAT}),snapshot,
    'returning a heat state must never mutate the shared recipe tables');
  assert.equal(STAGE_HEAT.S2.intensity,0.62);
});
