/**
 * Hand-authored contact silhouettes: six material languages, one restrained
 * ink/edge palette. Drawn in the EXISTING arena Canvas2D pass. No particle
 * engines, offscreen allocations, noise hashes, extra RAF or gameplay writes.
 *
 * Timing/weight are learned from short physical pressure->release animation,
 * NOT copied PixelFX artwork or any licensed third-party frames.
 */
export const MATERIAL_SHEAR_LIFE=175;
const blockedEvents=new Set(['blocked','deflect','avoid-hit','avoid-ignored']);
export function drawMaterialShear(ctx,b,age,x,y,angle,reduced=false){
  if(reduced||!b||age<0||age>=MATERIAL_SHEAR_LIFE||blockedEvents.has(b.event))return false;
  const type=b.type,complete=!!b.complete;
  if(!['foam','rope','wood','plastic','ice','metal'].includes(type))return false;
  const fade=Math.pow(1-age/MATERIAL_SHEAR_LIFE,1.15)*(complete?1:.67);
  const travel=(Math.min(age,MATERIAL_SHEAR_LIFE)/MATERIAL_SHEAR_LIFE)*(complete?13:5);
  ctx.save();ctx.translate(x,y);ctx.rotate(Number.isFinite(angle)?angle:0);ctx.globalAlpha=fade;
  if(type==='foam'){
    // Compression cavities and soft secondary edges, no cartoon explosion.
    ctx.fillStyle='#569E94';ctx.strokeStyle='#D0F3E7';ctx.lineWidth=1.7;
    for(const side of [-1,1]){
      ctx.beginPath();ctx.ellipse(side*(7+travel*.5),side*4,5,2.5,.28,0,Math.PI*2);
      ctx.fill();ctx.stroke();
    }
  }else if(type==='rope'){
    // Fibers curl off the cut in two opposite directions.
    ctx.strokeStyle='#936237';ctx.lineWidth=2;ctx.beginPath();
    for(const s of [-1,1]){
      ctx.moveTo(s*4,s*2);
      ctx.bezierCurveTo(s*8,s*7+travel*.4,s*19,s*1+travel*.6,s*26,s*7+travel);
    }ctx.stroke();
    ctx.strokeStyle='#ECD6AB';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(-12,-3);ctx.lineTo(10,3);ctx.stroke();
  }else if(type==='wood'){
    // Sheared grain: dark core, a chipped V, two exposed warm fibers.
    ctx.fillStyle='#805033';ctx.beginPath();ctx.moveTo(-19,-2);ctx.lineTo(-3,2.5);
    ctx.lineTo(19,2);ctx.lineTo(-2,6);ctx.closePath();ctx.fill();
    ctx.fillStyle='#E1B783';ctx.beginPath();ctx.moveTo(-20,1);
    ctx.lineTo(-8,-7-travel*.4);ctx.lineTo(-3,-1);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(3,1);ctx.lineTo(15,9+travel*.65);
    ctx.lineTo(11,0);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#F5DBAB';ctx.lineWidth=1.3;ctx.beginPath();
    ctx.moveTo(-18,-3);ctx.lineTo(18,-3);ctx.stroke();
  }else if(type==='plastic'){
    // A laminar shearing lip is more credible than orange hot sparks.
    ctx.fillStyle='#3C7688';ctx.beginPath();ctx.moveTo(-19,0);ctx.lineTo(0,4);
    ctx.lineTo(19,0);ctx.lineTo(11,6);ctx.lineTo(-12,7);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#B1E1E2';ctx.lineWidth=1.45;ctx.beginPath();
    ctx.moveTo(-18,-1);ctx.lineTo(18,-1);ctx.stroke();
    ctx.beginPath();ctx.moveTo(9,2);ctx.lineTo(14,9+travel);ctx.stroke();
  }else if(type==='ice'){
    // Two offset cold facets above a narrow opaque fracture trough.
    ctx.fillStyle='#5DBED4';ctx.strokeStyle='#DCF9FF';ctx.lineWidth=1.1;
    for(const side of [-1,1]){
      const xx=side*(11+travel),yy=side*(6+travel*.42);
      ctx.beginPath();ctx.moveTo(xx-5,yy+1);ctx.lineTo(xx,yy-12);
      ctx.lineTo(xx+7,yy+4);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.strokeStyle='#F3FDFF';ctx.beginPath();ctx.moveTo(xx,yy-12);
      ctx.lineTo(xx,yy);ctx.stroke();ctx.strokeStyle='#DCF9FF';
    }
    ctx.fillStyle='#337C9A';ctx.fillRect(-17,-1.7,34,3.4);
    ctx.fillStyle='#F0FDFF';ctx.fillRect(-14,-2.5,28,1.4);
  }else if(type==='metal'){
    // Cold deep scoring and a tiny exposed gold burr. Conserve light: no
    // giant glowing ring that destroys the real metal silhouette.
    ctx.fillStyle='#263B4A';ctx.beginPath();ctx.moveTo(-24,-1.5);
    ctx.lineTo(23,-2);ctx.lineTo(16,5);ctx.lineTo(-17,4.5);ctx.closePath();ctx.fill();
    ctx.fillStyle='#CB8653';ctx.beginPath();ctx.moveTo(-21,2);
    ctx.lineTo(19,1);ctx.lineTo(12,5);ctx.lineTo(-14,5);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#FFE6BA';ctx.lineWidth=1.35;ctx.beginPath();
    ctx.moveTo(-18,-2.5);ctx.lineTo(17,-2.5);ctx.stroke();
    ctx.fillStyle='#F3C184';ctx.beginPath();ctx.moveTo(16+travel,3);
    ctx.lineTo(21+travel,1);ctx.lineTo(19+travel,6);ctx.closePath();ctx.fill();
  }
  ctx.restore();return true;
}
