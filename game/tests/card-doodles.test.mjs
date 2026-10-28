import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../src/data/cards.js';
import { doodleSpec } from '../src/ui/cardDoodles.js';

test('entire catalog has deterministic, unique name-led doodle signatures', () => {
  assert.equal(CARDS.length,218);
  const signatures=new Set(),families=new Set(),palettes=new Set();
  for(const c of CARDS){
    const a=doodleSpec(c),b=doodleSpec(c);
    assert.deepEqual(a,b,'same card must render exactly the same sticker on preview/reload');
    assert.ok(a.primary && a.secondary && a.signature);
    assert.ok(!signatures.has(a.signature),'duplicate decal identity: '+c.name);
    signatures.add(a.signature);families.add(a.primary);palettes.add(a.palette.paper);
  }
  assert.ok(families.size>=13,'doodles need meaningful variety beyond palette swaps');
  assert.ok(palettes.size>=5,'not every stage should share one flat fill');
});
test('visual vocabulary prioritizes actual card names, not just stage or rarity', () => {
  const examples=[
    ['冷蓝幕层','frost','flow'],
    ['星屑悬熔','star','flame'],
    ['暗月蚀晶','void','star'],
    ['急冷锁锋','frost','edge'],
    ['六边格','grid','weave'],
    ['温木柄','flame','organic'],
    ['玄线显影','void','weave'],
  ];
  for(const [name,a,b] of examples){
    const result=doodleSpec({id:'demo-'+name,name,tags:[]});
    assert.equal(result.primary,a,name);
    assert.equal(result.secondary,b,name);
  }
});
test('unknown cards render safely and never depend on DOM to derive appearance', () => {
  const s=doodleSpec({id:'fallback',name:'',tags:[]});
  assert.ok(s.primary && s.secondary && s.palette.paper.startsWith('#'));
  assert.notEqual(s.seed,0);
});

test('colour and distinct ink strokes follow the card names',()=>{
  const samples=[
    ['冷蓝幕层','cobalt','stitch'],
    ['星屑悬熔','celestial','scatter'],
    ['暗月蚀晶','obsidian','orbit'],
    ['赤金临界','crimson','crystal'],
    ['温木柄','timber','root'],
    ['流光长刃','spectrum','ribbon'],
    ['紫电刃弧','electric','spark'],
    ['白昼珠光','pearl','mirror'],
    ['六边格','lattice','crystal'],
  ];
  for(const [name,theme,motion] of samples){
    const appearance=doodleSpec({id:'example-'+name,name,tags:[]});
    assert.equal(appearance.theme,theme,name+' must express its name colour');
    assert.equal(appearance.motion,motion,name+' must express its name marks');
    assert.ok(/^#[0-9a-f]{6}$/i.test(appearance.palette.main));
  }
});
test('named colour and motif rules stay stable for the same name across card IDs',()=>{
  for(const name of ['冷蓝幕层','赤金临界','流光长刃']){
    const a=doodleSpec({id:'S5_00',name});
    const b=doodleSpec({id:'S9_99',name});
    assert.deepEqual(a.palette,b.palette);
    assert.equal(a.motion,b.motion);
    assert.notEqual(a.signature,b.signature);
  }
});
