import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {bakeS5Optical,s5Pattern,getS5OpticalTexture} from '../src/render/v2/s5OpticalArt.js';
const seed=[0.21,0.58,0.37,0.88];
const hash=x=>createHash('sha256').update(x).digest('hex');
test('25 optical identities replay exactly and each varies across run seeds',()=>{
  const identities=new Set();
  for(let i=1;i<=25;i++){
    const id='S5_'+String(i).padStart(2,'0');
    const a=bakeS5Optical(id,seed), b=bakeS5Optical(id,seed);
    const c=bakeS5Optical(id,[0.82,0.17,0.61,0.31]);
    assert.equal(a.data.length,256*128*4);
    assert.equal(hash(a.data),hash(b.data),id+' must replay');
    assert.notEqual(hash(a.data),hash(c.data),id+' must vary');
    identities.add(hash(a.data));
  }
  assert.equal(identities.size,25);
});
test('rare cosmetic patterns are deterministic, reachable and independent of gameplay',()=>{
  const hits=[];
  for(let n=0;n<1000;n++)if(s5Pattern('S5_16',[.2,n/1000,.3,.4]).rare)hits.push(n);
  assert.ok(hits.length>30&&hits.length<100);
  const a=s5Pattern('S5_16',[.2,hits[0]/1000,.3,.4]);
  assert.equal(a.variant,'蓝宝石心');
  assert.deepEqual(a,s5Pattern('S5_16',[.2,hits[0]/1000,.3,.4]));
  assert.deepEqual(a,s5Pattern('S5_16',[.9,hits[0]/1000,.3,.4]),'S3 index cannot reroll S5 art');
});
test('optical GPU allocations are reused per material and isolated between live previews',()=>{
  let allocations=0,disposals=0;
  class DataTexture {constructor(data,width,height){allocations++;this.image={data,width,height};}dispose(){disposals++;}}
  const THREE={DataTexture,RGBAFormat:1,LinearFilter:2,ClampToEdgeWrapping:3};
  const owner=()=>({addEventListener(event,cb){this.onDispose=cb;}});
  const a=owner(),b=owner();
  const first=getS5OpticalTexture(THREE,'S5_20',seed,true,a);
  const old=hash(first.image.data);
  const other=getS5OpticalTexture(THREE,'S5_20',[.8,.2,.4,.7],true,b);
  assert.notEqual(first,other);assert.equal(hash(first.image.data),old);
  for(let i=1;i<=25;i++)assert.equal(getS5OpticalTexture(THREE,'S5_'+String(i).padStart(2,'0'),seed,true,a),first);
  assert.equal(allocations,2);a.onDispose();b.onDispose();assert.equal(disposals,2);
});
