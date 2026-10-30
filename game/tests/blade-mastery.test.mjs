import test from 'node:test';
import assert from 'node:assert/strict';
const items=new Map();
let blocked=false;
globalThis.localStorage={
  getItem:key=>items.get(key)??null,
  setItem:(key,value)=>{if(blocked)throw new Error('quota exceeded');items.set(key,value);},
  removeItem:key=>items.delete(key),
};
const P=await import('../src/core/progress.js');
const M=await import('../src/core/bladeMastery.js');
const A=await import('../src/core/bladeAdapter.js');
const makeBlade=(id='blade-x')=>({
  id,knifeTypeId:'folding',bladeName:'测试名刀',stats:{
    strength:130,toughness:45,sharpness:160,craft:120,design:55,spirit:50,
  },score:407,rarity:'rare',traits:[],combos:[],tags:{},history:[],arenaHistory:[],
});
const match=id=>({
  version:'formal-v4.1',
  result:{version:'formal-v4.1',cut:{structure:{primary:.72}}},
  projectScores:[{kind:'cutting',name:'切割',score:1000}],
  id,
});
test('old blades default to new blade proficiency without mutating base stats or appearance',()=>{
  const b=makeBlade();b.visualRecipe=[{foo:'bar'}];
  const normalized=P.normalizeSave({collection:[b]}).collection[0];
  assert.equal(normalized.mastery.qualifiedMatches,0);
  assert.ok(M.masteryView(normalized).specialtyProject);
  assert.deepEqual(normalized.stats,b.stats);
  assert.deepEqual(normalized.visualRecipe,b.visualRecipe);
  assert.equal(normalized.score,407);
});
test('two and five verified matches unlock bounded 2% and 5% single-project bonuses',()=>{
  P.resetAll();
  P.get().collection.push(makeBlade());
  P.persist();
  const base=P.bladeById('blade-x');
  const before=A.adaptBlade(base);
  const project=M.masteryView(base).specialtyProject;
  const originalStats=JSON.stringify(base.stats),originalScore=base.score;
  const valid=(id)=>P.recordMatch('school',{win:false,matchId:id,bladeId:'blade-x',
    styleId:'press',gradient:0,score:100,matchRecord:match(id)});
  const first=valid('m-1');assert.equal(first.duplicate,undefined);
  assert.equal(P.bladeById('blade-x').mastery.qualifiedMatches,1);
  assert.equal(P.recordMatch('school',{win:false,matchId:'m-1',bladeId:'blade-x',matchRecord:match('m-1')}).duplicate,true);
  valid('m-2');
  assert.equal(M.masteryView(P.bladeById('blade-x')).bonus,.02);
  for(let i=3;i<=5;i++)valid('m-'+i);
  const after=P.bladeById('blade-x');
  assert.equal(M.masteryView(after).name,'名刃');
  assert.equal(M.masteryView(after).bonus,.05);
  assert.equal(JSON.stringify(after.stats),originalStats);
  assert.equal(after.score,originalScore);
  const adapted=A.adaptBlade(after);
  assert.equal(adapted.mastery.bonus,.05);
  assert.equal(adapted.projectFactor[project].mastery,1.05);
  for(const other of Object.keys(adapted.projectFactor))if(other!==project)assert.equal(adapted.projectFactor[other].mastery,1);
  assert.ok(adapted.projectFactor[project].raw>=before.projectFactor[project].raw);
});
test('empty and unverified match records grant no proficiency',()=>{
  P.resetAll();P.get().collection.push(makeBlade('idle'));P.persist();
  P.recordMatch('school',{win:false,matchId:'idle-match',bladeId:'idle',
    styleId:'press',gradient:0,score:0,matchRecord:{version:'formal-v4.1',result:{version:'formal-v4.1',cut:{structure:{primary:0}}}}});
  assert.equal(M.masteryView(P.bladeById('idle')).qualifiedMatches,0);
});
test('favorite persists as separate collection marker and respects save transactions',()=>{
  P.resetAll();P.get().collection.push(makeBlade('favorite'));P.persist();
  assert.equal(P.toggleFavorite('favorite').favorite,true);
  assert.equal(P.normalizeSave(JSON.parse(items.get('bladeforge.save'))).collection[0].favorite,true);
  assert.equal(P.toggleFavorite('favorite').favorite,false);
});

test('national and apex count only real multi-round structural participation',()=>{
  P.resetAll();P.get().collection.push(makeBlade('multi'));P.persist();
  const noAction={version:'formal-v4.1',result:{version:'formal-v4.1'},rounds:[{round:0,primary:0}]};
  assert.equal(M.qualifyingFormalMatch(noAction,'national'),false);
  assert.equal(M.qualifyingFormalMatch({version:'legacy',rounds:[{primary:1}]},'national'),false);
  assert.equal(M.qualifyingFormalMatch({version:'formal-v4.1',rounds:[{round:0,primary:.5}]},'national'),true);
  assert.equal(M.qualifyingFormalMatch({version:'formal-v4.1',rounds:[{round:1,primaryCompleted:true}]},'apex'),true);
  P.recordMatch('national',{win:false,matchId:'none-1',bladeId:'multi',matchRecord:noAction});
  assert.equal(M.masteryView(P.bladeById('multi')).qualifiedMatches,0);
  const real={version:'formal-v4.1',result:{version:'formal-v4.1'},rounds:[{round:0,primary:.6,primaryCompleted:true}]};
  P.recordMatch('national',{win:false,matchId:'multi-1',bladeId:'multi',matchRecord:real});
  assert.equal(P.bladeById('multi').mastery.qualifiedMatches,1);
  assert.equal(P.recordMatch('national',{win:false,matchId:'multi-1',bladeId:'multi',matchRecord:real}).duplicate,true);
  assert.equal(P.bladeById('multi').mastery.qualifiedMatches,1);
});
test('save write failure cannot grant mastery; successful retry remains idempotent',()=>{
  P.resetAll();P.get().collection.push(makeBlade('retry'));P.persist();
  const args={win:false,matchId:'retry-1',bladeId:'retry',styleId:'press',gradient:0,
    matchRecord:{version:'formal-v4.1',result:{version:'formal-v4.1',cut:{structure:{primary:.8}}}}};
  blocked=true;
  try {assert.equal(P.recordMatch('school',args).code,'PERSIST_FAILED');}
  finally{blocked=false;}
  assert.equal(M.masteryView(P.bladeById('retry')).qualifiedMatches,0);
  P.recordMatch('school',args);
  assert.equal(M.masteryView(P.bladeById('retry')).qualifiedMatches,1);
  assert.equal(P.recordMatch('school',args).duplicate,true);
  assert.equal(M.masteryView(P.bladeById('retry')).qualifiedMatches,1);
});

test('real completed 45s quick-cut challenge advances only its selected blade and cannot be replayed',()=>{
  P.resetAll();
  P.get().collection.push(makeBlade('quick-A'),makeBlade('quick-B'));
  P.persist();
  const run=(id,bladeId='quick-A',options={})=>({
    id,mode:options.mode||'quick',rulesVersion:'arena-v4.1',daily:false,
    done:true,elapsed:options.elapsed??45,health:100,
    blade:{id:bladeId},result:{mode:'quick',reason:'time',score:2400,grade:'B',reward:5,kills:options.kills??12},
  });
  const a=run('C-quick-first');
  assert.equal(P.settleQuickChallenge(a).ok,true);
  assert.equal(M.masteryView(P.bladeById('quick-A')).qualifiedMatches,1);
  assert.equal(M.masteryView(P.bladeById('quick-B')).qualifiedMatches,0);
  assert.equal(P.settleQuickChallenge(a).duplicate,true);
  const b=run('C-quick-second');
  assert.equal(P.settleQuickChallenge(b).ok,true);
  assert.equal(M.masteryView(P.bladeById('quick-A')).qualifiedMatches,2);
  // A previously settled run cannot be replayed after a newer run overwrites last.
  assert.equal(P.settleQuickChallenge(run('C-quick-first')).duplicate,true);
  assert.equal(M.masteryView(P.bladeById('quick-A')).qualifiedMatches,2);
});
test('idle, early exit, and 12-second sample do not create quick-match blade proficiency',()=>{
  P.resetAll();P.get().collection.push(makeBlade('idle-fast'));P.persist();
  const create=(id,elapsed,kills,mode='quick')=>({
    id,mode,rulesVersion:'arena-v4.1',done:true,elapsed,health:100,
    blade:{id:'idle-fast'},result:{mode,reason:'time',score:100,grade:'C',reward:0,kills},
  });
  assert.equal(P.settleQuickChallenge(create('C-quick-zero',45,0)).ok,true);
  assert.equal(M.masteryView(P.bladeById('idle-fast')).qualifiedMatches,0);
  assert.equal(P.settleQuickChallenge(create('C-quick-aborted',12,4)).ok,false);
  assert.equal(P.settleQuickChallenge(create('C-short-trial',12,4,'sample')).ok,false);
  assert.equal(M.masteryView(P.bladeById('idle-fast')).qualifiedMatches,0);
});
test('failed quick-match storage is not a credited blade mastery receipt',()=>{
  P.resetAll();P.get().collection.push(makeBlade('quick-retry'));P.persist();
  const run={id:'C-storage-retry',mode:'quick',rulesVersion:'arena-v4.1',
    done:true,elapsed:45,health:100,blade:{id:'quick-retry'},
    result:{mode:'quick',reason:'time',score:321,grade:'B',reward:4,kills:8}};
  blocked=true;
  try{assert.equal(P.settleQuickChallenge(run).code,'PERSIST_FAILED');}
  finally{blocked=false;}
  assert.equal(M.masteryView(P.bladeById('quick-retry')).qualifiedMatches,0);
  assert.equal(P.settleQuickChallenge(run).ok,true);
  assert.equal(M.masteryView(P.bladeById('quick-retry')).qualifiedMatches,1);
});
