/**
 * 锻材库存 v1：材料卡仍可从原随机卡池免费出现；库存的价值是【保证指定】。
 * 基础配方无限供给，不设置付费墙；稀有锻材由真实有效比赛按稳定 ID 掉落。
 * 仅 S1 卡可入库，单种上限 9，总库存上限 60；所有收据持久化幂等。
 */
import { BY_STAGE,CARD_BY_ID } from '../data/cards.js';
const MATERIALS=BY_STAGE.S1||[];
const RARITIES=Object.freeze({fine:0,rare:1,epic:2,legend:3,mythic:4});
const MAX_PER=9,MAX_ALL=60;
const integer=n=>Number.isFinite(Number(n))?Math.max(0,Math.min(MAX_PER,Math.floor(Number(n)))):0;
const ownedId=id=>typeof id==='string'&&CARD_BY_ID[id]?.stage==='S1'&&
  Object.hasOwn(RARITIES,CARD_BY_ID[id].rarity);
export function makeMaterialsV1(){return {version:1,counts:{},receipts:{}};}
export function normalizeMaterialsV1(raw){
  const out=makeMaterialsV1();
  const counts=raw?.counts&&typeof raw.counts==='object'&&!Array.isArray(raw.counts)?raw.counts:{};
  let total=0;
  for(const [id,n] of Object.entries(counts)){
    if(!ownedId(id)||total>=MAX_ALL)continue;
    const amount=Math.min(integer(n),MAX_ALL-total);
    if(amount>0){out.counts[id]=amount;total+=amount;}
  }
  const receipts=raw?.receipts&&typeof raw.receipts==='object'&&!Array.isArray(raw.receipts)?raw.receipts:{};
  for(const [key,v] of Object.entries(receipts)){
    if(key.length<160 && typeof key==='string' && key && typeof v==='string' && ownedId(v))out.receipts[key]=v;
  }
  return out;
}
export const stockedCount=(save,id)=>ownedId(id)?integer(save?.materialsV1?.counts?.[id]):0;
const hash=key=>{
  let h=2166136261;
  for(const c of String(key)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
  return h>>>0;
};
export function materialDropFor(receipt,tier='school'){
  const pools={
    school:['fine','fine','rare'],
    national:['rare','rare','epic'],
    apex:['rare','epic','legend'],
    quick:['fine','fine','rare'],
  };
  const list=pools[tier]||pools.school;
  const hashed=hash(receipt);
  const rarity=list[hashed%list.length];
  const candidates=MATERIALS.filter(c=>c.rarity===rarity);
  return candidates.length ? candidates[Math.floor(hashed/list.length)%candidates.length] : null;
}
/** Only call on an already-verified event, within that event's save transaction. */
export function grantMaterial(save,receipt,tier='school'){
  if(!save||typeof receipt!=='string'||!receipt||receipt.length>140)
    return {ok:false,reason:'掉落事件无效'};
  save.materialsV1=normalizeMaterialsV1(save.materialsV1);
  const inv=save.materialsV1;
  if(inv.receipts[receipt])return {ok:true,duplicate:true,cardId:inv.receipts[receipt],credited:0};
  const card=materialDropFor(receipt,tier);
  if(!card)return {ok:false,reason:'材料池为空'};
  const current=stockedCount(save,card.id);
  const total=Object.values(inv.counts).reduce((a,b)=>a+b,0);
  const credited=current>=MAX_PER||total>=MAX_ALL?0:1;
  if(credited)inv.counts[card.id]=current+1;
  inv.receipts[receipt]=card.id;
  return {ok:true,cardId:card.id,name:card.name,credited};
}
/** Save-level decrement; allow only real S1 stocked material, never negative. */
export function spendMaterialInDraft(save,cardId){
  if(!ownedId(cardId)||stockedCount(save,cardId)<1)
    return {ok:false,reason:'锻材库存不足'};
  save.materialsV1=normalizeMaterialsV1(save.materialsV1);
  const now=save.materialsV1.counts[cardId];
  if(now===1)delete save.materialsV1.counts[cardId];
  else save.materialsV1.counts[cardId]=now-1;
  return {ok:true,cardId,remaining:now-1};
}
