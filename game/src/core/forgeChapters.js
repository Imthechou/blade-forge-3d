/**
 * V3.4 五屏锻造协调层。只改变玩家看到的工序组织，不伪造或跳过任何卡牌、
 * 六维、标签、PBR 视觉结算或真实风险掷骰。
 * S1/S2 配方 -> S3/S4 锻打 -> S5/S6/S7 精制 -> S8/S9 装配 -> S10 鉴定。
 */
export const FORGE_FLOW_VERSION = 'five-screen-v1';
export const FORGE_CHAPTERS = Object.freeze([
  Object.freeze({id:'recipe',number:1,name:'开炉配方',subtitle:'材料 · 工艺',stages:Object.freeze(['S1','S2']),primary:'材料建立六维初值，主工艺决定后续路线',risk:'准备阶段：积累的隐患在锻打时检查'}),
  Object.freeze({id:'hammer',number:2,name:'锻打成型',subtitle:'锻纹 · 刀型 · 锤击',stages:Object.freeze(['S3','S4']),primary:'强度、工艺与刀型；每锤决定强化或收手',risk:'本屏开始执行断裂检查，继承准备期的风险'}),
  Object.freeze({id:'finish',number:3,name:'刀身精制',subtitle:'淬火 · 回火 · 开刃',stages:Object.freeze(['S5','S6','S7']),primary:'韧性、锋利、金属纹理与工艺特性',risk:'继承锻打风险，回火可修整但不归零'}),
  Object.freeze({id:'assembly',number:4,name:'刀柄装配',subtitle:'护手 · 刀柄 · 调校',stages:Object.freeze(['S8','S9']),primary:'设计、灵性、完整装配与最后一轮控险',risk:'继承精制风险，装配完成才真正成刀'}),
  Object.freeze({id:'appraisal',number:5,name:'名刀鉴定',subtitle:'揭晓 · 收藏 · 参赛',stages:Object.freeze(['S10']),primary:'六维与特性冻结，生成唯一收藏卡',risk:'只结算展示，不再断刀'}),
]);
export function isFiveScreen(run){return run?.flowVersion === FORGE_FLOW_VERSION;}
export function chapterOf(stageId){
  return FORGE_CHAPTERS.find(ch=>ch.stages.includes(stageId))||FORGE_CHAPTERS[0];
}
export function chapterState(run){
  const ch=chapterOf(run?.stageId);
  const sub=Math.max(0,ch.stages.indexOf(run?.stageId));
  return {...ch,step:sub+1,steps:ch.stages.length,done:ch.number-1};
}

/*
 * 五屏的六维分工：只对原卡片的 4 项辅助属性重新分配正收益。
 * 原卡的强度/锋利专属收益、总辅助收益、稀有度、风险、卡名、标签、材质完全不变。
 * 保留 35% 原卡自身倾向，避免同阶段各卡变成同一个数值模板。
 * 旧 S1/S2 配方仍由原卡决定属性底子；旧版/每日流程完全不调用此转换。
 */
const SIDE_STATS=['toughness','craft','design','spirit'];
const ROLE_WEIGHTS=Object.freeze({
  S3:{toughness:.20,craft:.46,design:.24,spirit:.10},
  S4:{toughness:.12,craft:.36,design:.40,spirit:.12},
  S5:{toughness:.56,craft:.25,design:.03,spirit:.16},
  S6:{toughness:.54,craft:.24,design:.02,spirit:.20},
  S7:{toughness:.26,craft:.40,design:.12,spirit:.22},
  S8:{toughness:.04,craft:.13,design:.57,spirit:.26},
  S9:{toughness:.02,craft:.18,design:.40,spirit:.40},
});
export function forgeStageStatDelta(run,card) {
  const source=card?.statDelta||{};
  if(!isFiveScreen(run)||!ROLE_WEIGHTS[run.stageId])return source;
  const positive=SIDE_STATS.reduce((sum,k)=>sum+Math.max(0,Number(source[k])||0),0);
  if(positive<=0)return source;
  const target=ROLE_WEIGHTS[run.stageId];
  const result={...source};
  let total=0;
  for(let i=0;i<SIDE_STATS.length;i++){
    const k=SIDE_STATS[i];
    const raw=Math.max(0,Number(source[k])||0)/positive;
    const value=i===SIDE_STATS.length-1
      ?Math.round((positive-total)*100)/100
      :Math.round(positive*(.35*raw+.65*target[k])*100)/100;
    result[k]=value+Math.min(0,Number(source[k])||0);
    if(i!==SIDE_STATS.length-1)total+=value;
  }
  return result;
}
