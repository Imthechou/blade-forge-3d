/**
 * Deterministic, offline collectible-card poster.
 * Uses a captured frame of the actual PBR knife; never substitutes generic artwork.
 * Canvas is transient and never written to the save or thumbnail caches.
 */
const PALETTE = Object.freeze({
  common: ['#8d97a9','#d5dce6'], fine: ['#299b83','#a1e0d0'],
  rare: ['#5778c8','#b9c9fa'], epic: ['#8861bb','#d5b8f1'],
  legend: ['#be8a42','#ffe1a0'], mythic: ['#aa526f','#ffd1dc'],
  // Older records can carry English tier names; keep their poster identity.
  uncommon: ['#299b83','#a1e0d0'], legendary: ['#be8a42','#ffe1a0'],
});
const W=1080,H=1520;
export function collectibleFilename(model) {
  const name=String(model?.name||'名刀').replace(/[\\/:*?"<>|\x00-\x1f]/g,'').trim().slice(0,40)||'名刀';
  return `锻刀大赛-${name}-收藏卡.png`;
}
export function posterInfo(model) {
  return {
    name:String(model?.name||'未命名'),
    rarity:String(model?.rarityName||model?.rarity||'普通'),
    tone:PALETTE[model?.rarityTone]||PALETTE.common,
    quality:String(model?.qualityName||'成刀'),
    knifeType:String(model?.knifeTypeName||'名刀'),
    score:Math.max(0,Math.round(Number(model?.score)||0)),
    mastery:String(model?.mastery?.name||'新铸'),
    traits:(model?.coreTraits||[]).slice(0,3).map(t=>String(t.name||'')).filter(Boolean),
    honor:(model?.honors||[]).some(h=>h.champion)?'冠军作品':(model?.arenaWins||0)>0?`${model.arenaWins} 胜`:'',
    id:String(model?.id||'').slice(0,36),
  };
}
function rounded(ctx,x,y,w,h,r) {
  if (typeof ctx.roundRect==='function') {ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
  else {ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
}
function fitText(ctx,text,maxWidth) {
  let s=String(text),size=parseFloat(ctx.font)||48;
  while(ctx.measureText(s).width>maxWidth && size>23) {
    size-=2;ctx.font=ctx.font.replace(/\d+(?:\.\d+)?px/,size+'px');
  }
  if(ctx.measureText(s).width>maxWidth) {
    while(s.length>1&&ctx.measureText(s+'…').width>maxWidth)s=s.slice(0,-1);
    return s+'…';
  }
  return s;
}
function loadImage(url) {
  return new Promise((resolve,reject)=>{
    if(typeof url!=='string'||!url.startsWith('data:image/'))return reject(new Error('尚未生成真实刀具画面'));
    const img=new Image();img.onload=()=>img.naturalWidth?resolve(img):reject(new Error('刀具图像为空'));
    img.onerror=()=>reject(new Error('刀具图像解码失败'));img.src=url;
  });
}
/**
 * Safely locate the real knife in a transparent offscreen WebGL image.  Avoid
 * rotating or cropping images with opaque backgrounds, where that would expose
 * a visibly tilted screenshot rectangle. The source bitmap stays unmodified.
 */
function transparentKnifeBounds(img) {
  try {
    const probe=document.createElement('canvas');
    const w=192,h=Math.max(32,Math.round(img.naturalHeight*w/img.naturalWidth));
    probe.width=w;probe.height=h;
    const ctx=probe.getContext('2d',{willReadFrequently:true});
    if(!ctx)return null;
    ctx.drawImage(img,0,0,w,h);
    const data=ctx.getImageData(0,0,w,h).data;
    const alphaAt=(x,y)=>data[(y*w+x)*4+3];
    const corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]];
    if(corners.some(([x,y])=>alphaAt(x,y)>32))return null;
    let left=w,top=h,right=0,bottom=0,n=0;
    for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
      if(alphaAt(x,y)<=55)continue;
      left=Math.min(left,x);top=Math.min(top,y);
      right=Math.max(right,x);bottom=Math.max(bottom,y);n++;
    }
    if(n<12||n> w*h*.13)return null;
    const rx=img.naturalWidth/w,ry=img.naturalHeight/h;
    const pad=8;
    const x=Math.max(0,(left-pad)*rx),y=Math.max(0,(top-pad)*ry);
    const x2=Math.min(img.naturalWidth,(right+pad)*rx);
    const y2=Math.min(img.naturalHeight,(bottom+pad)*ry);
    if(x2-x<8||y2-y<8)return null;
    return {x,y,w:x2-x,h:y2-y};
  }catch(_){return null;} // old/tainted canvas: use original unrotated photograph.
}

/** Frame the actual knife diagonally when transparency allows it, without
 * touching its shader/material color. An opaque legacy capture uses the safe
 * rectangular fallback on a light exhibition background. */
function paintKnifeGallery(ctx,pic,tone) {
  const field={x:92,y:197,w:896,h:811},silhouette=transparentKnifeBounds(pic);
  const bg=ctx.createLinearGradient(112,200,950,975);
  if(silhouette){
    bg.addColorStop(0,'#293851');bg.addColorStop(.56,'#34445f');bg.addColorStop(1,'#172338');
  }else{
    bg.addColorStop(0,'#e5ecf5');bg.addColorStop(.56,'#dce4f1');bg.addColorStop(1,'#becbdb');
  }
  rounded(ctx,field.x,field.y,field.w,field.h,33);
  ctx.fillStyle=bg;ctx.fill();
  ctx.save();rounded(ctx,field.x,field.y,field.w,field.h,33);ctx.clip();
  // Museum softbox: subtle environment behind the PBR knife, not a material filter.
  if(silhouette){
    const halo=ctx.createRadialGradient(550,545,70,550,580,610);
    halo.addColorStop(0,'rgba(208,225,247,.30)');
    halo.addColorStop(.6,'rgba(143,167,203,.095)');
    halo.addColorStop(1,'rgba(143,167,203,0)');
    ctx.fillStyle=halo;ctx.fillRect(92,197,896,811);
  }
  ctx.strokeStyle=silhouette?'rgba(220,233,249,.13)':'rgba(80,96,124,.12)';
  ctx.lineWidth=2;
  for(const radius of [304,382]){
    ctx.beginPath();ctx.arc(540,597,radius,0,2*Math.PI);ctx.stroke();
  }
  ctx.save();
  if(silhouette) {
    // Sword tip: upper right. Hilt: lower left. Content-fit is based on the
    // *visible* knife pixels, not the large transparent WebGL camera viewport.
    const targetLength=770;
    const angle=27*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
    // Fit the rotated crop, including its transparent safety border. Broad
    // hooked blades otherwise lose their tips at the gallery's clip edge.
    const rotatedWidth=silhouette.w*cos+silhouette.h*sin;
    const rotatedHeight=silhouette.w*sin+silhouette.h*cos;
    const availableWidth=field.w-64;
    const availableHeight=2*Math.min(594-field.y,field.y+field.h-594)-64;
    const scale=Math.min(targetLength/silhouette.h,670/silhouette.w,
      availableWidth/rotatedWidth,availableHeight/rotatedHeight);
    ctx.translate(540,594);ctx.rotate(angle);
    const w=silhouette.w*scale,h=silhouette.h*scale;
    ctx.shadowColor='rgba(3,10,24,.34)';
    ctx.shadowBlur=20;ctx.shadowOffsetX=10;ctx.shadowOffsetY=12;
    ctx.drawImage(pic,silhouette.x,silhouette.y,silhouette.w,silhouette.h,-w/2,-h/2,w,h);
  }else{
    const area={x:136,y:236,w:808,h:730};
    const scale=Math.min(area.w/pic.naturalWidth,area.h/pic.naturalHeight);
    const w=pic.naturalWidth*scale,h=pic.naturalHeight*scale;
    ctx.drawImage(pic,area.x+(area.w-w)/2,area.y+(area.h-h)/2,w,h);
  }
  ctx.restore();ctx.restore();
  ctx.strokeStyle=silhouette?'rgba(174,194,228,.22)':'rgba(58,64,91,.10)';
  rounded(ctx,field.x,field.y,field.w,field.h,33);ctx.stroke();
  return !!silhouette;
}
export async function renderCollectiblePoster(model,dataUrl) {
  const pic=await loadImage(dataUrl),info=posterInfo(model);
  const canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('设备无法生成收藏卡');
  const bg=ctx.createLinearGradient(0,0,W,H);
  bg.addColorStop(0,'#f5f6fa');bg.addColorStop(.5,'#e6e9f2');bg.addColorStop(1,'#d6dce8');
  ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  ctx.save();ctx.strokeStyle='rgba(255,255,255,.32)';ctx.lineWidth=1;
  for(let x=-H;x<W+H;x+=27){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+H,H);ctx.stroke();}ctx.restore();
  // Premium neutral enclosure; rarity remains a narrow physical accent, not a neon background.
  rounded(ctx,55,55,970,1410,48);ctx.fillStyle='#fefefe';ctx.fill();
  ctx.strokeStyle='rgba(58,64,91,.13)';ctx.lineWidth=2;ctx.stroke();
  const stripe=ctx.createLinearGradient(90,0,990,0);
  stripe.addColorStop(0,info.tone[0]);stripe.addColorStop(1,info.tone[1]);
  rounded(ctx,86,90,908,13,6);ctx.fillStyle=stripe;ctx.fill();
  ctx.fillStyle='#566070';ctx.font='500 24px system-ui, sans-serif';ctx.textAlign='left';
  ctx.fillText('BLADE FORGE  /  PERSONAL ARCHIVE',94,154);
  ctx.font='600 25px system-ui, sans-serif';ctx.fillStyle=info.tone[0];ctx.textAlign='right';
  ctx.fillText(info.rarity,976,154);
  // Camera/lighting and steel texture are still the *original* real 3D render.
  // A transparent capture gets a stronger diagonal exhibition composition.
  const angled=paintKnifeGallery(ctx,pic,info.tone);
  canvas.dataset.artworkLayout=angled?'real-knife-diagonal':'opaque-safe-fallback';
  ctx.textAlign='left';ctx.fillStyle='#272f42';
  ctx.font='700 64px system-ui, "Microsoft YaHei", sans-serif';
  ctx.fillText(fitText(ctx,info.name,700),102,1106);
  ctx.font='400 28px system-ui, sans-serif';ctx.fillStyle='#768091';
  ctx.fillText(`${info.knifeType}  ·  ${info.quality}`,106,1155);
  ctx.font='800 65px system-ui, sans-serif';ctx.fillStyle=info.tone[0];ctx.textAlign='right';
  ctx.fillText(String(info.score),980,1103);
  ctx.font='400 22px system-ui, sans-serif';ctx.fillStyle='#788394';ctx.fillText('成刀评分',975,1138);
  ctx.strokeStyle='#e3e6ed';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(105,1196);ctx.lineTo(974,1196);ctx.stroke();
  ctx.textAlign='left';ctx.font='600 26px system-ui, sans-serif';ctx.fillStyle='#677184';
  ctx.fillText(info.honor||info.mastery,108,1250);
  ctx.font='400 24px system-ui, sans-serif';ctx.fillStyle='#333f55';
  ctx.fillText(fitText(ctx,info.traits.join('  /  ')||'专属工艺珍藏',830),108,1301);
  ctx.fillStyle='#9da4af';ctx.font='400 19px monospace';ctx.fillText(info.id?`ID  ${info.id}`:'CRAFTED COLLECTION',108,1391);
  ctx.textAlign='right';ctx.fillText('锻刀大赛  ·  个人藏刀阁',976,1391);
  return canvas;
}
export async function downloadCollectiblePoster(model,imageUrl) {
  const canvas=await renderCollectiblePoster(model,imageUrl);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG 编码失败')),'image/png'));
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=collectibleFilename(model);document.body.appendChild(link);
  try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);}
  return {ok:true,bytes:blob.size,filename:link.download};
}
