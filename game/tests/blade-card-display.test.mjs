import test from 'node:test';
import assert from 'node:assert/strict';
import { bladeCardModel } from '../src/ui/bladeCard.js';

const base = {
  id:'older-knife',knifeTypeId:'tangdao',bladeName:'旧藏刀',score:320,
  stats:{strength:150,toughness:150,sharpness:150,craft:150,design:150,spirit:150}
};

test('legacy blade displays exact six-stat mean without mutating score or stored record',()=>{
  const original=JSON.stringify(base);
  const model=bladeCardModel(base);
  assert.equal(model.statMean,150);
  assert.equal(model.score,320);
  assert.equal(JSON.stringify(base),original);
});

test('authoritative mean is preserved, never recomputed from display stats',()=>{
  assert.equal(bladeCardModel({...base,statMean:81.23}).statMean,81.23);
});

test('missing stats remain unknown while a genuine zero mean is still displayed',()=>{
  const {spirit,...partial}=base.stats;
  assert.equal(bladeCardModel({...base,stats:partial}).statMean,null);
  assert.equal(bladeCardModel({...base,stats:Object.fromEntries(Object.keys(base.stats).map(k=>[k,0]))}).statMean,0);
});
