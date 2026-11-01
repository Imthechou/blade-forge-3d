import test from 'node:test';
import assert from 'node:assert/strict';
import {breakPosition,createBreakTracker,linkStyle,LINK_STYLES,joinedKey} from '../src/ui/arenaStructureVisual.js';
import {createStructure,updateStructure,STRUCTURE_TEMPLATES} from '../src/core/arenaStructures.js';
test('each of six formal schools has physical-looking bounded support rendering',()=>{
  assert.equal(new Set(Object.values(LINK_STYLES).map(x=>x.body)).size,5);
  for(const [id] of Object.entries(STRUCTURE_TEMPLATES)){
    const rig=createStructure(7,id,4);
    const style=linkStyle(rig.kind);
    assert.ok(style.body&&style.broken&&style.highlight&&style.face);
    assert.ok(style.width>=.018&&style.width<=.028);
  }
  assert.equal(joinedKey('struct-b','struct-a'),joinedKey('struct-a','struct-b'));
});
test('a failed joint never heals visually; newly failed joints settle within 650ms',()=>{
  const track=createBreakTracker(),rig=createStructure(10,'press',2);
  const original=JSON.stringify(rig),base=new Set();
  assert.deepEqual([...track(rig,base,1000)],[]);
  assert.deepEqual([...track(rig,base,1150)],[]);
  const key=joinedKey(...rig.joins[0]);
  assert.deepEqual([...track(rig,new Set([key]),1200)],[[key,0]]);
  assert.deepEqual([...track(rig,new Set([key]),1280)],[[key,80]]);
  assert.equal(track(rig,new Set([key]),1900).has(key),false);
  assert.equal(track(rig,new Set([key]),1950).has(key),false);
  assert.equal(JSON.stringify(rig),original,'visual state must not pollute save or collision data');
  const restored=createBreakTracker();
  assert.equal(restored(rig,new Set([key]),1970).has(key),false,'old broken joins must start settled');
});
test('each fragment drops and separates with a limited material-neutral visual motion',()=>{
  const old=breakPosition(0,-1),mid=breakPosition(280,-1),final=breakPosition(650,-1);
  assert.ok(Math.abs(old.normal)<Math.abs(final.normal));
  assert.ok(mid.drop>old.drop&&final.drop>old.drop);
  assert.equal(breakPosition(800,-1).drop,final.drop);
  assert.deepEqual(breakPosition(0,1,true),breakPosition(700,1,true));
  for(const age of [0,20,100,280,560,1000]){
    for(const side of [-1,1]){
      const a=breakPosition(age,side);
      assert.ok(Math.abs(a.normal)<1.1&&a.drop<=1.05&&Math.abs(a.tilt)<1.1);
      assert.ok(Object.values(a).every(Number.isFinite));
    }
  }
});
test('rendering helpers do not modify physics-linked structure positions',()=>{
  const rig=createStructure(41,'quench',3),before=JSON.stringify(rig);
  const track=createBreakTracker();track(rig,new Set(),1234);
  for(let i=0;i<10;i++)breakPosition(i*90,-1);
  assert.equal(JSON.stringify(rig),before);
  rig.parts[0].alive=false;updateStructure(rig,rig.parts);
  assert.ok(rig.failedJoins.length>0);
  const k=joinedKey(...rig.failedJoins[0]);
  assert.equal(track(rig,new Set([k]),1300).get(k),0);
});
