/**
 * Generated WebP atlas loader for the arena.
 * 6 columns x 5 rows, 256px cells. One HTTP request, lazy decoded.
 * Rendering is completely optional: arenaStage falls back to proven Canvas art
 * if sprites cannot be loaded, and never blocks pointer input / the game timer.
 */
export const TYPES=Object.freeze(['foam','rope','wood','plastic','ice','metal']);
export const STATES=Object.freeze(['whole','top','bottom','chips','flash']);
export const CELL=256;
const url=new URL('../../assets/arena/targets.webp',import.meta.url).href;
let image=null;
let status='idle';
let error=null;
let loading=null;

export function spriteStatus() { return {status,error,url,width:image?.naturalWidth||0,height:image?.naturalHeight||0}; }
export function prepareArenaSprites() {
  if(status==='ready')return Promise.resolve(true);
  if(status==='failed')return Promise.resolve(false);
  if(loading)return loading;
  if(typeof Image==='undefined'){status='unavailable';return Promise.resolve(false);}
  status='loading';
  const candidate=new Image();
  candidate.decoding='async';
  loading=new Promise(resolve=>{
    candidate.onload=()=>{
      if(candidate.naturalWidth!==CELL*6||candidate.naturalHeight!==CELL*5) {
        status='failed';error='atlas-size-mismatch';resolve(false);return;
      }
      image=candidate;status='ready';resolve(true);
    };
    candidate.onerror=()=>{status='failed';error='asset-unavailable';resolve(false);};
    candidate.src=url;
  });
  return loading;
}
export function spriteReady() {
  if(status==='idle')void prepareArenaSprites();
  return status==='ready'&&!!image;
}
function cell(ctx,type,row,x,y,w,h) {
  if(!spriteReady())return false;
  const index=TYPES.indexOf(type);
  if(index<0 || !Number.isFinite(w) || !Number.isFinite(h))return false;
  ctx.drawImage(image,index*CELL,row*CELL,CELL,CELL,x,y,w,h);
  return true;
}
/** Whole intact prop, aligned with existing target's physical collision center. */
export function drawWholeSprite(ctx,type,x,y,bodyW,bodyH) {
  return cell(ctx,type,0,x-bodyW*.75,y-bodyH*.665,bodyW*1.5,bodyH*1.33);
}
/** One of two transparent, pre-fractured pieces, still centered on original mass. */
export function drawSplitSprite(ctx,type,side,bodyW,bodyH) {
  return cell(ctx,type,side<0?1:2,-bodyW*.75,-bodyH*.665,bodyW*1.5,bodyH*1.33);
}
/** 4 unique fragment glyphs per material, each a 128x128 atlas sub-cell. */
export function drawShardSprite(ctx,type,variant,x,y,size,rotation=0) {
  if(!spriteReady())return false;
  const index=TYPES.indexOf(type);
  if(index<0)return false;
  const sub=((variant%4)+4)%4;
  ctx.save();
  ctx.translate(x,y);ctx.rotate(rotation);
  ctx.drawImage(image,index*CELL+(sub%2)*CELL/2,3*CELL+Math.floor(sub/2)*CELL/2,
    CELL/2,CELL/2,-size/2,-size/2,size,size);
  ctx.restore();
  return true;
}
/** Material-specific generated flare: ice blue, wood chips, metal sparks, foam fragments... */
export function drawFlashSprite(ctx,type,x,y,size,alpha=1,angle=0) {
  if(!spriteReady())return false;
  ctx.save();
  ctx.globalAlpha*=Math.max(0,Math.min(1,alpha));
  ctx.translate(x,y);ctx.rotate(angle);
  const ok=cell(ctx,type,4,-size/2,-size/2,size,size);
  ctx.restore();
  return ok;
}

if(typeof window!=='undefined') {
  window.__FORGE_SPRITES={status:spriteStatus,preload:prepareArenaSprites};
}
