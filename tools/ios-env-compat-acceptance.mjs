import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const out=path.resolve(process.cwd(),'ios-env-compat-results');
await fs.mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),cases:[],errors:[]};
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/google-chrome',
  args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
for(const c of [
 {name:'mobile-baseline',width:390,height:740,blockHDR:false,blockFloatFilter:false},
 {name:'mobile-no-old-hdr',width:390,height:740,blockHDR:true,blockFloatFilter:false},
 {name:'mobile-no-float32-linear',width:390,height:740,blockHDR:true,blockFloatFilter:true},
 {name:'desktop-baseline',width:1280,height:900,blockHDR:false,blockFloatFilter:false},
]) {
 const context=await browser.newContext({viewport:{width:c.width,height:c.height},
  deviceScaleFactor:c.width<600?2:1,isMobile:c.width<600,hasTouch:c.width<600,locale:'zh-CN',reducedMotion:'reduce'});
 if(c.blockFloatFilter) await context.addInitScript(()=>{
   const p=WebGL2RenderingContext.prototype;const orig=p.getExtension;
   p.getExtension=function(name){if(name==='OES_texture_float_linear')return null;return orig.call(this,name);};
 });
 const page=await context.newPage();
 const errors=[]; const requests=[];
 page.on('pageerror',e=>errors.push('pageerror: '+String(e)));
 page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
 page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url());});
 page.on('request',req=>{if(req.url().includes('environment.hdr'))requests.push(req.url());});
 if(c.blockHDR) await page.route(/environment\.hdr(?:\?.*)?$/,route=>route.abort('blockedbyclient'));
 await page.goto('http://127.0.0.1:8123/',{waitUntil:'domcontentloaded',timeout:40000});
 await page.waitForFunction(()=>window.__FORGE_PREP?.ready && document.querySelector('#boot.is-gone'),null,{timeout:90000});
 await page.waitForFunction(()=>!!window.__FORGE_ENV_DIAG,null,{timeout:45000});
 const diag=await page.evaluate(()=>({env:window.__FORGE_ENV_DIAG,
   prep:{ready:window.__FORGE_PREP?.ready,problems:window.__FORGE_PREP?.problems},
   webgl:(()=>{const gl=document.querySelector('canvas')?.getContext('webgl2');
     return {webgl2:!!gl,floatLinear:!!gl?.getExtension('OES_texture_float_linear'),
       halfFloatType:window.THREE?.HalfFloatType};})()}));
 await page.screenshot({path:path.join(out,c.name+'-home.png'),animations:'disabled'});
 await page.waitForTimeout(1000);
 // Onboarding sheet can disappear during its own animation; do not treat a
 // detached close button as a game-render failure.
 for(let i=0;i<3;i++){
   const close=page.locator('.sheet-mask.is-in .sheet-x');
   if(await close.count() && await close.first().isVisible()){
     try{await close.first().click({timeout:1800});}catch(e){console.log('Guide closed during click:',String(e).slice(0,80));}
     await page.waitForTimeout(300);
   }else break;
 }
 await page.getByRole('button',{name:/开始锻刀/}).first().click({timeout:12000});
 await page.waitForTimeout(900);
 await page.screenshot({path:path.join(out,c.name+'-forge.png'),animations:'disabled'});
 const forge=await page.evaluate(()=>({page:document.querySelector('.page.is-active')?.dataset.page,
  canvas:[...document.querySelectorAll('canvas')].filter(x=>x.width>10&&x.getClientRects().length).length,
  horizontalOverflow:document.documentElement.scrollWidth>innerWidth}));
 const pass=diag.env?.mode==='studio-half-float' && diag.env.ready && forge.page==='forge' && forge.canvas>0 &&
   !forge.horizontalOverflow && errors.length===0 && requests.length===0;
 const record={...c,diag,forge,errors,requests,pass};report.cases.push(record);
 console.log('CASE',JSON.stringify(record));
 await context.close();
}
await browser.close();
report.pass=report.cases.every(c=>c.pass);
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log('SUMMARY',JSON.stringify({pass:report.pass,count:report.cases.length,failed:report.cases.filter(c=>!c.pass).map(c=>c.name)}));
if(!report.pass)process.exitCode=1;
