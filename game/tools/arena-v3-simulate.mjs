/** Deterministic gesture population. No random success rolls or rendering shortcuts. */
import {pathToFileURL} from 'node:url';
import * as C from '../src/core/arenaChallenge.js';
export const keys=['strength','toughness','sharpness','craft','design','spirit'];
export const sampleBlade=(mean,patch={})=>({id:`mean-${mean}`,bladeName:`均值${mean}`,canEnterArena:true,traits:[],tags:{},combos:[],stats:{...Object.fromEntries(keys.map(k=>[k,mean])),...patch}});
export function materialSample(mean,type,count=400,patch={}) {
  let firstCuts=0,completed=0,totalCuts=0,totalWear=0;
  for(let sample=0;sample<count;sample++) {
    const r=C.createChallenge(sampleBlade(mean,patch),{seed:sample+1,mode:'formal',augments:false}).run,mat=C.MATERIALS[type];
    const t={id:'sample',type,x:.5,y:.5,alive:true,armorLeft:mat.armor*.6,progress:0,cuts:[],variation:.03};
    r.targets=[t];
    const d=(sample%20)/20*.06,angle=mat.angle+(((sample*37)%101)/100-.5)*1.8;
    const vx=Math.cos(angle),vy=Math.sin(angle),cx=.5-vy*d,cy=.5+vx*d;
    let cuts=0;
    while(t.alive&&!r.done&&cuts<80) {
      C.beginSwipe(r);C.swipe(r,{x:cx-vx*.2,y:cy-vy*.2},{x:cx+vx*.2,y:cy+vy*.2},{duration:.16+(sample%13)*.015});
      cuts++;r.elapsed+=.2;
    }
    if(cuts===1&&!t.alive)firstCuts++;
    if(!t.alive){completed++;totalCuts+=cuts;totalWear+=r.damage;}
  }
  return {samples:count,completed,firstCutRate:firstCuts/count,cuts:completed?+(totalCuts/completed).toFixed(2):null,wear:completed?+(totalWear/completed).toFixed(2):null};
}
export function simulateMatch(mean,{seed=1,encounter=null,styleId='composite',strategy='soft',augments=true,patch={}}={}) {
  const r=C.createChallenge(sampleBlade(mean,patch),{seed,mode:'formal',encounter,styleId,augments}).run;
  let nextAttack=0;
  while(!r.done) {
    if(r.phase==='buff-choice') {
      C.chooseAugment(r,r.offers[0]);
      continue;
    }
    if(r.elapsed>=nextAttack) {
      const targets=r.targets.filter(t=>t.alive).sort((a,b)=>(strategy==='soft'?C.MATERIALS[a.type].hard-C.MATERIALS[b.type].hard:C.MATERIALS[b.type].points-C.MATERIALS[a.type].points));
      const t=targets[0];
      if(t) {
        const a=C.MATERIALS[t.type].angle;
        C.beginSwipe(r);
        C.swipe(r,{x:t.x-Math.cos(a)*.15,y:t.y-Math.sin(a)*.15},{x:t.x+Math.cos(a)*.15,y:t.y+Math.sin(a)*.15},{duration:.18});
      }
      nextAttack=r.elapsed+.22;
    }
    C.tick(r,.05);
  }
  return r.result;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const materialMatrix=[0,30,60,100,150,200].map(mean=>({mean,materials:Object.fromEntries(Object.keys(C.MATERIALS).map(type=>[type,materialSample(mean,type)]))}));
  const matches=[30,60,100,150].flatMap(mean=>['soft','hard'].map(strategy=>({mean,strategy,...simulateMatch(mean,{seed:187,encounter:{tier:'national',round:4},strategy})})));
  console.log(JSON.stringify({version:'arena-3',samplePopulation:'400 deterministic gestures: angular offset ±0.9rad, centre error 0–.057, duration .16–.34s; neutral knife, no augments in material matrix',materialMatrix,matches},null,2));
}
