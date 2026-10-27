import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSkinState, deriveHandleMask } from '../src/core/recipe.js';
import { CARD_BY_ID } from '../src/data/cards.js';

const recipe = (extra = {}) => ({
  seed: 20261027,
  stageIndex: 3,
  pendingSkin: {
    materialId: 'M06', textureId: 'T02', finishId: 'F06',
    variants: {
      melt: { purity: .37, scale: 1, roughnessStrength: .5 },
      texture: { scale: 1.1, rotation: 12, roughnessStrength: .35 },
      finish: { amount: .8, colorPhase: .31 },
    },
    ...extra,
  },
  visualRecipe: ['S2_11', 'S3_03', 'K13', 'S5_21'].map(cardId => ({ cardId })),
});
test('P0-1: changing shape cannot replace S3 texture or relief parameters', () => {
  const run = recipe({ fixedTexture: 'T11' });
  const baseline = deriveSkinState(run);
  const shaped = deriveSkinState(run, { knifeType: 'bayonet', fixedTexture: 'T12',
    visualStages: [{ index:3,cardId:'K15',rarity:'rare',rank:15 }] });
  assert.equal(shaped.textureId,'T02');
  assert.deepEqual(shaped.variantParams.texture, baseline.variantParams.texture);
  assert.ok(shaped.textureChosen);
  assert.equal(shaped.knifeType,'bayonet');
  const legacy = recipe({ textureId: null, fixedTexture:'T04' });
  assert.equal(deriveSkinState(legacy).textureId,'T04');
});
test('P0-2: every earlier stage identity survives later-stage card selection', () => {
  const run=recipe();
  const base=deriveSkinState(run);
  const identity=(skin)=>({
    materialIdentity:skin.materialIdentity,
    melt:skin.variantParams.melt,
    texture:skin.variantParams.texture,
    finish:skin.variantParams.finish,
    finishCardId:skin.finishCardId,
  });
  for(let idx=5;idx<=8;idx++){
    run.stageIndex=idx;
    const next=deriveSkinState(run,{
      visualStages:[{index:idx,cardId:CARD_BY_ID[idx===7?'S8_02':idx===8?'S9_02':idx===6?'S7_02':idx===5?'S6_02':'S5_21'].id,
      rarity:'epic',rank:7}],
      handle:idx===7?{metalId:'h_warm_wood'}:undefined,
    });
    assert.deepEqual(identity(next),identity(base),`confirmed S3/S5 changed during S${idx+1}`);
  }
});
test('P0-3: handle material only becomes explicit with S8 choice; previews are immutable', () => {
  const run=recipe({ handle:undefined });
  assert.equal(deriveHandleMask(run).explicit,false);
  const committed=JSON.stringify(run);
  const a=deriveHandleMask(run,{handle:{metalId:'h_warm_wood'}});
  assert.equal(a.explicit,true);
  assert.equal(JSON.stringify(run),committed);
  const b=deriveHandleMask(run,{handle:{metalId:'h_grip_leather'}});
  assert.notEqual(a.metalId,b.metalId);
  assert.equal(deriveHandleMask(run).explicit,false);
});
test('P0-2: S4 is 12 normal and 12 advanced shape cards',()=>{
  const basic=Array.from({length:12},(_,i)=>CARD_BY_ID[`K${String(i+1).padStart(2,'0')}`]);
  const advanced=Array.from({length:12},(_,i)=>CARD_BY_ID[`K${i+13}`]);
  assert.ok([...basic,...advanced].every(Boolean));
  assert.equal(new Set(basic.map(c=>c.visual.write.knifeType)).size,12);
  assert.equal(new Set(advanced.map(c=>c.visual.write.knifeType)).size,12);
  assert.deepEqual(advanced.map(c=>c.visual.write.knifeType).sort(),basic.map(c=>c.visual.write.knifeType).sort());
});
