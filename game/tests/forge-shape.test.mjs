import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizedShapeProfile,noteHammerShape,MAX_SHAPE_MARKS} from '../src/core/forgeShape.js';

test('only five-screen S4 impacts persist as a compact and bounded recipe',()=>{
  const run={flowVersion:'five-screen-v1',phase:'hammer',shapeProfile:null};
  for(let i=0;i<MAX_SHAPE_MARKS+12;i++)noteHammerShape(run,{x:i%2?1.7:-.5,y:i/MAX_SHAPE_MARKS});
  assert.equal(run.shapeProfile.version,1);
  assert.equal(run.shapeProfile.marks.length,MAX_SHAPE_MARKS);
  for(const mark of run.shapeProfile.marks){
    assert.ok(mark.x>=0&&mark.x<=1&&mark.y>=0&&mark.y<=1);
  }
  const saved=JSON.parse(JSON.stringify(run.shapeProfile));
  assert.deepEqual(normalizedShapeProfile(saved),saved);
  assert.equal(noteHammerShape(run,{x:.5,y:.5}),false);
});

test('old runs and fracture results never synthesize a custom knife geometry',()=>{
  const old={flowVersion:null,phase:'hammer',shapeProfile:null};
  assert.equal(noteHammerShape(old,{x:.8,y:.4}),false);
  assert.equal(old.shapeProfile,null);
  const broken={flowVersion:'five-screen-v1',phase:'fractured',shapeProfile:null};
  assert.equal(noteHammerShape(broken,{x:.6,y:.3}),false);
  assert.equal(broken.shapeProfile,null);
});

test('invalid or hostile old shape recipes never survive normalization',()=>{
  assert.equal(normalizedShapeProfile({version:4,marks:[{x:1,y:1}]}),null);
  assert.equal(normalizedShapeProfile({version:1,marks:[{x:'NaN',y:.2},{x:0,y:NaN}]}),null);
  assert.deepEqual(normalizedShapeProfile({version:1,marks:[{x:-100,y:1000}]}),
    {version:1,marks:[{x:0,y:1}]});
});
