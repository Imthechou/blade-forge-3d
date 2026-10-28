// Run from repository root. Use an isolated Chrome profile; no user saves are touched.
// node tools/s5-optical-acceptance.mjs after --full
// Set FORGE_URL, FORGE_BEFORE_URL, CHROME_PATH or PLAYWRIGHT_MODULE as needed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadPlaywright,browserExecutable} from '../game/tools/lib/browser.mjs';
const {chromium}=await loadPlaywright();
const which=process.argv[2]||'after', full=process.argv.includes('--full'), benchOnly=process.argv.includes('--bench');
const url=which==='before'?(process.env.FORGE_BEFORE_URL||'http://127.0.0.1:8124/'):(process.env.FORGE_URL||'http://127.0.0.1:8123/');
const out=path.resolve(process.env.S5_QA_OUT||'s5-optical-review',benchOnly?'bench-'+which:which);
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:browserExecutable(),args:['--enable-unsafe-swiftshader']});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'zh-CN',reducedMotion:'reduce'});
const page=await ctx.newPage();
const report={browser:await browser.version(),viewport:'390x844 DPR2 mobile/touch',which,shots:[],errors:[],perf:[]};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text().slice(0,2000));});
await ctx.addInitScript(()=>{
  for(const name of ['WebGLRenderingContext','WebGL2RenderingContext']) {
    const p=globalThis[name]?.prototype;if(!p)continue;
    const compile=p.compileShader, link=p.linkProgram;
    p.compileShader=function(s){compile.call(this,s);if(!this.getShaderParameter(s,this.COMPILE_STATUS))console.error('SHADER',this.getShaderInfoLog(s));};
    p.linkProgram=function(s){link.call(this,s);if(!this.getProgramParameter(s,this.LINK_STATUS))console.error('LINK',this.getProgramInfoLog(s));};
  }
});
try {
  const t=Date.now();
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__FORGE_PREP?.ready&&document.querySelector('#boot.is-gone'),null,{timeout:120000});
  report.bootMs=Date.now()-t;
  const settle=async()=>{
    await page.waitForFunction(async()=>{
      const st=(await import('/src/render/index.js')).getStage();
      return !(st?._requestedModelId&&st._requestedModelId!==st.modelId||st?.viewer?._compiling||st?.viewer?._compilePromise);
    },null,{timeout:60000});
    await page.waitForTimeout(550);
  };
  const dismiss=async()=>{for(let i=0;i<4;i++){
    const n=page.locator('.sheet-mask.is-in .sheet-x');
    if(await n.count()&&await n.first().isVisible()){await n.first().click();await page.waitForTimeout(200);} else break;
  }};
  const get=()=>page.evaluate(async()=>{
    const st=(await import('/src/render/index.js')).getStage();
    const g=(await import('/src/app/game.js')).default;
    const u=st?._pack?.uniforms||{}, r=st?.viewer?.renderer;
    return {stage:g.run?.stageId,phase:g.run?.phase,model:st?.modelId,
      texture:u.uS3TexId,s3On:u.uS3On,card:u.uS5CardId,seeds:u.uSeeds,
      coverAll:u.uSkinCoverAll,programs:r?.info?.programs?.length,
      memory:r?.info?.memory,render:r?.info?.render,handle:g.isHandleExplicit?.()};
  });
  const shot=async(tag)=>{
    await settle();
    /* Render the settled stage, not the 1.4s central transition toast.
       The toast intermittently obscured the sword in baseline/candidate:
       flow-S6 and flow-S8 then looked 20 luminance units different even
       though the underlying material was pixel-identical. Wait for actual
       DOM removal; never relax brightness thresholds or alter the game. */
    await page.locator('.page.is-active .stage-advance-toast')
      .waitFor({state:'detached',timeout:6000});
    const state=await get();
    await page.screenshot({path:path.join(out,tag+'.png'),animations:'disabled'});
    report.shots.push({tag,...state});console.log('SHOT',tag,JSON.stringify(state));
  };
  await dismiss();
  await page.evaluate(async()=>{
    const g=(await import('/src/app/game.js')).default;
    g.startForge({mode:'normal',seed:20261024});
    (await import('/src/ui/router.js')).default.go('forge');
  });
  await page.locator('.page.is-active .dcard').first().waitFor();
  await page.waitForTimeout(600);await dismiss();
  for(let idx=1;idx<=4;idx++){
    if((await get()).stage!=='S'+idx)throw Error('Wrong stage '+idx);
    if(idx===4)await page.evaluate(async()=>{
      const g=(await import('/src/app/game.js')).default;
      const {getCard}=await import('/src/data/cards.js');
      g.run.candidates=[getCard('K07'),...g.run.candidates.slice(1)];
      (await import('/src/ui/pages/forge.js')).default.render();
    });
    await page.locator('.page.is-active .dcard').first().click();await settle();
    if(full)await shot('flow-S'+idx);
    await page.locator('.page.is-active .actions .btn--primary').click();await page.waitForTimeout(500);
    if((await get()).phase==='hammer'){
      await page.locator('.hammer-stage-hit').click();
      await page.locator('.hammer-actions .btn').click();
      await page.waitForTimeout(500);
    }
  }
  await page.waitForTimeout(1800);
  await shot('S5-unselected');
  const base=await page.evaluate(async()=>{
    const g=(await import('/src/app/game.js')).default;
    return JSON.parse(JSON.stringify(g.run));
  });
  // Use the real preview path; UI card name and actual shader stay aligned.
  const preview=async(id,material='M06',texture='T07',seed=20261024)=>{
    const name=await page.evaluate(async({id,material,texture,seed})=>{
      const g=(await import('/src/app/game.js')).default;
      const {getCard} = await import('/src/data/cards.js');
      g.run.seed=seed;
      g.run.pendingSkin.materialId=material;g.run.pendingSkin.textureId=texture;
      const card=getCard(id);g.preview=null;
      g.run.candidates=[card,...g.run.candidates.filter(c=>c.id!==id).slice(0,2)];
      (await import('/src/ui/pages/forge.js')).default.render();
      let label=document.getElementById('qa-caption');
      if(!label){label=document.createElement('div');label.id='qa-caption';
        label.style='position:fixed;left:12px;right:12px;top:535px;z-index:9999;padding:4px 8px;background:#152231e8;color:#e9f0f1;font:10px system-ui;border-radius:6px;pointer-events:none;line-height:1.6';document.body.append(label);}
      label.textContent=id+' · '+card.name+' | '+material+' / S3 '+texture+' | '+seed;
      return card.name;
    },{id,material,texture,seed});
    await page.locator('.page.is-active .dcard').first().click();
    return name;
  };
  const count=full&&!benchOnly?25:1;
  for(let i=1;i<=count;i++){
    const id='S5_'+String(full?i:20).padStart(2,'0');
    await preview(id);await shot(id);
  }
  if(full) {
    if(!benchOnly){
    for(const texture of ['T01','T04','T12','T18','T24'])for(const id of ['S5_04','S5_14','S5_20']){
      await preview(id,'M06',texture);await shot('S3-'+texture+'-'+id);
    }
    if(which==='after'){
      for(let i=1;i<=24;i++){
        await preview('S5_20','M06','T'+String(i).padStart(2,'0'));
        await shot('S3-all-'+String(i).padStart(2,'0'));
      }
      const rares=await page.evaluate(async()=>{
        const {s5Pattern}=await import('/src/render/v2/s5OpticalArt.js');
        return ['S5_14','S5_16','S5_18','S5_20','S5_21','S5_24'].map(id=>{
          for(let n=20261000;n<20262000;n++){
            const s=K3D.bladeSkin.deriveSeeds(n);
            const p=s5Pattern(id,[0,s.warpSeed/1e6,s.colorPhaseSeed,s.fresnelSeed]);
            if(p.rare)return {id,seed:n,variant:p.variant};
          }throw Error('rare seed missing');
        });
      });
      report.rares=rares;
      for(const c of rares){await preview(c.id,'M06','T07',c.seed);await shot('rare-'+c.id);}
    }
    for(const m of ['M01','M14','M24'])for(const id of ['S5_16','S5_20','S5_23']){
      await preview(id,m);await shot(m+'-'+id);
    }
    for(const seed of [20261025,20261026,20261027])for(const id of ['S5_14','S5_16','S5_20','S5_21']){
      await preview(id,'M06','T07',seed);await shot('seed-'+seed+'-'+id);
    }
    }
    await preview('S5_20');
    // Real renderer timing, same browser, resolution, camera, card and machine.
    for(let i=0;i<3;i++){
      const perf=await page.evaluate(async()=>{
        const s=(await import('/src/render/index.js')).getStage(),v=s.viewer,r=v.renderer,gl=r.getContext();
        const ms=[],gpu=[],ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');
        const px=new Uint8Array(4);
        for(let j=0;j<30;j++){
          const query=ext?gl.createQuery():null;
          if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
          const t=performance.now();r.render(v.scene,v.camera);
          if(query)gl.endQuery(ext.TIME_ELAPSED_EXT);
          gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px);ms.push(performance.now()-t);
          if(query){
            for(let k=0;k<50&&!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE);k++)await new Promise(r=>setTimeout(r,4));
            if(gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE)&&!gl.getParameter(ext.GPU_DISJOINT_EXT))gpu.push(gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6);
            gl.deleteQuery(query);
          }
        }
        ms.sort((a,b)=>a-b);
        gpu.sort((a,b)=>a-b);
        return {median:ms[15],p95:ms[28],gpuMedian:gpu[Math.floor(gpu.length/2)],gpuSamples:gpu.length,
          programs:r.info.programs.length,memory:{...r.info.memory},draw:{...r.info.render},
          canvas:[r.domElement.width,r.domElement.height],vendor:gl.getParameter(gl.RENDERER)};
      });report.perf.push(perf);
    }
    if(!benchOnly){
    // Restore original legal run, commit one S5 card and walk through S6/S8.
    await page.evaluate(async(base)=>{
      const g=(await import('/src/app/game.js')).default;
      const {getCard}=await import('/src/data/cards.js');
      Object.assign(g.run,base);g.run.rng=()=>0.99;g.preview=null;g.run.candidates=[getCard('S5_20'),...g.run.candidates.slice(1)];
      g.syncStage();g.confirmCard(getCard('S5_20'));
      (await import('/src/ui/pages/forge.js')).default.render();
      document.getElementById('qa-caption')?.remove();
    },base);
    await settle();await shot('flow-S6-enter');
    await page.locator('.page.is-active .dcard').first().click();await settle();await shot('flow-S6-selected');
    await page.locator('.page.is-active .actions .btn--primary').click();await page.waitForTimeout(500);
    // S7 edge exercise may have its own phase; game-level fixture still uses real transitions.
    await page.evaluate(async()=>{
      const g=(await import('/src/app/game.js')).default;
      g.confirmCard(g.run.candidates[0]);
      if(g.run.phase==='edge')g.submitEdge(null,{skipped:true});
      (await import('/src/ui/pages/forge.js')).default.render();
    });
    await settle();await shot('flow-S8-enter');
    if((await get()).stage==='S8'){
      await page.locator('.page.is-active .dcard').first().click();await settle();await shot('flow-S8-grip');
      await page.locator('.page.is-active .actions .btn--primary').click();await settle();await shot('flow-S9-enter');
    }
    else throw Error('Flow did not reach S8');
    }
  }
  if(full&&!benchOnly){
    if(report.shots.filter(x=>/^S5_\d+$/.test(x.tag)).length!==25)throw Error('Incomplete 25 card coverage');
    if(which==='after'&&report.shots.filter(x=>/^S3-all-/.test(x.tag)).length!==24)throw Error('Incomplete S3 coverage');
    const programs=report.shots.filter(x=>/^S5_\d+$/.test(x.tag)).map(x=>x.programs);
    if(new Set(programs).size!==1)throw Error('Card switch linked additional programs');
    const grip=report.shots.find(x=>x.tag==='flow-S8-grip');
    if(grip?.coverAll!==0||grip.card!=='S5_20')throw Error('S8 ownership regression');
  }
  report.pass=!report.errors.length;
  console.log('RESULT',JSON.stringify({pass:report.pass,shots:report.shots.length,errors:report.errors,perf:report.perf}));
} catch(e) {
  report.errors.push(String(e));console.log('FAILED',String(e));
  await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
} finally {
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  await browser.close();
}
if(report.errors.length)process.exitCode=1;
