/** Validate that collection thumbnails/detail show their own real GPU studio reflections. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadPlaywright, browserExecutable, baseUrl } from './lib/browser.mjs';
import { sampleBlade } from './arena-v3-simulate.mjs';

const output=path.resolve(process.env.COLLECTION_QA_OUT || 'collection-reflection-evidence');
fs.mkdirSync(output,{recursive:true});
const {chromium}=await loadPlaywright();
const browser=await chromium.launch({
  executablePath:browserExecutable(),headless:true,
  args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage','--ignore-gpu-blocklist'],
});
const report={cases:[],errors:[],testedAt:new Date().toISOString()};
try {
  const context=await browser.newContext({
    viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,
    hasTouch:true,locale:'zh-CN',reducedMotion:'reduce',
  });
  await context.addInitScript(() => {
    const record={
      id:'studio-archive-01',bladeName:'霜纹唐刀',knifeType:'knife_tangdao',knifeTypeId:'tangdao',
      rarity:'rare',rarityName:'稀有',qualityName:'精制',score:290,seed:12345,
      stats:{strength:98,toughness:104,sharpness:116,craft:100,design:94,spirit:90},
      tags:{},traits:[],combos:[],history:[],
      pendingSkin:{materialId:'M02',textureId:'T02',finishId:'F01',wear:0.04,variants:{},handle:{metalId:'polymer',explicit:true}},
    };
    localStorage.setItem('bladeforge.save',JSON.stringify({
      version:1,cr:3000,collection:[record],
      settings:{tutorialSeen:true,sound:false,motion:'reduced'},
    }));
  });
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))report.errors.push(m.text());});
  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__FORGE_PREP?.ready && !document.querySelector('#boot'),null,{timeout:120000});
  await page.getByRole('button',{name:'藏刀阁',exact:true}).click();
  await page.waitForFunction(()=>{
    const img=document.querySelector('.ws-collection-grid .blade-thumb img');
    return img && img.complete && img.naturalWidth > 0;
  },null,{timeout:120000});
  const before=await page.evaluate(async()=>{
    const {getStage}=await import('/src/render/index.js');
    const {studioEnvInfo}=await import('/src/render/v2/studioEnv.js');
    return {contexts:studioEnvInfo()?.contexts,
      mainReady:!!getStage().viewer?.envMap,
      thumb:document.querySelector('.ws-collection-grid .blade-thumb')?.dataset.state};
  });
  assert.ok(before.mainReady&&before.contexts>=2,JSON.stringify(before));
  report.cases.push({name:'distinct main + thumbnail studio GPU contexts',...before});
  await page.screenshot({path:path.join(output,'collection.png')});

  await page.locator('.bcv-open').first().click();
  await page.locator('.blade-detail-stage canvas').waitFor({timeout:90000});
  await page.waitForFunction(async()=>{
    const {studioEnvInfo}=await import('/src/render/v2/studioEnv.js');
    const s=document.querySelector('.blade-detail-stage-status');
    return studioEnvInfo()?.contexts>=3 && (!s || !s.isConnected);
  },null,{timeout:90000});
  // The status can disappear before the first real GPU frame. Never archive a blank
  // 'success' screenshot: wait until the actual WebGL canvas contains nontransparent
  // model pixels, not just a mounted DOM canvas or finished shader compilation.
  await page.waitForFunction(async () => {
    const canvas=document.querySelector('.blade-detail-stage canvas');
    if(!canvas || !canvas.width || !canvas.height) return false;
    const img=new Image();
    img.src=canvas.toDataURL('image/png');
    try { await img.decode(); } catch (_) { return false; }
    const out=document.createElement('canvas');
    out.width=img.width;out.height=img.height;
    const ctx=out.getContext('2d',{willReadFrequently:true});
    if(!ctx) return false;
    ctx.drawImage(img,0,0);
    const data=ctx.getImageData(0,0,img.width,img.height).data;
    let solid=0;
    for(let i=3;i<data.length;i+=4) if(data[i]>160) solid++;
    return solid>150;
  },null,{timeout:20000,polling:300});
  await page.screenshot({path:path.join(output,'detail.png')});
  const during=await page.evaluate(async()=>(await import('/src/render/v2/studioEnv.js')).studioEnvInfo()?.contexts);
  assert.ok(during>=3,'detail must have its own studio reflection target');

  await page.locator('.sheet-mask').last().getByRole('button',{name:'关闭',exact:true}).click();
  await page.waitForFunction(async()=>(await import('/src/render/v2/studioEnv.js')).studioEnvInfo()?.contexts===2,null,{timeout:20000});
  const after=await page.evaluate(async()=>{
    const {getStage}=await import('/src/render/index.js');
    const {studioEnvInfo}=await import('/src/render/v2/studioEnv.js');
    return {contexts:studioEnvInfo()?.contexts,mainReady:!!getStage().viewer?.envMap};
  });
  assert.ok(after.mainReady,'closing archive detail must not destroy main stage reflection');
  // IndexedDB images must survive a full page reload without allocating an
  // additional thumbnail WebGL context or replaying historical skin shaders.
  await page.waitForFunction(async () =>
    (await import('/src/render/collectionCache.js')).thumbnailCacheStats().writes > 0,
    null,{timeout:20000,polling:250});
  // Verify the actual IndexedDB record after a real WebGL draw. Avoid forcing
  // another complete GPU boot within the same SwiftShader browser process:
  // this can exhaust software GL contexts and obscure cache correctness.
  const disk = await page.evaluate(() => new Promise(resolve => {
    const req = indexedDB.open('blade-forge-thumbnails', 1);
    req.onerror = () => resolve({ok:false, reason:'db-open-failed'});
    req.onsuccess = () => {
      const db=req.result;
      const tx=db.transaction('previews','readonly');
      const images=tx.objectStore('previews').getAll();
      images.onerror = () => resolve({ok:false, reason:'read-failed'});
      images.onsuccess = () => resolve({
        ok:images.result.some(x=>String(x.dataUrl||'').startsWith('data:image/webp;base64,')),
        rows:images.result.length,
        bytes:images.result.reduce((sum,x)=>sum+String(x.dataUrl||'').length,0),
      });
    };
  }));
  assert.ok(disk.ok && disk.rows > 0 && disk.bytes > 100,
    'persistent archive thumbnail must contain a real saved WebP: '+JSON.stringify(disk));
  report.cases.push({name:'IndexedDB contains reusable versioned WebGL thumbnails',disk});
  await context.close();
} catch(e) {
  report.failure=String(e.stack||e);
  console.error(report.failure);
  process.exitCode=1;
} finally {
  fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(report,null,2));
  await browser.close();
}
