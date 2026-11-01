/** Read-only 2.5D structure-link presentation. No gameplay target or saved
 * structure is modified; all animation is bounded, deterministic per time. */
export const LINK_STYLES=Object.freeze({
  tension:Object.freeze({body:'#A68E68',broken:'#B2A18A',highlight:'rgba(247,230,195,.68)',face:'#5C4C3C',width:.018}),
  frame:Object.freeze({body:'#967C66',broken:'#A99987',highlight:'rgba(250,225,193,.65)',face:'#5C5148',width:.025}),
  protected:Object.freeze({body:'#A7BEC7',broken:'#BCCBD1',highlight:'rgba(255,255,255,.8)',face:'#608C9D',width:.021}),
  crystal:Object.freeze({body:'#8DC3D3',broken:'#B0DEE4',highlight:'rgba(248,255,255,.91)',face:'#518EAA',width:.025}),
  alloy:Object.freeze({body:'#7D939D',broken:'#A3B3BB',highlight:'rgba(232,245,250,.67)',face:'#3E5C6A',width:.028}),
});
export function linkStyle(kind){return LINK_STYLES[kind]||LINK_STYLES.frame;}
export const joinedKey=(a,b)=>a<b?a+':'+b:b+':'+a;
const limit=x=>Math.min(1,Math.max(0,Number.isFinite(x)?x:1));
/** Returns a fraction of the rig scale; never moves a playable target. */
export function breakPosition(age,side,reduced=false){
  const p=reduced?1:limit(age/560);
  const settle=1-Math.pow(1-p,3);
  const flex=reduced?0:Math.sin(Math.PI*p)*Math.exp(-2.7*p);
  const s=side<0?-1:1;
  return {
    normal:s*(.36+.42*settle+.19*flex),
    drop:.19+.56*settle+.19*flex*(s>0?1:.4),
    tilt:s*(.14+.52*settle+.25*flex),
  };
}
/** Weak state tied to the actual in-memory structure. A previously broken
 * joint starts at its settled pose, not a spurious animation on page re-entry.
 * Once seen, breaks never reappear intact as effects expire. */
export function createBreakTracker(){
  const history=new WeakMap();
  return (structure,broken,now)=>{
    let state=history.get(structure);
    if(!state){state={seen:new Set(broken),started:new Map()};history.set(structure,state);return new Map();}
    for(const key of broken){
      if(!state.seen.has(key)){
        state.seen.add(key);state.started.set(key,Number.isFinite(now)?now:0);
      }
    }
    const ages=new Map();
    for(const [key,start] of state.started){
      const age=Math.max(0,(Number.isFinite(now)?now:start)-start);
      if(age>650){state.started.delete(key);continue;}
      ages.set(key,age);
    }
    return ages;
  };
}
