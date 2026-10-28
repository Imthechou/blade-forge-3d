import test from 'node:test';
import assert from 'node:assert/strict';
import { applyForgeCutTraits, resolveForgeCutTraits } from '../src/core/forgeTraitCuts.js';
import { deriveCutParams, deriveCutParamsForBlade } from '../src/core/cutParams.js';

const stats = { strength: 80, toughness: 80, sharpness: 80, craft: 80, design: 80, spirit: 80 };
const base = () => deriveCutParams(stats, []);

test('before 2 layers, a tendency creates no live effect', () => {
  const p = applyForgeCutTraits(base(), { tags: { edge: 1 } });
  assert.equal(p.softBase, base().softBase);
  assert.equal(p.forgeTraits.length, 0);
});

test('2/4/6 layers increase a single edge cutting bonus, not three stacks', () => {
  const v = [2, 4, 6].map(layers => applyForgeCutTraits(base(), { tags: { edge: layers }, tagTiers: [{ tagId: 'edge', layers }] }));
  assert.ok(v[0].softBase > base().softBase);
  assert.ok(v[1].softBase > v[0].softBase);
  assert.ok(v[2].softBase > v[1].softBase);
  assert.ok(v.every(x => x.forgeTraits.length === 1));
});

test('tradeoff, defense, chain and precision builds feel different', () => {
  const heat = applyForgeCutTraits(base(), { tags: { heat: 6 } });
  const stable = applyForgeCutTraits(base(), { tags: { stable: 6 } });
  const cold = applyForgeCutTraits(base(), { tags: { cold: 6 } });
  const precision = applyForgeCutTraits(base(), { tags: { precision: 6 } });
  assert.ok(heat.hardPowerMult > base().hardPowerMult);
  assert.ok(heat.wearHardMult > base().wearHardMult);
  assert.ok(stable.wearHardMult < base().wearHardMult);
  assert.ok(cold.iceChain > 0);
  assert.ok(precision.weakMap > 0);
});

test('legacy-only traits do not accidentally stack, special traits dedupe', () => {
  const v = applyForgeCutTraits(base(), { traits: ['old-legacy', 'ST_resonance', 'ST_resonance'] });
  assert.equal(v.forgeTraits.length, 1);
  assert.ok(v.tripleBonus > 0);
});

test('standalone blade params uses same active effects', () => {
  const blade = { stats, tags: { flow: 4 }, traits: ['ST_void'] };
  const p = deriveCutParamsForBlade(blade);
  assert.ok(p.comboWindow > base().comboWindow);
  assert.equal(p.forgeTraits.length, 2);
  assert.ok(p.emergencyHeal > 0);
});
