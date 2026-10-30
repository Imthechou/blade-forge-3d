/**
 * 名刀磨合：不改变成刀六维、刀皮、稀有度或原始评分。
 * 仅正式有效出战累积里程碑，每把刀锁定一个最擅长的赛事项目。
 */
import { TEST_PROJECTS, applyStatCurve } from '../data/balance.js';
import { KNIFE_PROFILES } from '../data/bladeEffects.js';
const ids=Object.keys(TEST_PROJECTS);
const count=(n)=>Number.isFinite(Number(n))?Math.max(0,Math.min(999999,Math.floor(Number(n)))):0;
export const MASTERY_LEVELS=Object.freeze([
  Object.freeze({tier:0,name:'新铸',required:0,bonus:0}),
  Object.freeze({tier:1,name:'熟刃',required:2,bonus:.02}),
  Object.freeze({tier:2,name:'名刃',required:5,bonus:.05}),
]);
export function selectBladeSpecialty(blade) {
  const stats=blade?.stats||{};
  const profile=KNIFE_PROFILES[blade?.knifeTypeId]||{};
  let best=ids[0],value=-Infinity;
  for(const id of ids) {
    const project=TEST_PROJECTS[id];
    const avg=project.stats.reduce((sum,key)=>sum+applyStatCurve(stats[key]),0)/project.stats.length;
    const factor=Number.isFinite(profile[id])?profile[id]:1;
    const strength=avg*factor;
    if(strength>value){best=id;value=strength;}
  }
  return best;
}
export function normalizeBladeMastery(raw,blade) {
  const src=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  return {
    version:1,
    qualifiedMatches:count(src.qualifiedMatches),
    specialtyProject: ids.includes(src.specialtyProject)?src.specialtyProject:selectBladeSpecialty(blade),
  };
}
export function masteryView(blade) {
  const m=normalizeBladeMastery(blade?.mastery,blade);
  const tier=m.qualifiedMatches>=5?MASTERY_LEVELS[2]:m.qualifiedMatches>=2?MASTERY_LEVELS[1]:MASTERY_LEVELS[0];
  const next=tier.tier<2?MASTERY_LEVELS[tier.tier+1].required:null;
  return {...m,tier:tier.tier,name:tier.name,bonus:tier.bonus,
    projectName:TEST_PROJECTS[m.specialtyProject].name,nextRequired:next};
}
/**
 * 使用与 V4.1 CR/XP 相同的“实际结构目标完成度”判断磨合资格。
 * 全国赛与巅峰赛有 rounds[]，不能只读取流派赛的顶层 cut 字段。
 */
export function qualifyingFormalMatch(record,tier) {
  const isV41=record?.version==='formal-v4.1'||record?.result?.version==='formal-v4.1';
  if(!isV41)return false;
  const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
  const cut=record?.result?.cut||record?.cut||record?.detail||{};
  const single=clamp(cut?.structure?.primary??record?.structure?.primary);
  if(single>=.20)return true;
  if(!['national','apex'].includes(tier))return false;
  const rounds=Array.isArray(record?.rounds)?record.rounds:Array.isArray(record?.result?.rounds)?record.result.rounds:[];
  return rounds.some(r=>{
    if(!r||typeof r!=='object')return false;
    if(r.primaryCompleted===true)return true;
    return clamp(r.primary??r.cut?.structure?.primary??r.result?.cut?.structure?.primary)>=.20;
  });
}
/** 只用于同一笔正式赛事存档事务，外层已按 matchId 完成幂等检查。 */
export function creditBladeMastery(blade) {
  const original=masteryView(blade);
  if(blade?.fractured||blade?.canEnterArena===false)return original;
  blade.mastery={
    version:1,
    qualifiedMatches:Math.min(999999,original.qualifiedMatches+1),
    specialtyProject:original.specialtyProject,
  };
  return masteryView(blade);
}
