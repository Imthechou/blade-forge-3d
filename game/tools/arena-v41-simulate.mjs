/**
 * Evidence-only 25,000 seeded complete forge attempts (five strategies).
 * Does not simulate human speed; use this to compare progression probabilities,
 * economy, stages, and card distributions under deterministic, labelled policy.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createRun,confirmCard,hammerStrike,endHammer,submitEdge} from '../src/core/forge.js';
import {reroll} from '../src/core/cards.js';
import {workshopSnapshot} from '../src/core/arenaV41Growth.js';
const N=Number(process.env.FORGE_SIM_SEEDS)||5000;
const strategies=['conservative','balanced','rarity','tag-focus','extreme'];
const rarityLevel={common:0,fine:1,rare:2,epic:3,legend:4,mythic:5};
const keys=['strength','toughness','sharpness','craft','design','spirit'];
const shapePath=Array.from({length:64},(_,index)=>({index,value:.5}));
const quantile=(arr,q)=>{if(!arr.length)return null;const x=[...arr].sort((a,b)=>a-b);return Number(x[Math.floor((x.length-1)*q)].toFixed(2));};
const ci=(yes,n)=>{const p=yes/n,z=1.96,base=1+z*z/n,mid=(p+z*z/(2*n))/base,err=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/base;return {rate:+p.toFixed(4),ci95:[+(mid-err).toFixed(4),+(mid+err).toFixed(4)]};};
const result={version:'arena-v4.1-simulation-v1',type:'game-engine deterministic policies only (not human/phone)',
  assumptions:{perStrategy:N,seedBase:1,stageSelection:'one of three legal candidates at each forge stage',
    riskDraw:'actual game RNG and V4.1 interpolation',s7:'64 idealized contour points',
    hammerStrikes:{conservative:8,balanced:11,rarity:13,'tag-focus':12,extreme:19},
    workshopLevels:[1,5,10],paidBudgets:[0,3,6],
    time:'logic-loop only; not real user time'},strategies:{}};
for(const strategy of strategies){
 const stats={attempts:0,complete:0,failed:{},seeds:[],candidates:0,mythicSeen:0,rarityCandidates:{},
   rarityPicked:{},successMeans:[],successStats:Object.fromEntries(keys.map(k=>[k,[]])),
   peakRisk:[],spentCr:[],costBySuccess:[],paidRerolls:[],tagTiers:{},specialTraits:0,comboFound:0};
 for(let index=0;index<N;index++){
  const seed=index+1,level=[1,5,10][index%3],budget=[0,3,6][index%3];
  const save={workshopV41:{xp:{1:0,5:800,10:4600}[level]}};
  const run=createRun({seed,cr:10000,workshopSnapshot:workshopSnapshot(save)});
  stats.attempts++;
  const offers=()=>{stats.candidates+=run.candidates.length;for(const c of run.candidates){
    stats.rarityCandidates[c.rarity]=(stats.rarityCandidates[c.rarity]||0)+1;
    if(c.rarity==='mythic')stats.mythicSeen++;
  }};
  offers();
  let stageCount=0;
  while(!run.finished && !run.fractured && stageCount<20){
   if(run.phase==='select'){
     const stage=run.stageId;
     const canReroll=run.paidRerollsUsed<budget;
     const useFree= strategy!=='conservative' && index%4!==0;
     if(useFree&&run.rerollCountByStage[stage]===undefined){const next=reroll(run);if(next.ok)offers();}
     if(canReroll&&(['rarity','extreme'].includes(strategy)||strategy==='tag-focus')){
       const next=reroll(run);if(next.ok)offers();
     }
     const sorted=[...run.candidates];
     const tagCounts={};for(const e of run.ledger.entries||[])for(const tag of e.tags||[])tagCounts[tag]=(tagCounts[tag]||0)+1;
     const weight=card=>{
       const risk=Number(card.riskDeltaPoints)||0,rare=rarityLevel[card.rarity]||0;
       const tags=(card.tags||[]).reduce((n,t)=>n+(tagCounts[t]||0),0);
       if(strategy==='conservative')return -risk*5+rare*.35;
       if(strategy==='balanced')return rare*1.4-risk*1.5;
       if(strategy==='rarity')return rare*8-risk*.3;
       if(strategy==='tag-focus')return rare*.65-risk*.45+tags*2.5;
       return rare*5+risk*1.6;
     };
     sorted.sort((a,b)=>weight(b)-weight(a)||String(a.id).localeCompare(String(b.id)));
     const chosen=sorted[0];
     if(!chosen)break;
     stats.rarityPicked[chosen.rarity]=(stats.rarityPicked[chosen.rarity]||0)+1;
     const r=confirmCard(run,chosen);
     if(!r.ok)throw Error('unusable card at '+run.stageId+': '+r.reason);
     stageCount++;
    }else if(run.phase==='hammer'){
      const h=result.assumptions.hammerStrikes[strategy];
      for(let i=0;i<h&&!run.fractured;i++)hammerStrike(run);
      if(!run.fractured)endHammer(run);
    }else if(run.phase==='edge'){
      submitEdge(run,shapePath,{projected:true,attemptsUsed:1});
    }else break;
   }
   stats.spentCr.push(10000-run.cr);
   stats.paidRerolls.push(run.paidRerollsUsed);
   stats.peakRisk.push(run.peakRisk||0);
   if(run.fractured){
    const stage=run.fractureInfo?.stageId||run.stageId;
    stats.failed[stage]=(stats.failed[stage]||0)+1;
   }else if(run.phase==='appraise'||run.finished){
    stats.complete++;
    const mean=keys.reduce((n,k)=>n+(run.stats[k]||0),0)/keys.length;
    stats.successMeans.push(mean);
    for(const k of keys)stats.successStats[k].push(run.stats[k]||0);
    stats.costBySuccess.push(10000-run.cr);
    for(const tag of run.tagTiersCache||[]){
      const tier=tag.tier||tag.level||tag.layers||0;const bucket=String(tier);
      stats.tagTiers[bucket]=(stats.tagTiers[bucket]||0)+1;
    }
    stats.specialTraits+=(run.specialTagList||[]).length;
    stats.comboFound+=(run.comboDiscoveries||[]).length;
   }else stats.failed.incomplete=(stats.failed.incomplete||0)+1;
 }
 result.strategies[strategy]={
   ...ci(stats.complete,N),total:N,failedByStage:stats.failed,
   candidateRarityCounts:stats.rarityCandidates,selectedRarityCounts:stats.rarityPicked,
   mythicShownPerCard:ci(stats.mythicSeen,stats.candidates),
   finishedMean:{p10:quantile(stats.successMeans,.1),median:quantile(stats.successMeans,.5),p90:quantile(stats.successMeans,.9)},
   permanentStats:Object.fromEntries(keys.map(k=>[k,{p10:quantile(stats.successStats[k],.1),
     p50:quantile(stats.successStats[k],.5),p90:quantile(stats.successStats[k],.9)}])),
   peakRisk:{p50:quantile(stats.peakRisk,.5),p90:quantile(stats.peakRisk,.9)},
   rerollSpend:{p50:quantile(stats.spentCr,.5),p90:quantile(stats.spentCr,.9),
     p50PerSuccess:quantile(stats.costBySuccess,.5),paidP95:quantile(stats.paidRerolls,.95)},
   successTagTiers:stats.tagTiers,avgSpecialTags:stats.complete?stats.specialTraits/stats.complete:0,
   avgComboFound:stats.complete?stats.comboFound/stats.complete:0,
 };
 console.log(strategy+' '+stats.complete+'/'+N+' completed; p50 score-proxy '+quantile(stats.successMeans,.5));
}
const dest=path.resolve(process.env.FORGE_SIM_OUTPUT||'arena-playtest/arena-v41-forge-simulation.json');
fs.mkdirSync(path.dirname(dest),{recursive:true});
fs.writeFileSync(dest,JSON.stringify(result,null,2));
console.log('Wrote '+dest);
