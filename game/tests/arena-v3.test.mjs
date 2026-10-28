import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../src/core/arenaChallenge.js';
import * as F from '../src/core/arenaFormal.js';
import {BUFFS,BUFF_BY_ID,rollBuffChoices,resonanceOf} from '../src/data/arena/buffs.js';
import {deriveCutParamsForBlade} from '../src/core/cutParams.js';
import {formalCutPayload} from '../src/core/arenaCutBridge.js';
import {makeQuickRecords,normalizeQuickRecords,updateQuickRecord} from '../src/core/quickChallengeRecords.js';
import {materialSample,sampleBlade,simulateMatch} from '../tools/arena-v3-simulate.mjs';
function run(buffs=[],mean=100){return C.createChallenge(sampleBlade(mean),{mode:'formal',seed:42,buffs,augments:false}).run;}
function target(type='metal',patch={}){return {id:'t',type,x:.5,y:.5,progress:0,armorLeft:C.MATERIALS[type].armor*.6,alive:true,cuts:[],variation:.03,...patch};}
function hit(r,t,angle=C.MATERIALS[t.type].angle){r.targets=[t];C.beginSwipe(r);return C.swipe(r,{x:t.x-Math.cos(angle)*.2,y:t.y-Math.sin(angle)*.2},{x:t.x+Math.cos(angle)*.2,y:t.y+Math.sin(angle)*.2},{duration:.18});}
const payload=score=>({measure:1,detail:{source:'arenaChallenge',score,duration:45}});

test('400 个固定手势校准：60 泡棉 45–55% 首刀断；100/150 ≥95/99%，金属刀数与刀损显著分层',()=>{
  const f=materialSample(60,'foam');assert.ok(f.firstCutRate>=.45&&f.firstCutRate<=.55,JSON.stringify(f));
  assert.ok(materialSample(100,'foam').firstCutRate>=.95);
  assert.ok(materialSample(150,'foam').firstCutRate>=.99);
  const samples=[60,100,150].map(v=>materialSample(v,'metal'));
  assert.ok(samples[0].cuts>=12&&samples[0].cuts<=16);
  assert.ok(samples[1].cuts>=5&&samples[1].cuts<=7);
  assert.ok(samples[2].cuts>=2&&samples[2].cuts<=3);
  assert.ok(samples[0].wear>=50&&samples[0].wear<=75);
  assert.ok(samples[1].wear>=11&&samples[1].wear<=19);
  assert.ok(samples[2].wear>=2&&samples[2].wear<=4);
  for(const v of [0,30,200])assert.equal(materialSample(v,'foam',40).samples,40);
});
test('偏科刀：锋利决定软靶，强度参与破甲，韧性只改变承载，不偷偷修改永久属性',()=>{
  const sharp=materialSample(100,'foam',100,{strength:30,sharpness:150});
  const blunt=materialSample(100,'foam',100,{strength:150,sharpness:30});
  assert.ok(sharp.cuts<blunt.cuts);
  assert.ok(materialSample(100,'metal',100,{strength:150}).cuts<materialSample(100,'metal',100,{strength:60}).cuts);
  assert.ok(materialSample(100,'metal',100,{toughness:150}).wear<materialSample(100,'metal',100,{toughness:60}).wear);
  const blade=sampleBlade(200),before=JSON.stringify(blade);
  C.createChallenge(blade);deriveCutParamsForBlade(blade);assert.equal(JSON.stringify(blade),before);
});
test('同一次按压反向补刀；原地抖动、时间未到或短路径不重复伤害，单划连击不重置',()=>{
  const r=run(),t=target();r.targets=[t];C.beginSwipe(r);
  const a={x:.3,y:.5},b={x:.7,y:.5};
  assert.equal(C.swipe(r,a,b).hits.length,1);const progress=t.progress,armor=t.armorLeft;
  assert.equal(C.swipe(r,b,a).hits.length,0);
  assert.equal(t.progress,progress);assert.equal(t.armorLeft,armor);
  assert.equal(C.swipe(r,{x:.499,y:.5},{x:.51,y:.5}).hits.length,0);
  C.tick(r,.2);
  assert.equal(C.swipe(r,b,a).hits.length,1);
});
test('清场后 0.15 秒开始补位，不受阶段投放预算耗尽限制；目标 ID 永不复用',()=>{
  const r=run([],150);const ids=new Set();
  for(let batch=0;batch<30;batch++) {
    for(const t of r.targets.filter(t=>t.alive)) {assert.ok(!ids.has(t.id));ids.add(t.id);hit(r,t);}
    r.targets=[];r.nextSpawnAt=Infinity;r.stageSpawned=9999;r.refillAt=r.elapsed+.15;
    C.tick(r,.1);assert.equal(r.targets.length,0);
    C.tick(r,.1);assert.ok(r.targets.some(t=>t.alive));
  }
  assert.equal(r.metrics.emptySeconds<=6.1,true);assert.ok(r.metrics.maxEmptyGap<=.201);
});
test('36 张强化各有真实参数，1000 次抽取均为同品质三张且不重复；五种共鸣可达',()=>{
  assert.equal(BUFFS.length,36);assert.equal(new Set(BUFFS.map(b=>b.id)).size,36);
  let seed=1;const rng=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
  const seen=new Set();
  for(let n=0;n<1000;n++) {
    const picks=rollBuffChoices(rng);
    assert.equal(picks.length,3);assert.equal(new Set(picks).size,3);
    assert.equal(new Set(picks.map(id=>BUFF_BY_ID[id].tier)).size,1);
    picks.forEach(id=>seen.add(id));
  }
  assert.equal(seen.size,36);
  for(const b of BUFFS) {
    const base=deriveCutParamsForBlade(sampleBlade(100)),modified=deriveCutParamsForBlade(sampleBlade(100),[b.id]);
    assert.notEqual(JSON.stringify(base),JSON.stringify(modified),b.id+' 没有参数效果');
  }
  assert.deepEqual(resonanceOf(['bloodgroove','chainmult','weakmap','weakfinish','layerbreak','cladsteel','crackrelay','glacier','bloodblade','tempering']).sort(),['armor','combo','crack','precise','risk']);
});
test('破甲悬赏只发一次、碎甲连斩生效、铁匠防护封顶、首次致命伤保命',()=>{
  const r=run(['armorbounty','armorchain','smithsoul']),t=target('wood');hit(r,t);
  assert.equal(r.armorBreaks,1);assert.ok(r.score>=45);assert.ok(r.nextBoostUntil>r.elapsed);assert.equal(r.shield,1);
  const old=r.armorBreaks;r.elapsed+=.2;hit(r,t);assert.equal(r.armorBreaks,old);
  const survive=run(['unbroken'],60),heavy=target();survive.health=1;
  hit(survive,heavy);assert.equal(survive.deathSaveUsed,true);assert.ok(survive.health>0);assert.equal(survive.done,false);
  survive.health=1;survive.elapsed+=.2;hit(survive,heavy);assert.equal(survive.done,true);assert.equal(survive.result.reason,'fracture');
});
test('精准弱点、标记终结、定向刀势、冰纹刀路改变实际切割结果',()=>{
  const a=run([],150),b=run(['weakfinish','markedhunt'],150);
  hit(a,target('foam'));hit(b,target('foam',{markedUntil:3}));assert.ok(b.score-a.score>=160);
  const plain=run([],60),mapped=run(['weakmap'],60);const x=target('foam'),y=target('foam');hit(plain,x);hit(mapped,y);assert.ok(y.progress>=x.progress);
  const d=run(['direction'],60);for(let i=0;i<4;i++){d.elapsed+=.2;hit(d,target('wood',{id:'d'+i}));}assert.equal(d.directionCount,3);
  const normal=run(),crack=run(['iceedge']);const ice=target('ice'),bonusIce=target('ice');hit(normal,ice);hit(crack,bonusIce);assert.ok(bonusIce.progress>ice.progress);
});
test('贯穿、裂纹传导、冰河连锁和剑气有真实次级伤害；不制造精准与连击，最多 3 个',()=>{
  for(const id of ['piercing','crackrelay','glacier','myriad']) {
    const r=run([id],150),primary=target(id==='crackrelay'||id==='glacier'?'ice':'foam',{id:'primary',x:.2,y:.5,progress:.98,armorLeft:0,cuts:id==='crackrelay'?[{angle:0,y:0}]:[]});
    const others=Array.from({length:5},(_,i)=>target('foam',{id:'n'+i,x:.34+i*.065,y:.5,progress:.95,armorLeft:0}));
    r.targets=[primary,...others];C.beginSwipe(r);if(id==='myriad')r.gestureKills=2;
    const angle=id==='crackrelay'?1.1:C.MATERIALS[primary.type].angle;
    const result=C.swipe(r,{x:.05,y:.5},{x:.28,y:.5},{angle});
    assert.ok(result.hits.some(h=>h.secondary),id+' 没有次级伤害');
    assert.ok(r.secondaryKills<=3,id);assert.ok(r.secondaryScore<=3*50*.35+3,id);
    assert.ok(r.gestureKills<=3,id+' 次级击破制造连击');
    assert.equal(r.perfects,1,id+' 次级击破制造精准');
  }
});
test('满贯需达目标且零漏切；匠魂只随本局目标增益；无我与狂热必破真实生效',()=>{
  const no=run(['grandslam']);no.score=100;C.finish(no);assert.equal(no.score,100);
  const yes=run(['grandslam']);yes.score=2000;C.finish(yes);assert.equal(yes.score,2600);
  const soul=run(['artisansoul'],150);soul.guide={done:false,reward:10,slots:[0]};hit(soul,target('foam',{slot:0}));assert.equal(soul.objectiveBonus,.08);
  const frenzy=run(['noself','quenchheat'],150);frenzy.frenzyUntil=3;const t=target();hit(frenzy,t);assert.equal(t.alive,false);assert.ok(frenzy.damage>0);assert.equal(frenzy.params.frenzyMult,2);
});
test('45 秒模拟有连续目标；低刀硬切会失效，高刀硬靶策略收益更高',()=>{
  for(const mean of [60,100,150]) {
    const soft=simulateMatch(mean,{seed:187,strategy:'soft',encounter:{tier:'national',round:4}});
    assert.equal(soft.metrics.emptySeconds,0);
    assert.ok(soft.choicesMade<=3);
  }
  const low=simulateMatch(60,{seed:187,strategy:'hard'}),high=simulateMatch(150,{seed:187,strategy:'hard'});
  assert.ok(low.fractured);assert.equal(high.reason,'time');assert.ok(high.score>low.score*3);
});
test('正式赛只消费真实切割分，不再重复乘刀具能力；无操作零分、刀况耗尽判负',()=>{
  for(const mean of [60,150]) {
    const m=F.createFormalMatch({blade:sampleBlade(mean),styleId:'edge'}).match;
    assert.equal(F.submitTest(m,{measure:1}).ok,false);
    F.submitTest(m,payload(3600));assert.equal(m.result.composite,3600);assert.equal(m.done,true);
  }
  const m=F.createFormalMatch({blade:sampleBlade(150)}).match;
  const r=run();r.health=0;r.score=50000;C.finish(r,'wearout');F.submitTest(m,formalCutPayload(r));assert.equal(m.result.win,false);assert.equal(m.result.composite,50000,'失效保留真实过程分，但不能赢下比赛');
});
test('全国五轮不同风格且不累积强化；失败/放弃不毁刀，三刀巅峰严格轮换并正常结算',()=>{
  const blade=sampleBlade(150),before=JSON.stringify(blade),n=F.createNationalMatch({blade,seed:15}).match;
  for(let i=0;i<5;i++) {
    assert.ok(F.nationalStartRound(n,[blade]).ok);
    const round=F.nationalCurrentRound(n);
    assert.equal(round.roundMatch.definition.tests.length,1);
    assert.equal(round.roundMatch.round,i);
    assert.ok(F.nationalSubmit(n,payload(100000)).ok);
  }
  assert.equal(n.result.champion,true);assert.equal(n.result.bladeDestroyed,false);
  const lost=F.createNationalMatch({blade}).match;F.nationalStartRound(lost,[blade]);F.nationalSubmit(lost,payload(0));assert.equal(lost.result.reason,'eliminated');
  const abandoned=F.createNationalMatch({blade}).match;F.nationalAbandon(abandoned);assert.equal(abandoned.result.reason,'abandoned');
  const blades=[blade,{...sampleBlade(150),id:'b'},{...sampleBlade(150),id:'c'}],a=F.createApexMatch({blades}).match;
  assert.equal(F.apexDispatch(a,[{...blade,id:'outside'}],'outside').ok,false);
  for(const b of blades) {
    assert.ok(F.apexDispatch(a,blades,b.id).ok);
    assert.ok(F.apexSubmit(a,payload(100000)).ok);
    if(!a.done)assert.equal(F.apexDispatch(a,blades,b.id).ok,false);
  }
  assert.equal(a.result.wins,3);assert.equal(a.result.win,true);assert.equal(a.result.composite,300000);
  assert.equal(JSON.stringify(blade),before);
});
test('新快赛纪录独立版本分组，旧纪录与未知存档内容保留',()=>{
  const records=normalizeQuickRecords({byChallenge:{'quick:free':{bestScore:99999}}});
  const r=C.createChallenge(sampleBlade(150),{augments:false}).run;r.elapsed=45;r.score=100;C.finish(r);
  assert.equal(updateQuickRecord(records,r),true);
  assert.equal(records.byChallenge['quick:free'].bestScore,99999);
  assert.equal(records.byChallenge['quick:v3:free'].bestScore,100);
  assert.equal(normalizeQuickRecords(records).byChallenge['quick:v3:free'].bestScore,100);
});


test('中心刀路分成高频 PointerEvent 后不因前缘先接触而降低切割质量',()=>{
  const a=run([],60),b=run([],60),ta=target('foam'),tb=target('foam');
  a.targets=[ta];b.targets=[tb];C.beginSwipe(a);C.beginSwipe(b);
  const angle=C.MATERIALS.foam.angle,pt=d=>({x:.5+Math.cos(angle)*d,y:.5+Math.sin(angle)*d});
  C.swipe(a,pt(-.13),pt(.13),{duration:.18});
  for(let i=0;i<10;i++)C.swipe(b,pt(-.13+i*.026),pt(-.13+(i+1)*.026),{duration:.018});
  assert.equal(tb.alive,ta.alive);assert.equal(tb.progress,ta.progress);assert.equal(b.weakHits,a.weakHits);assert.equal(b.perfects,a.perfects);
});
