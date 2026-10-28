import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(process.cwd(), 'visual-acceptance');
await fs.mkdir(root, {recursive:true});

const report={date:new Date().toISOString(),checks:[],consoleErrors:[],failedRequests:[],failures:[],screenshots:[]};
const candidate='http://127.0.0.1:8123/';
const before='https://imthechou.github.io/blade-forge-3d/';
const sizes=[{width:390,height:844},{width:390,height:740},{width:390,height:680},{width:375,height:667},{width:1280,height:900}];
async function capture(label,url,viewport,check) {
  // One Chromium/SwiftShader process per viewport; a single long-lived GPU context
  // can stall WebGL shader preparation after several mobile profiles.
  const browser = await chromium.launch({headless:true, executablePath:'/usr/bin/google-chrome',
    args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  const mobile=viewport.width<600;
  const context=await browser.newContext({viewport,deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,locale:'zh-CN',reducedMotion:'reduce'});
  const page=await context.newPage();
  page.on('pageerror',err=>report.consoleErrors.push({label,message:String(err)}));
  page.on('console',msg=>{if(msg.type()==='error') report.consoleErrors.push({label,message:msg.text()});});
  page.on('response',resp=>{if(resp.status()>=400) report.failedRequests.push({label,status:resp.status(),url:resp.url()});});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>window.__FORGE_PREP?.ready && document.querySelector('#boot.is-gone'),null,{timeout:100000});
  // The guide is scheduled after first paint: wait for that async overlay before clicking.
  await page.waitForTimeout(900);
  // Fresh profiles open an onboarding sheet; dismiss it through the real UI first.
  for(let i=0;i<3;i++) {
    const close=page.locator('.sheet-mask .sheet-x');
    if(await close.count() && await close.first().isVisible()) {
      await close.first().click({timeout:5000});
      await page.waitForTimeout(250);
    } else break;
  }
  const start=page.getByRole('button',{name:/开始锻刀/}).first();
  await start.click({timeout:18000});
  await page.locator('.page[data-page="forge"].is-active .dcard').first().waitFor({timeout:30000});
  await page.waitForTimeout(1000);
  const snap=async()=>await page.evaluate(()=>{
    const box=(s)=>{const n=document.querySelector(s); if(!n)return null;
      const r=n.getBoundingClientRect();return {top:+r.top.toFixed(1),bottom:+r.bottom.toFixed(1),
        height:+r.height.toFixed(1),scrollHeight:n.scrollHeight,clientHeight:n.clientHeight,visible:!!n.getClientRects().length};};
    const sel='.page[data-page="forge"].is-active';
    const btn=[...document.querySelectorAll(sel+' .actions .btn')];
    return {innerHeight,innerWidth,stage:box(sel+' .stage'),body:box(sel+' .forge-body'),
      rail:box(sel+' .forge-rail'),cards:box(sel+' .cards'),actions:box(sel+' .actions'),
      confirm:btn[1]?{text:btn[1].textContent,disabled:btn[1].disabled}:null,
      horizontalOverflow:document.documentElement.scrollWidth>innerWidth,
      canvasVisible:[...document.querySelectorAll(sel+' canvas')].some(x=>x.getClientRects().length&&x.width>10&&x.height>10),
      actualPage:document.querySelector(sel)?.dataset.page,
      mobileDevice:matchMedia('(pointer:coarse)').matches,
      bodyScrolling:document.querySelector(sel+' .forge-body')?.scrollHeight>document.querySelector(sel+' .forge-body')?.clientHeight+3
    };
  });
  const prefix=label+'-'+viewport.width+'x'+viewport.height;
  await page.screenshot({path:path.join(root,prefix+'-forge.png'),fullPage:false,animations:'disabled'});
  report.screenshots.push(prefix+'-forge.png');
  let state=await snap();
  const beforeSelect=state;
  let selected=false, progressed=false;
  if(check) {
    const first=page.locator('.page.is-active .dcard').first();
    await first.click({timeout:14000});
    await page.waitForTimeout(400);
    await page.screenshot({path:path.join(root,prefix+'-selected.png'),fullPage:false,animations:'disabled'});
    report.screenshots.push(prefix+'-selected.png');
    state=await snap();
    selected=state.confirm?.text?.includes('确认工艺')&&!state.confirm.disabled;
    if(selected && viewport.height>=680) {
      const btn=page.getByRole('button',{name:'确认工艺 →',exact:true});
      await btn.click({timeout:16000});
      await page.waitForTimeout(650);
      progressed=(await page.locator('.page.is-active .stage-badge').innerText()).includes('02');
      await page.screenshot({path:path.join(root,prefix+'-stage2.png'),fullPage:false,animations:'disabled'});
      report.screenshots.push(prefix+'-stage2.png');
    }
  }
  const record={label,viewport,initial:beforeSelect,selected,progressed};
  report.checks.push(record);
  if(check) {
    const fit=beforeSelect.actions?.bottom<=viewport.height+1 &&
      beforeSelect.actions?.top>=0 && beforeSelect.stage?.height>=165 &&
      beforeSelect.rail?.top>=beforeSelect.stage?.bottom-1 &&
      beforeSelect.actions?.top>=beforeSelect.cards?.bottom-1 &&
      !beforeSelect.horizontalOverflow && !beforeSelect.bodyScrolling;
    record.oneScreen=fit;
    if(!fit || !selected || (viewport.height>=680&&!progressed))
      report.failures.push({label,viewport,fit,selected,progressed});
  }
  console.log('CASE',JSON.stringify(record));
  await context.close();
  await browser.close();
}
for(const viewport of sizes) {
  if(viewport.width===390&&viewport.height===740) await capture('BEFORE',before,viewport,false);
  await capture('AFTER',candidate,viewport,true);
}
await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));
console.log('SUMMARY',JSON.stringify({passed:report.failures.length===0,failures:report.failures,errors:report.consoleErrors.length,failedRequests:report.failedRequests.length,screenshots:report.screenshots.length}));
if(report.failures.length>0 || report.consoleErrors.length>0 || report.failedRequests.length>0) process.exitCode=1;
