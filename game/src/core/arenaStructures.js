/**
 * V4.1 formal arena: deterministic 2.5D destructible assemblies.
 * The canonical part objects are also the actual contact targets. No screen-space
 * proxy health bar or visual RNG is consulted by the scoring logic.
 */
const clamp=(n,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number.isFinite(n)?n:0));
export const STRUCTURE_VERSION='arena-structure-v1';
const make=(id,name,materials,kind='frame')=>Object.freeze({
  id,name,kind,
  // Six visible materials/positions allow horizontal, diagonal and short precision routes.
  parts:Object.freeze([
    ['a',materials[0],.26,.32,'coupling'],
    ['b',materials[1],.74,.32,'coupling'],
    ['c',materials[2],.32,.53,'support'],
    ['d',materials[3],.68,.53,'support'],
    ['e',materials[4],.38,.74,'joint'],
    ['f',materials[5],.62,.74,'joint'],
  ]),
  // Two ways to remove the load-bearing assembly. The player can bypass hard
  // face material using its exposed connectors or directly cut its main spine.
  routes:[['a','c','e'],['b','d','f']],
  joins:[['a','c'],['b','d'],['c','e'],['d','f'],['a','b'],['e','f']],
});
export const STRUCTURE_TEMPLATES=Object.freeze({
  edge:make('tension-rig','张力绳索试验台',['rope','rope','wood','plastic','rope','foam'],'tension'),
  press:make('load-bearing','木质承重框架',['wood','wood','wood','metal','plastic','wood'],'frame'),
  precise:make('protected-plate','精密复合夹具',['plastic','metal','foam','plastic','wood','rope'],'protected'),
  quench:make('crystal-cluster','冰晶连结阵',['ice','ice','ice','plastic','ice','metal'],'crystal'),
  composite:make('composite-frame','复合试刀框架',['metal','plastic','wood','wood','rope','ice'],'frame'),
  overload:make('alloy-frame','合金锁扣框架',['metal','metal','wood','plastic','metal','rope'],'alloy'),
});
export function createStructure(seed=1,styleId='composite',gradient=0) {
  const spec=STRUCTURE_TEMPLATES[styleId]||STRUCTURE_TEMPLATES.composite;
  const difficulty=clamp(Math.floor(Number(gradient)||0),0,4);
  const parts=spec.parts.map(([key,type,x,y,role],i)=>({
    id:'struct-'+key,type,key,role,x,y,slot:i%3,row:Math.floor(i/3),
    layout:'structure',alive:true,progress:0,cuts:[],lastAngle:null,
    createdAt:0,difficulty:1 + difficulty*.12,
    // Higher grades add structural connections, not hidden level scaling.
    armorLeft:0,layer:0,variation:0,weakX:0,weakY:0,
    attached:true,
  }));
  return {
    version:STRUCTURE_VERSION,seed,styleId,gradient:difficulty,
    id:spec.id,name:spec.name,kind:spec.kind,
    routes:spec.routes.map(route=>route.map(k=>'struct-'+k)),
    joins:spec.joins.map(([a,b])=>['struct-'+a,'struct-'+b]),
    completedIds:[],failedJoins:[],routeComplete:null,
    primary:0,quality:0,completed:false,score:0,
    parts,
  };
}
export function updateStructure(structure,targets) {
  if (!structure) return null;
  const byId=new Map((targets||structure.parts).map(p=>[p.id,p]));
  const completedIds=[...new Set((structure.parts||[]).filter(p=>!byId.get(p.id)?.alive || byId.get(p.id)?.progress>=1).map(p=>p.id))];
  structure.completedIds=completedIds;
  const done=new Set(completedIds);
  structure.failedJoins=structure.joins.filter(([a,b])=>done.has(a)||done.has(b));
  const routeProgress=structure.routes.map(route=>
    route.reduce((sum,id)=>sum+clamp(byId.get(id)?.progress??(done.has(id)?1:0)),0)/route.length);
  structure.primary=Math.max(0,...routeProgress);
  const best=structure.routes.findIndex(route=>route.every(id=>done.has(id)));
  if(best>=0) {
    structure.completed=true;
    structure.routeComplete=best;
  }
  // A qualifying, completed assembly earns the protection bonus; zero actions
  // cannot earn any quality points simply because uncut material remains intact.
  structure.quality=structure.completed?1:0;
  return structure;
}
export function structureScore(structure,elapsed,limit,health,maxHealth) {
  if(!structure)return 0;
  const p=clamp(structure.primary),q=clamp(structure.quality);
  const opt=Math.min(20,limit*.48);
  const t=clamp((limit-elapsed)/Math.max(1,limit-opt));
  const h=clamp(health/Math.max(1,maxHealth));
  return Math.round(700*p+200*q+p*(50*t+50*h));
}
export function structureSnapshot(structure) {
  if(!structure)return null;
  return {id:structure.id,name:structure.name,styleId:structure.styleId,
    completed:structure.completed,routeComplete:structure.routeComplete,
    primary:structure.primary,quality:structure.quality,
    completedIds:[...structure.completedIds],failedJoins:structure.failedJoins.map(x=>[...x])};
}
