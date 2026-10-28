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
