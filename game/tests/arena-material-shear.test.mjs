import test from 'node:test';
import assert from 'node:assert/strict';
import {drawMaterialShear,MATERIAL_SHEAR_LIFE} from '../src/ui/arenaMaterialShear.js';
test('six distinct material silhouettes are short, deterministic and gameplay-pure',()=>{
 const types=['foam','rope','wood','plastic','ice','metal'];
 const fingerprints=new Set();
 for(const type of types){
   const log=[];
   const ctx={save(){log.push('save')},restore(){log.push('restore')},translate(){},
     rotate(){},beginPath(){log.push('begin')},ellipse(){log.push('ellipse')},
     fill(){log.push('fill')},stroke(){log.push('stroke')},closePath(){},
     moveTo(){},lineTo(){},bezierCurveTo(){log.push('fiber')},fillRect(){log.push('facet')}};
   const event={type,complete:true,event:'kill',at:1000};
   const before=JSON.stringify(event);
   assert.equal(drawMaterialShear(ctx,event,35,120,220,-.3),true,type);
   assert.equal(log[0],'save');assert.equal(log.at(-1),'restore');
   assert.ok(log.filter(x=>x==='fill'||x==='stroke').length>=2);
   fingerprints.add(type+':'+log.join(','));
   assert.equal(JSON.stringify(event),before,'visual must not touch hit physics');
   assert.equal(drawMaterialShear(ctx,event,MATERIAL_SHEAR_LIFE,120,220,-.3),false);
   assert.equal(drawMaterialShear(ctx,event,10,120,220,-.3,true),false,'reduced motion skips shear animation');
   assert.equal(drawMaterialShear(ctx,{...event,event:'blocked'},10,120,220,-.3),false);
 }
 assert.equal(fingerprints.size,6);
});
