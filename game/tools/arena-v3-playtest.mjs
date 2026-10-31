/** V4.1 actual Chromium pointer flow; software WebGL. Virtual clock accelerates test scenarios; recordings are not phone/human validation. */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadPlaywright,browserExecutable} from './lib/browser.mjs';
import {sampleBlade} from './arena-v3-simulate.mjs';
const {chromium}=await loadPlaywright();
const out=path.resolve(process.env.ARENA_QA_OUT || 'arena-playtest');fs.mkdirSync(out,{recursive:true});
let server=null;
const base=process.env.FORGE_URL || 'http://127.0.0.1:8123/';
if(!process.env.FORGE_URL) {
  const {createGameServer}=createRequire(import.meta.url)('../serve.cjs');server=createGameServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8123,'127.0.0.1',resolve);});
}
const browser=await chromium.launch({headless:true,executablePath:browserExecutable(),args:['--no-sandbox','--use-angle=swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist']});
const report={version:'arena-v4.1',engine:'Chromium / Playwright / software ANGLE (not human or physical device)',cases:[],errors:[],requestFailures:[]};
async function screenshot(page,name){await page.screenshot({path:path.join(out,name+'.png'),timeout:15000});}
async function newGame(name,{width=390,height=844,virtual=true}={}) {
  const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:2,recordVideo:{dir:path.join(out,'videos'),size:{width,height}},locale:'zh-CN',reducedMotion:'reduce'});
  const records=[sampleBlade(150),{...sampleBlade(150),id:'blade-b',bladeName:'破甲刀'},{...sampleBlade(150),id:'blade-c',bladeName:'综合刀'}];
  await context.addInitScript(records=>localStorage.setItem('bladeforge.save',JSON.stringify({version:1,cr:2000,collection:records,arena:{school:{edge:{cleared:[0,1,2]},press:{cleared:[0,1,2]},composite:{cleared:[0,1,2]}},history:[{id:'qa-national-crown',tier:'national',result:{champion:true}}]},settings:{tutorialSeen:true,sound:false,motion:'reduced',hintsSeen:{}}})),records);
  if(name==='lifecycle-ten-navigation-cycles') {
    await context.addInitScript(()=>{
      const tracker={liveObservers:0,totalObservers:0,disconnected:0};
      Object.defineProperty(window,'__ARENA_LIFECYCLE_QA',{value:tracker});
      const Base=window.ResizeObserver;
      if(Base)window.ResizeObserver=class extends Base{
        constructor(callback){super(callback);tracker.totalObservers++;tracker.liveObservers++;this._tracked=true;}
        disconnect(){if(this._tracked){this._tracked=false;tracker.disconnected++;tracker.liveObservers--;}return super.disconnect();}
      };
      // Count actual registered listeners while preserving native behavior.
      const register=(host,key,types)=>{
        const listeners=new Map(types.map(type=>[type,new Set()]));
        const add=host.addEventListener,remove=host.removeEventListener;
        host.addEventListener=function(type,fn,options){
          if(listeners.has(type))listeners.get(type).add(fn);
          return add.call(this,type,fn,options);
        };
        host.removeEventListener=function(type,fn,options){
          if(listeners.has(type))listeners.get(type).delete(fn);
          return remove.call(this,type,fn,options);
        };
        Object.defineProperty(tracker,key,{get:()=>Object.fromEntries([...listeners].map(([k,v])=>[k,v.size]))});
      };
      register(window,'windowListeners',['resize']);
      register(document,'documentListeners',['visibilitychange','keydown']);
    });
  }
  const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push({name,error:String(e)}));
  page.on('requestfailed',r=>{if(!r.failure()?.errorText?.includes('ERR_ABORTED'))report.requestFailures.push({name,url:r.url(),error:r.failure()?.errorText});});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>{const boot=document.querySelector('#boot');return document.querySelector('.page[data-page="home"]')&&(!boot||boot.classList.contains('is-gone'));},null,{timeout:60000});
  await page.evaluate(async()=> (await import('/src/ui/router.js')).go('arena'));
  if(virtual){
    // pauseAt must be in the FUTURE relative to Playwright's installed clock.
    // A fixed +200ms target can already be in the past on SwiftShader CI.
    await page.clock.install({time:new Date('2026-10-28T00:00:00Z')});
    const clockNow = await page.evaluate(()=>Date.now());
    await page.clock.pauseAt(new Date(clockNow+2000));
  }
  return {page,context,virtual};
}
async function choose(page,virtual) {
  const cards=page.locator('[data-augment-id]');
  if(await cards.count()) {
    const data=await page.evaluate(()=>({elapsed:__FORGE_ARENA.run.elapsed,health:__FORGE_ARENA.run.health,types:__FORGE_ARENA.run.offers}));
    if(virtual)await page.clock.fastForward(600);else await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>__FORGE_ARENA.run.elapsed),data.elapsed);
    const preference=['sanmai','tempering','smithsoul','unbroken','cladsteel','pickings','whetstone','quenchheat','noself','layerbreak','weakmap','longblade','piercing'];
    const selected=[...data.types].sort((a,b)=>(preference.indexOf(a)<0?99:preference.indexOf(a))-(preference.indexOf(b)<0?99:preference.indexOf(b)))[0];
    await page.locator(`[data-augment-id="${selected}"]`).click({force:true});
    if(virtual)await page.clock.fastForward(20);
    return true;
  }
  return false;
}
async function pointerCut(page) {
  const state=await page.evaluate(()=>{
    const r=globalThis.__FORGE_ARENA?.run;
    if(!r||r.done||r.paused||r.phase.endsWith('-choice'))return null;
    const live=r.targets.filter(t=>t.alive);
    if(!live.length)return null;
    if(r.structure){
      // From the published physical structure graph, follow the more
      // accessible of two valid connection-removal routes. No mutation.
      const routes=r.structure.routes.map(route=>route
        .map(id=>live.find(t=>t.id===id)).filter(Boolean));
      routes.sort((a,b)=>a.reduce((n,t)=>n+({foam:1,rope:2,ice:3,wood:4,plastic:5,metal:8}[t.type]||6),0)
        -b.reduce((n,t)=>n+({foam:1,rope:2,ice:3,wood:4,plastic:5,metal:8}[t.type]||6),0));
      const active=routes[0]?.sort((a,b)=>(b.progress||0)-(a.progress||0))[0] || live[0];
      return {target:active,structure:true,elapsed:r.elapsed};
    }
    const t=live.sort((a,b)=>({foam:1,rope:2,wood:4,plastic:5,ice:3,metal:8}[a.type]||4)
      -({foam:1,rope:2,wood:4,plastic:5,ice:3,metal:8}[b.type]||4))[0];
    return {target:t,structure:false,elapsed:r.elapsed};
  });
  if(!state)return null;
  const {target:t}=state;
  const angle={foam:Math.PI*.77,rope:0,wood:Math.PI*.47,plastic:0,ice:Math.PI*.25,metal:0}[t.type];
  const box=await page.locator('.quick-canvas').boundingBox();assert.ok(box?.height>50);
  const p=d=>[box.x+(t.x+Math.cos(angle)*d)*box.width,
    box.y+(t.y+Math.sin(angle)*d)*box.height];
  const start=p(-.20),end=p(.20);
  await page.mouse.move(...start);await page.mouse.down();
  await page.mouse.move(...end,{steps:5});await page.mouse.up();
  return {id:t.id,type:t.type,structure:state.structure};
}
/** Test genuine mobile touch against a moving late-game target.
 * The arena uses the normal PointerEvent handlers and the actual moving
 * (x,y) computed by tick(); no direct Challenge.swipe / synthetic damage. */
async function touchMovingTarget(page){
  const target=await page.evaluate(()=>{
    const r=globalThis.__FORGE_ARENA?.run;
    const t=r?.targets?.find(t=>t.alive&&t.moving&&!t.avoid);
    return t?{id:t.id,x:t.x,y:t.y,age:r.elapsed-t.createdAt,cuts:t.cuts.length}:null;
  });
  if(!target)return null;
  const box=await page.locator('.quick-canvas').boundingBox();
  assert.ok(box?.width>100&&box?.height>100,'moving target touch canvas missing');
  const point=(fraction)=>({
    x:box.x+box.width*Math.min(.99,Math.max(.01,target.x+fraction)),
    y:box.y+box.height*target.y,
  });
  const cdp=await page.context().newCDPSession(page);
  try{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(-.16)]});
    for(let i=1;i<=16;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',
      touchPoints:[point(-.16+.32*i/16)]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }finally{await cdp.detach();}
  const result=await page.evaluate(id=>{
    const r=globalThis.__FORGE_ARENA.run;
    const t=r.targets.find(t=>t.id===id);
    return {cuts:t?.cuts.length??0,alive:t?.alive,contacts:r.primaryContacts||0};
  },target.id);
  // On a true 45-second wall clock the target keeps drifting while Chrome
  // delivers each touch segment. One missed swipe is a valid player outcome;
  // gather a bounded sample instead of conflating it with a broken input path.
  return {target,...result,hit:result.cuts>target.cuts};
}
async function playRound(page,virtual,{capture=false,evidenceName='v41-round'}={}) {
  await page.locator('.quick-canvas').waitFor();
  const initial=await page.evaluate(()=>{
    const r=globalThis.__FORGE_ARENA?.run;
    return {id:r?.id,total:r?.total,structure:!!r?.structure,mode:r?.mode};
  });
  assert.ok(initial.id);
  assert.equal(await page.locator('[data-augment-id]').count(),0,
    'V4.1 must never interrupt to sell an augment');
  let loops=0;
  const contact=[];
  let movingTouch=null;
  const movingAttempts=[];
  if(capture)await screenshot(page,evidenceName+'-before');
  while(loops++<650) {
    if(virtual)await page.clock.fastForward(38);
    else await page.waitForTimeout(40);
    const state=await page.evaluate(()=>{
      const r=globalThis.__FORGE_ARENA?.run;
      return r?{id:r.id,done:r.done,elapsed:r.elapsed,phase:r.phase,
        structure:r.structure ? {
          primary:r.structure.primary,completedIds:[...r.structure.completedIds],
          failedJoins:r.structure.failedJoins.length,completed:r.structure.completed
        }:null,score:r.score}:null;
    });
    if(!state)throw Error('Missing arena run');
    if(state.id!==initial.id||state.done)break;
    if(initial.mode==='quick' && !movingTouch && movingAttempts.length<6 &&
       (state.phase==='speed'||state.phase==='finale')){
      const attempt=await touchMovingTarget(page);
      if(attempt){
        movingAttempts.push(attempt);
        if(attempt.hit){
          movingTouch=attempt;
          if(capture) {
            if(virtual)await page.clock.fastForward(38);
            await screenshot(page,evidenceName+'-moving-touch');
          }
        }
      }
    }
    const cut=await pointerCut(page);
    if(cut){contact.push({at:state.elapsed,...cut,score:state.score});if(contact.length>200)contact.shift();}
    if(capture && loops===1)await screenshot(page,evidenceName+'-first-contact');
    if(capture && loops===2)await screenshot(page,evidenceName+'-damage-progress');
    if(capture && loops===5)await screenshot(page,evidenceName+'-after-cuts');
    if(virtual)await page.clock.fastForward(230);
  }
  const r=await page.evaluate(()=>globalThis.__FORGE_ARENA?.run?.result);
  assert.ok(r,'No settled round; '+JSON.stringify({initial,loops,contact:contact.slice(-3)}));
  assert.equal(r.total,initial.total);
  assert.equal(r.choicesMade,0);
  assert.equal(await page.locator('[data-augment-id]').count(),0);
  if(initial.mode==='quick'){
    assert.equal(r.reason,'time');
    assert.ok(movingTouch,'none of six genuine mobile swipes hit a moving target: '+
      JSON.stringify(movingAttempts));
  }
  if(capture)await screenshot(page,evidenceName+'-settlement');
  return {score:r.score,kills:r.kills,choices:r.choicesMade,
    elapsed:r.total,mode:r.mode,reason:r.reason,structure:r.structure,
    contacts:contact,performance:r.metrics,movingTouch,movingAttempts};
}

async function scenario(name,fn,options) {
  if(process.env.ARENA_CASE && !new RegExp(process.env.ARENA_CASE).test(name))return;
  const env=await newGame(name,options);
  try{const data=await fn(env);report.cases.push({name,status:'PASS',data});console.log('PASS',name,JSON.stringify(data));}
  catch(error){report.cases.push({name,status:'FAIL',error:String(error.stack)});await screenshot(env.page,name+'-failure').catch(()=>{});console.error('FAIL',name,String(error));}
  finally{
    await env.context.close();
    try{
      const dest=path.join(out,'video-'+name+'.webm');
      await env.page.video()?.saveAs(dest);
      const result=report.cases.findLast(c=>c.name===name);
      if(result)result.video=path.basename(dest);
    }catch(err){console.warn('Video not saved for '+name+': '+String(err));}
  }
}
try {
  await scenario('quick-45s-real-pointer',async({page,virtual})=>{
    await page.getByRole('button',{name:'快速挑战',exact:true}).click({force:true});
    await page.getByRole('button',{name:'开始自由快赛',exact:true}).click({force:true});
    if(virtual)await page.clock.fastForward(30);else await page.waitForTimeout(150);
    await screenshot(page,'v41-quick-opening');
    const r=await playRound(page,virtual,{capture:true,evidenceName:'v41-quick'});
    await screenshot(page,'v41-quick-report');
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('bladeforge.save')));
    assert.ok(stored.quickChallengeRecords.byChallenge['quick:v41:free']);
    return {score:r.score,kills:r.kills,choices:r.choices,contacts:r.contacts.length,
      movingTouch:r.movingTouch};
  },{virtual:process.env.ARENA_REALTIME==='1'?false:true});
  await scenario('lifecycle-ten-navigation-cycles',async({page})=>{
    const measurements=[];
    // Native ResizeObserver + listeners are tracked by this *isolated context*,
    // not by the game. No direct stage renderer or gameplay mutations.
    const metrics=()=>page.evaluate(()=>{
      const q=window.__ARENA_LIFECYCLE_QA;
      const bridge=window.__FORGE_ARENA;
      const arena=document.querySelector('.page[data-page="arena"]');
      return {
        live:q.liveObservers,total:q.totalObservers,disconnected:q.disconnected,
        listeners:{...q.windowListeners,...q.documentListeners},
        diagnosticCanvas:!!bridge?.canvas,diagnosticEffects:!!bridge?.effects,
        canvasConnected:bridge?.canvas?.isConnected??false,
        arenaCanvases:arena?.querySelectorAll('.quick-canvas').length||0,
        paused:bridge?.run?.paused??null,phase:bridge?.run?.phase||null,
        cr:JSON.parse(localStorage.getItem('bladeforge.save'))?.cr||0,
      };
    });
    const baseline=await metrics();
    await page.getByRole('button',{name:'快速挑战',exact:true}).click({force:true});
    await page.getByRole('button',{name:'开始自由快赛',exact:true}).click({force:true});
    const first=await metrics();
    assert.ok(first.diagnosticCanvas&&first.diagnosticEffects,'first arena mount missing live canvas/FX');
    const activeDelta=first.live-baseline.live;
    assert.ok(activeDelta>=1,'arena must register a ResizeObserver');
    let awayReference=null,resumeReference=null;
    const currentRun=await page.evaluate(()=>window.__FORGE_ARENA?.run?.id);
    for(let i=0;i<10;i++){
      await page.evaluate(async()=> (await import('/src/ui/router.js')).go('home'));
      const away=await metrics();
      if(!awayReference)awayReference=away;
      else {
        assert.equal(away.live,awayReference.live,'observer count accumulates on exit #'+i);
        assert.deepEqual(away.listeners,awayReference.listeners,
          'listener count accumulates on exit #'+i);
      }
      assert.equal(away.diagnosticCanvas,false,'retained obsolete Canvas on exit #'+i);
      assert.equal(away.diagnosticEffects,false,'retained visual FX buffers on exit #'+i);
      assert.equal(away.arenaCanvases,0,'hidden arena keeps a canvas backing store on exit #'+i);
      assert.equal(away.paused,true,'navigation away must freeze live arena timer');
      // The home page legitimately owns separate listeners/observers. Never
      // compare different page types to a supposed global "zero" baseline.
      await page.evaluate(async()=> (await import('/src/ui/router.js')).go('arena'));
      const resumed=await metrics();
      if(!resumeReference)resumeReference=resumed;
      else {
        assert.equal(resumed.live,resumeReference.live,'observer count grows on arena re-entry #'+i);
        assert.deepEqual(resumed.listeners,resumeReference.listeners,
          'listener count grows on arena re-entry #'+i);
      }
      assert.equal(resumed.arenaCanvases,1,'re-enter has duplicate canvases #'+i);
      assert.ok(resumed.diagnosticCanvas&&resumed.diagnosticEffects,'missing active visual buffers #'+i);
      assert.equal(resumed.paused,true,'returning from another page must require explicit resume');
      assert.ok(resumed.live>0,'arena must have an active canvas observer');
      const resumedId=await page.evaluate(()=>window.__FORGE_ARENA?.run?.id);
      assert.equal(resumedId,currentRun,'paused round should survive page re-entry #'+i);
      await page.getByRole('button',{name:'继续挑战',exact:true}).click({force:true});
      const active=await metrics();
      assert.equal(active.paused,false,'manual resume failed at cycle #'+i);
      assert.equal(active.live,resumed.live,'resume created an extra observer at #'+i);
      measurements.push({cycle:i+1,away,resumed,active});
    }
    await page.evaluate(async()=> (await import('/src/ui/router.js')).go('home'));
    const end=await metrics();
    assert.equal(end.live,awayReference.live,'final home stage must return to its own stable baseline');
    assert.deepEqual(end.listeners,awayReference.listeners);
    assert.equal(end.diagnosticCanvas,false);
    assert.equal(end.diagnosticEffects,false);
    assert.equal(end.arenaCanvases,0);
    assert.equal(end.cr,baseline.cr,'exiting must not award unearned CR');
    await screenshot(page,'v41-arena-lifecycle-home-10');
    return {cycles:10,initial:baseline,active:first,final:end,
      maxObservers:Math.max(...measurements.flatMap(x=>[x.away.live,x.resumed.live,x.active.live])),
      noCumulativeGrowth:true,earnedCR:0};
  },{virtual:false});
  await scenario('six-material-2_5d-render-contact-gallery',async({page})=>{
    // This gallery is a deterministic renderer-state fixture. It is not
    // presented as human input or a real structural victory recording.
    await page.getByRole('button',{name:'快速挑战',exact:true}).click({force:true});
    await page.getByRole('button',{name:'开始自由快赛',exact:true}).click({force:true});
    await page.locator('.quick-canvas').waitFor();
    // A renderer-state fixture may take far longer than 45 real seconds on software WebGL.
    // Extend this isolated QA run only; player quick matches stay at their 45s rule.
    await page.evaluate(()=>{
      const run=globalThis.__FORGE_ARENA?.run;
      if(!run||run.done)throw Error('Material gallery requires an active canvas');
      run.total=Math.max(run.total,600);
      run.remaining=Math.max(0,run.total-run.elapsed);
    });
    const images=[];
    for(const type of ['foam','rope','wood','plastic','ice','metal']) {
      for(const state of ['intact','damage','severed']){
        await page.evaluate(({type,state})=>{
          const bridge=globalThis.__FORGE_ARENA,run=bridge.run,effects=bridge.effects;
          const t={
            id:'fixture-'+type,type,x:.5,y:.52,slot:1,row:1,layout:'structure',
            progress:state==='damage' ? .48 : 0,
            armorLeft:0,alive:state!=='severed',
            cuts:state==='damage'?[{angle:-.35,y:.03,progress:.48}]:[],
            lastAngle:-.35,variation:.03,createdAt:run.elapsed
          };
          run.targets=state==='severed'?[]:[t];
          run.spawnMode='structure';run.structure=null;run.refillAt=null;
          effects.debris.length=0;effects.bursts.length=0;effects.hitLabels.length=0;
          if(state==='severed')effects.debris.push({
            type,x:t.x,y:t.y,angle:t.lastAngle,layout:'structure',at:performance.now(),
          });
        },{type,state});
        // Allow the existing animation scheduler to draw this precise state.
        await page.waitForTimeout(35);
        const file='materials-'+type+'-'+state+'.png';
        const box=await page.locator('.quick-canvas').boundingBox();
        assert.ok(box?.width>100&&box?.height>100,`Canvas missing in ${type}/${state} fixture`);
        await page.screenshot({path:path.join(out,file),clip:box,timeout:20000});
        images.push(file);
      }
    }
    const rows=['foam','rope','wood','plastic','ice','metal'];
    const labels={foam:'泡棉',rope:'绳束',wood:'木材',plastic:'工程塑料',ice:'冰晶',metal:'金属'};
    const grid=rows.map(type=>'<section><h3>'+labels[type]+'</h3><div class="row">'+
      ['intact','damage','severed'].map((st,i)=>'<figure><img src="materials-'+type+'-'+st+'.png"><figcaption>'+['完整','持久切槽','分离断面'][i]+'</figcaption></figure>').join('')+
      '</div></section>').join('');
    const html='<!DOCTYPE html><html lang="zh"><meta charset="utf-8"><title>V4.1 六材料损伤/断面对照（渲染状态夹具）</title><style>body{font:16px system-ui;background:#f4f6fa;color:#28314c;max-width:1100px;margin:24px auto}h1{font-size:22px}p{color:#68758c}section{border-top:1px solid #dde3ea;padding:12px 0}h3{margin:5px}.row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}figure{margin:0}img{width:100%;border-radius:12px}figcaption{text-align:center;color:#52627a}</style><h1>六材料：完整 / 受损 / 断面</h1><p>当前提交 Canvas/2.5D 渲染状态夹具；非真人、非实际手机、非实际赛局通过证据。</p>'+grid+'</html>';
    const htmlPath=path.join(out,'v41-six-material-contact-sheet.html');
    fs.writeFileSync(htmlPath,html);
    const gallery=await page.context().newPage();
    await gallery.setViewportSize({width:1060,height:780});
    await gallery.goto(pathToFileURL(htmlPath).href);
    await gallery.screenshot({path:path.join(out,'v41-six-material-contact-sheet.png'),fullPage:true});
    await gallery.close();
    return {materials:rows,states:3,files:images.length,
      evidence:'renderer state fixtures, not real playtest'};
  },{virtual:false});
  await scenario('school-six-branches',async({page,virtual})=>{
    const results=[];
    for(const branch of ['锻压','锋刃','精密','淬彩','复合','过载']) {
      await page.getByRole('button',{name:new RegExp('^'+({锻压:'锤',锋刃:'刃',精密:'准',淬彩:'彩',复合:'复',过载:'载'}[branch]))}).filter({hasText:branch}).click({force:true});
      await page.getByRole('button',{name:'开始挑战',exact:true}).click({force:true});
      const r=await playRound(page,virtual,{capture:true,evidenceName:'v41-school-'+branch});
      assert.ok(r.contacts.length>0,branch+' no material contact');
      results.push({branch,score:r.score,choices:r.choicesMade});
      await page.getByRole('button',{name:'再打一场',exact:true}).click({force:true});
    }
    return results;
  });
  await scenario('national-five-rounds',async({page,virtual})=>{
    await page.getByRole('button',{name:'全国大赛',exact:true}).click({force:true});
    // Player entry uses the same Game orchestration; no fabricated scores or direct core mutation.
    const launch=page.getByRole('button',{name:/开始.*全国|参加.*全国|开始本届/}).last();
    if(await launch.count())await launch.click({force:true});else throw Error('National launch button missing: '+await page.locator('.arena-body').innerText());
    const results=[];
    for(let i=0;i<5;i++) {
      const button=page.getByRole('button',{name:/开始第.*轮/}).last();
      await button.click({force:true});
      const r=await playRound(page,virtual,{capture:true,evidenceName:'v41-national-'+i});results.push({score:r.score,choices:r.choices});
      const m=await page.evaluate(async()=>(await import('/src/app/game.js')).default.nationalMatch);
      assert.ok(!m.done||m.result.champion,'national bot eliminated at '+i);
    }
    await screenshot(page,'v41-national-report');return results;
  });
  await scenario('apex-three-blades',async({page,virtual})=>{
    await page.getByRole('button',{name:'三刀巅峰',exact:true}).click({force:true});
    for(const name of ['均值150','破甲刀','综合刀'])await page.locator('.arena-team-list button').filter({hasText:name}).click({force:true});
    await page.getByRole('button',{name:'开始挑战',exact:true}).click({force:true});
    const results=[];
    for(let i=0;i<3;i++) {
      const button=page.locator('.arena-team-list button').first();await button.click({force:true});
      const r=await playRound(page,virtual,{capture:true,evidenceName:'v41-apex-'+i});results.push({score:r.score,choices:r.choices});
    }
    const m=await page.evaluate(async()=>(await import('/src/app/game.js')).default.apexMatch);
    assert.equal(m.usedBladeIds.length,3);assert.equal(new Set(m.usedBladeIds).size,3);assert.equal(m.result.rounds,3);
    await screenshot(page,'v41-apex-report');return results;
  });
  await scenario('small-screen-choice-pause-resume',async({page,virtual})=>{
    await page.getByRole('button',{name:'快速挑战',exact:true}).click({force:true});await page.getByRole('button',{name:'开始自由快赛',exact:true}).click({force:true});
    await page.clock.fastForward(40);await screenshot(page,'v41-small-320x568');
    assert.equal(await page.locator('[data-augment-id]').count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.getByRole('button',{name:'暂停',exact:true}).click({force:true});
    const at=await page.evaluate(()=>__FORGE_ARENA.run.elapsed);
    await page.clock.fastForward(1500);
    assert.equal(await page.evaluate(()=>__FORGE_ARENA.run.elapsed),at);
    await screenshot(page,'v41-small-paused');
    const resume=page.getByRole('button',{name:/继续/}).last();
    await resume.click({force:true});
    // fastForward invokes only the last RAF; after a remount its first frame
    // has delta=0. runFor actually exercises the resumed animation frames.
    assert.equal(await page.evaluate(()=>__FORGE_ARENA.run.paused),false);
    await page.clock.runFor(600);
    assert.ok(await page.evaluate(()=>__FORGE_ARENA.run.elapsed)>at);
    return {overflow:false,pauseFreezes:true};
  },{width:320,height:568});
} finally {
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
  await browser.close();if(server)await new Promise(r=>server.close(r));
}
assert.equal(report.errors.length,0,JSON.stringify(report.errors));
assert.ok(report.cases.every(c=>c.status==='PASS'),JSON.stringify(report.cases.filter(c=>c.status!=='PASS')));
