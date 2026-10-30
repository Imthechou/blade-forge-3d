import test from 'node:test';
import assert from 'node:assert/strict';
const saved=new Map();let blocked=false;
globalThis.localStorage={
  getItem:key=>saved.get(key)??null,
  setItem:(key,v)=>{if(blocked)throw Error('quota exceeded');saved.set(key,v);},
  removeItem:key=>saved.delete(key),
};
const P=await import('../src/core/progress.js');
import { materialDropFor } from '../src/core/forgeMaterials.js';

test('valid V4.1 structural participation rewards collectible forge material atomically and once',()=>{
  P.resetAll();
  const record={version:'formal-v4.1',result:{version:'formal-v4.1',cut:{structure:{primary:.66}}}};
  P.recordMatch('school',{win:false,styleId:'press',gradient:0,score:0,matchId:'material-school-1',matchRecord:record});
  const card=materialDropFor('material:formal:material-school-1','school');
  assert.ok(card);
  assert.equal(P.get().materialsV1.counts[card.id],1);
  const prior=JSON.stringify(P.get().materialsV1);
  assert.equal(P.recordMatch('school',{win:false,styleId:'press',gradient:0,matchId:'material-school-1',matchRecord:record}).duplicate,true);
  assert.equal(JSON.stringify(P.get().materialsV1),prior);
  P.recordMatch('school',{win:false,styleId:'press',gradient:0,matchId:'material-idle-1',
    matchRecord:{version:'formal-v4.1',result:{version:'formal-v4.1',cut:{structure:{primary:0}}}}});
  assert.equal(P.get().materialsV1.receipts['material:formal:material-idle-1'],undefined);
});
test('a real full quick match credits one forge material, short/idle modes never do',()=>{
  P.resetAll();
  const run=(id,kills=6,elapsed=45)=>({id,mode:'quick',rulesVersion:'arena-v4.1',done:true,elapsed,
    result:{mode:'quick',reason:'time',score:1000,grade:'B',reward:1,kills},health:100});
  assert.equal(P.settleQuickChallenge(run('C-drop-1')).ok,true);
  const after=P.get().materialsV1;
  assert.equal(Object.values(after.counts).reduce((a,b)=>a+b,0),1);
  assert.equal(P.settleQuickChallenge(run('C-idle-1',0)).ok,true);
  assert.equal(Object.values(P.get().materialsV1.counts).reduce((a,b)=>a+b,0),1);
  assert.equal(P.settleQuickChallenge(run('C-short-1',6,12)).ok,false);
  assert.equal(Object.values(P.get().materialsV1.counts).reduce((a,b)=>a+b,0),1);
  const twice=run('C-drop-1');
  assert.equal(P.settleQuickChallenge(twice).duplicate,true);
  assert.equal(Object.values(P.get().materialsV1.counts).reduce((a,b)=>a+b,0),1);
});
test('material spend persists only when storage succeeds, cannot overdraft or reuse',()=>{
  P.resetAll();
  const id=materialDropFor('material:formal:spend','apex').id;
  P.get().materialsV1.counts[id]=1;P.persist();
  blocked=true;let failure;
  try{failure=P.spendForgeMaterial(id);}
  finally{blocked=false;}
  assert.equal(failure?.code,'PERSIST_FAILED');
  assert.equal(P.get().materialsV1.counts[id],1);
  assert.equal(P.spendForgeMaterial(id).ok,true);
  assert.equal(P.get().materialsV1.counts[id],undefined);
  assert.equal(P.spendForgeMaterial(id).ok,false);
});
