import test from 'node:test';
import assert from 'node:assert/strict';
import {createStructure,updateStructure,structureScore,structureSnapshot,STRUCTURE_TEMPLATES} from '../src/core/arenaStructures.js';
import {createChallenge,beginSwipe,swipe,finish} from '../src/core/arenaChallenge.js';
import {sampleBlade} from '../tools/arena-v3-simulate.mjs';
import {careerRewardPlan,SCHOOL_CR,SCHOOL_FIRST_CR,isV41Match} from '../src/core/arenaV41Rewards.js';
const blade=sampleBlade(100);
test('all six original material families are physical components in six distinct authored structures',()=>{
  assert.equal(Object.keys(STRUCTURE_TEMPLATES).length,6);
  const types=new Set();
  for(const name of Object.keys(STRUCTURE_TEMPLATES)) {
    const structure=createStructure(1,name,2);
    assert.ok(structure.parts.length>=6);
    assert.equal(structure.routes.length,2);
    for(const part of structure.parts)types.add(part.type);
    assert.equal(structure.primary,0);
    assert.equal(structure.completed,false);
    assert.equal(structureScore(structure,0,90,100,100),0,'full health cannot earn objective progress');
    assert.equal(structureSnapshot(structure).completed,false);
  }
  assert.deepEqual([...types].sort(),['foam','ice','metal','plastic','rope','wood']);
});
test('real support disconnect changes location and collision point; protection can be kept intact',()=>{
 const s=createStructure(2,'composite',3);
 const byKey=new Map(s.parts.map(x=>[x.key,x]));
 const c=byKey.get('c'),a=byKey.get('a');
 const before=c.x;
 a.progress=1;a.alive=false;
 updateStructure(s,s.parts);
 assert.notEqual(c.x,before);
 assert.equal(s.failedJoins.some(edge=>edge.includes(a.id)),true);
 const support=s.routes[0];
 for(const id of support){const t=s.parts.find(p=>p.id===id);t.progress=1;t.alive=false;}
 updateStructure(s,s.parts);
 assert.equal(s.completed,true);
 assert.equal(s.primary,1);
 assert.equal(s.quality<=1,true);
 assert.equal(s.parts.find(p=>p.isProtected).progress,0);
});
test('formal score earns quality only from completed real contacts, never blank protected plate',()=>{
 const s=createStructure(2,'precise',4),max=90;
 assert.equal(s.quality,0);
 updateStructure(s,s.parts);
 assert.equal(s.quality,0);
 const pts=structureScore(s,20,max,100,100);
 // Score formula: when P=0, even a perfect protected plate is worth 0.
 assert.equal(pts,0);
});
test('formal cover access makes a different first cut more effective, with no direct stat mean gate',()=>{
  const run=createChallenge(blade,{mode:'formal',seed:7,seconds:90,
    encounter:{structure:true,styleId:'composite',gradient:2},styleId:'composite'}).run;
  const a=run.targets.find(x=>x.key==='a'),c=run.targets.find(x=>x.key==='c');
  assert.equal(c.coveredBy,'a');
  const routeCut=t=>{
    beginSwipe(run);const x=t.x,y=t.y;
    return swipe(run,{x:x-.2,y},{x:x+.2,y},{duration:.18});
  };
  const originalArmor=c.armorLeft;
  const first=routeCut(c);
  assert.ok(first.hits.some(hit=>hit.target.id===c.id));
  const guarded=(originalArmor-c.armorLeft)+c.progress;
  // Compare the same untouched material with the cover now removed.
  c.progress=0;c.armorLeft=originalArmor;c.alive=true;c.cuts=[];
  a.progress=1;a.alive=false;
  updateStructure(run.structure,run.targets);
  const second=routeCut(c);
  assert.ok(second.hits.some(hit=>hit.target.id===c.id));
  const exposed=(originalArmor-c.armorLeft)+c.progress;
  assert.ok(exposed>guarded,'opening structural cover must reduce required effort');
});
test('V4.1 tier budgets, first wins and round receipts are explicit, empty retired records stay legacy',()=>{
 const school={version:'formal-v4.1',result:{version:'formal-v4.1',cut:{structure:{primary:.8}}}};
 assert.equal(isV41Match(school),true);
 assert.equal(careerRewardPlan('school',true,2,school,'m1','press').events[0].cr,SCHOOL_CR[2]);
 assert.equal(careerRewardPlan('school',true,2,school,'m1','press').events[1].cr,SCHOOL_FIRST_CR[2]);
 assert.equal(careerRewardPlan('school',false,2,school,'m2','press').events[0].cr,Math.floor(SCHOOL_CR[2]*.35*.8));
 assert.equal(careerRewardPlan('school',false,2,school,'m2','press').events[0].xp,Math.floor(32*.35*.8));
 assert.equal(careerRewardPlan('school',false,2,{version:'formal-3'},'m3','press').reason,'not-v41');
 const rounds=Array.from({length:5},(_,i)=>({round:i,win:true,primary:1,primaryCompleted:true}));
 const national=careerRewardPlan('national',true,4,{version:'formal-v4.1',rounds},'cup1');
 assert.equal(national.events.filter(x=>x.key.startsWith('round:')).length,5);
 assert.equal(national.events.filter(x=>x.key.startsWith('first:national:')).length,6);
 assert.equal(national.events.reduce((t,x)=>t+x.cr,0),5*60+5*100+160);
 const world=careerRewardPlan('apex',true,4,{version:'formal-v4.1',
   rounds:rounds.slice(0,3).map(r=>({...r,win:false}))},'world1');
 assert.equal(world.events.reduce((t,x)=>t+x.cr,0),3*85+3*120+240);
});

test('Six school rigs have distinct playable silhouettes and physical join graphs, not six recolored copies',()=>{
 const signatures=new Set();
 const names=Object.keys(STRUCTURE_TEMPLATES);
 const validKeys=new Set(['a','b','c','d','e','f']);
 for(const school of names){
   const template=STRUCTURE_TEMPLATES[school],structure=createStructure(73,school,2);
   assert.equal(structure.version,'arena-structure-v4');
   const physical=structure.parts.filter(p=>!p.isProtected);
   assert.equal(physical.length,6);
   const keyMap=new Map(physical.map(p=>[p.key,p]));
   assert.equal(keyMap.size,6);
   const signature=JSON.stringify({
     geometry:physical.map(p=>[p.key,p.x,p.y]),
     joints:template.joins.map(pair=>pair.join('-')),
   });
   assert.equal(signatures.has(signature),false,school+' reuses previous rig geometry and links');
   signatures.add(signature);
   for(const part of physical) {
     assert.ok(validKeys.has(part.key));
     assert.ok(part.x>=.18&&part.x<=.81&&part.y>=.22&&part.y<=.78,school+' off-stage target');
   }
   for(const [a,b] of structure.joins){
     assert.ok(structure.parts.some(p=>p.id===a),school+' unknown physical join');
     assert.ok(structure.parts.some(p=>p.id===b),school+' unknown physical join');
   }
   for(const route of structure.routes){
     assert.equal(route.length,3);
     for(const nodeId of route)assert.ok(structure.joins.some(j=>j.includes(nodeId)),school+' route node is invisible');
     const frozen=createStructure(73,school,2);
     for(const nodeId of route){
       const target=frozen.parts.find(p=>p.id===nodeId);
       target.alive=false;target.progress=1;
     }
     updateStructure(frozen,frozen.parts);
     assert.equal(frozen.completed,true,school+' route cannot complete actual graph');
     assert.equal(frozen.primary,1,school+' route has wrong score');
     assert.ok(frozen.failedJoins.length>0);
   }
   const saved=createStructure(73,school,2);
   const initial=JSON.stringify(saved);
   assert.equal(JSON.stringify(createStructure(73,school,2)),initial,school+' seed not deterministic');
 }
 assert.equal(signatures.size,6);
});

test('Formal structure completion allows an explicit bank-or-continue choice with real score',()=>{
 const run=createChallenge(blade,{mode:'formal',seed:390,seconds:90,
   encounter:{structure:true,styleId:'composite',gradient:1},styleId:'composite'}).run;
 const route=run.structure.routes[0];
 for(const key of route.slice(0,2)){
   const part=run.targets.find(t=>t.id===key);
   part.alive=false;part.progress=1;
 }
 const last=run.targets.find(t=>t.id===route[2]);
 last.progress=.999;last.armorLeft=0;
 updateStructure(run.structure,run.targets);
 assert.equal(run.structure.completed,false);
 beginSwipe(run);
 const cut=swipe(run,{x:last.x-.09,y:last.y},{x:last.x+.09,y:last.y},{duration:.14});
 assert.equal(cut.ok,true);
 assert.ok(cut.hits.some(hit=>hit.target.id===last.id));
 assert.equal(run.structure.completed,true);
 assert.equal(run.done,false,'finishing the objective must not force immediate departure');
 assert.ok(run.targets.some(t=>t.alive&&!t.isProtected),'an optional component remains');
 const points=run.score;
 assert.ok(points>0);
 const result=finish(run,'collected');
 assert.equal(run.done,true);
 assert.equal(result.reason,'collected');
 assert.equal(result.score,points,'player banks already earned score, with no fabricated bonus');
 assert.equal(result.structure.completed,true);
 assert.equal(finish(run,'collected'),result,'cannot settle same run twice');
});

test('Five school grades require visibly different access and actual dismantling, never scaled hidden material HP',()=>{
 for(const name of Object.keys(STRUCTURE_TEMPLATES)){
   const [apprentice,skilled,expert,master,legend]=[0,1,2,3,4].map(rank=>createStructure(91,name,rank));
   const get=(s,key)=>s.parts.find(p=>p.key===key);
   assert.equal(get(apprentice,'c').coveredBy,null);
   assert.equal(get(skilled,'c').coveredBy,'a');
   assert.equal(get(skilled,'e').coveredBy,null);
   assert.equal(get(expert,'e').coveredBy,'c');
   assert.equal(apprentice.protectedId,null);
   assert.ok(expert.protectedId);
   assert.equal(expert.routes[0].length,3);
   assert.equal(master.routes[0].length,4);
   assert.equal(legend.routes[0].length,5);
   assert.ok(master.joins.length>=expert.joins.length);
   assert.ok(legend.joins.length>=master.joins.length);
   for(const rank of [apprentice,skilled,expert,master,legend]){
     assert.ok(rank.parts.filter(p=>!p.isProtected).every(p=>p.difficulty===1),
       name+' must not secretly multiply health with rank');
     const route=rank.routes[0];
     for(const nodeId of route){
       const target=rank.parts.find(p=>p.id===nodeId);
       target.alive=false;target.progress=1;
     }
     updateStructure(rank,rank.parts);
     assert.equal(rank.completed,true,name+' rank '+rank.gradient+' lost a valid finish');
     assert.equal(rank.primary,1);
   }
 }
});
