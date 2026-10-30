/** Narrow-phone interaction regressions. Full forge and competitions run in the existing suites. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable,baseUrl} from './lib/browser.mjs';
import {sampleBlade} from './arena-v3-simulate.mjs';
const out=path.resolve(process.env.UX_QA_OUT||'unified-ux-evidence');fs.mkdirSync(out,{recursive:true});
const {chromium}=await loadPlaywright();
const browser=await chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist']});
const report={cases:[],errors:[],requests:[],performance:[]};let page;
const shot=async name=>page.screenshot({path:path.join(out,name+'.png')});
async function test(name,fn){await fn();report.cases.push(name);console.log('PASS',name);}
async function fit(selector){const n=page.locator(selector);const b=await n.boundingBox(),v=page.viewportSize();assert.ok(b&&b.width>0&&b.height>0&&b.x>=-1&&b.y>=-1&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,JSON.stringify({selector,b,v}));}
async function dialog(){await page.locator('.sheet-mask.is-in').last().waitFor();await fit('.sheet-mask:last-child .sheet');}
async function close(){await page.locator('.sheet-mask').last().getByRole('button',{name:'关闭',exact:true}).click();await page.locator('.sheet-mask').waitFor({state:'detached'});}
async function cabinet(tab){await page.evaluate(async tab=>(await import('/src/ui/pages/workshop.js')).openTab(tab),tab);}
async function readyThumbs(selector){await page.waitForFunction(selector=>{const ns=[...document.querySelectorAll(selector)].slice(0,2);return ns.length&&ns.every(n=>n.dataset.state==='ready'&&n.querySelector('img')?.complete&&n.querySelector('img')?.naturalWidth>0);},selector,{timeout:90000});}
try {
 for(const [width,height] of [[375,667],[320,568]]) {
  const identity={knifeType:'knife_tangdao',knifeTypeId:'tangdao',rarity:'rare',rarityName:'稀有',qualityName:'精制',history:[],seed:123,edge:{tier:'contour',tierName:'',fit:.97,acc:.97,sharp:128}};
  const blades=[{...sampleBlade(150),...identity,score:320,bladeName:'冷镜唐刀',tags:{cold:4,precision:2}},{...sampleBlade(100),...identity,id:'second',score:220,bladeName:'流光唐刀'},{...sampleBlade(120),...identity,id:'third',score:250,bladeName:'夜幕唐刀'}];
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'zh-CN',reducedMotion:'reduce'});
  await context.addInitScript(blades=>{if(!localStorage.getItem('bladeforge.save'))localStorage.setItem('bladeforge.save',JSON.stringify({version:1,cr:2000,collection:blades,fractured:[{...blades[1],id:'fractured-qa',bladeName:'断裂的流光唐刀',fractured:true,canEnterArena:false,fractureInfo:{stageId:'S4',stageName:'定型',risk:42,chance:.15}}],settings:{tutorialSeen:true,sound:false,motion:'reduced'}}));},blades);
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.requests.push({url:r.url(),status:r.status()});});
  await page.goto(baseUrl);await page.waitForFunction(()=>window.__FORGE_PREP?.ready&&!document.querySelector('#boot'),null,{timeout:120000});
  await test(`${width} home + real WebGL`,async()=>{assert.equal(await page.locator('#homeStage canvas').count(),1);await fit('.home-start');await shot(`${width}-home`);});
  await test(`${width} switches, focus and nested guide`,async()=>{
   await page.getByRole('button',{name:'设置',exact:true}).click();await dialog();
   // A freshly opened sheet can still be at scale(.97); measure targets after its entrance settles.
   await page.waitForFunction(() => {
    const sheet=document.querySelector('.sheet-mask.is-in .sheet');
    if(!sheet) return false;
    const transform=getComputedStyle(sheet).transform;
    return transform==='none'||transform==='matrix(1, 0, 0, 1, 0, 0)';
   },null,{timeout:5000});
   for(const item of await page.locator('.switch,.seg-btn').all()){
    const b=await item.boundingBox();
    assert.ok(b&&b.height>=44&&b.width>=44,JSON.stringify({target:await item.getAttribute('aria-label')||await item.textContent(),bounds:b}));
   }
   await page.getByRole('switch',{name:'音效',exact:true}).click();assert.equal(await page.getByRole('switch',{name:'音效',exact:true}).getAttribute('aria-checked'),'true');
   assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'音效');
   assert.equal(await page.getByRole('slider',{name:'音量'}).count(),1);
   await shot(`${width}-settings`);
   await page.getByRole('button',{name:'重看',exact:true}).click();assert.equal(await page.locator('.sheet-mask').count(),2);await shot(`${width}-guide`);
   await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelectorAll('.sheet-mask').length===1);
   assert.equal(await page.locator('#app').evaluate(n=>n.inert),true);assert.equal(await page.locator('.sheet-mask').evaluate(n=>n.inert),false);await close();
  });
  await test(`${width} card buttons, archive preview and rename`,async()=>{
   await cabinet('collection');await readyThumbs('.ws-collection-grid .blade-thumb');assert.equal(await page.locator('button button').count(),0);await shot(`${width}-collection`);
   await page.locator('.bcv-open').first().click();await dialog();await page.locator('.blade-detail-stage-status').waitFor({state:'detached',timeout:90000});await fit('.blade-detail-actions');assert.ok((await page.locator('.blade-detail-sheet').innerText()).includes('轮廓开刃（贴合 97%'));await shot(`${width}-blade-detail`);
   const workshopDownload=page.waitForEvent('download',{timeout:30000});
   await page.getByRole('button',{name:'下载本刀真实3D外观收藏卡'}).click();
   const workshopPng=await workshopDownload;
   assert.match(workshopPng.suggestedFilename(),/收藏卡\.png/);
   assert.ok(fs.statSync(await workshopPng.path()).size>50000,'Workshop uses actual full-resolution knife image');
   await page.getByRole('button',{name:'重命名',exact:true}).click();await page.getByRole('textbox',{name:'新的刀名'}).fill('霜镜 · 唐刀');await page.getByRole('button',{name:'保存刀名'}).click();await page.waitForFunction(()=>document.querySelectorAll('.sheet-mask').length===1);
   assert.equal(await page.locator('.blade-detail-sheet .sheet-title').innerText(),'霜镜 · 唐刀');await close();
   assert.equal(await page.locator('.bcv-name').first().innerText(),'霜镜 · 唐刀');
   await page.getByRole('button',{name:'加入比较',exact:true}).first().click();await page.getByRole('button',{name:'加入比较',exact:true}).first().click();await page.getByRole('button',{name:'比较这两把',exact:true}).click();await dialog();await shot(`${width}-compare`);await close();
   await page.locator('.ws-fracture-entry').click();await dialog();assert.equal(await page.locator('.sheet-x svg').count(),1);await page.locator('.ws-fracture-item').first().click();await shot(`${width}-fracture`);await close();
  });
  await test(`${width} workshop tab scroll, bonus selection, codex search`,async()=>{
   await page.getByRole('tab',{name:'成就',exact:true}).click();await shot(`${width}-achievements`);
   await page.locator('.page[data-page="workshop"]').evaluate(n=>n.scrollTop=700);
   await page.getByRole('tab',{name:'锻造加成',exact:true}).click();assert.equal(await page.locator('.page[data-page="workshop"]').evaluate(n=>n.scrollTop),0);
   await page.locator('.ws-bonus').first().click();assert.equal(await page.locator('.ws-bonus').first().getAttribute('aria-pressed'),'true');await shot(`${width}-bonuses`);
   await page.getByRole('tab',{name:'图鉴',exact:true}).click();await page.getByRole('searchbox',{name:'搜索图鉴'}).fill('zz-no-matching-clue');assert.equal(await page.locator('.codex-clear').isVisible(),true);
   await page.getByRole('button',{name:'清除搜索与筛选'}).click();assert.equal(await page.getByRole('searchbox',{name:'搜索图鉴'}).inputValue(),'');await shot(`${width}-codex`);
   assert.equal(await page.evaluate(()=>document.querySelector('.page.is-active').scrollWidth>document.querySelector('.page.is-active').clientWidth),false);
  });
  await test(`${width} forge preview + details + response latency`,async()=>{
   await page.getByRole('button',{name:'返回首页',exact:true}).click();await page.getByRole('button',{name:'开始锻刀',exact:true}).click();await page.locator('.dcard').first().waitFor();
   await fit('#forgeStage');await fit('.page.is-active .actions');await fit('.page.is-active .cards');
   await page.locator('.dcard').first().click();
   const clearance=await page.locator('.dcard').evaluateAll(cards=>cards.map(c=>{const track=c.querySelector('.dcard-tier,.dcard-instant-action');return !track||track.getBoundingClientRect().bottom<=c.getBoundingClientRect().bottom-4;}));assert.ok(clearance.every(Boolean),'card progress cropped');
   await shot(`${width}-forge`);
   const timings=await page.evaluate(async()=>{const samples=[];for(let i=0;i<12;i++){const start=performance.now();document.querySelectorAll('.dcard')[i%3].click();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));samples.push(performance.now()-start);}return samples;});
   const sorted=timings.slice().sort((a,b)=>a-b);report.performance.push({width,kind:'two-RAF DOM response, SwiftShader CI, not phone GPU',samples:timings,p50:sorted[6],p95:sorted[11]});
   await page.locator('.dcard-more').first().click();await dialog();await shot(`${width}-card-detail`);await close();
   await page.locator('.stage-traits').click();await dialog();await shot(`${width}-build`);await close();
  });
  await test(`${width} five-screen recipe and role-based risk flow`,async()=>{
    assert.equal(await page.locator('.stage-progress .sp-dot').count(),5,'normal forge uses five screens');
    assert.match(await page.locator('.stage-badge').innerText(),/开炉配方/);
    await page.locator('.forge-recipe-direct').click();
    const known=page.locator('.forge-recipe-option');
    assert.ok(await known.count()>=2,'workshop offers learned materials');
    await known.first().click();
    await page.locator('.dcard').first().click();
    await page.getByRole('button',{name:'确认工艺 →',exact:true}).click();
    assert.match(await page.locator('.forge-flow-substep').innerText(),/2\/2/);
    assert.equal(await page.evaluate(async()=> (await import('/src/app/game.js')).default.run.lastRiskCheck),undefined);
    await page.locator('.forge-recipe-direct').click();
    await page.locator('.forge-recipe-option').first().click();
    await page.locator('.dcard').first().click();
    await page.getByRole('button',{name:'确认工艺 →',exact:true}).click();
    assert.match(await page.locator('.stage-badge').innerText(),/锻打成型/);
    assert.equal(await page.locator('.stage-progress .sp-dot.active').count(),1);
    assert.equal(await page.evaluate(async()=> (await import('/src/app/game.js')).default.run.lastRiskCheck?.stageId),'S3',
      'support forge now checks carried risk in screen 2, not during recipe');
    assert.equal(await page.evaluate(async()=> (await import('/src/app/game.js')).default.run.assistedSteps?.[0]?.stageId),'S3');
    const chipLayout=await page.locator('.stage-chipbar').evaluate(bar=>{
      const stage=bar.closest('.stage'),bounds=stage.getBoundingClientRect();
      const children=[...bar.children].filter(n=>n.getClientRects().length>0)
        .map(n=>({className:n.className,text:n.textContent?.trim().slice(0,32),left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right}));
      return {left:bounds.left,right:bounds.right,children};
    });
    assert.ok(chipLayout.children.every(c=>c.left>=chipLayout.left-1&&c.right<=chipLayout.right+1),
      `Forge stage chip clipped at ${width}px: ${JSON.stringify(chipLayout)}`);
    await shot(`${width}-five-screen-forging`);
  });
  if(width===375)await test('375 rare material inventory: pin, preview, spend only on confirm',async()=>{
    const chosen=await page.evaluate(async()=>{
      const [{Game},routerMod,coreMod,cardsMod]=await Promise.all([
        import('/src/app/game.js'),import('/src/ui/router.js'),
        import('/src/core/index.js'),import('/src/data/cards.js'),
      ]);
      const card=cardsMod.BY_STAGE.S1.find(c=>c.rarity==='rare');
      const save=coreMod.progress.get();
      save.materialsV1 ||= {version:1,counts:{},receipts:{}};
      save.materialsV1.counts[card.id]=1;
      if(!coreMod.progress.persist())throw Error('failed to seed mobile inventory');
      routerMod.default.go('home');
      Game.startForge({mode:'normal',seed:55331});
      routerMod.default.go('forge');
      return {id:card.id,name:card.name};
    });
    await page.locator('.forge-recipe-direct').waitFor();
    await page.locator('.forge-recipe-direct').click();
    await page.locator('.forge-recipe-option').filter({hasText:chosen.name}).click();
    assert.equal(await page.evaluate(id=>import('/src/app/game.js').then(m=>m.default.run.materialReservation===id),chosen.id),true);
    assert.equal(await page.evaluate(id=>import('/src/core/index.js').then(m=>m.progress.get().materialsV1.counts[id]),chosen.id),1,
      'not consumed while previewing');
    await shot('375-rare-stock-pick');
    await page.locator('.dcard').first().click();
    await page.getByRole('button',{name:'确认工艺 →',exact:true}).click();
    assert.equal(await page.evaluate(id=>import('/src/core/index.js').then(m=>m.progress.get().materialsV1.counts[id]||0),chosen.id),0);
    assert.equal(await page.evaluate(()=>import('/src/app/game.js').then(m=>m.default.run.stageId)),'S2');
    await shot('375-rare-stock-spent');
  });
  if(width===375)await test('collectible gallery rotates transparent blades and preserves opaque old captures',async()=>{
    const modes=await page.evaluate(async()=>{
      const {renderCollectiblePoster}=await import('/src/ui/bladeCardExport.js');
      const sample=document.createElement('canvas');sample.width=200;sample.height=340;
      const g=sample.getContext('2d');
      g.fillStyle='#d0d8e3';g.fillRect(88,25,24,285);
      const real=await renderCollectiblePoster({name:'刀具',rarityTone:'rare'},sample.toDataURL('image/png'));
      g.fillStyle='#e4e8ed';g.fillRect(0,0,200,340);
      const legacy=await renderCollectiblePoster({name:'刀具',rarityTone:'rare'},sample.toDataURL('image/png'));
      return {real:real.dataset.artworkLayout,legacy:legacy.dataset.artworkLayout};
    });
    assert.deepEqual(modes,{real:'real-knife-diagonal',legacy:'opaque-safe-fallback'});
  });
  await test(`${width} real appraisal collectible identity card`,async()=>{
   await page.evaluate(async()=>{
     const [gameMod,routerMod,coreMod]=await Promise.all([
       import('/src/app/game.js'),import('/src/ui/router.js'),import('/src/core/index.js')
     ]);
     const Game=gameMod.default, router=routerMod.default, Core=coreMod;
     const saved=Core.progress.collection()[0];
     const rec=JSON.parse(JSON.stringify(saved));
     rec._archived=true;rec.canEnterArena=true;
     rec.scoreDetail={mean:100,baseMult:1,specialMult:1,peakMult:1,breakdown:{base:[],special:[]}};
     rec.riskPeak=rec.riskPeak||12;rec.riskCurrent=rec.riskCurrent||12;
     rec.combos=rec.combos||[];rec.traits=rec.traits||[];
     rec.hammerCount=10;rec.hammerTierName='稳锻';
     Game.record=rec;Game.run=null;
     router.go('appraise');
   });
   const card=page.locator('.ap-archive-card .blade-card-v2');
   await card.waitFor({timeout:30000});
   await page.locator('.ap-archive-card').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>{const image=document.querySelector('.ap-archive-card .blade-thumb-image');return image?.complete && image.naturalWidth>0;},null,{timeout:90000});
   // Keep the unmodified offscreen PBR source for objective art-direction comparison.
   const actualCapture=await page.locator('.ap-archive-card .blade-thumb-image').evaluate(n=>n.src);
   if(actualCapture.startsWith('data:image/')){
     const raw=actualCapture.split(',')[1];
     const ext=actualCapture.startsWith('data:image/webp')?'webp':'png';
     fs.writeFileSync(path.join(out,`${width}-collectible-source.${ext}`),Buffer.from(raw,'base64'));
   }
   assert.equal(await page.locator('.ap-archive-card .bcv-name').innerText(),'霜镜 · 唐刀');
   assert.ok(await page.locator('.ap-archive-card .bcv-score').isVisible());
   await page.waitForFunction(()=>document.querySelector('.page[data-page="appraise"]')?.classList.contains('is-archive-revealed'));
   assert.equal(await page.locator('.page[data-page="appraise"] .ap-stage').isVisible(),false,'最终成品卡成为视觉主角，不与大 3D 舞台重复');
   await page.locator('.ap-archive-view3d').click();
   // 0px 网格行在同一 click 任务中可能仍返回上一次计算样式，等下一帧完成布局。
   await page.waitForFunction(()=>{
     const root=document.querySelector('.page[data-page="appraise"]');
     const stage=root?.querySelector('.ap-stage');
     return root?.classList.contains('is-archive-3d') && stage && getComputedStyle(stage).visibility==='visible' && stage.getBoundingClientRect().height>0;
   },null,{timeout:3500}).catch(()=>{});
   const restored=await page.locator('.page[data-page="appraise"] .ap-stage').isVisible();
   const layout=await page.evaluate(()=>{
     const root=document.querySelector('.page[data-page="appraise"]');
     const stage=root.querySelector('.ap-stage');const rect=stage.getBoundingClientRect();
     return {classes:root.className,inlineRows:root.style.gridTemplateRows,computedRows:getComputedStyle(root).gridTemplateRows,
       stageVisibility:getComputedStyle(stage).visibility,stageDisplay:getComputedStyle(stage).display,
       rect:{width:rect.width,height:rect.height},stageMinHeight:stage.style.minHeight};
   });
   assert.equal(restored,true,'玩家可返回 3D 鉴赏：'+JSON.stringify(layout));
   await page.locator('.ap-archive-view3d').click();
   const cardRect=await card.boundingBox();const viewport=page.viewportSize();
   assert.ok(cardRect&&cardRect.width>0&&cardRect.x>=-1&&cardRect.x+cardRect.width<=viewport.width+1,'收藏卡不得横向溢出手机屏幕');
   // This is a real PNG downloaded from the live PBR image, not a placeholder knife.
   await page.evaluate(async()=>{
     const s=(await import('/src/render/index.js')).getStage();
     const original=s.snapshot.bind(s);
     s.snapshot=(w,h)=>{window.__QA_EXPORT_RESOLUTION=[w,h];return original(w,h);};
   });
   const exported=page.waitForEvent('download',{timeout:30000});
   await page.locator('.ap-archive-export').click();
   assert.deepEqual(await page.evaluate(()=>window.__QA_EXPORT_RESOLUTION),[720,960],
     'Appraisal must render at export resolution rather than upscaling the 288px thumbnail');
   const download=await exported;
   assert.match(download.suggestedFilename(),/锻刀大赛.*收藏卡\.png/);
   const saved=await download.path();
   const image=fs.readFileSync(saved);
   assert.ok(image.length>50000,'收藏卡必须包含实际刀具画面');
   assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   assert.equal(image.readUInt32BE(16),1080);
   assert.equal(image.readUInt32BE(20),1520);
   // Upload the *actual downloaded poster* so visual reviewers can inspect its PBR knife,
   // typography and composition, not just a screenshot of the download button.
   fs.copyFileSync(saved,path.join(out,`${width}-collectible-export.png`));
   await shot(`${width}-appraisal-collectible`);
  });
  await test(`${width} loadout preview + pause focus + real cutting input`,async()=>{
   await page.evaluate(async()=>(await import('/src/ui/pages/arena.js')).openTournament());await readyThumbs('.arena-loadout .blade-thumb');await shot(`${width}-arena`);
   await page.getByRole('button',{name:'更换参赛刀'}).click();await dialog();await shot(`${width}-loadout`);await close();
   await page.getByRole('button',{name:'全国大赛',exact:true}).click();await shot(`${width}-national`);
   await page.getByRole('button',{name:'全球巅峰赛',exact:true}).click();await shot(`${width}-apex`);
   await page.getByRole('button',{name:'快速挑战',exact:true}).click();await page.getByRole('button',{name:'开始自由快赛',exact:true}).click();await page.locator('.quick-canvas').waitFor();assert.equal(await page.locator('[data-augment-id]').count(),0,'V4.1 no random augment');await shot(`${width}-quick-opening`);
   await page.locator('.quick-canvas').waitFor();await page.waitForTimeout(500);await page.getByRole('button',{name:'暂停',exact:true}).click();await page.locator('.quick-pause-overlay').waitFor();
   const time=await page.evaluate(()=>__FORGE_ARENA.run.elapsed);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>__FORGE_ARENA.run.elapsed),time);
   await page.getByRole('button',{name:/继续挑战/}).press('Shift+Tab');assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.quick-pause-overlay')),true);await shot(`${width}-pause`);
   await page.keyboard.press('Escape');await page.locator('.quick-pause-overlay').waitFor({state:'detached'});
   await page.getByRole('button',{name:'查看切割操作说明'}).click();await page.locator('.quick-help-overlay').waitFor();await shot(`${width}-cut-help`);await page.getByRole('button',{name:'明白，继续'}).click();
   const b=await page.locator('.quick-canvas').boundingBox();await page.mouse.move(b.x+20,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width-20,b.y+b.height*.5,{steps:12});await page.mouse.up();await shot(`${width}-cutting`);
   await page.getByRole('button',{name:'暂停',exact:true}).click();await page.getByRole('button',{name:/放弃并退出/}).click();
  });
  await context.close();
 }
 const emptyContext=await browser.newContext({viewport:{width:375,height:667},isMobile:true,hasTouch:true,deviceScaleFactor:2,locale:'zh-CN'});
 await emptyContext.addInitScript(()=>localStorage.setItem('bladeforge.save',JSON.stringify({version:1,settings:{tutorialSeen:true,sound:false,motion:'reduced'}})));
 page=await emptyContext.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.goto(baseUrl);await page.waitForFunction(()=>window.__FORGE_PREP?.ready&&!document.querySelector('#boot'),null,{timeout:120000});
 await test('empty collection and arena preserve an unfinished forge',async()=>{
  await page.getByRole('button',{name:'藏刀阁',exact:true}).click();await shot('375-empty-collection');
  await page.getByRole('button',{name:'开始锻刀',exact:true}).click();await page.locator('.dcard').first().waitFor();
  const cardId=await page.evaluate(async()=>[...(await import('/src/app/game.js')).default.run.candidates].sort((a,b)=>(a.riskDeltaPoints||0)-(b.riskDeltaPoints||0))[0].id);
  await page.locator(`[data-card-id="${cardId}"]`).click();await page.getByRole('button',{name:'确认工艺 →',exact:true}).click();
  const snapshot=()=>page.evaluate(async()=>{const r=(await import('/src/app/game.js')).default.run;return JSON.stringify({seed:r.seed,ledger:r.ledger,stageIndex:r.stageIndex});});
  const before=await snapshot();
  await page.getByRole('button',{name:'返回首页',exact:true}).click();await page.getByRole('button',{name:'赛事',exact:true}).click();await shot('375-empty-arena');
  await page.getByRole('button',{name:'去锻刀',exact:true}).click();await page.locator('.dcard').first().waitFor();assert.equal(await snapshot(),before);
 });
 await emptyContext.close();
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.requests,[]);
} catch(error){report.failure=String(error.stack);console.error(report.failure);process.exitCode=1;if(page)await shot('failure').catch(()=>{});}
finally{fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(report,null,2));await browser.close();}
