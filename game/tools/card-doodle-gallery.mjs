/** Browser-only visual proof: a real rendered gallery of all 218 name-driven card doodles. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadPlaywright,browserExecutable,baseUrl} from './lib/browser.mjs';

const out=path.resolve(process.env.UI_QA_OUT||'spatial-ui-evidence');
fs.mkdirSync(out,{recursive:true});
const {chromium}=await loadPlaywright();
const browser=await chromium.launch({executablePath:browserExecutable(),headless:true,
  args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1120,height:900},deviceScaleFactor:1,locale:'zh-CN',reducedMotion:'reduce'});
const issues=[];
page.on('pageerror',e=>issues.push(String(e)));
try{
  await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const {BY_STAGE}=await import('/src/data/cards.js');
    const {cardDoodle,doodleSpec}=await import('/src/ui/cardDoodles.js');
    const gallery=document.createElement('div');
    gallery.setAttribute('id','doodle-gallery-qa');
    gallery.style.cssText='position:relative;z-index:99999;background:#f3f4f8;color:#262b41;padding:28px 24px 44px;min-height:100vh;font:14px system-ui,sans-serif;';
    const head=document.createElement('h1');head.textContent='FORGE / 工艺涂鸦卡面 · 9 STAGES / ALL 218 DECALS';
    head.style.cssText='font-size:21px;margin:0 0 22px;letter-spacing:.06em;';
    gallery.append(head);
    const signatures=new Set(),shapes=new Set();
    for(const stage of ['S1','S2','S3','S4','S5','S6','S7','S8','S9']){
      const section=document.createElement('section');
      section.style.cssText='margin-bottom:23px';
      const title=document.createElement('h2');title.textContent=stage;
      title.style.cssText='font-size:14px;letter-spacing:.16em;color:#6b6e82;margin:0 0 10px';
      section.append(title);
      const grid=document.createElement('div');
      grid.style.cssText='display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:11px';
      const pool=BY_STAGE[stage]||[];
      for(let i=0;i<pool.length;i++){
        const card=pool[i]; if(!card)continue;
        const tile=document.createElement('div');
        tile.style.cssText='border:1px solid #dadce5;border-radius:12px;padding:9px;background:#fff;overflow:hidden;';
        const art=document.createElement('div');
        art.style.cssText='height:70px;border-radius:9px;overflow:hidden;border:1px solid rgba(35,40,70,.1)';
        const svg=cardDoodle(card);
        svg.style.cssText='width:100%;height:100%;display:block;';
        art.append(svg);
        const label=document.createElement('div');
        label.style.cssText='margin-top:8px;font-size:13px;font-weight:700;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;';
        label.textContent=card.name;
        const meta=document.createElement('div');
        meta.style.cssText='font-size:10px;color:#777;margin-top:4px;';
        const info=doodleSpec(card);
        meta.textContent=info.colorName+' · '+info.motionName;
        tile.append(art,label,meta);grid.append(tile);
        signatures.add(info.signature);
        shapes.add(svg.outerHTML);
      }
      section.append(grid);gallery.append(section);
    }
    document.body.replaceChildren(gallery);
    return {cards:signatures.size,uniqueSVG:shapes.size,sections:gallery.querySelectorAll('section').length,
      images:gallery.querySelectorAll('svg.dcard-doodle').length,
      width:document.documentElement.scrollWidth,viewportWidth:innerWidth,
      galleryHeight:gallery.getBoundingClientRect().height};
  });
  assert.equal(result.cards,218);
  assert.equal(result.uniqueSVG,218);
  assert.equal(result.sections,9);
  assert.equal(result.images,218);
  assert.ok(result.width<=result.viewportWidth+1,'gallery must have no horizontal overflow');
  await page.screenshot({path:path.join(out,'doodle-gallery-all-218-cards.png'),fullPage:true,timeout:30000});
  assert.deepEqual(issues,[]);
  fs.writeFileSync(path.join(out,'doodle-gallery-report.json'),JSON.stringify({ok:true,...result,errors:issues},null,2));
  console.log('PASS doodle gallery:',JSON.stringify(result));
}catch(err){
  fs.writeFileSync(path.join(out,'doodle-gallery-report.json'),JSON.stringify({ok:false,error:String(err.stack),errors:issues},null,2));
  await page.screenshot({path:path.join(out,'doodle-gallery-failed.png')}).catch(()=>{});
  throw err;
}finally{await browser.close()}
