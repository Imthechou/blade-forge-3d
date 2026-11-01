import fs from 'node:fs/promises';
import path from 'node:path';
import {loadPlaywright,browserExecutable} from './lib/browser.mjs';
const {chromium}=await loadPlaywright();
const out=path.resolve(process.env.ARENA_QA_OUT||'arena-playtest');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:browserExecutable()});
const page=await browser.newPage({viewport:{width:1100,height:1150},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto(process.env.FORGE_URL||'http://127.0.0.1:8123/');
 const result=await page.evaluate(async()=>{
   const S=await import('/src/ui/arenaSprites.js');await S.prepareArenaSprites();
   const {targetPose}=await import('/src/ui/arenaImpact.js');
   const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1100;
   canvas.id='cut-qa';canvas.style='position:fixed;inset:0;z-index:999999;background:#f4f7f9';
   document.body.replaceChildren(canvas);const c=canvas.getContext('2d');
   c.fillStyle='#f4f7f9';c.fillRect(0,0,1080,1100);
   c.fillStyle='#17344b';c.font='600 25px system-ui';c.fillText('六材质 / 实际刀口裁切，物体朝向保持连续',30,38);
   const names=['泡棉','绳束','木桩','塑板','冰块','金属块'];
   const directions=[0,Math.PI/4,Math.PI/2];const proof=[];
   for(let row=0;row<6;row++)for(let col=0;col<3;col++){
     const type=S.TYPES[row],a=directions[col],x=180+col*355,y=151+row*163;
     c.save();c.translate(x,y);
     for(const side of [-1,1]){
       c.save();c.translate(-Math.sin(a)*side*10,Math.cos(a)*side*10);
       S.drawSplitSprite(c,type,side,96,115,a);c.restore();
     }c.restore();
     c.fillStyle='#17344b';c.font='14px system-ui';c.textAlign='center';
     c.fillText(names[row]+' · '+Math.round(a*180/Math.PI)+'°',x,y+81);
     // At zero separation, the fragments must preserve the original silhouette.
     const whole=new OffscreenCanvas(180,180),parts=new OffscreenCanvas(180,180);
     const w=whole.getContext('2d'),p=parts.getContext('2d');w.translate(90,90);p.translate(90,90);
     S.drawWholeSprite(w,type,0,0,96,115);
     S.drawSplitSprite(p,type,-1,96,115,a);S.drawSplitSprite(p,type,1,96,115,a);
     const wa=w.getImageData(0,0,180,180).data,pa=p.getImageData(0,0,180,180).data;
     let mismatch=0,coverage=0;
     for(let i=3;i<wa.length;i+=4){if(wa[i]>40)coverage++;if((wa[i]>40)!==(pa[i]>40))mismatch++;}
     if(mismatch/coverage>.025)throw Error(type+' fracture silhouette drift '+mismatch+'/'+coverage);
     proof.push({type,angle:a,mismatch,coverage});
   }
   if(S.spriteStatus().fractures>S.spriteStatus().fractureLimit)throw Error('Fracture cache escaped budget');
   const frozen=targetPose({id:'motion-proof',type:'rope'},2400,.5,true);
   if(frozen.angle!==0||frozen.x!==0||frozen.y!==0)throw Error('Reduced motion changed');
   const original={id:'motion-proof',type:'rope',x:.5,y:.5};
   const a=targetPose(original,2400,.5),b=targetPose(original,3000,.5);
   if(a.angle===b.angle)throw Error('Idle pose static');
   return {proof,status:S.spriteStatus(),motion:{first:a,second:b,reduced:frozen}};
 });
 await page.locator('#cut-qa').screenshot({path:path.join(out,'cut-directions.png')});
 // Real Canvas renderer with six actual rig graphs. The sheet is for the
 // reviewer to see intact, fresh fracture and settling, not a mock illustration.
 const rigs=await page.evaluate(async()=>{
   const {createStructure,updateStructure}=await import('/src/core/arenaStructures.js');
   const {drawArenaStage}=await import('/src/ui/arenaStage.js');
   const styles=['edge','press','precise','quench','composite','overload'];
   const c=document.createElement('canvas');c.width=1170;c.height=1140;c.id='structure-review';
   c.style='position:fixed;inset:0;z-index:999999;background:#f4f7f9';
   document.body.replaceChildren(c);
   const ctx=c.getContext('2d');
   const states=styles.map((id,i)=>{
     const structure=createStructure(43210+i,id,3);
     const run={version:'arena-v4.1',mode:'formal',phase:'active',elapsed:9,
       remaining:36,total:45,health:100,maxHealth:100,score:0,combo:0,kills:0,
       structure,targets:structure.parts,guide:null};
     return {id,run};
   });
   const snapshot=()=>JSON.stringify(states.map(s=>s.run.structure));
   const labels=['锻压','承重','精密','淬彩','复合','过载'];
   const paint=(time)=>{
     ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#F4F7F9';ctx.fillRect(0,0,1170,1140);
     for(let i=0;i<states.length;i++){
       const col=i%3,row=Math.floor(i/3),x=col*390,y=row*570;
       ctx.save();ctx.translate(x,y);ctx.beginPath();ctx.rect(0,0,390,570);ctx.clip();
       drawArenaStage(ctx,states[i].run,390,510,{now:time,reducedMotion:false});
       ctx.textAlign='center';ctx.font='600 16px system-ui';
       ctx.fillStyle='#243A4A';ctx.fillText(labels[i]+' / '+states[i].id,195,543);
       ctx.restore();
     }
   };
   paint(1000);
   const original=snapshot();
   const sourceImage=ctx.getImageData(0,0,1170,1140).data.slice();
   window.__rigReviewAdvance=()=>{
     for(const state of states){
       const target=state.run.structure.parts.find(t=>t.key==='a');
       target.alive=false;
       updateStructure(state.run.structure,state.run.targets);
     }
     const beforePaint=snapshot();
     paint(1001);paint(1201);
     if(snapshot()!==beforePaint)throw Error('visual painter mutated actual structure');
     const diff=ctx.getImageData(0,0,1170,1140).data;
     let changed=0;for(let i=0;i<diff.length;i+=16){
       if(Math.abs(diff[i]-sourceImage[i])+Math.abs(diff[i+1]-sourceImage[i+1])+
         Math.abs(diff[i+2]-sourceImage[i+2])>55)changed++;
     }
     if(changed<500)throw Error('broken supports not visibly different '+changed);
     return {changedSamplePixels:changed,styles:states.map(s=>({
       id:s.id,brokenJoins:s.run.structure.failedJoins.length,
       targetPosition:[s.run.structure.parts[1].x,s.run.structure.parts[1].y],
     }))};
   };
   if(snapshot()!==original)throw Error('intact renderer mutated structure');
   return {styles,mode:'actual drawArenaStage Canvas',modelMutations:0};
 });
 await page.locator('#structure-review').screenshot({path:path.join(out,'rigs-before.png')});
 const breakResult=await page.evaluate(()=>window.__rigReviewAdvance());
 await page.locator('#structure-review').screenshot({path:path.join(out,'rigs-broken.png')});
 if(breakResult.styles.some(s=>s.brokenJoins<1))throw Error('Missing actual failed joins');
 await fs.writeFile(path.join(out,'rig-structure-report.json'),JSON.stringify({rigs,...breakResult},null,2));
 console.log('STRUCTURE_BREAK_VISUAL_QA',JSON.stringify(breakResult));
 await fs.writeFile(path.join(out,'cut-direction-report.json'),JSON.stringify({pass:!errors.length,errors,...result},null,2));
 console.log(JSON.stringify({pass:!errors.length,checks:result.proof.length,cache:result.status}));
 if(errors.length)throw Error('Browser errors: '+errors.join('\n'));
}finally{await browser.close();}
