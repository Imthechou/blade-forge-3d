/**
 * Forge card artwork — a small, deterministic "doodle sticker" language.
 *
 * Every card's illustration is derived from its NAME (primary and secondary
 * motifs) and stable id (layout/accent). No images, random, textures, shaders
 * or WebGL allocations. Only SVG vector shapes; the in-game model is untouched.
 *
 * Each motif uses the same hand-drawn rounded strokes and flat 3-color palette.
 */
const NS = 'http://www.w3.org/2000/svg';
const palettes = Object.freeze([
  { paper:'#FBF6EB', field:'#FFE0C0', main:'#FF7248', pop:'#3A6DF0', ink:'#222740' },
  { paper:'#F6F4FF', field:'#DDD5FF', main:'#8462F5', pop:'#FCBA46', ink:'#2B2549' },
  { paper:'#F0FBF9', field:'#B9F0DF', main:'#20B6A2', pop:'#FF7A70', ink:'#213C48' },
  { paper:'#FFF5FA', field:'#FFD0DF', main:'#FE609C', pop:'#6F59E8', ink:'#33263D' },
  { paper:'#F5F9FF', field:'#CDE2FF', main:'#4D87F5', pop:'#FFC35C', ink:'#233550' },
  { paper:'#FBFCEB', field:'#E9F4A9', main:'#A9C735', pop:'#F67378', ink:'#303649' },
]);

// Ordered by position in a card's name; secondary matched semantics form a
// small supporting glyph. This is not an arbitrary palette swap by rarity.
const rules = Object.freeze([
  { id:'electric', re:/电|雷|闪|离子/g },
  { id:'void', re:/暗|影|玄|黑|静|夜|噬|蚀|灰|雾/g },
  { id:'echo', re:/共鸣|回响|灵|震|谐|振/g },
  { id:'star', re:/星|月|天|日|曜|辉|极光|光/g },
  { id:'frost', re:/冷|冰|寒|雪|霜|冻|零|蓝/g },
  { id:'flame', re:/热|焰|火|赤|灼|熔|炉|温/g },
  { id:'flow', re:/流|波|液|水|虹|彩|渐|染|云|幕/g },
  { id:'shard', re:/晶|玉|矿|钛|金|银|钢|铁|铜|砂|瓷|石/g },
  { id:'fracture', re:/断|裂|碎|残|破|战痕|错/g },
  { id:'weave', re:/层|叠|丝|织|纹|格|线|缠|密/g },
  { id:'mirror', re:/镜|净|面|白|亮|抛|透|偏|哑/g },
  { id:'strike', re:/锤|压|击|受力|冲|疾|速|快/g },
  { id:'edge', re:/刃|锋|刀|剑|脊|尖|刻|切|磨/g },
  { id:'grid', re:/六边|构|控|定|匀|准|轴|工|机|模块|制|衡/g },
  { id:'organic', re:/木|竹|皮|翡|琥珀|柔|兽|爪|蝶|胶|节/g },
]);
const tagFallback = Object.freeze({
  cold:'frost',heat:'flame',flow:'flow',layer:'weave',edge:'edge',
  oxide:'mirror',precision:'grid',stable:'grid',mirror:'mirror',
  void:'void',spectral:'star',resonance:'echo',impact:'strike'
});
const hash = value => {
  let h=2166136261;
  for(const ch of String(value)) { h=Math.imul(h ^ ch.codePointAt(0),16777619); }
  return h >>> 0;
};

export function doodleSpec(card) {
  const name=String(card?.name || '');
  const key=String(card?.id || '')+'|'+name;
  const seed=hash(key);
  const hits=[];
  for(const [i,r] of rules.entries()){
    r.re.lastIndex=0;
    for(const m of name.matchAll(r.re)) hits.push({id:r.id,at:m.index,length:m[0].length,i});
  }
  hits.sort((a,b)=>a.at-b.at || b.length-a.length || a.i-b.i);
  const ordered=[...new Set(hits.map(h=>h.id))];
  const fromTag=(card?.tags || []).map(t=>tagFallback[t]).find(Boolean);
  const primary=ordered[0] || fromTag || 'grid';
  const secondary=ordered.find(id=>id!==primary) || fromTag && fromTag!==primary && fromTag
    || rules[(seed>>>9)%rules.length].id;
  // Deterministic by name/id: two identical names in different stages do not
  // accidentally clone one entire sticker; all 218 card IDs stay distinct.
  const palette=palettes[(seed>>>3)%palettes.length];
  return {
    primary,secondary,seed,palette,
    tilt:(seed%23)-11,
    offset:(seed>>>15)%13-6,
    variant:(seed>>>22)%7,
    signature:primary+'-'+secondary+'-'+seed.toString(36),
  };
}

function e(parent,tag,attrs={}) {
  const node=document.createElementNS(NS,tag);
  for(const [k,v] of Object.entries(attrs)) node.setAttribute(k,String(v));
  parent.appendChild(node);
  return node;
}
const path=(g,d,props={})=>e(g,'path',{d,...props});
const stroke=(g,d,color,width=3)=>path(g,d,{fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round'});
const poly=(g,points,fill,ink,width=2.4)=>e(g,'polygon',{points,fill,stroke:ink,'stroke-width':width,'stroke-linejoin':'round'});
const dot=(g,x,y,r,fill)=>e(g,'circle',{cx:x,cy:y,r,fill});
const oval=(g,x,y,rx,ry,fill,ink,width=2.5)=>e(g,'ellipse',{cx:x,cy:y,rx,ry,fill,stroke:ink,'stroke-width':width});

/** All glyphs are drawn around (0,0), sized ~46 square, in a single visual alphabet. */
function motif(g,id,p,v) {
  const ink=p.ink,fill=p.main,pop=p.pop,field=p.field;
  switch(id) {
    case 'frost':
      poly(g,'0,-24 8,-10 23,-3 10,7 1,23 -8,9 -24,1 -10,-8',field,ink);
      stroke(g,'M0 -19 L0 19 M-19 0 L19 0 M-13 -13 L13 13 M13 -13 L-13 13',pop,3);
      dot(g,0,0,4,fill);break;
    case 'flame':
      path(g,'M-13 21 C-29 4 -8 -6 -8 -23 C2 -18 5 -9 5 -5 C13 -16 16 -18 16 -22 C28 -1 25 11 12 21 Q0 29 -13 21Z',{fill,stroke:ink,'stroke-width':3,'stroke-linejoin':'round'});
      path(g,'M-4 20 Q-12 11 -1 1 Q4 8 10 4 Q15 19 6 21Z',{fill:field});
      stroke(g,'M-18 -20 l-4 -6 M21 14 l7 4',ink,2.2);break;
    case 'flow':
      stroke(g,'M-27 -12 C-8 -29 -6 7 14 -11 Q22 -17 27 -10',ink,5.3);
      stroke(g,'M-26 3 C-10 -13 -5 21 14 1 Q22 -4 27 2',fill,5.5);
      stroke(g,'M-26 17 C-13 2 -6 31 10 16 Q18 9 27 16',pop,4.5);
      dot(g,7,-17,3.7,fill);break;
    case 'shard':
      poly(g,'-24 -5 -4 -24 21 -16 26 10 6 24 -18 16',field,ink);
      poly(g,'-4 -24 7 -4 6 24 -9 10',fill,ink,2.1);
      stroke(g,'M-24 -5 L7 -4 L21 -16 M7 -4 L26 10 M-18 16 L-9 10',ink,2);
      dot(g,20,-19,3.8,pop);break;
    case 'star':
      poly(g,'0,-27 7,-9 25,-18 16,0 27,10 8,10 1,27 -7,12 -25,17 -15,0 -25,-14 -7,-10',pop,ink,3);
      stroke(g,'M0 -12 L0 12 M-13 0 L13 0',fill,3);
      dot(g,23,21,3,ink);break;
    case 'void':
      oval(g,0,0,24,24,ink,ink,1);
      path(g,'M10 -20 Q-16 -13 -13 6 Q-11 22 11 19 Q-1 28 -16 17 Q-29 0 -16 -16 Q-3 -29 10 -20Z',{fill:field});
      poly(g,'18 -20 21 -13 28 -10 21 -7 18 0 15 -7 8 -10 15 -13',pop,ink,1.3);break;
    case 'echo':
      dot(g,0,0,8,fill);
      stroke(g,'M-11 -12 Q-24 0 -11 12 M11 -12 Q24 0 11 12',ink,4.3);
      stroke(g,'M-21 -22 Q-41 0 -21 22 M21 -22 Q41 0 21 22',pop,4.6);
      dot(g,0,0,3,field);break;
    case 'electric':
      poly(g,'3 -28 -23 3 -4 3 -12 27 23 -8 5 -8 14 -27',pop,ink,3);
      stroke(g,'M-23 -17 l-8 -4 M23 14 l9 2',fill,3);break;
    case 'fracture':
      poly(g,'-23 -19 4 -25 -5 -5 -20 1',pop,ink);
      poly(g,'11 -21 26 -3 5 3',fill,ink);
      poly(g,'-18 10 -4 2 3 24 -17 21',field,ink);
      poly(g,'10 10 27 9 20 24 6 24',fill,ink);
      stroke(g,'M-8 -27 l2 -7 M7 27 l3 6',ink,2);break;
    case 'weave':
      for(let i=-1;i<=1;i++) stroke(g,'M'+(-24+i*10)+' -24 Q'+(5+i*9)+' -6 '+(-22+i*11)+' 23',i===0?pop:ink,4.5);
      for(let j=-1;j<=1;j++) stroke(g,'M-26 '+(j*12-1)+' Q0 '+(j*12+14)+' 26 '+(j*12-1),j===0?fill:field,4.2);
      break;
    case 'mirror':
      oval(g,0,0,26,19,field,ink,3.5);
      oval(g,0,0,11,18,pop,ink,2.5);
      oval(g,0,0,4,8,fill,ink,1.8);
      stroke(g,'M-22 -24 l-4 -5 M21 22 l5 4',ink,2);break;
    case 'strike':
      poly(g,'-25 -5 -12 -11 -15 -25 -1 -14 13 -26 12 -10 27 -4 15 7 23 22 4 17 -7 27 -11 12 -27 11 -17 1',fill,ink,3);
      stroke(g,'M-4 -7 L6 7 M5 -8 L-6 7',field,3.7);break;
    case 'edge':
      path(g,'M-23 15 Q-1 -13 23 -24 Q16 3 -7 22Z',{fill:field,stroke:ink,'stroke-width':3,'stroke-linejoin':'round'});
      stroke(g,'M-15 10 Q5 -10 20 -21',pop,4.2);
      stroke(g,'M-26 -13 l-8 -4 M19 14 l8 5',fill,3);break;
    case 'grid':
      poly(g,'-20 -20 20 -20 27 18 -13 25 -26 -6',field,ink);
      for(let i=-1;i<=1;i++) stroke(g,'M'+(i*11)+' -17 L'+(i*11+4)+' 21',i===0?pop:ink,2.5);
      for(let j=-1;j<=1;j++) stroke(g,'M-20 '+(j*11)+' L23 '+(j*11-4),j===0?fill:ink,2.2);
      break;
    case 'organic':
      stroke(g,'M-20 23 Q-10 -13 18 -24',ink,4.1);
      path(g,'M-4 -7 Q-28 -32 -29 -6 Q-23 8 -4 -7Z',{fill,stroke:ink,'stroke-width':2.5});
      path(g,'M7 -16 Q29 -24 25 1 Q16 8 7 -16Z',{fill:field,stroke:ink,'stroke-width':2.5});
      path(g,'M-10 8 Q-28 1 -26 22 Q-15 25 -10 8Z',{fill:pop,stroke:ink,'stroke-width':2.5});
      break;
    default:
      oval(g,0,0,22,20,fill,ink);
  }
  // A second, restrained pen-stroke ties families together. Its position
  // varies but never obscure the main glyph.
  if(v%3===0) stroke(g,'M-25 27 Q-9 31 4 27',ink,1.7);
}

/**
 * Compose one 160×64 editorial sticker; no external graphic assets.
 * On narrow cards this remains recognisable as one bold glyph + one mini glyph.
 */
export function cardDoodle(card) {
  const s=doodleSpec(card),p=s.palette;
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 160 64');
  svg.setAttribute('preserveAspectRatio','xMidYMid slice');
  svg.setAttribute('class','dcard-doodle');
  svg.setAttribute('aria-hidden','true');
  svg.setAttribute('focusable','false');
  e(svg,'rect',{x:0,y:0,width:160,height:64,fill:p.paper});
  const brush=s.variant%2===0
    ? 'M-6 10 Q34 -13 72 10 Q95 22 167 -7 L167 31 Q115 18 80 48 Q35 74 -6 43Z'
    : 'M-5 37 Q28 2 78 11 T166 15 L166 46 Q104 63 64 47 Q23 39 -5 68Z';
  path(svg,brush,{fill:p.field,opacity:'.95'});
  // Decal backing: hand-cut capsule shape, flat screen-print look.
  const x=61+s.offset;
  const back=e(svg,'g',{transform:'translate('+x+' 33) rotate('+s.tilt+')'});
  path(back,'M-30 -17 Q-19 -31 6 -25 Q31 -23 33 -5 Q37 13 13 27 Q-14 33 -30 13 Q-37 -5 -30 -17Z',{fill:p.main,opacity:'.23'});
  const main=e(svg,'g',{transform:'translate('+x+' 32) rotate('+s.tilt+') scale(.79)'});
  motif(main,s.primary,p,s.variant);
  const mini=e(svg,'g',{transform:'translate('+(127-s.offset/2)+' '+(31+(s.variant%3-1)*3)+') rotate('+(-s.tilt*1.3)+') scale(.45)'});
  // Mini glyph has its own hue hierarchy while sharing the same motif grammar.
  motif(mini,s.secondary,{...p,main:p.pop,pop:p.main},s.variant+2);
  // Small hand-drawn noise marks: intentional and cheap, not random particles.
  const marks=e(svg,'g',{stroke:p.ink,'stroke-width':2.3,'stroke-linecap':'round',fill:'none'});
  stroke(marks,'M'+(10+s.variant)+' 16 l6 -4 M'+(18+s.variant)+' 11 l2 -6',p.ink,2);
  stroke(marks,'M143 49 l5 3 M144 55 l-2 4',p.ink,1.8);
  dot(svg,17+s.variant*2,49,2.1,p.pop);
  dot(svg,151,13+s.variant,2.7,p.main);
  return svg;
}
