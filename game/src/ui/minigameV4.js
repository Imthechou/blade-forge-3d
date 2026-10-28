/** Forge V4: one visible 3D stage, two distinct touch minigames. */
import { el, mount } from './dom.js';
import { bladeContourProjection } from './bladeEdgeProjection.js';
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
      el('span',{class:'forge-impact-dent','aria-hidden':'true'}),
      el('span',{class:'forge-impact-chips','aria-hidden':'true'},[el('i'),el('i'),el('i')]),
      el('span',{class:'forge-hammer-float','aria-hidden':'true'}),
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
    hit.classList.remove('is-striking');stage.classList.remove('forge-hit-stop');
    void hit.offsetWidth;hit.classList.add('is-striking');stage.classList.add('forge-hit-stop');
    clearTimeout(hit._feelTimer);hit._feelTimer=setTimeout(()=>stage.classList.remove('forge-hit-stop'),90);
    hit.querySelector('.forge-hammer-float').textContent='+'+Math.round(result.strike?.statGain||0);
    // No old WebGL fireworks: restrained local metal contact feedback instead.
    if(result.fractured||run.fractured){render();return;}
    refresh(result.strike);
  });
  refresh();
}

/**
 * S7: finger traces the actual two-sided blade outline.
 * One continuous % fit, up to three attempts. Best stroke wins;
 * spending fewer attempts gives a disclosed small multiplier.
 */
export function renderEdgeV4({body,run,stage,Game,getStage,render,toast}) {
  const question=stage.querySelector('.stage-question');
  if(question)question.textContent='沿刀身轮廓描线 · 最多三次';
  const canvas=el('canvas',{class:'edge-stage-canvas','aria-label':'沿真实刀身两侧轮廓描线'});
  stage.appendChild(canvas);
  const ctx=canvas.getContext('2d');
  const hud=el('div',{class:'edge-simple-hud',role:'status','aria-live':'polite'});
  const bar=el('div',{class:'edge-simple-rail'},[el('i')]);
  const hint=el('div',{class:'edge-simple-hint'});
  const action=el('div',{class:'edge-simple-actions'});
  const again=el('button',{class:'btn',type:'button',text:'再描一次'});
  const finish=el('button',{class:'btn btn--primary',type:'button',text:'完成开刃'});
  const skip=el('button',{class:'edge-skip',type:'button',text:'跳过'});
  action.append(again,finish,skip);body.append(hud,bar,hint,action);
  const n=48,tolerance=28;
  let path=null,active=null,previous=null,lastIndex=0,frame=0,disposed=false,dirty=true;
  let attempts=0,strokes=[],best=null,bestFit=-1,locked=false;
  let samples=new Map();
  const asArray=map=>[...map].map(([index,value])=>({index,value}));
  const score=(map,used)=>Edge.contourPreview(asArray(map),used);
  function currentBest(){
    const map=best||samples;
    return score(map,Math.max(1,attempts||1));
  }
  function sync(){
    const data=currentBest(),percentage=Math.round(data.fit*100);
    const earned=best?data.sharp:0;
    const played=attempts;
    put(hud,[
      el('div',{},[el('small',{text:'最佳贴合度'}),el('b',{text:percentage+'%'})]),
      el('div',{},[el('small',{text:'已描次数'}),el('b',{text:played+'/3'})]),
      el('div',{class:'edge-hud-result'},[el('small',{text:'预计锋利'}),el('b',{text:'+'+earned})])
    ]);
    bar.firstChild.style.width=(best?Math.round(data.fit*100):Math.round(score(samples,1).coverage*100))+'%';
    finish.disabled=attempts<1;
    again.disabled=attempts<1||attempts>=3||!locked;
    const mult=[1.12,1.06,1][Math.min(2,Math.max(0,attempts-1))];
    if(attempts===0)hint.textContent='从「起点」开始 · 贴着刀身轮廓滑动';
    else if(!locked)hint.textContent='沿轮廓继续描画';
    else hint.textContent='贴合 '+percentage+'%  ·  基础 +'+data.baseSharp
      +'  ×'+mult.toFixed(2)+'  ·  奖励 +'+data.bonus+'  =  +'+earned;
    again.textContent=attempts<3?'再描一次 ('+(3-attempts)+')':'次数已用完';
  }
  function setup(){
    const b=canvas.getBoundingClientRect();
    if(!b.width||!b.height)return;
    const dpr=Math.min(2,devicePixelRatio||1);
    canvas.width=Math.ceil(b.width*dpr);canvas.height=Math.ceil(b.height*dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    path=bladeContourProjection(getStage(),b.width,b.height);
    dirty=false;
    if(!path)hint.textContent='正在定位刀身轮廓…';
  }
  function traceLine(points,color,width,blur=0){
    if(!points.length)return;
    ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.lineJoin='round';ctx.lineCap='round';ctx.lineWidth=width;ctx.strokeStyle=color;
    ctx.shadowColor=color;ctx.shadowBlur=blur;ctx.stroke();ctx.shadowBlur=0;
  }
  function draw(){
    frame=0;if(disposed||!canvas.isConnected)return;
    if(dirty||!path)setup();
    const b=canvas.getBoundingClientRect();if(!b.width||!path)return;
    ctx.clearRect(0,0,b.width,b.height);
    traceLine(path,'rgba(67,190,228,.16)',14);
    traceLine(path,'rgba(76,200,241,.86)',2.2,5);
    // The best completed contour becomes a satin silver edge on the actual knife.
    for(const [map,color] of [[best,'rgba(242,252,255,.94)'],[samples,'#fff8ee']]){
      if(!map)continue;
      let segment=[];
      for(let i=0;i<path.length;i++){
        if(map.has(i)){segment.push(path[i]);}
        else {if(segment.length>1)traceLine(segment,color,map===best?3.5:3,5);segment=[];}
      }
      if(segment.length>1)traceLine(segment,color,3,7);
    }
    for(const [p,label] of [[path[0],'起'],[path[path.length-1],'终']]){
      ctx.beginPath();ctx.arc(p.x,p.y,9,0,Math.PI*2);ctx.fillStyle='rgba(246,252,255,.96)';ctx.fill();
      ctx.fillStyle='#36577b';ctx.font='bold 10px sans-serif';ctx.textAlign='center';
      ctx.fillText(label,p.x,p.y+3.5);
    }
  }
  function repaint(){if(!frame&&!disposed)frame=requestAnimationFrame(draw);}
  // Return the nearest segment with its path position in [0..47].
  // Bounded forward search prevents finger paths from snapping to the opposite side.
  function nearest(x,y){
    if(!path)return null;
    let nearest=null;
    const first=active===null?0:Math.max(0,lastIndex-2);
    const end=active===null?Math.min(5,n-2):Math.min(n-2,lastIndex+9);
    for(let i=first;i<=end;i++){
      const a=path[i],b=path[i+1],dx=b.x-a.x,dy=b.y-a.y;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
      const xx=a.x+dx*t,yy=a.y+dy*t,d=Math.hypot(x-xx,y-yy);
      if(!nearest||d<nearest.distance)nearest={index:Math.min(n-1,Math.round(i+t)),distance:d};
    }
    return nearest;
  }
  function sample(x,y){
    const near=nearest(x,y);if(!near)return;
    if(near.index<lastIndex-1||near.distance>tolerance*1.6)return;
    const next=Math.max(lastIndex,near.index);
    // Intermediate cells are valid only after physically traversing their segments.
    for(let i=lastIndex;i<=next;i++){
      const dist=Math.min(tolerance,near.distance);
      const val=.5 + dist/(2*tolerance);
      samples.set(i,Math.min(samples.has(i)?samples.get(i):1,val));
    }
    lastIndex=next;
  }
  function point(e){const b=canvas.getBoundingClientRect();return {x:e.clientX-b.left,y:e.clientY-b.top};}
  function moveTo(e){
    const q=point(e);
    if(previous){
      const distance=Math.hypot(q.x-previous.x,q.y-previous.y);
      const steps=Math.max(1,Math.ceil(distance/6));
      for(let i=1;i<=steps;i++){
        const t=i/steps;sample(previous.x+(q.x-previous.x)*t,previous.y+(q.y-previous.y)*t);
      }
    } else sample(q.x,q.y);
    previous=q;repaint();sync();
  }
  function finishStroke(e){
    if(active!==e.pointerId)return;
    try{if(canvas.hasPointerCapture(active))canvas.releasePointerCapture(active);}catch(_){}
    active=null;previous=null;
    if(samples.size>=3){
      attempts++;strokes.push(new Map(samples));
      const candidate=score(samples,1);
      if(candidate.eligible&&candidate.fit>bestFit){bestFit=candidate.fit;best=new Map(samples);}
      locked=true;
    } else {samples.clear();lastIndex=0;}
    sync();repaint();
  }
  canvas.addEventListener('pointerdown',e=>{
    if(disposed||active!==null||locked||attempts>=3||e.isPrimary===false)return;
    if(!path)setup();if(!path)return;
    const p=point(e);
    if(Math.hypot(p.x-path[0].x,p.y-path[0].y)>38)return;
    active=e.pointerId;lastIndex=0;previous=null;samples.clear();
    canvas.setPointerCapture(active);moveTo(e);
  });
  canvas.addEventListener('pointermove',e=>{
    if(active!==e.pointerId)return;
    // Coalesced pointer events keep precision on phones with high-frequency touch sampling.
    for(const p of (e.getCoalescedEvents?.()||[]))moveTo(p);
    moveTo(e);
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,finishStroke);
  again.addEventListener('click',()=>{
    if(attempts>=3||!locked)return;
    samples.clear();lastIndex=0;previous=null;locked=false;sync();repaint();
  });
  function commit(skipped){
    if(!skipped&&attempts<1)return;
    const data=best?asArray(best):[];
    const result=Game.submitEdge(skipped?null:data,{skipped,projected:true,attemptsUsed:Math.max(1,attempts)});
    if(!result?.ok){toast('开刃结算失败','warn');return;}
    const e=result.edge||{};
    toast('贴合 '+Math.round((e.fit||0)*100)+'% ×'+(e.multiplier||1).toFixed(2)
      +' · 锋利 +'+(e.sharp||0),e.sharp?'good':'info');
    render();
  }
  finish.addEventListener('click',()=>commit(false));skip.addEventListener('click',()=>commit(true));
  const observer=new ResizeObserver(()=>{if(active===null){dirty=true;repaint();}});observer.observe(canvas);
  const timer=setTimeout(()=>{dirty=true;repaint();},700);
  function clearPointer(){active=null;previous=null;lastIndex=0;}
  const onBlur=()=>{if(active!==null){clearPointer();samples.clear();locked=false;sync();repaint();}};
  globalThis.addEventListener('blur',onBlur);
  repaint();sync();
  return ()=>{disposed=true;observer.disconnect();clearTimeout(timer);
    globalThis.removeEventListener('blur',onBlur);if(frame)cancelAnimationFrame(frame);canvas.remove();};
}
