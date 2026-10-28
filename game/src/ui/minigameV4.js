/** Forge V4: one visible 3D stage, two distinct touch minigames. */
import { el, mount } from './dom.js';
import { bladeEdgeProjection } from './bladeEdgeProjection.js';
import { HAMMER_TIERS } from '../data/balance.js';
import * as Hammer from '../core/hammer.js';
import { breakChance } from '../core/risk.js';
import * as Edge from '../core/edge.js';
function put(parent,items){mount(parent,items);}
export function renderHammerV4({body,run,stage,Game,getStage,router,render}) {
  body.classList.add('hammer-panel');
  const question=stage.querySelector('.stage-question');
  if(question)question.textContent='自由锻打 · 越锤越强';
  const hit=el('button',{class:'hammer-stage-hit',type:'button',
    'aria-label':'自由挥锤，前十锤不会断裂'},[
      el('span',{class:'hammer-stage-cue',text:'点击挥锤'}),
      el('div',{class:'forge-hammer-burst','aria-hidden':'true'}),
      el('div',{class:'forge-hammer-float','aria-hidden':'true'}),
    ]);
  stage.appendChild(hit);
  const hud=el('div',{class:'hammer-simple-hud',role:'status','aria-live':'polite'});
  const meter=el('div',{class:'hammer-meter'});
  const next=el('div',{class:'hammer-next'});
  const caption=el('div',{class:'hammer-footer'});
  body.append(hud,meter,next,caption);
  body.parentNode.appendChild(el('div',{class:'hammer-actions'},[
    el('button',{class:'btn btn--primary btn--block',type:'button',text:'收手 · 保留强度',
      onclick:()=>{if(Game.run!==run||run.phase!=='hammer')return;Game.endHammer();render();}})
  ]));
  function refresh(strike=null){
    const h=run.hammer,scale=run.daily?.breakScale||1;
    const futureRisk=Math.min(100,run.risk.current+Hammer.nextRiskDelta(h.count));
    const chance=h.count<10?0:breakChance(futureRisk,scale);
    const nextGain=Hammer.progressOf(h.count+1);
    put(hud,[
      el('div',{class:'hammer-hud-value'},[el('small',{text:'本轮强度'}),el('b',{text:'+'+(h.statGained||0).toFixed(1)})]),
      el('div',{class:'hammer-hud-value'},[el('small',{text:'锤数'}),el('b',{text:String(h.count)})]),
      el('div',{class:'hammer-hud-value'+(run.risk.current>=60?' is-danger':'')},[el('small',{text:'Risk'}),el('b',{text:String(Math.round(run.risk.current))})]),
    ]);
    const tier=HAMMER_TIERS.at(-1).need;
    put(meter,[
      el('div',{class:'hammer-meter-top'},[
        el('b',{text:'强化 '+(h.tier?['','Ⅰ','Ⅱ','Ⅲ','Ⅳ'][h.tier]:'准备中')}),
        el('span',{text:h.count<10?'安全锤 '+(10-h.count)+' 次':run.risk.current>=75?'极限风险':'高收益锻打'})
      ]),
      el('div',{class:'hammer-meter-rail'},[el('i',{style:{width:Math.min(100,h.progress/tier*100)+'%'}})]),
    ]);
    put(next,[
      el('span',{text:'下一锤 +'+nextGain.toFixed(1)+' 强度'}),
      el('span',{class:chance>=.15?'hammer-risk-hot':'',text:'断裂 '+(chance*100).toFixed(1)+'%'})
    ]);
    caption.textContent=strike?.tierUp?'强化升级 · '+Hammer.tierName(strike.tierUp):
      h.count<10?'前十锤安全 · 自由挥锤':'越锤越强，也越危险';
    stage.classList.toggle('hammer-is-risky',run.risk.current>=60);
  }
  hit.addEventListener('click',e=>{
    if(router.currentKey()!=='forge'||Game.run!==run||run.phase!=='hammer')return;
    const result=Game.hammerStrike();
    if(!result?.ok)return;
    const box=hit.getBoundingClientRect();
    hit.style.setProperty('--hit-x',(e.detail>0?e.clientX-box.x:box.width*.5)+'px');
    hit.style.setProperty('--hit-y',(e.detail>0?e.clientY-box.y:box.height*.48)+'px');
    hit.classList.remove('is-striking');void hit.offsetWidth;hit.classList.add('is-striking');
    hit.querySelector('.forge-hammer-float').textContent='+'+(result.strike?.statGain||0).toFixed(1);
    getStage()?.effect('hammer');
    if(result.fractured||run.fractured){render();return;}
    refresh(result.strike);
  });
  refresh();
}
export function renderEdgeV4({body,run,stage,Game,getStage,render,toast}) {
  const question=stage.querySelector('.stage-question');
  if(question)question.textContent='沿刃滑动 · 锋利成形';
  const n=24;
  const canvas=el('canvas',{class:'edge-stage-canvas','aria-label':'在真实三维刀刃的发光轨迹上滑动'});
  stage.appendChild(canvas);
  const ctx=canvas.getContext('2d');
  const hud=el('div',{class:'edge-simple-hud',role:'status','aria-live':'polite'});
  const bar=el('div',{class:'edge-simple-rail'},[el('i')]);
  const hint=el('div',{class:'edge-simple-hint',text:'从刀根向刀尖划过发光刃线'});
  const actions=el('div',{class:'edge-simple-actions'});
  const retry=el('button',{class:'btn',type:'button',text:'重试'});
  const submit=el('button',{class:'btn btn--primary',type:'button',text:'完成开刃'});
  const skip=el('button',{class:'edge-skip',type:'button',text:'跳过'});
  actions.append(retry,submit,skip);
  body.append(hud,bar,hint,actions);
  let path=null,active=null,lastIndex=null,frameId=0,disposed=false,dirty=true;
  const samples=new Map();
  function grade(){
    const values=[...samples].map(([index,value])=>({index,value}));
    const ev=Edge.evaluate(new Array(n).fill(.5),Edge.normalizeSamples(values,n));
    ev.quality=Edge.projectedQuality(ev.fidelity,ev.coverage);
    return ev;
  }
  function updateHud(){
    const e=grade(),tier=Edge.tierOf(e.quality);
    put(hud,[
      el('div',{},[el('small',{text:'刃线进度'}),el('b',{text:Math.round(e.coverage*100)+'%'})]),
      el('div',{},[el('small',{text:'贴合'}),el('b',{text:Math.round(e.fidelity*100)+'%'})]),
      el('div',{class:'edge-hud-result'},[el('small',{text:'额外锋利'}),el('b',{text:'+'+tier.sharp})])
    ]);
    bar.firstChild.style.width=Math.round(e.coverage*100)+'%';
    submit.disabled=e.coverage<.60;
    hint.textContent=e.coverage>=.60?'可以完成，也可以重试':'沿发光刃线滑动 · 允许少量偏差';
  }
  function setup(){
    const b=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
    if(!b.width||!b.height)return;
    canvas.width=Math.round(b.width*dpr);canvas.height=Math.round(b.height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    path=bladeEdgeProjection(getStage(),b.width,b.height);
    if(!path){
      const x=b.width*.42,y0=b.height*.17,y1=b.height*.72;
      path=Array.from({length:n},(_,i)=>({x:x+Math.sin(i/23*Math.PI)*b.width*.045,y:y0+(y1-y0)*i/23}));
    }
    dirty=false;
  }
  function draw(){
    frameId=0;if(disposed||!canvas.isConnected)return;
    if(dirty||!path)setup();
    const b=canvas.getBoundingClientRect();if(!path||!b.width)return;
    ctx.clearRect(0,0,b.width,b.height);
    ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();path.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.strokeStyle='rgba(80,210,250,.20)';ctx.lineWidth=22;ctx.stroke();
    ctx.strokeStyle='#5cccf4';ctx.lineWidth=3;ctx.shadowBlur=13;ctx.shadowColor='#52d8ff';ctx.stroke();ctx.shadowBlur=0;
    let open=false;ctx.beginPath();
    for(let i=0;i<n;i++){
      const val=samples.get(i);if(val===undefined){open=false;continue;}
      const point=path[i],x=point.x+(val-.5)/.28*27;
      if(!open){ctx.moveTo(x,point.y);open=true;}else ctx.lineTo(x,point.y);
    }
    ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.shadowBlur=12;ctx.shadowColor='#fff';ctx.stroke();ctx.shadowBlur=0;
    for(const [point,label,color] of [[path[n-1],'起','#8ee9f8'],[path[0],'终','#b3a2ff']]){
      ctx.beginPath();ctx.arc(point.x,point.y,10,0,Math.PI*2);
      ctx.fillStyle=color;ctx.fill();ctx.fillStyle='#263354';ctx.font='bold 12px sans-serif';
      ctx.textAlign='center';ctx.fillText(label,point.x,point.y+4);
    }
  }
  function redraw(){if(!frameId&&!disposed)frameId=requestAnimationFrame(draw);}
  function record(e){
    if(!path)return;
    const b=canvas.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;
    const idx=Math.max(0,Math.min(n-1,Math.round((y-path[0].y)/Math.max(1,path[n-1].y-path[0].y)*23)));
    const v=Math.max(0,Math.min(1,.5+(x-path[idx].x)/27*.28));
    if(lastIndex!==null&&Math.abs(idx-lastIndex)>1){
      const start=lastIndex,from=samples.get(start)??v;
      for(let i=Math.min(start,idx)+1;i<Math.max(start,idx);i++)
        samples.set(i,from+(v-from)*(i-start)/(idx-start));
    }
    samples.set(idx,v);lastIndex=idx;redraw();updateHud();
  }
  canvas.addEventListener('pointerdown',e=>{
    if(active!==null||e.isPrimary===false)return;
    if(!path)setup();
    const b=canvas.getBoundingClientRect();
    if(!path?.some(p=>Math.hypot(p.x-(e.clientX-b.left),p.y-(e.clientY-b.top))<42))return;
    active=e.pointerId;lastIndex=null;canvas.setPointerCapture(active);record(e);
  });
  canvas.addEventListener('pointermove',e=>{if(active===e.pointerId)record(e);});
  const end=e=>{if(active!==e.pointerId)return;active=null;lastIndex=null;
    try{if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}catch(_){}
    updateHud();};
  for(const ev of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(ev,end);
  retry.addEventListener('click',()=>{samples.clear();lastIndex=null;redraw();updateHud();});
  function finish(skipped){
    if(!skipped&&grade().coverage<.60)return;
    const result=Game.submitEdge(skipped?null:[...samples].map(([index,value])=>({index,value})),{skipped,projected:!skipped});
    if(!result?.ok){toast('开刃未完成','warn');return;}
    toast('开刃 '+(result.edge?.tierName||'完成'),result.edge?.tier==='perfect'?'good':'info');
    render();
  }
  skip.addEventListener('click',()=>finish(true));submit.addEventListener('click',()=>finish(false));
  const obs=new ResizeObserver(()=>{dirty=true;redraw();});obs.observe(canvas);
  const late=setTimeout(()=>{dirty=true;redraw();},650);
  redraw();updateHud();
  return ()=>{disposed=true;clearTimeout(late);obs.disconnect();
    if(frameId)cancelAnimationFrame(frameId);
    if(active!==null)try{canvas.releasePointerCapture(active);}catch(_){}
    canvas.remove();
  };
}
