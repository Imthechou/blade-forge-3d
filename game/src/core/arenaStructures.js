/**
 * V4.1 authored 2.5D specimen structures.
 * Data and hit locations share a single mutable graph: there are no screen
 * overlays that fake damage or hidden branch difficulty multipliers.
 */
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:0));
export const STRUCTURE_VERSION='arena-structure-v2';
const MATERIAL_ARMOR=Object.freeze({foam:0,rope:0,wood:.16,plastic:.26,ice:.11,metal:.40});
const nodes=materials=>[
 ['a',materials[0],.27,.30,'coupling'],
 ['b',materials[1],.73,.30,'coupling'],
 ['c',materials[2],.33,.51,'support'],
 ['d',materials[3],.67,.51,'support'],
 ['e',materials[4],.38,.73,'joint'],
 ['f',materials[5],.62,.73,'joint'],
];
const make=(id,name,materials,kind='frame')=>Object.freeze({
 id,name,kind,parts:nodes(materials),
 joins:[['a','b'],['a','c'],['b','d'],['c','d'],['c','e'],['d','f'],['e','f']],
 routes:[['a','c','e'],['b','d','f']],
});
export const STRUCTURE_TEMPLATES=Object.freeze({
 edge:make('tension-rig','双向高张力绳索架',['rope','rope','foam','wood','rope','foam'],'tension'),
 press:make('load-bearing','木质复合承重架',['wood','wood','metal','wood','plastic','wood'],'frame'),
 precise:make('protected-plate','内置标牌的精切架',['plastic','metal','wood','plastic','foam','rope'],'protected'),
 quench:make('crystal-cluster','分段冰晶连结阵',['ice','ice','ice','plastic','ice','metal'],'crystal'),
 composite:make('composite-frame','多材料复合试刀架',['metal','plastic','wood','wood','rope','ice'],'frame'),
 overload:make('alloy-frame','高负载合金锁扣架',['metal','metal','wood','plastic','metal','rope'],'alloy'),
});
const id=key=>'struct-'+key;
export function createStructure(seed=1,styleId='composite',gradient=0){
 const spec=STRUCTURE_TEMPLATES[styleId]||STRUCTURE_TEMPLATES.composite;
 const tier=clamp(Math.floor(Number(gradient)||0),0,4);
 // Low rank teaches two distinct routes. High ranks preserve materials but
 // require deeper, observable connector disassembly rather than hidden HP x2.
 const parts=spec.parts.map(([key,type,x,y,role],i)=>({
   id:id(key),key,type,role,x,y,baseX:x,baseY:y,
   slot:i%3,row:Math.floor(i/3),layout:'structure',
   alive:true,progress:0,cuts:[],lastAngle:null,
   createdAt:0,difficulty:1,armorLeft:MATERIAL_ARMOR[type],
   layer:0,variation:0,weakX:0,weakY:0,attached:true,
   // Protectors are physical connectors: open them first for more efficient
   // cutting; a very strong knife can instead force the direct route.
   coveredBy:key==='c'?'a':key==='d'?'b':key==='e'?'c':key==='f'?'d':null,
 }));
 const protective=['precise','composite','overload'].includes(styleId)||tier>=2;
 if(protective)parts.push({
   id:id('p'),key:'p',type:'plastic',role:'protected',isProtected:true,
   x:.50,y:.53,baseX:.50,baseY:.53,slot:1,row:1,layout:'structure',
   alive:true,progress:0,cuts:[],lastAngle:null,createdAt:0,
   difficulty:1,armorLeft:.2,layer:0,variation:0,weakX:0,weakY:0,
 });
 const routes=spec.routes.map(path=>path.map(id));
 const joins=spec.joins.map(pair=>pair.map(id));
 return {
   version:STRUCTURE_VERSION,id:spec.id,name:spec.name,kind:spec.kind,styleId,
   seed,gradient:tier,parts,routes,joins,
   protectedId:protective?id('p'):null,
   completedIds:[],failedJoins:[],routeComplete:null,
   primary:0,quality:0,completed:false,score:0,
   partialCuts:0,perfectCuts:0,cleanCuts:0,
 };
}
export function updateStructure(structure,targets){
 if(!structure)return null;
 const parts=targets||structure.parts,byId=new Map(parts.map(t=>[t.id,t]));
 const done=new Set(parts.filter(p=>!p.alive||p.progress>=1).map(p=>p.id));
 structure.completedIds=[...done];
 structure.failedJoins=structure.joins.filter(([a,b])=>done.has(a)||done.has(b));
 const normalized=structure.routes.map(route=>route.reduce((n,key)=>
   n+clamp(byId.get(key)?.progress??(done.has(key)?1:0)),0)/route.length);
 structure.primary=Math.max(0,...normalized);
 const winning=structure.routes.findIndex(route=>route.every(k=>done.has(k)));
 if(winning>=0){structure.completed=true;structure.routeComplete=winning;}
 // Once the coupling breaks, real anchor points drift to their resting
 // position. Logic and canvas reuse those coordinates, keeping touch aligned.
 const a=done.has(id('a')),b=done.has(id('b'));
 for(const part of parts){
   if(part.isProtected)continue;
   const left=['c','e'].includes(part.key),right=['d','f'].includes(part.key);
   const offset = left && a ? -.018 : right && b ? .018 : 0;
   const drop = part.key==='e' && done.has(id('c')) ? .027 :
      part.key==='f' && done.has(id('d')) ? .027 : 0;
   part.x=part.baseX+offset;part.y=part.baseY+drop;
 }
 const damaged=parts.find(p=>p.isProtected);
 const safe=damaged?1-clamp(damaged.progress):1;
 const cuts=parts.filter(p=>!p.isProtected).flatMap(p=>p.cuts||[]);
 const quality=cuts.length?cuts.reduce((n,c)=>n+(c.quality==='PERFECT'?1:c.quality==='CLEAN'?.65:.25),0)/cuts.length:0;
 structure.partialCuts=cuts.length;
 structure.perfectCuts=cuts.filter(c=>c.quality==='PERFECT').length;
 structure.cleanCuts=cuts.filter(c=>c.quality==='CLEAN').length;
 // Technique is earned by actual contacts, not by a pristine sign at t=0.
 structure.quality=structure.completed?clamp(safe*.55+quality*.45):0;
 return structure;
}
export function structureScore(structure,elapsed,limit,health,maxHealth){
 if(!structure)return 0;
 const p=clamp(structure.primary),q=clamp(structure.quality);
 const excellent=Math.min(limit*.65,Math.max(14,18+structure.gradient*5));
 const t=clamp((limit-elapsed)/Math.max(1,limit-excellent));
 const h=clamp(health/Math.max(1,maxHealth));
 return Math.round(700*p+200*q+p*(50*t+50*h));
}
export function structureSnapshot(s){
 if(!s)return null;
 return {version:s.version,id:s.id,name:s.name,styleId:s.styleId,
   completed:s.completed,routeComplete:s.routeComplete,
   primary:s.primary,quality:s.quality,protectedId:s.protectedId,
   protectedDamage:s.parts.find(p=>p.isProtected)?.progress||0,
   perfectCuts:s.perfectCuts,partialCuts:s.partialCuts,
   completedIds:[...s.completedIds],failedJoins:s.failedJoins.map(x=>[...x])};
}
