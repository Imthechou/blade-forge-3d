import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSave,normalizeSave} from '../src/core/saveSchema.js';
import * as Career from '../src/core/arenaCareerV41.js';
import * as F from '../src/core/arenaFormal.js';
import {sampleBlade} from '../tools/arena-v3-simulate.mjs';

const blade=sampleBlade(100);
const score=(s,sec)=>({measure:s/1000,detail:{source:'arenaChallenge',duration:sec,score:s,
  structure:{completed:s>=750,primary:s/1000}}});

test('old career saves migrate additively without touching knives or legacy cups',()=>{
  const raw=makeSave();
  delete raw.arenaCareerV41;
  raw.collection=[{...blade}];
  raw.nationalRuns.active={id:'legacy-national',round:2};
  const migrated=normalizeSave(raw);
  assert.equal(migrated.arenaCareerV41.version,1);
  assert.equal(migrated.arenaCareerV41.national.active,null);
  assert.deepEqual(migrated.nationalRuns.active,{id:'legacy-national',round:2});
  assert.deepEqual(migrated.collection[0].stats,blade.stats);
  assert.equal(Career.normalizeCareerV41(migrated.arenaCareerV41).version,1);
});
test('checkpointed national completed round survives reload; interrupted round restarts at same seed',()=>{
  const n=F.createNationalMatch({blade,seed:112233}).match;
  const a=F.nationalStartRound(n,[blade]);
  assert.ok(a.ok);
  const first=a.roundMatch.seed;
  assert.ok(F.nationalSubmit(n,score(1000,a.roundMatch.definition.rules[0].seconds)).ok);
  assert.equal(n.roundIndex,1);
  F.nationalStartRound(n,[blade]);
  assert.equal(n.rounds[1].status,'active');
  const cp=Career.recoverCareerMatch(JSON.parse(JSON.stringify(n)));
  assert.equal(cp.roundIndex,1);
  assert.equal(cp.rounds[0].result.win,true);
  assert.equal(cp.rounds[0].status,'complete');
  assert.equal(cp.rounds[1].status,'pending');
  assert.equal(cp.rounds[1].roundMatch,null);
  assert.equal(F.nationalStartRound(cp,[blade]).roundMatch.seed,(cp.seed+7919)>>>0);
  assert.equal(first,n.seed);
});
test('failed national attempt retries current frozen round without erasing previous wins',()=>{
  const n=F.createNationalMatch({blade,seed:123}).match;
  F.nationalStartRound(n,[blade]);
  const fail=F.nationalSubmit(n,score(0,n.rounds[0].roundMatch.definition.rules[0].seconds));
  assert.equal(fail.retry,true);
  assert.equal(n.roundIndex,0);
  assert.equal(n.rounds[0].attempts,1);
  assert.equal(n.done,false);
  const second=F.nationalStartRound(n,[blade]);
  assert.equal(second.roundMatch.seed,123);
  F.nationalSubmit(n,score(1000,second.roundMatch.definition.rules[0].seconds));
  assert.equal(n.roundIndex,1);
  assert.equal(n.rounds[0].result.win,true);
});
test('world roster is fixed before start, retries same slot and retains best legal score',()=>{
  const b=[blade,{...blade,id:'test-b'}, {...blade,id:'test-c'}];
  const m=F.createApexMatch({blades:b,seed:155}).match;
  assert.equal(F.apexAvailable(m)[0].id,b[0].id);
  assert.equal(F.apexDispatch(m,b,b[1].id).ok,false);
  for(let i=0;i<3;i++){
    assert.ok(F.apexDispatch(m,b,b[i].id).ok);
    const sec=m.rounds[i].match.definition.rules[0].seconds;
    F.apexSubmit(m,score(930,sec));
  }
  assert.equal(m.done,true);assert.equal(m.result.win,true);
  const r=F.apexRetryRound(m,1);
  assert.equal(r.ok,true);
  assert.equal(m.roundIndex,1);
  assert.equal(F.apexAvailable(m)[0].id,b[1].id);
  const d=F.apexDispatch(m,b,b[1].id);assert.ok(d.ok);
  assert.equal(d.roundMatch.seed,(155+7919)>>>0);
  F.apexSubmit(m,score(800,d.roundMatch.definition.rules[0].seconds));
  assert.equal(m.rounds[1].result.composite,930,'lower retake never overwrites best');
  assert.equal(m.result.composite,2790);
  assert.equal(m.result.win,true);
  assert.equal(m.retryCount,1);
});
