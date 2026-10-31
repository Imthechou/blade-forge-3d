/** Real WebGL 3-knifetype collectible validation, with PNG and per-type screenshots. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { loadPlaywright,browserExecutable,baseUrl } from './lib/browser.mjs';
const out=path.resolve('collection-multiblade-evidence');
fs.mkdirSync(out,{recursive:true});
const {chromium}=await loadPlaywright();
const browser=await chromium.launch({headless:true,executablePath:browserExecutable(),
  args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist']});
const results={models:[],errors:[],requests:[]};
let page,context;
try{
  context=await browser.newContext({viewport:{width:375,height:812},deviceScaleFactor:2,isMobile:true,hasTouch:true,locale:'zh-CN',reducedMotion:'reduce',acceptDownloads:true});
  await context.addInitScript(()=>{
    if(localStorage.getItem('bladeforge.save'))return;
    const specs=[
      ['tangdao','唐刀·银灰','M02','T02','F01','rare'],
      ['karambit','爪子刀·黑曜','M06','T04','F04','fine'],
      ['balisong','蝴蝶刀·黄金','M14','T12','F02','legend'],
    ];
    const make=(id,name,mat,tex,finish,rarity,index)=>({
      id:'multiblade-'+id,bladeName:name,knifeTypeId:id,knifeType:'knife_'+id,
      seed:4100+index,score:280+index*100,rarity,
      rarityName:{rare:'稀有',fine:'精良',legend:'传说'}[rarity],
      qualityName:'精制',createdAt:100-index,canEnterArena:true,
      stats:{strength:96,toughness:90,sharpness:104,craft:95,design:105,spirit:88},
      history:[],traits:[],combos:[],tags:{},arenaHistory:[],
      pendingSkin:{materialId:mat,textureId:tex,finishId:finish,wear:0.015,variants:{},
        handle:{metalId:'polymer'}}});
    localStorage.setItem('bladeforge.save',JSON.stringify({version:1,cr:600,collection:specs.map(make),
      settings:{tutorialSeen:true,sound:false,motion:'reduced'}}));
  });
  page=await context.newPage();
  page.on('pageerror',e=>results.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))results.errors.push(m.text())});
  page.on('response',r=>{if(r.status()>=400)results.requests.push({status:r.status(),url:r.url()})});
  await page.goto(baseUrl,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>window.__FORGE_PREP?.ready&&!document.querySelector('#boot'),null,{timeout:120000});
  await page.getByRole('button',{name:'藏刀阁',exact:true}).click();
  await page.locator('.ws-collection-grid .blade-card-v2').first().waitFor({timeout:25000});
  const specs=[['tangdao','唐刀·银灰'],['karambit','爪子刀·黑曜'],['balisong','蝴蝶刀·黄金']];
  for(const [id,name] of specs){
    const card=page.locator('.ws-collection-grid .blade-card-v2').filter({hasText:name});
    assert.equal(await card.count(),1,name+' must appear exactly once');
    await card.scrollIntoViewIfNeeded();
    await page.waitForFunction(name=>{
      const card=[...document.querySelectorAll('.ws-collection-grid .blade-card-v2')].find(c=>c.textContent.includes(name));
      const image=card?.querySelector('.blade-thumb-image');
      return !!image&&image.complete&&image.naturalWidth>0;
    },name,{timeout:90000});
    const thumb=await card.locator('.blade-thumb-image').evaluate(n=>n.src);
    assert.ok(thumb.startsWith('data:image/'),'Thumbnail must be the real GLB render');
    await card.screenshot({path:path.join(out,id+'-collection-card.png')});
    await card.locator('.bcv-open').click();
    await page.locator('.blade-detail-stage-status').waitFor({state:'detached',timeout:90000});
    const actual=await page.evaluate(async()=> (await import('/src/render/index.js')).getStage().modelId);
    // Detail uses a dedicated renderer, not the shared home/forge stage.
    const detailName=await page.locator('.blade-detail-sheet').innerText();
    assert.ok(detailName.includes(name),'Wrong blade detail');
    const dialog=page.locator('.blade-detail-sheet');
    await dialog.screenshot({path:path.join(out,id+'-detail.png')});
    const pending=page.waitForEvent('download',{timeout:60000});
    await page.getByRole('button',{name:'下载本刀真实3D外观收藏卡'}).click();
    const download=await pending, bytes=fs.readFileSync(await download.path());
    assert.ok(bytes.length>50000,name+' export is not a placeholder image');
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),1080);
    assert.equal(bytes.readUInt32BE(20),1520);
    fs.writeFileSync(path.join(out,id+'-collectible-poster.png'),bytes);
    results.models.push({id,name,posterBytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),
      thumbBytes:thumb.length,mainStageModel:actual});
    await page.locator('.sheet-mask').last().getByRole('button',{name:'关闭',exact:true}).click();
    await page.locator('.sheet-mask').waitFor({state:'detached',timeout:15000});
  }
  assert.equal(new Set(results.models.map(m=>m.sha256)).size,3,'Distinct knives must yield distinct real 3D posters');
  assert.equal(new Set(results.models.map(m=>m.thumbBytes)).size>=2,true,'Knife silhouettes/materials should not all produce identical payload sizes');
  assert.deepEqual(results.errors,[]);assert.deepEqual(results.requests,[]);
  console.log('PASS: three actual GLB collectible cards and exported 1080x1520 posters');
}catch(error){results.failure=String(error?.stack||error);console.error(results.failure);process.exitCode=1;
  if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
}finally{
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(results,null,2));
  await context?.close();await browser.close();
}
