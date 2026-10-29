import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MARK_INKS, MARK_TYPES, handmarkMetrics, drawTargetHandmark } from '../src/ui/arenaDoodle.js';
import { cutImpact } from '../src/ui/arenaImpact.js';

function recordingCanvas(){
  const calls=[];let depth=0;
  const ctx=new Proxy({},{
    get(_obj,property){
      if(property==='save')return ()=>{depth++;calls.push('save');};
      if(property==='restore')return ()=>{depth--;calls.push('restore');};
      return (...args)=>{calls.push(String(property));for(const a of args)
        assert.ok(typeof a!=='number'||Number.isFinite(a),'invalid Canvas coordinate');};
    },
    set(_obj,key,value){if(key==='lineWidth')assert.ok(Number.isFinite(value));return true;},
  });
  return {ctx,calls,getDepth:()=>depth};
}

test('Six distinct hand-authored ink markers are bounded, repeatable and leave targets untouched',()=>{
  assert.equal(MARK_TYPES.length,6);
  assert.equal(new Set(Object.values(MARK_INKS)).size,6);
  for(const type of MARK_TYPES){
    const record=recordingCanvas(),target={id:'fixture-'+type,type,x:.5,y:.6,progress:.35};
    const before=JSON.stringify(target);
    drawTargetHandmark(record.ctx,target,180,270,61,86,70);
    assert.equal(record.getDepth(),0,type+' must restore canvas stack');
    assert.ok(record.calls.includes('stroke'),type+' has a visible ink outline');
    assert.ok(record.calls.includes('fill'),type+' has a flat handmade sticker body');
    assert.equal(JSON.stringify(target),before,type+' must not mutate hit box/state');
  }
});
test('Markers stay small on narrow phones, never grow with CSS viewport',()=>{
  for(const u of [32,64,88,140,220]){
    const d=handmarkMetrics(70,112,u);
    assert.ok(d.radius>=4 && d.radius<=8.5);
    assert.ok(d.inkWidth>=1.3 && d.inkWidth<=2);
    assert.ok(d.offsetX>0 && d.offsetY<0);
  }
  const blank=recordingCanvas();
  drawTargetHandmark(blank.ctx,{type:'unknown'},0,0,40,60,30);
  assert.equal(blank.calls.length,0);
});
test('Visual material feedback uses no generated flash or fragment sprite dependency',()=>{
  const stage=fs.readFileSync(new URL('../src/ui/arenaStage.js',import.meta.url),'utf8');
  assert.doesNotMatch(stage,/drawFlashSprite\s*\(/);
  assert.doesNotMatch(stage,/drawShardSprite\s*\(/);
  assert.match(stage,/drawTargetHandmark\s*\(/);
  assert.match(stage,/function drawBursts\s*\(/);
  for(const type of MARK_TYPES){
    const fx=cutImpact({target:{type},quality:'CLEAN',complete:true,contactEvent:'kill'});
    assert.ok(fx.particleCount<=3,type+' should use at most 3 material chips');
  }
});
