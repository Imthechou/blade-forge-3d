import test from 'node:test';
import assert from 'node:assert/strict';
import * as Risk from '../src/core/risk.js';
import * as Challenge from '../src/core/arenaChallenge.js';
import { quickChallengeKey } from '../src/core/quickChallengeRecords.js';

const stats = Object.freeze({strength:60,toughness:60,sharpness:60,craft:60,design:60,spirit:60});
const blade = () => ({id:'v41-test-blade',name:'V4.1 基准刀',stats:{...stats},score:100,traits:[],tags:{},tagTiers:[],effects:{}});

test('V4.1 anchors are linearly interpolated, shared by check and preview', () => {
  for (const [risk,expected] of [[0,0],[12,0],[18,.01],[24,.02],[30,.035],[36,.05],[48,.1],[54,.14],[60,.18],[72,.30],[84,.45],[92,.525],[100,.60]]) {
    assert.ok(Math.abs(Risk.breakChance(risk)-expected)<1e-9,'risk '+risk);
    assert.equal(Risk.check(risk,()=>1).chance,Risk.breakChance(risk));
  }
  assert.ok(Math.abs(Risk.breakChance(100,.8)-.48)<1e-9);
});

test('V4.1 quick starts immediately without all three random offer interrupts', () => {
  const created=Challenge.createChallenge(blade(),{seed:7291,mode:'quick'});
  assert.equal(created.ok,true);
  const r=created.run;
  assert.equal(r.augments,false);
  assert.deepEqual(r.offers,[]);
  assert.equal(r.phase,'warmup');
  assert.equal(r.rulesVersion,'arena-v4.1');
  assert.equal(quickChallengeKey(r),'quick:v41:free');
  for(let i=0;i<360&&!r.done;i++) Challenge.tick(r,.125);
  assert.equal(r.done,true);
  assert.ok(r.elapsed>=45);
  assert.equal(r.result.reason,'time');
  assert.equal(r.choicesMade,0);
  assert.equal(r.result.reward,0,'empty 45-second session cannot earn CR');
  assert.equal(r.health,r.maxHealth,'quick mode has no passive wear');
});

test('quick and formal have separate damage and persistent blade record remains unchanged', () => {
  const original=blade();
  const r=Challenge.createChallenge(original,{seed:7211,mode:'quick'}).run;
  const t=r.targets.find(t=>t.alive);
  assert.ok(t);
  Challenge.beginSwipe(r);
  Challenge.swipe(r,{x:t.x-.14,y:t.y-.022},{x:t.x+.14,y:t.y+.022},{duration:.15});
  assert.equal(r.health,r.maxHealth);
  assert.equal(original.fractured,undefined);
  assert.deepEqual(original.stats,stats);
});

test('v4 quick must never terminate from wearout even if called explicitly', () => {
  const r=Challenge.createChallenge(blade(),{seed:11}).run;
  Challenge.finish(r,'wearout');
  assert.equal(r.result.fractured,false);
  assert.equal(r.result.reward,0);
});
