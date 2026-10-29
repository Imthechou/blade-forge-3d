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
  assert.deepEqual(report.errors,[]);
  report.cases.push({name:'detail disposal keeps main and thumbnail reflections',during,after});
  await context.close();
} catch(e) {
  report.failure=String(e.stack||e);
  console.error(report.failure);
  process.exitCode=1;
} finally {
  fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(report,null,2));
  await browser.close();
}
