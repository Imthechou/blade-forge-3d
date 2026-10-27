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
 await fs.writeFile(path.join(out,'cut-direction-report.json'),JSON.stringify({pass:!errors.length,errors,...result},null,2));
 console.log(JSON.stringify({pass:!errors.length,checks:result.proof.length,cache:result.status}));
 if(errors.length)throw Error('Browser errors: '+errors.join('\n'));
}finally{await browser.close();}
