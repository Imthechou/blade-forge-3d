import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const dir=path.resolve('forge-visual-audit');
await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'zh-CN',reducedMotion:'reduce'});
const page=await context.newPage();
const report={seed:20261024,stages:[],errors:[],warnings:[],shotCount:0};
page.on('pageerror',err=>report.errors.push('pageerror '+String(err).slice(0,900)));
page.on('console',m=>{if(m.type()==='error')report.errors.push('console '+m.text().slice(0,900));if(m.type()==='warning')report.warnings.push(m.text().slice(0,600));});
page.on('response',r=>{if(r.status()>=400) report.errors.push('HTTP '+r.status()+' '+r.url())});
const dismiss=async()=>{
  for(let x=0;x<5;x++){
    const is=await page.evaluate(()=>!!document.querySelector('.sheet-mask'));
    if(!is)break;
    await page.evaluate(()=>document.querySelector('.sheet-x')?.click());
    await page.waitForTimeout(180);
  }
};
const getState=()=>page.evaluate(async()=>{
  const g=(await import('/src/app/game.js')).default;
  const r=g.run;
  const st=(await import('/src/render/index.js')).getStage();
  const v=st?.viewer;
  return {phase:r?.phase,stage:r?.stageId,index:r?.stageIndex,fractured:r?.fractured,
    risk:r?.risk?.current,model:st?.modelId,pendingModel:st?._requestedModelId,
    env:window.__FORGE_ENV_DIAG?.mode,
    recipe:window.__FORGE_RENDER_DIAG?.()?.recipeHash??null,
    chosen:r?.choices?.length??null,visualStages:r?.visualStages?.length??null,
    cards:[...document.querySelectorAll('.cards .dcard')].map(el=>({
      id:el.dataset.cardId,name:el.querySelector('.dcard-title')?.textContent,
      rarity:el.querySelector('.dcard-head')?.textContent.replace(/\s+/g,' ').trim().slice(0,55),
      picked:el.classList.contains('is-picked')})),
    canvasW:v?.renderer?.domElement?.width,
    canvasH:v?.renderer?.domElement?.height,
    effect:!!v?._effect,compile:!!(v?._compiling||v?._compilePromise),
    coverAll:st?._coverAll,
    s3Geom:(()=> {
      if(r?.stageId!=='S3')return null;
      const info=st?.engine?.loaded?.get(st?.modelId);
      const ns=info?.meshData?.normals, basis=info?.bladeFrame?.basis?.elements;
      if(!ns||!basis)return {ready:false,model:st?.modelId};
      let x=0,y=0,z=0,front=0,side=0,nonzero=0;
      const n=ns.length/3;
      for(let i=0;i<n;i++){
        const nx=ns[i*3],ny=ns[i*3+1],nz=ns[i*3+2];
        const bx=Math.abs(basis[0]*nx+basis[3]*ny+basis[6]*nz);
        const by=Math.abs(basis[1]*nx+basis[4]*ny+basis[7]*nz);
        const bz=Math.abs(basis[2]*nx+basis[5]*ny+basis[8]*nz);
        x+=bx;y+=by;z+=bz;
        if(bz>.8)front++;
        if(bz<.3)side++;
        if(bz>.05)nonzero++;
      }
      const skin=g.resolveVisual(g.preview,{preview:!!g.preview})?.skin;
      const u=skin?st?._composePack(skin)?.uniforms:null;
      return {ready:true,n,meanAbsNormal:[x/n,y/n,z/n],
        frontRatio:front/n,sideRatio:side/n,nonzeroRatio:nonzero/n,
        s3On:u?.uS3On,alpha:u?.uS3Alpha,texStrength:u?.uSkinTexStrength,
        mapId:skin?.textureId,model:st?.modelId};
    })(),
    skin:(()=>{
      const v=g.resolveVisual(g.preview,{preview:!!g.preview}),skin=v?.skin;
      if(!skin)return null;
      return {
        materialId:skin.materialId, materialIdentity:skin.materialIdentity,
        textureId:skin.textureId,textureParams:skin.variantParams?.texture,
        finishId:skin.finishId, finishCardId:skin.finishCardId,
        finishParams:skin.variantParams?.finish,
        temperCardId:skin.temperCardId,
        patternSeed:skin.patternSeed,
        tiers:Array.from(st?._composePack(skin)?.uniforms?.uStageTiers||[]),
      };
    })()
  };
});
async function settle(ms=750) {
  for(let n=0;n<15;n++){
    const busy=await page.evaluate(async()=>{
      const st=(await import('/src/render/index.js')).getStage();
      const v=st?.viewer;
      return !!(v?._compiling||v?._compilePromise||v?.deferCompile||st?._requestedModelId && st?._requestedModelId!==st?.modelId);
    });
    if(!busy)break;
    await page.waitForTimeout(350);
  }
  await page.waitForTimeout(ms);
}
async function shot(name){
  await page.screenshot({path:path.join(dir,name+'.jpg'),type:'jpeg',quality:87,animations:'disabled',timeout:30000});
  report.shotCount++;
}
await page.goto('http://127.0.0.1:8123/',{waitUntil:'domcontentloaded',timeout:40000});
await page.waitForFunction(()=>window.__FORGE_PREP?.ready && document.querySelector('#boot.is-gone'),null,{timeout:90000});
await page.waitForTimeout(750);
await dismiss();
await page.evaluate(async()=>{
  const g=(await import('/src/app/game.js')).default;
  g.startForge({mode:'normal',seed:20261024});
  (await import('/src/ui/router.js')).default.go('forge');
});
await page.waitForSelector('.cards .dcard',{timeout:30000});
await settle(850);
for(let pass=0;pass<32;pass++){
  await dismiss();
  const st=await getState();
  if(!st?.stage)break;
  console.log('STEP',pass,st.stage,st.phase,'model',st.model,'risk',st.risk);
  if(st.phase==='select'){
    let entry={stage:st.stage,idx:st.index,base:st,previews:[],post:null};
    report.stages.push(entry);
    await settle(350);
    await shot(st.stage+'-00-base');
    let cards=await getState();
    for(let i=0;i<Math.min(3,cards.cards.length);i++){
      const pre=await getState();
      await page.locator('.page.is-active .cards .dcard').nth(i).click({timeout:12000});
      await settle(900);
      const selected=await getState();
      if(st.stage==='S3')console.log('S3_FACE_DIAG',JSON.stringify(selected.s3Geom));
      entry.previews.push({i,card:pre.cards[i],state:selected});
      await shot(st.stage+'-0'+(i+1)+'-'+(pre.cards[i]?.id||i));
    }
    if(cards.cards.length>0){
      await page.locator('.page.is-active .cards .dcard').last().click({timeout:12000});
      await settle(550);
      entry.cancel=await getState();
      await shot(st.stage+'-04-cancel');
      await page.locator('.page.is-active .cards .dcard').first().click({timeout:12000});
      await settle(500);
      await page.locator('.page.is-active .actions .btn--primary').click({timeout:12000});
      await page.waitForTimeout(500);
    }
    entry.post=await getState();
  } else if(st.phase==='hammer'){
    const a=await page.locator('.hammer-stage-hit').count();
    if(a)await page.evaluate(()=>document.querySelector('.hammer-stage-hit')?.click());
    const b=await page.locator('.hammer-actions .btn').count();
    if(b)await page.evaluate(()=>document.querySelector('.hammer-actions .btn')?.click());
    await page.waitForTimeout(500);
  } else if(st.phase==='edge'){
    await page.evaluate(()=>{
      const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('跳过'));
      (b||document.querySelector('.actions .btn--primary'))?.click();
    });
    await page.waitForTimeout(500);
  } else {report.warnings.push('Stopped phase '+st.phase+' at '+st.stage);break}
  if(st.fractured){report.warnings.push('Fractured at '+st.stage);break}
}
// Fail loudly if any previous layer was changed by a later-stage preview.
const errors=[];
for(const entry of report.stages){
  if(entry.stage==='S2'&&entry.base.model!=='molten_sphere_small')
    errors.push('S2 entered wrong neutral geometry: '+entry.base.model);
  if(entry.stage==='S3'&&entry.base.model!=='blank_ingot_small')
    errors.push('S3 entered wrong neutral geometry: '+entry.base.model);
  if(entry.stage==='S4'&&entry.base.model!=='blank_ingot_small')
    errors.push('S4 should start as an unformed billet');
  const stable=(x)=>JSON.stringify(x??null);
  const baseSkin=entry.base.skin;
  for(const pv of entry.previews){
    const skin=pv.state.skin;
    if(!skin||!baseSkin){errors.push(entry.stage+' missing skin');continue;}
    if(['S4','S5','S6','S7','S8','S9'].includes(entry.stage)){
      if(stable(skin.textureParams)!==stable(baseSkin.textureParams)
        || skin.textureId!==baseSkin.textureId)
        errors.push(entry.stage+' preview modified confirmed S3 texture '+pv.i);
    }
    if(['S6','S7','S8','S9'].includes(entry.stage)){
      if(stable(skin.finishParams)!==stable(baseSkin.finishParams)
        || skin.finishId!==baseSkin.finishId || skin.finishCardId!==baseSkin.finishCardId
        || skin.tiers[4]!==baseSkin.tiers[4])
        errors.push(entry.stage+' preview modified confirmed S5 finish '+pv.i);
    }
    if(entry.stage==='S8'&&pv.state.coverAll!==false)
      errors.push('S8 grip mask not separated for card '+pv.i);
  }
  if(entry.cancel&&entry.cancel.skin&&baseSkin){
    if(stable(entry.cancel.skin)!==stable(baseSkin))
      errors.push(entry.stage+' cancellation did not restore exact baseline recipe');
    if(entry.cancel.model!==entry.base.model)
      errors.push(entry.stage+' cancellation left old model');
  }
}
if(report.stages.length!==9)errors.push('Expected S1-S9; reached '+report.stages.length);
errors.push(...report.errors);
report.assertionErrors=errors;
console.log('P0_ASSERTIONS',JSON.stringify({ok:errors.length===0,errors}).slice(0,17000));
await fs.writeFile(path.join(dir,'audit.json'),JSON.stringify(report,null,2));
if(errors.length) process.exitCode=1;
console.log('SUMMARY',JSON.stringify({stages:report.stages.map(x=>({stage:x.stage,cards:x.previews.map(p=>p.card?.name),models:x.previews.map(p=>p.state.model),cancel:x.cancel?.model,phase:x.post?.phase})),errors:report.errors.slice(0,12),warnings:report.warnings.slice(0,9),shotCount:report.shotCount}).slice(0,22000));
await browser.close();
