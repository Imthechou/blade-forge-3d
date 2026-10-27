import test from 'node:test';
import assert from 'node:assert/strict';
import { cutImpact,impactMotion,IMPACT_PRESETS } from '../src/ui/arenaImpact.js';
import { MATERIALS } from '../src/core/arenaChallenge.js';

test('6种固定靶具都拥有轻重区分的冲击预设，且不污染材料物理参数',()=>{
  const types=['foam','rope','wood','plastic','ice','metal'];
  const materials=JSON.stringify(MATERIALS);
  let last=0;
  for(const type of types) {
    const config=cutImpact({target:{type},complete:true,angle:.5,quality:'PERFECT',contactEvent:'kill'});
    assert.ok(config.weight>last,type+' 错误重量等级');
    assert.ok(config.holdMs>0 && config.holdMs<85,'短顿帧应小于85ms');
    assert.ok(config.shakePx>=0 && config.shakePx<=4.0);
    assert.ok(config.particleCount>=2 && config.particleCount<=16);
    assert.ok(config.hapticMs>=4 && config.hapticMs<=28);
    assert.ok(Object.hasOwn(IMPACT_PRESETS,type));
    const mid=impactMotion({...config,at:1000},1000+config.holdMs*.5);
    assert.ok(mid?.compress>=.99,'视觉定格不阻塞输入');
    const after=impactMotion({...config,at:1000},1000+config.holdMs+155);
    assert.equal(after,null,'冲击必须迅速退场');
    last=config.weight;
    const reduced=cutImpact({target:{type},complete:true},{reducedMotion:true});
    assert.equal(reduced.holdMs,0);
    assert.equal(reduced.shakePx,0);
    assert.equal(reduced.particleCount,0);
  }
  assert.equal(JSON.stringify(MATERIALS),materials);
});
test('未切断、破甲、弹开仍有区别；输入没有行为状态与计时副作用',()=>{
  for(const event of ['blocked','deflect','armor','cut','kill']) {
    const hit={type:'metal',quality:event==='deflect'?'ANGLE':'CLEAN',
      contactEvent:event,complete:event==='kill',angle:Math.PI/3};
    const old=JSON.stringify(hit);
    const effect=cutImpact(hit);
    assert.equal(JSON.stringify(hit),old);
    assert.equal(effect.event,event);
    assert.ok(effect.shakePx>=0);
    assert.equal(impactMotion({...effect,at:12345},12340),null);
  }
});
