/** Product inspection + actual production arena renderer; fixtures are labeled. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable,baseUrl} from './lib/browser.mjs';
const out=path.resolve(process.env.ART_QA_OUT||'premium-art-evidence');fs.mkdirSync(out,{recursive:true});
const {chromium}=await loadPlaywright();
const browser=await chromium.launch({headless:true,executablePath:browserExecutable(),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={engine:'Chromium / software WebGL; not physical mobile',errors:[],http:[],cases:[]};
let page;
try{
 for(const [label,url] of [...(process.env.ART_BASELINE_URL?[['before',process.env.ART_BASELINE_URL]]:[]),['after',baseUrl]]){
  const context=await browser.newContext({viewport:{width:375,height:812},isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:'zh-CN',recordVideo:process.env.ART_QA_VIDEO==='1'?{dir:path.join(out,'videos'),size:{width:375,height:812}}:undefined});
  await context.addInitScript(()=>localStorage.setItem('bladeforge.save',JSON.stringify({version:1,settings:{tutorialSeen:true,sound:false,motion:'full'}})));
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)report.http.push(r.url())});
  await page.goto(url);await page.waitForFunction(()=>window.__FORGE_PREP?.ready&&!document.querySelector('#boot'),null,{timeout:120000});
  for(const [id,material,finish] of [['tangdao','M02','F01'],['karambit','M06','F04'],['balisong','M14','F02']]){
   await page.evaluate(async({id,material,finish})=>{
    const G=(await import('/src/app/game.js')).default;
    G.showRecord({id:'art-'+id,knifeTypeId:id,knifeType:'knife_'+id,seed:4100,score:320,stats:{strength:100,toughness:100,sharpness:100,craft:100,design:100,spirit:100},history:[],pendingSkin:{materialId:material,textureId:'T02',finishId:finish,wear:.015,variants:{},handle:{metalId:'polymer'}}});
    const s=(await import('/src/render/index.js')).getStage();await s.settle();await s.viewer.precompile();s.resize();
   },{id,material,finish});
   await page.waitForTimeout(500);await page.screenshot({path:path.join(out,`${label}-${id}-rest.png`)});
   const state=()=>page.evaluate(async()=>{const s=(await import('/src/render/index.js')).getStage(),v=s.viewer;return {camera:v.camera.position.toArray(),geometry:v.renderer.info.memory.geometries,textures:v.renderer.info.memory.textures,tween:!!v._camTween};});
   if(label==='after'){
    const start=await state();await page.getByRole('button',{name:'检视刀具光影',exact:true}).click();await page.waitForTimeout(600);
    const mid=await state();await page.screenshot({path:path.join(out,`${label}-${id}-inspect.png`)});await page.waitForTimeout(1550);const end=await state();
    assert.ok(mid.camera.some((n,i)=>Math.abs(n-start.camera[i])>.01),'inspection must move the actual camera');
    assert.ok(end.camera.every((n,i)=>Math.abs(n-start.camera[i])<.002),'inspection returns to its exact start');
    assert.equal(end.tween,false);assert.equal(end.geometry,start.geometry);assert.equal(end.textures,start.textures);
    report.cases.push({id,start,mid,end});
   }
  }
  // Actual 3D shells, not a DOM glow: verify the new shader compiles and stays bounded.
  await page.evaluate(async()=>{const s=(await import('/src/render/index.js')).getStage();s.applyGlow('K13');await s.viewer.precompile();});
  await page.waitForTimeout(250);await page.screenshot({path:path.join(out,`${label}-energy-025.png`)});
  await page.waitForTimeout(700);await page.screenshot({path:path.join(out,`${label}-energy-095.png`)});
  const shells=await page.evaluate(async()=>{const s=(await import('/src/render/index.js')).getStage(),v=s.viewer;return {count:v._effect?.items.length,time:v._effect?.uniforms.uTime.value,geometry:v.renderer.info.memory.geometries,textures:v.renderer.info.memory.textures};});
  assert.ok(shells.count>0&&shells.count<=36);report.cases.push({label,shells});
  if(label==='after'){
   const reduced=await page.evaluate(async()=>{
    const s=(await import('/src/render/index.js')).getStage(),v=s.viewer;
    v.setReduceMotion(true);const before=v.camera.position.toArray();s.inspectKnife();
    return {before,after:v.camera.position.toArray(),time:v._effect.uniforms.uTime.value,tween:!!v._camTween};
   });
   assert.deepEqual(reduced.before,reduced.after);assert.equal(reduced.time,0);assert.equal(reduced.tween,false);
   report.cases.push({reduced});
  }
  // Visual-only impact gallery. It uses drawArenaStage itself, never mock VFX.
  const data=await page.evaluate(async()=>{
   const {drawArenaStage}=await import('/src/ui/arenaStage.js'),S=await import('/src/ui/arenaSprites.js');await S.prepareArenaSprites();
   const canvas=document.createElement('canvas');canvas.width=1125;canvas.height=1100;
   const c=canvas.getContext('2d'),types=['foam','rope','wood','plastic','ice','metal'];
   c.fillStyle='#EEF2F8';c.fillRect(0,0,1125,1100);
   for(let i=0;i<types.length;i++){
    const x=i%3*375,y=Math.floor(i/3)*550,type=types[i];c.save();c.translate(x,y);
    const run={targets:[{id:'review-'+type,type,x:.5,y:.48,alive:true,progress:.4,armorLeft:.2,cuts:[],layout:'structure',createdAt:0}],elapsed:2,mode:'quick',params:{forgeTraits:[{id:'cold'}]}};
    const b={x:.5,y:.48,type,at:1000,angle:-.28,weight:type==='metal'?1:.6,complete:true,quality:'PERFECT',event:'kill',particleCount:3};
    drawArenaStage(c,run,375,500,{now:1060,bursts:[b],hitLabels:[],trail:[{a:{x:.12,y:.60},b:{x:.85,y:.4},at:1040}],debris:[],reducedMotion:false});
    c.fillStyle='#24324A';c.font='bold 18px sans-serif';c.fillText(type,16,530);c.restore();
   }
   const benchmark=document.createElement('canvas');benchmark.width=375;benchmark.height=500;
   const ctx=benchmark.getContext('2d'),samples=[];
   const run={targets:types.map((type,i)=>({id:'bench'+i,type,x:.25+(i%2)*.5,y:.22+Math.floor(i/2)*.26,alive:true,progress:.2,armorLeft:1,cuts:[],layout:'structure',createdAt:0})),elapsed:2,mode:'quick',params:{forgeTraits:[]}};
   const before=JSON.stringify(run);
   const effects={now:1060,bursts:run.targets.map(t=>({...t,at:1000,complete:true,weight:.7,angle:-.3,particleCount:3})),trail:[{a:{x:.1,y:.7},b:{x:.9,y:.2},at:1040}],hitLabels:[],debris:[]};
   for(let i=0;i<90;i++){const start=performance.now();drawArenaStage(ctx,run,375,500,effects);if(i>=10)samples.push(performance.now()-start);}
   if(JSON.stringify(run)!==before)throw Error('visual rendering changed the gameplay fixture');
   samples.sort((a,b)=>a-b);
   return {image:canvas.toDataURL('image/png'),cpuSubmission:{method:'80 warmed Canvas2D fixture submissions, DPR1; not display FPS or phone GPU',p50:samples[40],p95:samples[76],gameplayUnchanged:true}};
  });
  fs.writeFileSync(path.join(out,`${label}-six-material-contact.png`),Buffer.from(data.image.split(',')[1],'base64'));
  report.cases.push({label,cpuSubmission:data.cpuSubmission});
  // Three material identities × blocked / partial cut / full separation.
  // Three fixed times expose the contact accent lifetime, not a fake single
  // "pretty" frame. Use the *production* Canvas2D renderer in both SHAs.
  const contactFrames=await page.evaluate(async()=>{
    const {drawArenaStage}=await import('/src/ui/arenaStage.js');
    const {prepareArenaSprites}=await import('/src/ui/arenaSprites.js');
    await prepareArenaSprites();
    const types=['wood','ice','metal'],events=['blocked','cut','kill'];
    const frames=[];
    for(const age of [15,65,125]){
      const cv=document.createElement('canvas');cv.width=1125;cv.height=1500;
      const ctx=cv.getContext('2d');
      for(let j=0;j<events.length;j++)for(let i=0;i<types.length;i++){
        const type=types[i],event=events[j],complete=event==='kill';
        ctx.save();ctx.translate(i*375,j*500);
        const target={id:'art-'+type,type,x:.5,y:.49,alive:!complete,
          progress:complete?1:event==='blocked'?.04:.55,armorLeft:event==='blocked'?.84:0,
          cuts:[{angle:-.35,y:-.03,progress:.55}],lastAngle:-.35,
          layout:'structure',createdAt:0};
        const run={targets:[target],elapsed:2,mode:'quick',params:{forgeTraits:[]}};
        const b={targetId:target.id,x:.54,y:.46,type,at:1000,angle:-.35,
          event,complete,weight:type==='metal'?1:type==='ice'?.77:.59,
          holdMs:type==='metal'?46:32,recoilPx:4,shakePx:0,particleCount:complete?2:1};
        drawArenaStage(ctx,run,375,500,{now:1000+age,bursts:[b],
          trail:[{a:{x:.27,y:.62},b:{x:.73,y:.32},at:1000}],
          debris:complete?[{x:.5,y:.49,type,layout:'structure',angle:-.35,at:1000}]:[],
          hitLabels:[],reducedMotion:false});
        ctx.save();ctx.fillStyle='#2E405A';ctx.font='bold 13px sans-serif';
        ctx.fillText(type+' / '+event+' / '+age+'ms',14,485);ctx.restore();ctx.restore();
      }
      frames.push({age,image:cv.toDataURL('image/png')});
    }
    return frames;
  });
  for(const frame of contactFrames)fs.writeFileSync(
    path.join(out,`${label}-material-contact-${String(frame.age).padStart(3,'0')}ms.png`),
    Buffer.from(frame.image.split(',')[1],'base64'));
  if(label==='after'){
   // Pixel-local proof: same artwork fixture / clock / camera from the known
   // previous SHA. Report how much changes specifically near each contact.
   const beforePng=fs.readFileSync(path.join(out,'before-material-contact-065ms.png')).toString('base64');
   const afterPng=fs.readFileSync(path.join(out,'after-material-contact-065ms.png')).toString('base64');
   const diff=await page.evaluate(async({a,b})=>{
     const decode=async raw=>{const im=new Image();im.src='data:image/png;base64,'+raw;await im.decode();
       const cv=document.createElement('canvas');cv.width=im.width;cv.height=im.height;
       const c=cv.getContext('2d',{willReadFrequently:true});c.drawImage(im,0,0);return c.getImageData(0,0,cv.width,cv.height).data;};
     const aa=await decode(a),bb=await decode(b),results=[];
     for(let row=0;row<3;row++)for(let col=0;col<3;col++){
       let changed=0,total=0,energy=0;
       for(let y=row*500+172;y<row*500+288;y++)for(let x=col*375+128;x<col*375+255;x++){
         const k=(y*1125+x)*4;
         const delta=Math.max(Math.abs(aa[k]-bb[k]),Math.abs(aa[k+1]-bb[k+1]),Math.abs(aa[k+2]-bb[k+2]));
         changed+=Number(delta>12);energy+=delta;total++;
       }
       results.push({material:['wood','ice','metal'][col],event:['blocked','cut','kill'][row],
         changedPct:+(100*changed/total).toFixed(3),meanMaxChannelDelta:+(energy/total).toFixed(3)});
     }
     return results;
   },{a:beforePng,b:afterPng});
   report.cases.push({label:'real-65ms-visual-ab',source:'same SHA 5c10e58 fixture and software renderer vs current HEAD',
     regions:diff});
   await page.evaluate(async()=>{(await import('/src/render/index.js')).getStage().viewer.setReduceMotion(false);});
   await page.getByRole('button',{name:'检视刀具光影',exact:true}).click();
   await page.getByRole('button',{name:'赛事',exact:true}).click();await page.waitForTimeout(350);
   const stopped=await page.evaluate(async()=>!(await import('/src/render/index.js')).getStage().viewer._camTween);
   assert.equal(stopped,true,'leaving the blade inspection cancels its timer');report.cases.push({inspectionCleanup:true});
  }
  const video=page.video();await context.close();if(video)await video.saveAs(path.join(out,label+'-inspection.webm'));
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.http,[]);
}catch(e){report.failure=String(e.stack);console.error(report.failure);process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
finally{fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();}
