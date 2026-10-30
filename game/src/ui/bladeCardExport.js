/**
 * Deterministic, offline collectible-card poster.
 * Uses a captured frame of the actual PBR knife; never substitutes generic artwork.
 * Canvas is transient and never written to the save or thumbnail caches.
 */
const PALETTE = Object.freeze({
  common: ['#8d97a9','#d5dce6'], uncommon: ['#299b83','#a1e0d0'],
  rare: ['#5778c8','#b9c9fa'], epic: ['#8861bb','#d5b8f1'],
  legendary: ['#be8a42','#ffe1a0'], mythic: ['#aa526f','#ffd1dc'],
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
  // The 3D capture retains the original material, reflection and camera treatment.
  const field=ctx.createLinearGradient(110,208,936,970);field.addColorStop(0,'#eaf0f7');
  field.addColorStop(.63,'#e5e8f1');field.addColorStop(1,'#ccd5e3');
  rounded(ctx,92,197,896,811,33);ctx.fillStyle=field;ctx.fill();
  ctx.save();rounded(ctx,92,197,896,811,33);ctx.clip();
  ctx.strokeStyle='rgba(80,96,124,.12)';ctx.lineWidth=2;
  ctx.beginPath();ctx.arc(540,597,286,0,2*Math.PI);ctx.stroke();
  ctx.beginPath();ctx.arc(540,597,360,0,2*Math.PI);ctx.stroke();
  const region={x:136,y:236,w:808,h:730};
  const scale=Math.min(region.w/pic.naturalWidth,region.h/pic.naturalHeight);
  const dw=pic.naturalWidth*scale,dh=pic.naturalHeight*scale;
  ctx.drawImage(pic,region.x+(region.w-dw)/2,region.y+(region.h-dh)/2,dw,dh);
  ctx.restore();
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
