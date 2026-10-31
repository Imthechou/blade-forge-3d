import test from 'node:test';
import assert from 'node:assert/strict';
import { cutImpact,impactMotion,targetPose,impactForTarget,contactFilingsCount,IMPACT_PRESETS } from '../src/ui/arenaImpact.js';
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
    assert.ok(config.particleCount>=0 && config.particleCount<=5,'V4.1 普通命中不再喷礼花');
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

test('idle presentation stays bounded, reproducible and independent of target physics',()=>{
  for(const type of Object.keys(IMPACT_PRESETS)){
    const target={id:'prop-'+type,type,x:.3,y:.5,createdAt:2,progress:.4,armorLeft:.2};
    const original=JSON.stringify(target);
    for(let i=0;i<180;i++){
      const pose=targetPose(target,i*16,i/180,false);
      assert.ok(Math.abs(pose.angle)<.08,type);
      assert.ok(Math.abs(pose.x)<1&&Math.abs(pose.y)<1,type+' cannot shift visual hit center');
      assert.ok(pose.scaleX>.90&&pose.scaleX<1.10);
      assert.ok(pose.scaleY>.88&&pose.scaleY<1.12);
      assert.deepEqual(targetPose(target,i*16,i/180,false),pose);
    }
    assert.equal(JSON.stringify(target),original);
    assert.deepEqual(targetPose(target,1234,.01,true),{angle:0,x:0,y:0,scaleX:1,scaleY:1});
  }
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

test('命中后靶具继续移动时按稳定ID追踪受力，不能误弹同材质另一靶',()=>{
  const initial={targetId:'target-42',type:'metal',x:.3,y:.5,at:1000,holdMs:40,recoilPx:4};
  const latest={...initial,at:1050};
  const bursts=[initial,latest];
  const moved={id:'target-42',type:'metal',x:.42,y:.66};
  const neighbour={id:'target-43',type:'metal',x:.3,y:.5};
  const before=JSON.stringify({bursts,moved,neighbour});
  assert.equal(impactForTarget(bursts,moved,1090),latest,'移动靶仍产生同一命中的回弹');
  assert.equal(impactForTarget(bursts,neighbour,1090),null,'同材质同旧坐标不是同一靶');
  assert.equal(impactForTarget(bursts,moved,1040),initial,'未来接触不能提前显示');
  assert.equal(impactForTarget(bursts,moved,1275),null,'短反馈应按时间退场');
  assert.equal(impactForTarget(bursts,moved,NaN),null);
  const old={type:'wood',x:.2,y:.4,at:1000};
  assert.equal(impactForTarget([old],{type:'wood',x:.2,y:.4},1100),old,'兼容旧位置事件');
  assert.equal(JSON.stringify({bursts,moved,neighbour}),before,'纯视觉关联不能改业务实体');
});

test('金属/冰晶接触闪屑遵守短暂次级粒子预算，阻挡不伪装成击断',()=>{
  assert.equal(contactFilingsCount('metal',true,'kill'),4);
  assert.equal(contactFilingsCount('metal',false,'cut'),1);
  assert.equal(contactFilingsCount('ice',true,'kill'),3);
  assert.equal(contactFilingsCount('ice',false,'armor'),1);
  assert.equal(contactFilingsCount('wood',false,'cut'),0);
  for(const type of Object.keys(IMPACT_PRESETS))for(const event of ['blocked','deflect','avoid-hit','avoid-ignored'])
    assert.equal(contactFilingsCount(type,false,event),0);
});
