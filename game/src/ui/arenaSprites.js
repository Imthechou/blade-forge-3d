/**
 * Generated WebP atlas loader for the arena.
 * 6 columns x 5 rows, 256px cells. One HTTP request, lazy decoded.
 * Rendering is completely optional: arenaStage falls back to proven Canvas art
 * if sprites cannot be loaded, and never blocks pointer input / the game timer.
 */
export const TYPES=Object.freeze(['foam','rope','wood','plastic','ice','metal']);
export const STATES=Object.freeze(['whole','top','bottom','chips','flash']);
export const CELL=256;
const url=new URL('../../assets/arena/targets.webp?v=2',import.meta.url).href;
let image=null;
let status='idle';
let error=null;
let loading=null;
const fractures=new Map();
const FRACTURE_LIMIT=12; // 12 pairs x 2 x 256^2 RGBA = at most 6 MiB.
let fractureBuilds=0;

export function spriteStatus() { return {status,error,url,width:image?.naturalWidth||0,height:image?.naturalHeight||0,
  fractures:fractures.size,fractureBuilds,fractureLimit:FRACTURE_LIMIT}; }
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
export function drawSplitSprite(ctx,type,side,bodyW,bodyH,angle=0) {
  if(!spriteReady())return false;
  const pair=fracturePair(type,angle);
  if(!pair)return cell(ctx,type,side<0?1:2,-bodyW*.75,-bodyH*.665,bodyW*1.5,bodyH*1.33);
  ctx.drawImage(pair[side<0?0:1],-bodyW*.75,-bodyH*.665,bodyW*1.5,bodyH*1.33);
  return true;
}

const CUT_FACE={foam:['#a9d5c4','#4b827e'],rope:['#e5c78c','#96713e'],
  wood:['#e9be81','#aa7541'],plastic:['#def0ed','#7eabb7'],
  ice:['#efffff','#80cfe0'],metal:['#eef5f5','#879fae']};
/**
 * Authored cut-face signatures rather than the same evenly striped white band
 * on every material. The marks are clipped to the exposed lip and calculated
 * only on a cache miss; per-frame Canvas draw cost stays unchanged.
 */
function drawMaterialCutFace(c,type,side,depth) {
  c.save();
  const top=side<0?-depth:0;
  c.beginPath();c.rect(-CELL,top,CELL*2,depth);c.clip();
  const y=u=>side*depth*u;
  c.lineCap='round';c.lineJoin='round';
  if(type==='foam') {
    // Fine open-cell pores: matte, offset rather than the metal's straight hatch.
    c.fillStyle='rgba(39,106,97,.37)';
    for(let row=0;row<2;row++)for(let x=-118;x<120;x+=13) {
      const jitter=((x*7+row*19)%9)/9;
      c.beginPath();c.ellipse(x+(row?6:0),y(.23+row*.48),1.4+jitter*1.2,1.1+jitter*.8,.2,0,Math.PI*2);c.fill();
    }
    c.strokeStyle='rgba(245,255,244,.55)';c.lineWidth=1.8;
    c.beginPath();c.moveTo(-CELL,y(.1));c.lineTo(CELL,y(.1));c.stroke();
  } else if(type==='rope') {
    // Loosened bundled fibres, with several dark axial twists.
    for(let x=-122;x<124;x+=8){
      c.strokeStyle=x%3===0?'rgba(111,75,38,.6)':'rgba(255,241,194,.75)';
      c.lineWidth=x%3===0?1.8:1.1;
      c.beginPath();c.moveTo(x,y(.06));c.lineTo(x+3.8,y(.9));c.stroke();
    }
    c.strokeStyle='rgba(105,73,39,.5)';c.lineWidth=1.7;
    for(const h of [.29,.74]){c.beginPath();c.moveTo(-CELL,y(h));c.lineTo(CELL,y(h+.05));c.stroke();}
  } else if(type==='wood') {
    // Growth rings are wavy long fibres, not straight evenly-spaced ribs.
    for(let row=0;row<4;row++){
      c.strokeStyle=row%2?'rgba(125,73,39,.55)':'rgba(255,225,168,.64)';
      c.lineWidth=row%2?1.35:1.8;c.beginPath();
      for(let x=-CELL;x<=CELL;x+=7){
        const yy=y(.16+row*.20+.055*Math.sin(x*.058+row*1.45));
        if(x===-CELL)c.moveTo(x,yy);else c.lineTo(x,yy);
      }c.stroke();
    }
    c.strokeStyle='rgba(90,53,32,.38)';c.lineWidth=1;
    for(let x=-115;x<=110;x+=28){c.beginPath();c.moveTo(x,y(.08));c.lineTo(x+5,y(.92));c.stroke();}
  } else if(type==='plastic') {
    // Semi-translucent laminated polymer layers with molded cross ribs.
    for(let row=0;row<3;row++){
      c.strokeStyle=row===1?'rgba(60,115,135,.55)':'rgba(255,255,255,.8)';
      c.lineWidth=row===1?2.3:1.5;c.beginPath();
      c.moveTo(-CELL,y(.18+row*.30));c.lineTo(CELL,y(.18+row*.30));c.stroke();
    }
    c.strokeStyle='rgba(86,147,157,.42)';c.lineWidth=1.5;
    for(let x=-116;x<120;x+=18){c.beginPath();c.moveTo(x,y(.18));c.lineTo(x+4,y(.83));c.stroke();}
  } else if(type==='ice') {
    // A fractured crystalline face: irregular planar facets, not sparkle.
    for(let x=-122,i=0;x<123;x+=23,i++){
      c.fillStyle=i%2?'rgba(218,253,255,.62)':'rgba(83,168,199,.23)';
      c.beginPath();c.moveTo(x,y(.08));c.lineTo(x+23,y(i%2?.18:.5));
      c.lineTo(x+8,y(.94));c.closePath();c.fill();
      c.strokeStyle='rgba(246,255,255,.66)';c.lineWidth=1.2;
      c.beginPath();c.moveTo(x+23,y(i%2?.18:.5));c.lineTo(x+8,y(.94));c.stroke();
    }
  } else if(type==='metal') {
    // Thin machined bevel plus directional brushing; no fantasy sparks.
    c.fillStyle='rgba(56,81,100,.23)';c.fillRect(-CELL,y(.53),CELL*2,depth*.32);
    c.strokeStyle='rgba(255,255,255,.92)';c.lineWidth=2.2;
    c.beginPath();c.moveTo(-CELL,y(.1));c.lineTo(CELL,y(.1));c.stroke();
    c.strokeStyle='rgba(55,85,103,.52)';c.lineWidth=.8;
    for(let x=-118;x<120;x+=8){c.beginPath();c.moveTo(x,y(.43));c.lineTo(x+6,y(.93));c.stroke();}
  }
  c.restore();
}
function fracturePair(type,angle) {
  const index=TYPES.indexOf(type);if(index<0)return null;
  const turn=Math.PI/90;
  const bucket=Math.round((((Number(angle)||0)%(Math.PI*2))+Math.PI*2)%(Math.PI*2)/turn);
  const key=type+':'+bucket;
  if(fractures.has(key)){
    const hit=fractures.get(key);fractures.delete(key);fractures.set(key,hit);return hit;
  }
  const a=bucket*turn;
  const pair=[];
  for(const side of [-1,1]){
    const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(CELL,CELL)
      :typeof document!=='undefined'?Object.assign(document.createElement('canvas'),{width:CELL,height:CELL}):null;
    const c=canvas?.getContext('2d');if(!c)return null;
    c.translate(CELL/2,CELL/2);c.rotate(a);
    c.beginPath();c.moveTo(-CELL,0);c.lineTo(CELL,0);
    c.lineTo(CELL,CELL*side);c.lineTo(-CELL,CELL*side);c.closePath();c.clip();
    c.rotate(-a);
    c.drawImage(image,index*CELL,0,CELL,CELL,-CELL/2,-CELL/2,CELL,CELL);
    // Source-atop keeps every exposed face inside the prop's alpha silhouette.
    c.globalCompositeOperation='source-atop';c.rotate(a);
    const depth=type==='rope'?13:type==='wood'?11:type==='metal'?7:9;
    const colors=CUT_FACE[type]||CUT_FACE.wood;
    const g=c.createLinearGradient(0,0,0,depth*side);
    g.addColorStop(0,colors[0]);g.addColorStop(.30,colors[0]);g.addColorStop(1,colors[1]);
    c.fillStyle=g;c.fillRect(-CELL,side<0?-depth:0,CELL*2,depth);
    drawMaterialCutFace(c,type,side,depth);
    pair.push(canvas);
  }
  fractureBuilds++;fractures.set(key,pair);
  while(fractures.size>FRACTURE_LIMIT)fractures.delete(fractures.keys().next().value);
  return pair;
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
