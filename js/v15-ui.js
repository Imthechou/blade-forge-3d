/* V15 UI pass: single-layer forge layout + six-axis radar + compact state panel. */
(function(){
'use strict';
const labels=['锋利','强度','韧性','灵性','工艺','设计'];
const keys=['edge','strength','toughness','spirit','craft','design'];
const $=s=>document.querySelector(s);
function radarSvg(values){
 const cx=120,cy=92,r=67,max=100;
 const pts=(vals,rr)=>vals.map((v,i)=>{const a=-Math.PI/2+i*Math.PI/3;const q=Math.max(0,Math.min(max,Number(v)||0))/max*rr;return `${(cx+Math.cos(a)*q).toFixed(1)},${(cy+Math.sin(a)*q).toFixed(1)}`}).join(' ');
 const grid=[20,40,60,80,100].map(n=>`<polygon points="${pts(labels.map(()=>n),r)}"/>`).join('');
 const axes=labels.map((_,i)=>{const a=-Math.PI/2+i*Math.PI/3;return `<line x1="${cx}" y1="${cy}" x2="${(cx+Math.cos(a)*r).toFixed(1)}" y2="${(cy+Math.sin(a)*r).toFixed(1)}"/>`}).join('');
 const text=labels.map((t,i)=>{const a=-Math.PI/2+i*Math.PI/3,q=r+15,x=cx+Math.cos(a)*q,y=cy+Math.sin(a)*q,anchor=Math.abs(Math.cos(a))<.2?'middle':Math.cos(a)>0?'start':'end';return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" dominant-baseline="middle">${t}<tspan class="radar-num"> ${Math.round(values[i]||0)}</tspan></text>`}).join('');
 return `<svg class="forge-radar-svg" viewBox="0 0 240 184" aria-label="六维锻造属性"><g class="radar-grid">${grid}${axes}</g><polygon class="radar-fill" points="${pts(values,r)}"/><polygon class="radar-line" points="${pts(values,r)}"/>${text}<circle class="radar-core" cx="${cx}" cy="${cy}" r="15"/><text class="radar-total" x="${cx}" y="${cy-1}" text-anchor="middle">${Math.round(values.reduce((a,b)=>a+(Number(b)||0),0)/6)}</text><text class="radar-sub" x="${cx}" y="${cy+9}" text-anchor="middle">BUILD</text></svg>`;
}
function apply(){
 const fs=$('#forgeScreen');if(!fs||!fs.classList.contains('active'))return;
 const stats=$('.stats');if(!stats)return;
 $('.visual-state')?.remove();$('.craft-feedback')?.remove();$('.process-state')?.remove();
 fs.querySelectorAll('.skin-panel').forEach(x=>x.remove());
 let dash=fs.querySelector('.forge-dashboard');
 if(!dash){
  const vals=[...stats.querySelectorAll('.stat b')].map(x=>Number((x.textContent||'0').replace(/[^0-9.-]/g,'')));
  dash=document.createElement('div');dash.className='forge-dashboard';
  dash.innerHTML=`<div class="radar-pane">${radarSvg(vals.slice(0,6))}</div><div class="forge-state-pane"><div class="state-row"><small>当前锻造</small><b id="uiForgeStage">—</b><span id="uiForgeStageDesc">—</span></div><div class="state-row"><small>锻造特性</small><b id="uiForgeTrait">暂无</b><span id="uiForgeTraitDesc">继续锻造以发现特性</span></div><div class="state-row risk-state"><small>RISK</small><b id="uiForgeRisk">0%</b><span>当前锻造风险</span></div></div>`;
  stats.replaceWith(dash);
 } else {
  const vals=[...stats?.querySelectorAll('.stat b')||[]].map(x=>Number((x.textContent||'0').replace(/[^0-9.-]/g,'')));
  const pane=dash.querySelector('.radar-pane');if(pane&&vals.length)pane.innerHTML=radarSvg(vals.slice(0,6));
 }
 fs.querySelectorAll('.cards').forEach(c=>c.classList.add('forge-decision-cards'));
 fs.querySelectorAll('.action-row').forEach(a=>a.classList.add('forge-actions'));
 const head=$('.section-head h2'),stage=head?.textContent||'—';
 const en=[...$('.section-head')?.querySelectorAll('small')||[]].at(0)?.textContent||'当前阶段';
 const run=window.__FORGE_UI__?.appState?.run;
 const traits=run?.forgeTraits||[],defs=window.FORGE_DATA?.FORGE_TRAIT_DEFS||[],trait=traits.length?defs.find(x=>x.id===traits[traits.length-1]):null;
 const risk=Math.round(Number(run?.risk||0));
 $('#uiForgeStage')?.replaceChildren(document.createTextNode(stage));$('#uiForgeStageDesc')?.replaceChildren(document.createTextNode(en));
 $('#uiForgeTrait')?.replaceChildren(document.createTextNode(trait?.name||'暂无'));$('#uiForgeTraitDesc')?.replaceChildren(document.createTextNode(trait?.desc||'继续锻造以发现特性'));$('#uiForgeRisk')?.replaceChildren(document.createTextNode(risk+'%'));
}
const mo=new MutationObserver(()=>{clearTimeout(mo.t);mo.t=setTimeout(apply,0)});
mo.observe(document.body,{childList:true,subtree:true});
let tries=0;const timer=setInterval(()=>{apply();if(++tries>120)clearInterval(timer)},100);
})();
