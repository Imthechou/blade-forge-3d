/**
 * 玩家工坊与永久解锁带来的【配方直选】。
 * 不删除旧卡池：所有历史可随机获得的卡牌仍可随机获得；只提升已掌握
 * 材料、主工艺、刀型的确定性选择权，且不另开强化货币。
 */
import { BY_STAGE,CARD_BY_ID } from '../data/cards.js';
export const RECIPE_STAGES=Object.freeze(['S1','S2','S4']);
const TIERS=Object.freeze([
  {level:1,rarity:'common',count:{S1:2,S2:2,S4:3}},
  {level:3,rarity:'fine',count:{S1:1,S2:1,S4:2}},
  {level:5,rarity:'rare',count:{S1:1,S2:1,S4:1}},
  {level:7,rarity:'epic',count:{S1:1,S2:1,S4:1}},
  {level:9,rarity:'legend',count:{S1:1,S2:1,S4:1}},
]);
export function guaranteedRecipes(workshopOrLevel,unlockedIds=[]) {
  const level=Math.max(1,Math.min(10,Math.floor(Number(typeof workshopOrLevel==='number'?workshopOrLevel:workshopOrLevel?.level)||1)));
  const ids=new Set();
  for(const tier of TIERS) {
    if(level<tier.level)continue;
    for(const stage of RECIPE_STAGES) {
      const selected=(BY_STAGE[stage]||[]).filter(x=>x.rarity===tier.rarity);
      for(const card of selected.slice(0,tier.count[stage]||0))ids.add(card.id);
    }
  }
  for(const id of unlockedIds||[]) {
    const card=CARD_BY_ID[id];
    if(card&&RECIPE_STAGES.includes(card.stage))ids.add(id);
  }
  return [...ids];
}
export function selectableRecipes(run) {
  if(!RECIPE_STAGES.includes(run?.stageId))return [];
  const allow=new Set(Array.isArray(run.recipeChoiceIds)?run.recipeChoiceIds:[]);
  return (BY_STAGE[run.stageId]||[]).filter(x=>allow.has(x.id));
}
/** 纯候选状态变更：确认以前不扣 CR、不加属性、不抽风险。 */
export function pinRecipeChoice(run,cardId) {
  if(!run||run.phase!=='select'||!run.flowVersion||!RECIPE_STAGES.includes(run.stageId))
    return {ok:false,reason:'当前阶段不能指定配方'};
  const card=CARD_BY_ID[cardId];
  if(!card||card.stage!==run.stageId||!run.recipeChoiceIds?.includes(card.id))
    return {ok:false,reason:'尚未掌握该材料、工艺或刀型'};
  run.candidates=[card,...(run.candidates||[]).filter(c=>c.id!==card.id)].slice(0,3);
  return {ok:true,card};
}
