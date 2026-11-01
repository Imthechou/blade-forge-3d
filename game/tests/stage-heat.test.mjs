import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HEAT_COLORS, STAGE_HEAT, canCarryHeat, heatForStage, heatStateFor,
} from '../src/render/stageHeat.js';

test('B1: only furnace models can carry heat, blades never glow',()=>{
  for(const m of ['ore_small','molten_sphere_small','blank_ingot_small']){
    assert.equal(canCarryHeat(m),true,m+' should be heatable');
  }
  for(const m of ['knife_straight','knife_tangdao','knife_karambit','','Unknown']){
    assert.equal(canCarryHeat(m),false,JSON.stringify(m)+' must never glow');
  }
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

test('B1: melting is the hottest stage and later stages cool down',()=>{
  assert.ok(STAGE_HEAT.S2.intensity>0.4,'molten must be clearly visible');
  assert.ok(STAGE_HEAT.S2.intensity>STAGE_HEAT.S3.intensity,'S2 hotter than S3');
  assert.ok(STAGE_HEAT.S3.intensity>STAGE_HEAT.S4.intensity,'S3 hotter than S4');
  assert.ok(STAGE_HEAT.S4.intensity>STAGE_HEAT.S5.intensity,'S4 hotter than S5');
  /* 回火之后是常温：表面氧化色不是自发光。 */
  for(const id of ['S6','S7','S8','S9','S10']){
    assert.equal(STAGE_HEAT[id].intensity,0,id+' must not self-illuminate');
  }
  /* 熔炼的温度语义必须写对，避免把 S2 当淬火。 */
  assert.equal(STAGE_HEAT.S2.heat,'molten');
  assert.equal(STAGE_HEAT.S5.heat,'quenching');
  assert.equal(STAGE_HEAT.S6.heat,'tempering');
});

test('B1: heat is only applied to a heatable model on a hot stage',()=>{
  const molten=heatStateFor({stageId:'S2',modelId:'molten_sphere_small'});
  assert.equal(molten.apply,true);
  assert.equal(molten.colorHex,HEAT_COLORS.orange);
  assert.ok(molten.intensity>0.4&&molten.intensity<=1);

  const coldStage=heatStateFor({stageId:'S7',modelId:'molten_sphere_small'});
  assert.equal(coldStage.apply,false,'S7 must not glow even on a heatable model');
  assert.equal(coldStage.intensity,0);

  const bladeOnHotStage=heatStateFor({stageId:'S2',modelId:'knife_straight'});
  assert.equal(bladeOnHotStage.apply,false,'a blade model must never self-illuminate');
});

test('B1: intensity stays bounded and pulse is deterministic per time',()=>{
  for(let t=0;t<6000;t+=137){
    const s=heatStateFor({stageId:'S2',modelId:'molten_sphere_small',timeMs:t});
    assert.ok(s.intensity>0,'pulse must never go dark');
    assert.ok(s.intensity<=1,'pulse must never exceed 1');
  }
  /* 同一时刻必须给出同一结果（可复现）。 */
  const a=heatStateFor({stageId:'S2',modelId:'molten_sphere_small',timeMs:1234});
  const b=heatStateFor({stageId:'S2',modelId:'molten_sphere_small',timeMs:1234});
  assert.deepEqual(a,b);
  /* 不同时刻应产生脉动差异（熔液对流），但不剧烈。 */
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
