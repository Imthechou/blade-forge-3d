import test from 'node:test';
import assert from 'node:assert/strict';
import { S5_EFFECTS, resolveS5Effect, applyS5Effect, finishOperators } from '../src/render/v2/finishRecipe.js';

const seeds=[0.31,0.57,0.79,0.26];
const options=(cardId)=>({chosen:true,cardId,baseHex:'#687a90',amount:.75,colorPhase:.4,coat:.3});
const cases=[
 ['S5_14',4,'marbleFade'],['S5_16',6,'caseHardened'],
 ['S5_18',6,'caseHardened'],['S5_19',8,'fade'],
 ['S5_20',10,'doppler'],['S5_21',10,'gemDoppler'],
 ['S5_23',8,'fadeColdHot'],
];
test('S5 signature paint families are explicit and stable for each card',()=>{
 for(const [id,fid,key] of cases){
   const x=resolveS5Effect(fid,3,.33,seeds,options(id));
   const y=resolveS5Effect(fid,3,.33,seeds,options(id));
   assert.equal(x?.key,key,id);assert.deepEqual(x,y);
   const output=applyS5Effect(finishOperators(fid,{amount:.75},{finishId:fid}),x,{});
   assert.equal(output.premiumLook,Number(S5_EFFECTS[key].look),id);
   assert.equal(output.palette.length,4,id);
   assert.ok(output.palette.every(c=>/^#[0-9a-f]{6}$/i.test(c)),id);
 }
});
test('S5 never activates unchosen or ordinary lower-tier premium recipes',()=>{
 assert.equal(resolveS5Effect(10,4,.22,seeds,{chosen:false,cardId:'S5_21'}),null);
 assert.equal(resolveS5Effect(10,1,.22,seeds,options('S5_21')),null);
 assert.equal(finishOperators(1,{},{finishId:1}).chosen,false);
});
test('four jewel palettes can all be deterministically generated',()=>{
 const keys=new Set();
 for(let i=1;i<=40;i++){
   const x=resolveS5Effect(10,5,.2,[i/41,0.31,(i*7%41)/41,0.2],options('S5_21'));
   keys.add(x.gemVariant);
 }
 assert.deepEqual([...keys].sort(),[0,1,2,3]);
});
