import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const output = path.resolve(process.cwd(), 'visual-test-results');
await fs.mkdir(output, { recursive: true });
const report = { testedAt: new Date().toISOString(), browser: 'Google Chrome (GitHub Actions)', source: null, runs: {}, errors: [], failedRequests: [], consoleErrors: [], screenshots: [] };
const liveUrl = 'https://imthechou.github.io/blade-forge-3d/';
const fallbackUrl = 'http://127.0.0.1:8123/';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader']
});
async function shot(page, label) {
  const file = label + '.png';
  await page.screenshot({ path: path.join(output, file), fullPage: true, timeout: 30000, animations: 'disabled' });
  report.screenshots.push(file);
}
async function snapshot(page) {
  return page.evaluate(() => ({
    page: document.querySelector('.page.is-active')?.dataset.page,
    bootHidden: !!document.querySelector('#boot.is-gone'),
    prepReady: !!window.__FORGE_PREP?.ready,
    prepElapsedMs: window.__FORGE_PREP?.elapsedMs,
    prepProblems: window.__FORGE_PREP?.problems,
    viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
    canvas: [...document.querySelectorAll('canvas')].map(c => ({ width: c.width, height: c.height, visible: !!c.getClientRects().length })),
    buttons: [...document.querySelectorAll('button')].filter(x=>x.getClientRects().length).slice(0,24).map(x=>x.textContent.trim().slice(0,64)),
    text: document.querySelector('.page.is-active')?.innerText.slice(0,1000)
  }));
}
async function quiet(label, fn) {
  try { return await fn(); }
  catch(e) { report.errors.push({phase:label, message:String(e).slice(0,800)}); console.log('WARN',label,String(e).slice(0,400)); return null; }
}
async function ready(page) {
  const a = Date.now();
  await page.goto(liveUrl, { waitUntil:'domcontentloaded',timeout:40000 });
  try {
    await page.waitForFunction(() => window.__FORGE_PREP?.ready && document.querySelector('#boot.is-gone'), null, { timeout:90000 });
  } catch (err) { console.warn('Ready wait timed out', String(err)); }
  return Date.now()-a;
}
for(const [name, opts] of [
  ['mobile', {viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}],
  ['desktop', {viewport:{width:1280,height:900},deviceScaleFactor:1}]
]) {
  const context = await browser.newContext({ ...opts, locale:'zh-CN', reducedMotion:'reduce' });
  const page = await context.newPage();
  page.on('pageerror', e => report.errors.push({phase:name+' pageerror',message:String(e).slice(0,900)}));
  page.on('console', msg => { if(msg.type()==='error') report.consoleErrors.push({phase:name,message:msg.text().slice(0,900)}); });
  page.on('response', res => { if(res.status()>=400) report.failedRequests.push({phase:name,url:res.url(),status:res.status()}); });
  page.on('requestfailed', req => report.failedRequests.push({phase:name,url:req.url(),failure:req.failure()?.errorText}));
  const run=report.runs[name]={};
  await quiet(name+' navigation', async () => {
    run.startupMs = await ready(page);
    run.initial = await snapshot(page);
    report.source = liveUrl;
    await shot(page,name+'-01-home-initial');
    console.log('SNAPSHOT',name,'home',JSON.stringify(run.initial).slice(0,1200));
  });
  if(!run.initial?.prepReady) {
    await quiet(name+' home fallback', async () => {
      await page.goto(fallbackUrl,{waitUntil:'domcontentloaded',timeout:20000});
      await page.waitForFunction(() => window.__FORGE_PREP?.ready && document.querySelector('#boot.is-gone'),null,{timeout:90000});
      report.source = 'local fallback (GitHub main checkout)';
      run.fallback=true;
      run.initial=await snapshot(page);
      await shot(page,name+'-01-home-initial');
    });
  }
  if(run.initial?.prepReady) {
    await quiet(name+' first-guide',async()=>{
      const close=page.getByRole('button',{name:'关闭',exact:true});
      for(let attempt=0;attempt<2;attempt++){
        if(await close.count() && await close.first().isVisible()) {
          await close.first().click({timeout:4500}); await page.waitForTimeout(350);
        } else break;
      }
      await shot(page,name+'-02-home-clean');
    });
    await quiet(name+' forging',async()=>{
      const start=page.getByRole('button',{name:/开始锻刀/});
      await start.first().click({timeout:15000});
      await page.waitForTimeout(1000);
      await shot(page,name+'-03-forge');
      run.forge=await snapshot(page);
      console.log('SNAPSHOT',name,'forge',JSON.stringify(run.forge).slice(0,900));
      const card=page.locator('.page.is-active .dcard').first();
      await card.waitFor({timeout:22000});
      await card.click({timeout:14000});
      await page.waitForTimeout(300);
      await shot(page,name+'-04-card-selected');
      run.card=await snapshot(page);
      const confirm=page.getByRole('button',{name:'确认工艺 →',exact:true});
      await confirm.click({timeout:14000});
      await page.waitForTimeout(1400);
      await shot(page,name+'-05-stage2');
      run.stage2=await snapshot(page);
      console.log('SNAPSHOT',name,'stage2',JSON.stringify(run.stage2).slice(0,900));
    });
    for(const dest of ['arena','workshop']){
      await quiet(name+' '+dest,async()=>{
        await page.evaluate(async (destination)=>{
          const router = await import(new URL('src/ui/router.js',location.href).href);
          router.go(destination);
        },dest);
        await page.waitForTimeout(1400);
        await shot(page,name+'-'+(dest==='arena'?'06':'07')+'-'+dest);
        run[dest]=await snapshot(page);
        console.log('SNAPSHOT',name,dest,JSON.stringify(run[dest]).slice(0,850));
      });
    }
  }
  await context.close();
}
await browser.close();
await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
console.log('RESULT',JSON.stringify({source:report.source,shots:report.screenshots,errors:report.errors,consoleErrors:report.consoleErrors,failedRequests:report.failedRequests}).slice(0,12000));
