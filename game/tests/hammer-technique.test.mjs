import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun,confirmCard,hammerStrike} from '../src/core/forge.js';
import {CARDS,BY_STAGE} from '../src/data/cards.js';
import * as Hammer from '../src/core/hammer.js';
import {
  LANDING_ZONES,LANDING_BANDS,SWEET_SPOT_MAX_BONUS,SWEET_SPOT_RADIUS,DIRECTION_WEIGHT,
  normalizeLanding,landingOf,sweetSpotOf,aimScore,blendLandingVector,hammerTechnique,distributeGain,
} from '../src/core/hammerTechnique.js';
import {HAMMER_DIRECTION_VECTORS} from '../src/data/traits.js';
import * as Attr from '../src/core/attributes.js';

const STAT_KEYS=['strength','toughness','sharpness','craft','design','spirit'];
/** 进入 S4 hammer 阶段的确定性 run。 */
function hammerRun(seed=1234){
  const r=createRun({seed,flowVersion:'five-screen-v1'});
  r.rng=()=>.999999;
  return r;
}
/** 推进到 hammer 阶段（五屏：S1→S2→自动S3→S4 选卡后进入 hammer）。 */
function toHammer(seed=1234){
  const r=hammerRun(seed);
  confirmCard(r,r.candidates[0]);
  confirmCard(r,r.candidates[0]);
  assert.equal(r.stageId,'S4','expected S4 after recipe screen');
  if(r.phase==='select')confirmCard(r,r.candidates[0]);
  assert.equal(r.phase,'hammer','expected hammer phase');
  return r;
}

test('A3: every dominant hammer direction produces a distinct, summing-to-one vector',()=>{
  const ids=Object.keys(HAMMER_DIRECTION_VECTORS);
  assert.equal(ids.length,9,'nine hammer directions must stay defined');
  const signatures=new Map();
  for(const id of ids){
    const v=HAMMER_DIRECTION_VECTORS[id];
    const sum=STAT_KEYS.reduce((n,k)=>n+(Number(v[k])||0),0);
    assert.ok(Math.abs(sum-1)<1e-9,id+' direction vector must sum to 1, got '+sum);
    assert.ok(STAT_KEYS.some(k=>(Number(v[k])||0)>0),id+' must allocate at least one stat');
    const sig=STAT_KEYS.map(k=>Math.round((Number(v[k])||0)*100)).join(',');
    assert.ok(!signatures.has(sig),id+' duplicates the allocation of '+signatures.get(sig));
    signatures.set(sig,id);
  }
test('A3: statGainOf distributes a single blow along the real direction vector, not only strength',()=>{
  /* 用同一落点、逐一切换方向：至少 8 种方向把成果分到「非强度」维度上
     —— 这正是改造前 statGainOf 硬编码 {strength:1} 做不到的。 */
  const contact={x:.5,y:.5};
  const zone=landingOf(contact).vector;
  let nonStrength=0;
  const seen=new Set();
  for(const id of Object.keys(HAMMER_DIRECTION_VECTORS)){
    const weight=blendLandingVector(HAMMER_DIRECTION_VECTORS[id],zone).weight;
    const out=Hammer.statGainOf(10,id,weight);
    const total=STAT_KEYS.reduce((n,k)=>n+(out.delta[k]||0),0);
    assert.ok(Math.abs(total-out.total)<.011,id+' must preserve total gain, got '+total+' vs '+out.total);
    if((out.delta.strength||0)<out.total-.001)nonStrength++;
    const sig=STAT_KEYS.map(k=>Math.round((out.delta[k]||0)*100)).join(',');
    assert.ok(!seen.has(sig),id+' must not duplicate another direction allocation');
    seen.add(sig);
  }
  assert.ok(nonStrength>=8,'at least 8 directions must not be strength-only, got '+nonStrength);
  assert.equal(seen.size,9,'all nine directions must be distinguishable');

  /* 无落点的旧兜底路径必须逐字不变。 */
  const legacy=Hammer.statGainOf(10,'edge',null);
  assert.deepEqual(legacy.delta,{strength:10});
  assert.equal(legacy.total,10);
});
  const legacy=Hammer.statGainOf(10,'edge',null);
  assert.deepEqual(legacy.delta,{strength:10});
  assert.equal(legacy.total,10);
});

test('A2: landing zone changes which stats a blow rewards (tip/edge vs root)',()=>{
  const gain=20;
  const weightFor=contact=>blendLandingVector(
    HAMMER_DIRECTION_VECTORS.mixed,landingOf(contact).vector).weight;
  const tip=Hammer.statGainOf(gain,'mixed',weightFor({x:.5,y:.05})).delta;
  const root=Hammer.statGainOf(gain,'mixed',weightFor({x:.5,y:.95})).delta;
  assert.ok((tip.sharpness||0)>(root.sharpness||0),'tip must favour sharpness over root');
  assert.ok((root.toughness||0)>(tip.toughness||0),'root must favour toughness over tip');
  assert.notDeepEqual(tip,root);
  /* 同一落点重复计算必须确定，且总量守恒。 */
  const again=Hammer.statGainOf(gain,'mixed',weightFor({x:.5,y:.05})).delta;
  assert.deepEqual(again,tip);
  const sum=v=>Object.values(v).reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(sum(tip)-gain)<.011);
  assert.ok(Math.abs(sum(root)-gain)<.011);
});

test('A2: aiming at the sweet spot yields a bounded gain bonus, missing yields none',()=>{
  const r=toHammer(4321);
  const spot=sweetSpotOf(r.seed,1);
  const onSpot=hammerTechnique({directionVector:HAMMER_DIRECTION_VECTORS.mixed,contact:spot,seed:r.seed,strikeIndex:1});
  assert.equal(onSpot.active,true);
  assert.ok(onSpot.aim>.99,'hitting the exact sweet spot must score ~1.0');
  assert.ok(Math.abs(onSpot.gainScale-(1+SWEET_SPOT_MAX_BONUS))<1e-9);

  const far={x:spot.x>.5?0:1,y:spot.y>.5?0:1};
  const off=hammerTechnique({directionVector:HAMMER_DIRECTION_VECTORS.mixed,contact:far,seed:r.seed,strikeIndex:1});
  assert.equal(off.gainScale,1,'missing the sweet spot must grant no bonus');

  /* 加成必须有上界，不能靠反复点击无限堆叠。 */
  for(let i=1;i<=40;i++){
    const t=hammerTechnique({directionVector:HAMMER_DIRECTION_VECTORS.mixed,
      contact:sweetSpotOf(r.seed,i),seed:r.seed,strikeIndex:i});
    assert.ok(t.gainScale<=1+SWEET_SPOT_MAX_BONUS+1e-9);
    assert.ok(t.gainScale>=1);
  }
});

test('A2: sweet spot is deterministic per seed and strike, and varies across strikes',()=>{
  const a=sweetSpotOf(77,3),b=sweetSpotOf(77,3),c=sweetSpotOf(77,4),d=sweetSpotOf(78,3);
  assert.deepEqual(a,b,'same seed+strike must be identical (reproducible practice)');
  assert.notDeepEqual(a,c,'consecutive strikes must move the target');
  assert.notDeepEqual(a,d,'different seeds must differ');
  for(let i=1;i<=50;i++){
    const s=sweetSpotOf(9001,i);
    assert.ok(s.x>=0&&s.x<=1&&s.y>=0&&s.y<=1);
  }
  assert.equal(aimScore({x:.5,y:.5},{x:.5,y:.5}),1);
  assert.equal(aimScore({x:0,y:0},{x:1,y:1}),0);
});

test('A2: real hammerStrike persists landing into shapeProfile and rewards the aimed zone',()=>{
  const aimed=toHammer(5150);
  const spot=sweetSpotOf(aimed.seed,1);
  const before=Attr.clone(aimed.stats);
  const hit=hammerStrike(aimed,spot);
  assert.equal(hit.ok,true);
  assert.equal(hit.fractured,false);
  assert.equal(hit.strike.technique.active,true);
  assert.ok(hit.strike.technique.aim>.99);
  assert.equal(hit.strike.technique.zoneName,normalizeLanding(spot).zoneName);
  assert.equal(aimed.shapeProfile.marks.length,1,'a real blow must record a shape mark');
  assert.deepEqual(aimed.shapeProfile.marks[0],{x:Math.round(spot.x*1000)/1000,y:Math.round(spot.y*1000)/1000});
  const gained=STAT_KEYS.reduce((n,k)=>n+((aimed.stats[k]||0)-(before[k]||0)),0);
  assert.ok(gained>0,'an aimed blow must actually raise stats');
  assert.ok(Math.abs(gained-hit.strike.statGain)<.011,'stat delta total must equal reported gain');
});

test('A2: identical seed and strike, different landing, produce different persisted results',()=>{
  const mk=()=>toHammer(2468);
  const a=mk(),b=mk();
  /* 第 1 锤分别砸刀尖与刀根。 */
  hammerStrike(a,{x:.5,y:.05});
  hammerStrike(b,{x:.5,y:.95});
  assert.deepEqual(a.shapeProfile.marks[0],{x:.5,y:.05});
  assert.deepEqual(b.shapeProfile.marks[0],{x:.5,y:.95});
  assert.notDeepEqual(a.stats,b.stats,'landing must change the resulting build');
  assert.equal(a.hammer.count,1);
  assert.equal(b.hammer.count,1);
});

test('A2: preview invariant survives — technique never changes risk or published break chance',()=>{
  const r=toHammer(31415);
  for(let i=1;i<=20;i++){
    const preview=Hammer.previewNextBreakChance(r);
    const riskBefore=r.risk.current;
    const spot=sweetSpotOf(r.seed,i);
    const hit=hammerStrike(r,spot);
    if(hit.fractured)break;
    assert.equal(hit.strike.breakChance,preview,'preview must equal the actual roll at hit '+i);
    /* 风险增量只由 balance 决定，与落点/瞄准无关；Risk 上限 100 属既有钳制。 */
    const expected=Math.min(100,Math.round((riskBefore+Hammer.nextRiskDelta(i-1))*100)/100);
    assert.ok(Math.abs(r.risk.current-expected)<1e-9,
      'risk must follow balance only at hit '+i+': got '+r.risk.current+' expected '+expected);
  }
});

test('A2: blows without a contact keep the legacy numeric path exactly',()=>{
  const legacy=toHammer(8642);
  const hit=hammerStrike(legacy,null);
  assert.equal(hit.strike.technique.active,false);
  assert.equal(hit.strike.technique.gainScale,1);
  assert.equal(hit.strike.statGain,1,'first blow without contact must still grant exactly +1');
  assert.deepEqual(hit.strike.statDelta,{strength:1},'no landing means the legacy strength-only award');
  /* noteHammerShape 对空落点的中心回退是既有行为，这里只确认它没有改变数值路径。 */
  assert.equal(legacy.hammer.count,1);
  assert.equal(legacy.risk.current,0,'first three blows add no risk');
});

test('landing helpers clamp hostile input and stay side-effect free',()=>{
  assert.equal(normalizeLanding(null),null);
  assert.equal(normalizeLanding({x:'NaN',y:1}),null);
  const clamped=normalizeLanding({x:-5,y:9});
  assert.deepEqual({x:clamped.x,y:clamped.y},{x:0,y:1});
  assert.equal(clamped.zone,'root');
  assert.equal(normalizeLanding({x:.5,y:.1}).zone,'tip');
  assert.equal(normalizeLanding({x:.5,y:.5}).zone,'belly');
  assert.equal(LANDING_ZONES.tip.name,'刀尖');
  assert.ok(LANDING_BANDS.tipMax<LANDING_BANDS.bellyMax);

  const vec=LANDING_ZONES.belly.vector;
  const frozen=JSON.stringify(vec);
  blendLandingVector(HAMMER_DIRECTION_VECTORS.layer,vec);
  assert.equal(JSON.stringify(vec),frozen,'landing vectors must never be mutated');

  /* distributeGain 必须把余数完整分配，不留浮点残差。 */
  const out=distributeGain(7,{strength:.333,toughness:.333,craft:.334},'strength');
  const sum=Object.values(out.delta).reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(sum-7)<1e-9,'distributed parts must add up to the total');
  assert.equal(out.total,7);
  assert.deepEqual(distributeGain(0,null).delta,{});
});

test('A6: one player blow is still a single tap — no extra required gestures',()=>{
  const r=toHammer(1357);
  const before=r.hammer.count;
  hammerStrike(r,{x:.5,y:.5});
  assert.equal(r.hammer.count,before+1,'one call still equals one blow');
  assert.equal(r.phase,'hammer');
  /* 甜点、落点都只是同一锤的内部判定，没有引入第二段确认。 */
  const t=hammerTechnique({directionVector:HAMMER_DIRECTION_VECTORS.mixed,contact:{x:.5,y:.5},seed:1,strikeIndex:1});
  assert.equal(t.active,true);
  assert.ok(t.gainScale>=1&&t.gainScale<=1+SWEET_SPOT_MAX_BONUS);
});
