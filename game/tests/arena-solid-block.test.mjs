import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIALS, createChallenge, finish } from '../src/core/arenaChallenge.js';

const blade={id:'solid-block-acceptance',bladeName:'检验唐刀',knifeTypeId:'tang',
  canEnterArena:true,fractured:false,score:300,tags:{},traits:[],combos:[],
  stats:{strength:120,toughness:120,sharpness:120,craft:120,design:120,spirit:120}};

test('V3 solid metal block retains its solid silhouette and high-risk material identity',()=>{
  const m=MATERIALS.metal;
  assert.equal(m.name,'金属块');
  assert.equal(m.short,'金属块');
  assert.equal(m.solid,true);
  assert.equal(m.tubular,undefined);
  assert.equal(m.hard,1);
  assert.equal(m.armor,1);
  assert.equal(m.health,6.4);
  assert.equal(m.damage,0.72);
  assert.equal(m.points,460);
});

test('manual early end returns partial viewing report but earns no CR or completion',()=>{
  const made=createChallenge(blade,{seed:105,mode:'quick'});
  assert.ok(made.ok);
  const r=made.run;
  assert.equal(r.done,false);
  const finishResult=finish(r,'manual');
  assert.ok(finishResult);
  assert.equal(r.done,true);
  assert.equal(r.phase,'result');
  assert.equal(finishResult.reason,'manual');
  assert.equal(finishResult.reward,0);
  assert.equal(finish(r,'manual'),finishResult,'manual finish must be idempotent');
});
