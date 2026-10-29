/** Browser-only screenshot baseline: pinned 2026-10-29 main vs PR at identical viewport. */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable} from './lib/browser.mjs';
import {sampleBlade} from './arena-v3-simulate.mjs';
const {chromium}=await loadPlaywright();
const out=path.resolve(process.env.ARENA_QA_OUT||'arena-playtest');
fs.mkdirSync(out,{recursive:true});
const oldUrl=process.env.ARENA_BASELINE_URL||'http://127.0.0.1:8124/';
const newUrl=process.env.FORGE_URL||'http://127.0.0.1:8123/';
const browser=await chromium.launch({headless:true,executablePath:browserExecutable(),
  args:['--no-sandbox','--use-angle=swiftshader','--disable-dev-shm-usage']});
const report={baseline:'88a57c970e1c65150228c196104f46de17203373',
  head:process.env.GITHUB_SHA||'unknown',viewport:{width:390,height:844},device:'software Chromium'};
async function screenshot(url,prefix){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,
    deviceScaleFactor:2,reducedMotion:'reduce',locale:'zh-CN'});
  const blade={...sampleBlade(100),id:'compare-blade'};
  await context.addInitScript(blade=>localStorage.setItem('bladeforge.save',
    JSON.stringify({version:1,cr:3000,collection:[blade],settings:{tutorialSeen:true,motion:'reduced',sound:false}})),blade);
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  try{
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.querySelector('.page[data-page="home"]')
      &&(!document.querySelector('#boot')||document.querySelector('#boot').classList.contains('is-gone')),
    null,{timeout:60000});
    await page.evaluate(async()=>(await import('/src/ui/pages/arena.js')).openQuickChallenge('compare-blade'));
    await page.getByRole('button',{name:'开始自由快赛',exact:true}).click();
    await page.locator('.quick-canvas').waitFor();
    const offers=page.locator('[data-augment-id]');
    const count=await offers.count();
    if(count)await offers.first().click();
    await page.locator('.quick-canvas').waitFor();
    // Both screenshots are actual rendered browser states. Match viewport,
    // DPR and input mode, while acknowledging different game rules and seeds.
    await page.waitForTimeout(180);
    const file=prefix+'-390x844.png';
    await page.screenshot({path:path.join(out,file)});
    assert.deepEqual(errors,[]);
    return {offers:count,file};
  } finally {await context.close();}
}
try{
  report.old=await screenshot(oldUrl,'arena-v41-main');
  report.new=await screenshot(newUrl,'arena-v41-branch');
  const html=`<!doctype html><html><meta charset="utf-8"><style>
  body{margin:0;background:#e9eff4;font:16px system-ui;color:#25334b}
  header{padding:14px 20px;background:#fff;border-bottom:1px solid #d0dde8}
  .grid{display:grid;grid-template-columns:390px 390px;gap:12px;padding:12px}
  figure{margin:0}figcaption{padding:8px;font-weight:700}img{width:390px;height:844px;object-fit:contain;background:#fafcff}
  p{font-size:12px;color:#63728a;margin:4px 0}
  </style><header>赛事视觉同视口对照 · 390 × 844 CSS px<p>原 main ${report.baseline.slice(0,9)} vs PR ${report.head.slice(0,9)}；实际 Chromium 截屏，非真机。模式和随机靶序不完全相同。</p></header>
  <div class="grid"><figure><figcaption>修改前 · main</figcaption><img src="${report.old.file}"></figure>
  <figure><figcaption>修改后 · V4.1 分支</figcaption><img src="${report.new.file}"></figure></div></html>`;
  const file=path.join(out,'arena-v41-main-vs-branch.html');fs.writeFileSync(file,html);
  const context=await browser.newContext({viewport:{width:836,height:940},deviceScaleFactor:1});
  const page=await context.newPage();await page.goto(pathToFileURL(file).href);
  await page.screenshot({path:path.join(out,'arena-v41-main-vs-branch-390x844.png'),fullPage:true});
  await context.close();
  fs.writeFileSync(path.join(out,'arena-v41-visual-compare.json'),JSON.stringify(report,null,2));
  console.log('Compared PR to frozen main at 390x844',report);
}finally{await browser.close();}
