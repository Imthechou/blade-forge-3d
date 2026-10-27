import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import pngjs from 'pngjs';
const { PNG } = pngjs;

const out=path.resolve('s3-s5-review');
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const report={runs:[],errors:[],snapshots:[]};
const S5=['S5_04','S5_14','S5_18','S5_21','S5_23','S5_25'];
for(const [name,url] of [['before','https://imthechou.github.io/blade-forge-3d/'],['after','http://127.0.0.1:8123/']]){
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,
    locale:'zh-CN',reducedMotion:'reduce'});
  const page=await context.newPage();
  const run={name,url,preview:[],errors:[],snapshots:[],knifeVariants:[],startupMs:null};
  report.runs.push(run);
  page.on('pageerror',e=>run.errors.push('pageerror '+String(e).slice(0,1000)));
  page.on('console',m=>{if(m.type()==='error'||/Shader Error|VALIDATE_STATUS|undeclared identifier|glsl/i.test(m.text()))run.errors.push('console '+m.text().slice(0,1000));});
  page.on('response',r=>{if(r.status()>=400)run.errors.push('HTTP '+r.status()+' '+r.url());});
  const t0=Date.now();
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
  await page.waitForFunction(()=>window.__FORGE_PREP?.ready && document.querySelector('#boot.is-gone'),null,{timeout:110000});
  run.startupMs=Date.now()-t0;
  const settle=async()=>{
    for(let i=0;i<20;i++) {
      let b=await page.evaluate(async()=>{
        const st=(await import(new URL('src/render/index.js',location.href).href)).getStage();
        return !!(st?._requestedModelId && st?._requestedModelId!==st?.modelId
              ||st?.viewer?._compiling||st?.viewer?._compilePromise);
      });
      if(!b)break;
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(750);
  };
  const get=()=>page.evaluate(async()=>{
    const g=(await import(new URL('src/app/game.js',location.href).href)).default;
    const st=(await import(new URL('src/render/index.js',location.href).href)).getStage();
    const u=st?._pack?.uniforms||{};
    return {phase:g.run?.phase,stage:g.run?.stageId,model:st?.modelId,
      material:g.resolveVisual(g.preview,{preview:!!g.preview})?.skin?.materialId,
      texture:g.resolveVisual(g.preview,{preview:!!g.preview})?.skin?.textureId,
      finish:g.resolveVisual(g.preview,{preview:!!g.preview})?.skin?.finishId,
      patternOn:u.uS3On,textureStrength:u.uSkinTexStrength,metalness:u.uBladeMetalness,
      roughness:u.uBladeRoughness,s5Tier:u.uStageTiers?.[4],s5Mode:u.uV2Mode,s5Cover:u.uV2Cover,
      prepReady:window.__FORGE_PREP?.ready,env:window.__FORGE_ENV_DIAG?.mode,
      programs:st?.viewer?.renderer?.info?.programs?.length};
  });
  const shot=async(tag)=>{
    const fn=name+'-'+tag+'.png';
    const pngBuffer=await page.screenshot({path:path.join(out,fn),animations:'disabled',timeout:30000});
    // Hard visual gate: WebGL shaders can fail silently without any JS error.
    // Screenshot geometry detection is intentionally independent of the DOM.
    const pixels=PNG.sync.read(pngBuffer);
    let modelPixels=0;
    for(let y=145;y<Math.min(400,pixels.height);y++)
      for(let x=120;x<Math.min(270,pixels.width);x++){
        const k=(y*pixels.width+x)*4;
        if(pixels.data[k]<175 && pixels.data[k+1]<175 && pixels.data[k+2]<175)
          modelPixels++;
      }
    if(modelPixels<2400)throw new Error(name+' '+tag+' missing visible 3D model ('+modelPixels+' dark pixels)');
    const state=await get();
    state.modelPixels=modelPixels;
    run.snapshots.push({filename:fn,...state});
    console.log('CAPTURE',name,tag,JSON.stringify(state).slice(0,600));
  };
  await page.waitForTimeout(600);
  for(let j=0;j<4;j++){const n=page.locator('.sheet-mask.is-in .sheet-x');if(await n.count()&&await n.first().isVisible()){await n.first().click({timeout:3500});await page.waitForTimeout(180);}else break;}
  await page.evaluate(async()=>{
    const g=(await import(new URL('src/app/game.js',location.href).href)).default;
    g.startForge({mode:'normal',seed:20261024});
    (await import(new URL('src/ui/router.js',location.href).href)).default.go('forge');
  });
  await page.locator('.page.is-active .dcard').first().waitFor({timeout:20000});
  // The first-visit guide may appear *after* the boot gate or startForge.
  // Close through the actual UI once it has had time to mount.
  await page.waitForTimeout(1050);
  for(let k=0;k<5;k++){
    const active=await page.locator('.sheet-mask.is-in').count();
    if(!active)break;
    await page.evaluate(()=>document.querySelector('.sheet-mask.is-in .sheet-x')?.click());
    await page.waitForTimeout(260);
  }
  if(await page.locator('.sheet-mask.is-in').count())
    throw new Error(name+' could not dismiss onboarding sheet');
  for(let idx=1;idx<=5;idx++){
    const state=await get();
    if(state.stage!=='S'+idx)throw Error(name+' wrong stage '+JSON.stringify(state));
    await settle();
    if(idx===3){
      await shot('S3-enter');
      for(let i=0;i<3;i++){
        await page.locator('.page.is-active .dcard').nth(i).click();
        await settle();
        await shot('S3-card'+(i+1));
      }
      await page.locator('.page.is-active .dcard').first().click();
    }
    if(idx===4){
      await shot('S4-enter');
      await page.locator('.page.is-active .dcard').first().click();
      await settle();
      await shot('S4-after-S3');
      if(name==='after'){
        run.knifeVariants=[];
        // Check S3 inherited pattern on all 12 actual GLBs, normal + halo
        // variants, without committing the injected cards to gameplay.
        for(let k=1;k<=24;k++){
          const id='K'+String(k).padStart(2,'0');
          await page.evaluate(async(cardId)=>{
            const g=(await import(new URL('src/app/game.js',location.href).href)).default;
            const {getCard}=await import(new URL('src/data/cards.js',location.href).href);
            const card=getCard(cardId);
            g.applyResolvedVisual(g.previewVisual(card),{preview:true,cardId});
          },id);
          await settle();
          await shot('S4-'+id);
          run.knifeVariants.push({id,...await get()});
        }
        // Return to the actual player's selection before pressing confirm.
        await page.evaluate(async()=>{
          const g=(await import(new URL('src/app/game.js',location.href).href)).default;
          g.applyResolvedVisual(g.previewVisual(g.preview),{preview:true,cardId:g.preview?.id});
        });
        await settle();
      }
    }
    if(idx===5){
      await shot('S5-enter');
      const all=await page.evaluate(async(ids)=>{
        const g=(await import(new URL('src/app/game.js',location.href).href)).default;
        const {getCard}=await import(new URL('src/data/cards.js',location.href).href);
        return ids.map(id=>({id,name:getCard(id)?.name,rarity:getCard(id)?.rarity}));
      },S5);
      for(const c of all){
        if(!c.name){run.errors.push('Missing '+c.id);continue;}
        await page.evaluate(async(cardId)=>{
          const g=(await import(new URL('src/app/game.js',location.href).href)).default;
          const {getCard}=await import(new URL('src/data/cards.js',location.href).href);
          const card=getCard(cardId);
          const v=g.previewVisual(card);
          g.applyResolvedVisual(v,{preview:true,cardId:card.id});
        },c.id);
        await settle();
        await shot('S5-'+c.id);
        run.preview.push(c);
      }
      await page.evaluate(async()=>{
        const g=(await import(new URL('src/app/game.js',location.href).href)).default;
        g.syncStage();
      });
      await settle();
      await shot('S5-restored');
      break;
    }
    if(idx===3||idx===4){
      // choice 1 already selected for the audit; confirmation updates run state.
    }else{
      await page.locator('.page.is-active .dcard').first().click({timeout:16000});
      await settle();
    }
    await page.locator('.page.is-active .actions .btn--primary').click({timeout:18000});
    await page.waitForTimeout(600);
    let phase=(await get()).phase;
    if(phase==='hammer'){
      await page.evaluate(()=>{
        document.querySelector('.hammer-stage-hit')?.click();
        document.querySelector('.hammer-actions .btn')?.click();
      });
      await page.waitForTimeout(550);
    }
  }
  run.completed=true;
  console.log('RUN',name,JSON.stringify({startupMs:run.startupMs,errors:run.errors,shots:run.snapshots.length,preview:run.preview}));
  await context.close();
}
await browser.close();
const old=report.runs[0],next=report.runs[1];
report.pass=report.runs.every(r=>r.completed && !r.errors.length && r.snapshots.some(x=>x.filename.endsWith('S5-restored.png'))) && next.knifeVariants.length===24 && next.knifeVariants.every(k=>k.texture && k.model?.startsWith('knife_'));
report.programs={before:old.snapshots.map(x=>x.programs).filter(Number.isFinite).at(-1),
  after:next.snapshots.map(x=>x.programs).filter(Number.isFinite).at(-1)};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log('FINAL',JSON.stringify({passed:report.pass,programs:report.programs,shots:report.runs.map(r=>r.snapshots.length),
 errors:report.runs.map(r=>r.errors)}));
if(!report.pass)process.exitCode=1;
