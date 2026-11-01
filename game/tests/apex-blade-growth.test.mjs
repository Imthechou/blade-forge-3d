import test from 'node:test';
import assert from 'node:assert/strict';
const entries=new Map();let blocked=false;
globalThis.localStorage={
  getItem:key=>entries.get(key)??null,
  setItem:(key,value)=>{if(blocked)throw Error('quota exceeded');entries.set(key,value)},
  removeItem:key=>entries.delete(key),
};
const Progress=await import('../src/core/progress.js');
const Mastery=await import('../src/core/bladeMastery.js');
const Formal=await import('../src/core/arenaFormal.js');
const makeBlade=id=>({id,bladeName:'三刀测试 '+id,knifeTypeId:'folding',score:201,rarity:'rare',
  stats:{strength:70,toughness:80,sharpness:65,craft:70,design:60,spirit:80},
  traits:[],combos:[],history:[],arenaHistory:[],visualRecipe:[{id:'untouched'}]});
const match=(id,progress=[.6,.4,0],status=['complete','complete','not-run'])=>({
  version:'formal-v4.1',kind:'apex',roster:['A','B','C'].map(id=>({id})),
  rounds:progress.map((primary,round)=>({
    round,bladeId:status[round]==='complete'?['A','B','C'][round]:null,
    status:status[round],primary,primaryCompleted:status[round]==='complete'&&primary>=1,
    win:status[round]==='complete'?primary>=.9:null,
  })),
  result:{version:'formal-v4.1',win:false},
});
const start=()=>{
  Progress.resetAll();
  Progress.get().collection.push(...['A','B','C'].map(makeBlade));
  Progress.persist();
};
const submit=(id,record)=>Progress.recordMatch('apex',{matchId:id,bladeId:null,win:false,score:0,matchRecord:record});
test('each actual three-blade apex participant gets only verified round proficiency',()=>{
  start();
  const before=JSON.stringify(Progress.bladeById('A').stats);
  const entry=match('a',['.5',.6,0].map(Number),['complete','complete','not-run']);
  const result=submit('AP-team-a',entry);
  assert.equal(result.error,undefined);
  assert.equal(Mastery.masteryView(Progress.bladeById('A')).qualifiedMatches,1);
  assert.equal(Mastery.masteryView(Progress.bladeById('B')).qualifiedMatches,1);
  assert.equal(Mastery.masteryView(Progress.bladeById('C')).qualifiedMatches,0);
  assert.equal(JSON.stringify(Progress.bladeById('A').stats),before);
  assert.equal(Progress.bladeById('A').arenaHistory.length,1);
  assert.equal(Progress.bladeById('B').arenaHistory[0].round,1);
  assert.equal(Progress.get().arena.history.length,1);
  assert.equal(submit('AP-team-a',entry).duplicate,true);
  assert.equal(Mastery.masteryView(Progress.bladeById('A')).qualifiedMatches,1);
});
test('empty, mismatched, replayed and legacy team rounds do not mint blade mastery',()=>{
  start();
  const empty=match('b',[0,0,0],['complete','complete','complete']);
  const bad=match('c',[.7,.8,.9],['complete','complete','complete']);
  bad.rounds[1].bladeId='A';
  const old={version:'formal-v4.1',rounds:[{round:0,bladeId:'A',primary:1}],result:{version:'formal-v4.1'}};
  assert.deepEqual(Mastery.verifiedApexBladeRounds(empty),[]);
  assert.deepEqual(Mastery.verifiedApexBladeRounds(bad),[]);
  assert.deepEqual(Mastery.verifiedApexBladeRounds(old),[]);
  submit('AP-empty',empty);submit('AP-bad',bad);submit('AP-old',old);
  for(const id of ['A','B','C'])assert.equal(Mastery.masteryView(Progress.bladeById(id)).qualifiedMatches,0);
  assert.equal(Progress.get().materialsV1.receipts['material:formal:AP-empty'],undefined);
  assert.equal(Progress.get().materialsV1.receipts['material:formal:AP-bad'],undefined);
});
test('completion and 20 percent participation count; no credit for standby or sub-threshold',()=>{
  start();
  const record=match('d',[.2,.1999,1],['complete','complete','complete']);
  assert.deepEqual(Mastery.verifiedApexBladeRounds(record).map(x=>x.bladeId),['A','C']);
  submit('AP-limits',record);
  assert.equal(Mastery.masteryView(Progress.bladeById('A')).qualifiedMatches,1);
  assert.equal(Mastery.masteryView(Progress.bladeById('B')).qualifiedMatches,0);
  assert.equal(Mastery.masteryView(Progress.bladeById('C')).qualifiedMatches,1);
});
test('failed atomic save cannot grant any team blade experience; retry only once',()=>{
  start();const record=match('e',[.9,.9,.9],['complete','complete','complete']);
  blocked=true;
  try{assert.equal(submit('AP-retry',record).code,'PERSIST_FAILED');}
  finally{blocked=false;}
  for(const id of ['A','B','C'])assert.equal(Mastery.masteryView(Progress.bladeById(id)).qualifiedMatches,0);
  submit('AP-retry',record);
  for(const id of ['A','B','C'])assert.equal(Mastery.masteryView(Progress.bladeById(id)).qualifiedMatches,1);
  assert.equal(submit('AP-retry',record).duplicate,true);
  for(const id of ['A','B','C'])assert.equal(Mastery.masteryView(Progress.bladeById(id)).qualifiedMatches,1);
});

test('official V4.1 apex match generator emits roster/round identities compatible with atomic proficiency credit',()=>{
  start();
  const generated=Formal.createApexMatch({blades:['A','B','C'].map(id=>Progress.bladeById(id)),seed:10112});
  assert.equal(generated.ok,true);
  const apex=generated.match;
  for(let i=0;i<3;i++){
    const round=apex.rounds[i];
    round.status='complete';round.dispatchedBladeId=['A','B','C'][i];
    round.result={version:'formal-v4.1',win:i!==2,composite:i===2?80:980,
      cut:{structure:{primary:i===2?.08:.72,completed:false}},
      projectScores:[],honors:[]};
  }
  assert.equal(Formal.finishApex(apex).ok,true);
  const official={version:apex.result.version,kind:'apex',roster:apex.roster,
    rounds:apex.result.roundsDetail,report:apex.result.report,result:apex.result};
  assert.deepEqual(Mastery.verifiedApexBladeRounds(official).map(x=>x.bladeId),['A','B']);
  const credit=submit(apex.id,official);
  assert.equal(credit.error,undefined);
  assert.equal(Mastery.masteryView(Progress.bladeById('A')).qualifiedMatches,1);
  assert.equal(Mastery.masteryView(Progress.bladeById('B')).qualifiedMatches,1);
  assert.equal(Mastery.masteryView(Progress.bladeById('C')).qualifiedMatches,0);
});
