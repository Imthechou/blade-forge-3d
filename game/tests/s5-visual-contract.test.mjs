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
  assert.match(shader,/bladeV2:66/);
});

test('S3 billet card engraving stays legible while the entire forging chain has a bounded reflection budget',()=>{
  const shader=readFileSync(new URL('../src/render/v2/programFamilies.js',import.meta.url),'utf8');
  const detail=readFileSync(new URL('../src/render/v2/surfaceDetail.js',import.meta.url),'utf8');
  const viewer=readFileSync(new URL('../src/render/legacy/bladeViewer.js',import.meta.url),'utf8');
  const lights=readFileSync(new URL('../src/render/legacy/viewer.js',import.meta.url),'utf8');
  assert.match(shader,/uV2Proc\.x > 1\.5 && uV2Proc\.x < 2\.5 && uS3On > 0\.5/);
  assert.match(shader,/amp \*= mix\( 0\.84, 1\.18, billetFace \)/);
  assert.match(shader,/col = mix\( tinted, min\( tinted, col \), 0\.30 \)/);
  assert.match(shader,/float s4e = clamp\([\s\S]*?0\.0, 0\.92 \)/);
  assert.match(detail,/float patternWeight = mix\( 0\.16, 0\.26,/);
  assert.match(viewer,/const STAGE_ENV_GAIN = \[0\.88, 0\.90, 0\.80, 0\.88, 1\.00, 1\.04, 1\.08, 1\.10, 1\.12\]/);
  assert.match(viewer,/Math\.min\(1\.48, M\.envIntensity \* stageEnvGain\)/);
  assert.doesNotMatch(viewer,/0\.90 \+ 0\.1025 \* \(g - 1\)/);
  assert.match(lights,/toneMappingExposure = 0\\.87/);
  // The archive is intentionally a touch darker than forging, without
  // changing the BRDF, environment shape or S3 engraving energy.
  const archive=readFileSync(new URL('../src/render/collectionPreview.js',import.meta.url),'utf8');
  assert.match(archive,/COLLECTION_EXPOSURE = 0\\.84/);
  assert.match(archive,/archive-image-v4/);
});


test('S3 is carved into baked billet albedo with bounded one-sided contrast and no costly new normals',()=>{
  const shader=readFileSync(new URL('../src/render/v2/programFamilies.js',import.meta.url),'utf8');
  const detail=readFileSync(new URL('../src/render/v2/surfaceDetail.js',import.meta.url),'utf8');
  const process=shader.slice(shader.indexOf('/* ⑥ 过程模型'),shader.indexOf('/* Existing finish coats'));
  assert.match(process,/uV2Proc\.x > 1\.5 && uV2Proc\.x < 2\.5 && uS3On > 0\.5/);
  assert.match(process,/float darkGroove = max\( 0\.0, -sig \) \* s3Surface/);
  assert.match(process,/float grooveDepth = mix\( 0\.26, 0\.48, billetFace \)/);
  assert.match(process,/col = mix\( tinted, min\( tinted, col \), 0\.30 \)/);
  assert.match(process,/col \*= 1\.0 - darkGroove \* grooveDepth/);
  assert.match(process,/else \{\s*col = mix\( tinted, col, processBlend \)/);
  assert.doesNotMatch(process,/billetCeiling|forgedLum|fwidth\s*\(|s3FrontBoost|grooveAA/);
  assert.doesNotMatch(shader,/mix\( 0\.68, 0\.84, billetFace \)|mix\( 0\.44, 0\.58, billetFace \)/);
  assert.doesNotMatch(detail,/s3FrontBoost/);
  assert.match(shader,/bladeV2:66/);

  // The new S3 process can only retain or remove albedo from each baked
  // channel: bright ridges remain baked metal; card troughs are dark only.
  for(const baked of [0.02,0.15,0.45,0.85])
    for(const forged of [0.0,0.18,0.55,1.4])
      for(const sig of [-0.8,-0.2,0.2,0.8]) {
        const substrate=baked*0.7+Math.min(baked,forged)*0.3;
        const darkGroove=Math.max(0,-sig)*0.9;
        const result=substrate*(1-darkGroove*0.48);
        assert.ok(result<=baked+1e-10&&result>=0,{baked,forged,sig,result}.toString());
        if(sig>=0)assert.equal(result,substrate);
      }
});
