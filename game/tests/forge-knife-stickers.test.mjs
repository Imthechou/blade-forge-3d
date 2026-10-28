import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../src/data/cards.js';
import { knifeFormOf, isKnifeGlow, KNIFE_FORM_COUNT } from '../src/ui/forgeKnifeStickers.js';

test('S4 all 24 cards map to 12 purpose-drawn, distinct knife silhouettes',()=>{
  const cards=CARDS.filter(card=>card.stage==='S4');
  assert.equal(cards.length,24);
  const shapes=cards.map(knifeFormOf);
  assert.ok(shapes.every(Boolean),'every S4 forge card must map to an actual shape');
  assert.equal(new Set(shapes).size,12);
  assert.equal(KNIFE_FORM_COUNT,12);
  assert.equal(cards.filter(isKnifeGlow).length,12);
  for(const name of ['蝴蝶刀','爪子刀','马来剑','开山刀','罗马短剑','唐刀']){
    const regular=cards.find(c=>c.name===name);
    const variant=cards.find(c=>c.name!==name && c.visual.assetRef===regular.visual.assetRef);
    assert.ok(regular&&variant,name+' must have base and glow variant');
    assert.equal(knifeFormOf(regular),knifeFormOf(variant));
    assert.equal(isKnifeGlow(regular),false);
    assert.equal(isKnifeGlow(variant),true);
  }
});
test('non-S4 designs stay in their established doodle grammar',()=>{
  assert.equal(knifeFormOf({stage:'S1',name:'唐刀'}),null);
  assert.equal(knifeFormOf({stage:'S7',name:'蝴蝶刀'}),null);
});
