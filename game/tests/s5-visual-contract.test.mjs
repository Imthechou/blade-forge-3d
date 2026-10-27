import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S5_CARD_FAMILY, S5_VISUAL_FAMILY, S5_CARD_ART, s5CardArt,
  resolveS5Effect, applyS5Effect,
  refineS5BaseFinish, finishOperators, adaptS5PaletteToSubstrate } from '../src/render/v2/finishRecipe.js';
import { CARD_BY_ID } from '../src/data/cards.js';
const tiers={common:0,fine:1,rare:2,epic:3,legend:4,mythic:5};
const seeds=[0.21,0.58,0.37,0.88];
test('S5 has 25 original gameplay cards and exactly 13 visual families of 1-2 cards',()=>{
  const counts={};
  for(let n=1;n<=25;n++){
    const id='S5_'+String(n).padStart(2,'0');
    assert.ok(CARD_BY_ID[id],id);
    assert.ok(S5_CARD_FAMILY[id],id);
    counts[S5_VISUAL_FAMILY[id]]=(counts[S5_VISUAL_FAMILY[id]]||0)+1;
  }
  assert.equal(Object.keys(S5_CARD_FAMILY).length,25);
  assert.equal(Object.keys(counts).length,13);
  assert.ok(Object.values(counts).every(n=>n>=1&&n<=2),JSON.stringify(counts));
});
test('all cards retain predictable families; low tiers never get arbitrary premium hash rolls',()=>{
  for(let n=1;n<=25;n++){
    const id='S5_'+String(n).padStart(2,'0');
    const card=CARD_BY_ID[id],tier=tiers[card.rarity];
    const args={chosen:true,cardId:id,baseHex:'#778b9d',amount:.78};
    const a=resolveS5Effect(10,tier,.34,seeds,args);
    const b=resolveS5Effect(10,tier,.34,seeds,args);
    assert.deepEqual(a,b,id);
    if(tier<2)assert.equal(a,null,id);
    if(a)assert.equal(a.key,S5_CARD_FAMILY[id],id);
  }
});
test('S1 substrate meaningfully changes same selected S5 signature, without changing family',()=>{
  for(const id of ['S5_14','S5_16','S5_19','S5_20','S5_21','S5_24']){
    const args={chosen:true,cardId:id,amount:.75};
    const dark=resolveS5Effect(10,5,.38,seeds,{...args,baseHex:'#263746'});
    const light=resolveS5Effect(10,5,.38,seeds,{...args,baseHex:'#c3b294'});
    assert.equal(dark.key,light.key);
    const d=applyS5Effect(finishOperators(10,{amount:.7},{finishId:10}),dark,{});
    const l=applyS5Effect(finishOperators(10,{amount:.7},{finishId:10}),light,{});
    assert.notDeepEqual(d.palette,l.palette,id);
    assert.ok(d.palette.every(c=>/^#[0-9a-f]{6}$/i.test(c)));
  }
});
test('more rare S5 cards improve smoothness, NOT emitted radiance',()=>{
  for(const id of ['S5_20','S5_21','S5_23']){
    const opts={chosen:true,cardId:id,baseHex:'#6781a6'};
    const low=resolveS5Effect(10,2,.2,seeds,opts);
    const high=resolveS5Effect(10,5,.2,seeds,opts);
    const p=applyS5Effect(finishOperators(10,{amount:.7},{finishId:10}),low,{});
    const q=applyS5Effect(finishOperators(10,{amount:.7},{finishId:10}),high,{});
    assert.ok(q.a[1]<=p.a[1],id);
    assert.ok(q.cover<=0.95 && p.cover<=0.95);
    assert.equal(q.c[3],0,id);
  }
});
test('neutral mirror, matte and oxidized steel cannot repaint to gem/Marble',()=>{
  for(const id of ['S5_25','S5_08','S5_17']){
    const out=finishOperators(1,{amount:.75},{finishId:1});
    const next=refineS5BaseFinish(out,id,0);
    assert.equal(next.premiumLook,undefined);
    assert.equal(next.d[2],0);
    assert.equal(next.c[1],0);
  }
  assert.deepEqual(adaptS5PaletteToSubstrate(['#446688'],'not-a-color'),['#446688']);
});
test('S1-S6 full steel coverage, S8 grip gate and no additive late-stage film',()=>{
  const shader=readFileSync(new URL('../src/render/v2/programFamilies.js',import.meta.url),'utf8');
  const game=readFileSync(new URL('../src/app/game.js',import.meta.url),'utf8');
  assert.ok(shader.includes('uV2FinTint, wS,'));
  assert.ok(shader.includes('col *= filmGain;'));
  assert.ok(!shader.includes('col += ( film - 0.5 ) * tW * 3.10'));
  assert.ok(!shader.includes('col = col * ( 1.0 + 0.30'));
  assert.ok(game.includes('if (idx < 7) return false;'));
  assert.ok(game.includes('coverAll: !hGate'));
});

test('S5 art identities distinguish all 25 cards inside unchanged families',()=>{
  const uniques=new Set();
  for(let i=1;i<=25;i++){
    const id='S5_'+String(i).padStart(2,'0');
    const a=S5_CARD_ART[id];
    assert.ok(a?.type && a?.name, id);
    assert.ok(a.strength>0 && a.strength<=0.85,id);
    const value=s5CardArt(id,true,tiers[CARD_BY_ID[id].rarity]||0);
    assert.equal(value[0],i);
    assert.ok(value[1]>0 && value[1]<=a.strength);
    assert.deepEqual(s5CardArt(id,false,5),[0,0,0,0]);
    assert.deepEqual(s5CardArt(id,true,tiers[CARD_BY_ID[id].rarity]||0),value);
    assert.ok(!uniques.has(a.type),'duplicate S5 spatial design for '+id);
    uniques.add(a.type);
  }
  assert.equal(uniques.size,25);
  const shader=readFileSync(new URL('../src/render/v2/programFamilies.js',import.meta.url),'utf8');
  assert.ok(shader.includes('uniform vec4 uV2Art;'));
  assert.ok(shader.includes('s5CardArt(u.uS5CardId, op.chosen'));
  assert.ok(shader.includes('texture2D( uS5OpticalMap, uv )'));
});
test('a pair shares craft lineage but not its palette and spatial identity',()=>{
  const pairs=[['S5_01','S5_02'],['S5_03','S5_08'],['S5_04','S5_12'],
    ['S5_05','S5_11'],['S5_06','S5_17'],['S5_07','S5_13'],
    ['S5_09','S5_25'],['S5_14','S5_15'],['S5_16','S5_18'],
    ['S5_19','S5_23'],['S5_20','S5_22'],['S5_21','S5_24']];
  for(const [a,b] of pairs){
    assert.equal(S5_VISUAL_FAMILY[a],S5_VISUAL_FAMILY[b]);
    assert.notEqual(S5_CARD_ART[a].type,S5_CARD_ART[b].type);
    assert.notDeepEqual(s5CardArt(a,true,5),s5CardArt(b,true,5));
  }
  const r21=resolveS5Effect(10,5,.38,seeds,{chosen:true,cardId:'S5_21'});
  const r24=resolveS5Effect(10,5,.38,seeds,{chosen:true,cardId:'S5_24'});
  assert.equal(r24.gemVariant,1);
  assert.equal(r21.key,r24.key);
});


test('full forged blade clamps accumulated albedo energy and retires excessive S4 surface glow',()=>{
  const shader=readFileSync(new URL('../src/render/v2/programFamilies.js',import.meta.url),'utf8');
  assert.match(shader,/float baseLum = dot\( identityCol/);
  assert.match(shader,/float maxBase = max\( 0\.085, baseLum \* 1\.08 \)/);
  assert.match(shader,/float compressedLum = finalLum - excess \* 0\.82/);
  assert.match(shader,/col \*= compressedLum \/ finalLum/);
  assert.match(shader,/float haloCarry = 1\.0 - 0\.48 \* postS5 - 0\.12 \* postS6/);
  assert.match(shader,/float s4e =[\s\S]*?\* haloCarry/);
  assert.match(shader,/bladeV2:61/);
});
