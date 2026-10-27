import { MATERIALS } from '../core/arenaChallenge.js';

const TAU = Math.PI * 2;
const TRAIL_LIFE = 260;
const LABEL_LIFE = 860;
const BURST_LIFE = 560;
const DEBRIS_LIFE = 720;
const MAX_COUNTS = { trail: 64, hitLabels: 14, bursts: 20, debris: 12 };
const MATERIAL_NAMES = {
  rope: '绳束', foam: '泡棉', wood: '木桩', plastic: '塑板', ice: '冰块', metal: '金属',
};
const QUALITY_NAMES = { PERFECT: '完美', CLEAN: '利落', ANGLE: '弹刃', MISS: '未命中' };
const backdropCaches = new WeakMap();
const COLORS = {
  rope: ['#d8ad64', '#83bdc0', '#c68a91', '#81a98f', '#a894bd'],
  foam: ['#7bc4a9', '#d49a86', '#82b5d0', '#d4c175', '#aa99c7'],
  wood: '#b98150', plastic: '#c6d5d9', ice: '#8bd9e9', metal: '#b8c6cc',
};
/** 材料 → 断口截面主色（碎块内侧那一条） */
const CORE_COLORS = {
  rope: 'rgba(238,214,168,.92)', foam: 'rgba(246,250,244,.85)', wood: 'rgba(238,205,150,.92)',
  plastic: 'rgba(232,245,248,.85)', ice: 'rgba(228,252,255,.95)', metal: 'rgba(255,236,196,.95)',
};

/**
 * Draws the arena only. It reads run/effects and never changes them or invokes gameplay.
 * All target/effect positions are normalized; target centers stay exactly at (t.x*w,t.y*h).
 *
 * 2026-10-23 视觉重做（只改绘制，不改判定）：
 *   · 场景：墙面拉丝面板 + 顶部聚光锥 + 三道夹具导轨 + 台沿 + 暗角；
 *           靶具被清空后夹座不消失，整排空槽给"下一波倒计时"，不再是纯黑等待；
 *   · 切割：靶具真的断成两半（沿刀口法线分离、自旋下落、断口亮边）；
 *           未断时给"深缝 + 单侧高温边 + 两端碎屑"的刀口，而不是一根亮线；
 *           刀光改成三层锥形缎带；命中点有闪光与火花；硬靶轻微震屏；
 *   · 文字：得分贴命中点上方、未命中贴边缩小，两者分道不再互相压住；连斩有居中脉冲。
 */
export function drawArenaStage(ctx, run, w, h, effects = {}) {
  if (!ctx || !run || !(w > 0) || !(h > 0)) return;
  const now = Number.isFinite(effects.now) ? effects.now : 0;
  const reduced = !!effects.reducedMotion;
  const trail = effects.trail || EMPTY;
  const labels = effects.hitLabels || EMPTY;
  const bursts = effects.bursts || EMPTY;
  const debris = effects.debris || EMPTY;

  pruneInPlace(trail, now, TRAIL_LIFE, MAX_COUNTS.trail);
  pruneInPlace(labels, now, LABEL_LIFE, MAX_COUNTS.hitLabels);
  pruneInPlace(bursts, now, BURST_LIFE, MAX_COUNTS.bursts);
  pruneInPlace(debris, now, DEBRIS_LIFE, MAX_COUNTS.debris);

  drawBackdrop(ctx, w, h, (run.targets || []).some((t) => t && t.layout === 'stream'));
  drawGuideHeader(ctx, run.guide, w, h);

  const targets = run.targets || EMPTY;
  const shake = reduced ? null : shakeOffset(bursts, now);
  ctx.save();
  if (shake && (shake.x || shake.y)) ctx.translate(shake.x, shake.y);

  drawRoute(ctx, run, targets, w, h);
  drawEmptySlots(ctx, run, targets, now, w, h, reduced);
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t || !t.alive) continue;
    const d = MATERIALS[t.type];
    if (!d) continue;
    drawTarget(ctx, t, d, i, t.x * w, t.y * h, w, h, isGuideTarget(run.guide, t), now);
  }

  drawDebris(ctx, debris, now, w, h);
  drawTrail(ctx, trail, now, w, h, reduced);
  drawBursts(ctx, bursts, now, w, h, reduced);
  drawComboBanner(ctx, run, w, h, reduced);
  drawLabels(ctx, labels, now, w, h, reduced);
  if (effects.pointer) drawPointer(ctx, effects.pointer, w, h, reduced);
  ctx.restore();

  drawVignette(ctx, w, h);
}

const EMPTY = Object.freeze([]);

function pruneInPlace(list, now, life, limit) {
  if (!Array.isArray(list) || Object.isFrozen(list)) return;
  let write = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (item && Number.isFinite(item.at) && now - item.at <= life && now >= item.at - 100) {
      list[write++] = item;
    }
  }
  list.splice(write);
  if (list.length > limit) list.splice(0, list.length - limit);
}

/* ══ 场景 ═══════════════════════════════════════════════ */

function drawBackdrop(ctx, w, h, stream = false) {
  let cache = backdropCaches.get(ctx);
  if (typeof OffscreenCanvas === 'function' && typeof ctx.drawImage === 'function') {
    if (!cache || cache.w !== w || cache.h !== h || cache.stream !== stream) {
      const canvas = new OffscreenCanvas(Math.ceil(w), Math.ceil(h));
      const back = canvas.getContext('2d');
      if (back) { paintBackdrop(back, w, h, stream); cache = { w, h, stream, canvas }; backdropCaches.set(ctx, cache); }
    }
    if (cache) { ctx.drawImage(cache.canvas, 0, 0, w, h); drawWorkLight(ctx, w, h); return; }
  }
  paintBackdrop(ctx, w, h, stream);
  drawWorkLight(ctx, w, h);
}

/** 缓存层：墙、拉丝、夹具导轨、台沿。每帧只画一次 drawImage。 */
function paintBackdrop(ctx, w, h, stream = false) {
  /* 钢釉浅色底：与 app 的纸面同一套（白 → 冷灰），不再是深色测试舱 */
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#FFFFFF');
  bg.addColorStop(.42, '#F7FAFC');
  bg.addColorStop(.78, '#EEF3F7');
  bg.addColorStop(1, '#E3EBF1');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  /* 台面 = 一张白色样卡：1px 冷灰描边 + 冷调投影，和 app 里的 .card 同语言 */
  const panelX = w * .035, panelY = h * .02, panelW = w * .93, panelH = h * .9;
  ctx.save();
  ctx.shadowColor = 'rgba(23,52,75,.10)';
  ctx.shadowBlur = Math.max(10, w * .035);
  ctx.shadowOffsetY = Math.max(2, h * .004);
  ctx.fillStyle = '#FFFFFF';
  roundedRect(ctx, panelX, panelY, panelW, panelH, w * .035); ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, panelX, panelY, panelW, panelH, w * .035); ctx.clip();
  // 竖向拉丝：极淡的冷灰线，给白面一点织理
  ctx.strokeStyle = 'rgba(23,52,75,.028)';
  ctx.lineWidth = 1;
  for (let x = panelX; x < panelX + panelW; x += Math.max(5, w * .013)) {
    ctx.beginPath(); ctx.moveTo(x, panelY); ctx.lineTo(x, panelY + panelH); ctx.stroke();
  }
  const sheen = ctx.createLinearGradient(0, panelY, 0, panelY + panelH * .52);
  sheen.addColorStop(0, 'rgba(255,255,255,.95)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(panelX, panelY, panelW, panelH * .52);
  ctx.restore();

  ctx.strokeStyle = 'rgba(23,52,75,.12)';
  ctx.lineWidth = 1;
  roundedRect(ctx, panelX, panelY, panelW, panelH, w * .035); ctx.stroke();

  const rivet = Math.max(2, w * .005);
  ctx.fillStyle = 'rgba(23,52,75,.13)';
  for (const [rx, ry] of [[panelX + w * .022, panelY + w * .022], [panelX + panelW - w * .022, panelY + w * .022],
    [panelX + w * .022, panelY + panelH - w * .022], [panelX + panelW - w * .022, panelY + panelH - w * .022]]) {
    ctx.beginPath(); ctx.arc(rx, ry, rivet, 0, TAU); ctx.fill();
  }

  // 夹具导轨：画在每一排**夹座**的高度上，否则靶具像浮在桌面上
  const unit = stream ? Math.min(w * .16, h * .16, 62) : Math.min(w * .19, h * .21, 82);
  const bodyH = Math.min(unit * 1.55, h * (stream ? .145 : .21));
  const rows = stream ? [0.34, 0.52, 0.70] : [0.52, 0.42, 0.62];
  const gap = Math.max(10, unit * .24);
  for (let i = 0; i < rows.length; i++) {
    const y = rows[i] * h - bodyH * .5 - gap;
    const rail = ctx.createLinearGradient(0, 0, w, 0);
    rail.addColorStop(0, 'rgba(23,52,75,0)');
    rail.addColorStop(.14, 'rgba(23,52,75,.14)');
    rail.addColorStop(.86, 'rgba(23,52,75,.14)');
    rail.addColorStop(1, 'rgba(23,52,75,0)');
    ctx.fillStyle = rail;
    ctx.fillRect(w * .04, y, w * .92, Math.max(1, h * .0016));
    ctx.fillStyle = 'rgba(23,52,75,.06)';
    ctx.fillRect(w * .04, y + Math.max(1, h * .0016), w * .92, Math.max(1, h * .0022));
  }

  // 台沿：最下方一条实体，落地感靠它
  const benchY = h * .885;
  const bench = ctx.createLinearGradient(0, benchY, 0, h);
  bench.addColorStop(0, '#FBFDFE');
  bench.addColorStop(.35, '#E9F0F5');
  bench.addColorStop(1, '#D8E3EB');
  ctx.fillStyle = bench;
  ctx.fillRect(0, benchY, w, h - benchY);
  ctx.strokeStyle = 'rgba(23,52,75,.13)';
  ctx.lineWidth = Math.max(1, h * .0018);
  ctx.beginPath(); ctx.moveTo(0, benchY); ctx.lineTo(w, benchY); ctx.stroke();
  ctx.strokeStyle = 'rgba(23,52,75,.05)';
  ctx.beginPath(); ctx.moveTo(0, benchY + Math.max(2, h * .004)); ctx.lineTo(w, benchY + Math.max(2, h * .004)); ctx.stroke();
}

/** 非缓存层：顶部柔光 + 工作区光池。浅色下不要锥形光柱，会像脏污。 */
function drawWorkLight(ctx, w, h) {
  const pool = ctx.createRadialGradient(w * .5, h * .12, 0, w * .5, h * .12, w * .78);
  pool.addColorStop(0, 'rgba(255,255,255,.85)');
  pool.addColorStop(.42, 'rgba(255,255,255,.32)');
  pool.addColorStop(1, 'rgba(210,228,240,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, w, h * .72);

  // 极轻的青调，避免整块白面发死
  const cool = ctx.createRadialGradient(w * .5, h * .58, 0, w * .5, h * .58, w * .9);
  cool.addColorStop(0, 'rgba(34,122,135,.030)');
  cool.addColorStop(1, 'rgba(34,122,135,0)');
  ctx.fillStyle = cool;
  ctx.fillRect(0, h * .2, w, h * .8);
}

function drawVignette(ctx, w, h) {
  const v = ctx.createRadialGradient(w * .5, h * .46, Math.min(w, h) * .34, w * .5, h * .46, Math.max(w, h) * .74);
  v.addColorStop(0, 'rgba(23,52,75,0)');
  v.addColorStop(.78, 'rgba(23,52,75,.035)');
  v.addColorStop(1, 'rgba(23,52,75,.10)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/* ══ 引导与路线 ═════════════════════════════════════════ */

function drawGuideHeader(ctx, guide, w, h) {
  if (!guide || guide.done || !guide.title) return;
  const size = clamp(w * .038, 12, 16);
  const text = String(guide.title).length > 22 ? `${String(guide.title).slice(0, 21)}…` : guide.title;
  ctx.save();
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = Math.min(w * .84, ctx.measureText(text).width + 30);
  const x = w * .5, y = h * .105;
  ctx.fillStyle = 'rgba(34,122,135,.10)';
  roundedRect(ctx, x - width / 2, y - size * .95, width, size * 1.9, size); ctx.fill();
  ctx.strokeStyle = 'rgba(34,122,135,.30)'; ctx.lineWidth = 1;
  roundedRect(ctx, x - width / 2, y - size * .95, width, size * 1.9, size); ctx.stroke();
  ctx.fillStyle = '#195B65';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawRoute(ctx, run, targets, w, h) {
  if (!run.guide?.minGestureKills || run.guide.done || run.elapsed > 5) return;
  ctx.save(); ctx.strokeStyle = 'rgba(150,220,213,.25)'; ctx.lineWidth = 1; ctx.setLineDash([3, 7]);
  ctx.beginPath(); targets.filter((t) => t.alive).forEach((t, i) => { if (i) ctx.lineTo(t.x * w, t.y * h); else ctx.moveTo(t.x * w, t.y * h); }); ctx.stroke(); ctx.restore();
}

function isGuideTarget(guide, t) {
  if (!guide || guide.done) return false;
  if (guide.slots?.includes(t.slot) || guide.types?.includes(t.type)) return true;
  return !!((guide.minCombo || guide.minGestureKills) && t.alive);
}

/* ══ 靶具 ═══════════════════════════════════════════════ */

function targetMetrics(w, h, stream = false) {
  // 连续投放是三排并存，单件要小一点、行距才能拉开，否则上下两排的标题会互相压住
  const unit = stream ? Math.min(w * .16, h * .16, 62) : Math.min(w * .19, h * .21, 82);
  return { unit, half: unit * .5, bodyW: unit * .94, bodyH: Math.min(unit * 1.55, h * (stream ? .145 : .21)) };
}

function drawTarget(ctx, t, data, index, x, y, w, h, guided, now) {
  const { unit, half, bodyW, bodyH } = targetMetrics(w, h, t.layout === 'stream');
  const bodyTop = y - bodyH * .49;
  const progress = clamp(Number(t.progress) || 0, 0, 1);

  ctx.save();
  // 吊挂的靶具悬在半空，画"接触阴影"会变成一团灰斑；只在旧的三靶制（立在台面上）保留
  if (t.layout !== 'stream') {
    ctx.save();
    ctx.shadowColor = 'rgba(23,52,75,.16)';
    ctx.shadowBlur = Math.max(6, unit * .12);
    ctx.fillStyle = 'rgba(23,52,75,.10)';
    ctx.beginPath(); ctx.ellipse(x, y + bodyH * .6, bodyW * .62, unit * .085, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  if (guided) {
    const pulse = .5 + .5 * Math.sin(now * .004 + index);
    ctx.strokeStyle = `rgba(34,122,135,${.20 + pulse * .22})`; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(x, y, half * 1.12, bodyH * .70, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(34,122,135,.045)';
    ctx.beginPath(); ctx.ellipse(x, y, half * 1.06, bodyH * .65, 0, 0, TAU); ctx.fill();
  }

  drawHanger(ctx, x, bodyTop, unit);

  ctx.strokeStyle = 'rgba(144,190,204,.30)'; ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(x + side * bodyW * .58, bodyTop + bodyH * .2);
    ctx.lineTo(x + side * bodyW * .74, bodyTop + bodyH * .2);
    ctx.stroke();
  }

  drawMaterial(ctx, t, data, x, y, bodyW, bodyH, bodyTop, unit);
  if (t.type === 'rope' || t.type === 'foam') drawBundleTies(ctx, x, y, bodyW, bodyH, unit);
  drawKerf(ctx, t, x, y, bodyW, bodyH, bodyTop, unit, progress);

  const railW = bodyW * .88, railY = bodyTop - Math.max(9, unit * .15), railH = Math.max(3, unit * .05);
  ctx.fillStyle = 'rgba(225,239,241,.16)'; roundedRect(ctx, x - railW / 2, railY, railW, railH, railH / 2); ctx.fill();
  if (progress > 0) {
    ctx.fillStyle = progress >= 1 ? '#9de4d9' : '#e5c888';
    roundedRect(ctx, x - railW / 2, railY, railW * progress, railH, railH / 2); ctx.fill();
  }

  drawTargetCaption(ctx, t, data, index, x, y, unit, guided, w, bodyH, progress);
  ctx.restore();
}

/** 吊挂：一根细线从横杆垂下来，末端一个挂环扣住材料。没有夹座，靠"挂着"解释支撑。 */
function hangGap(unit) { return Math.max(10, unit * .24); }

function drawHanger(ctx, x, topY, unit) {
  const gap = hangGap(unit);
  const anchorY = topY - gap;
  ctx.save();
  ctx.strokeStyle = 'rgba(23,52,75,.26)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, anchorY); ctx.lineTo(x, topY - 2); ctx.stroke();
  // 挂环
  ctx.strokeStyle = 'rgba(23,52,75,.34)';
  ctx.lineWidth = Math.max(1, unit * .022);
  ctx.beginPath(); ctx.arc(x, topY - 1, Math.max(2, unit * .055), 0, TAU); ctx.stroke();
  // 横杆上的锚点
  ctx.fillStyle = 'rgba(23,52,75,.30)';
  ctx.beginPath(); ctx.arc(x, anchorY, Math.max(1.6, unit * .03), 0, TAU); ctx.fill();
  ctx.restore();
}

/** 空槽用的：只有垂线与空环 */
function drawEmptyHanger(ctx, x, topY, unit) {
  const gap = hangGap(unit);
  ctx.save();
  ctx.strokeStyle = 'rgba(23,52,75,.14)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(x, topY - gap); ctx.lineTo(x, topY - 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(23,52,75,.18)';
  ctx.beginPath(); ctx.arc(x, topY - 1, Math.max(2, unit * .05), 0, TAU); ctx.stroke();
  ctx.restore();
}

/** 旧夹具（保留给其它布局调用，当前靶具已改为吊挂）。 */
function drawClamp(ctx, x, baseY, unit) {
  const clampW = unit * 1.0, clampH = Math.max(7, unit * .155);
  const g = ctx.createLinearGradient(x - clampW * .5, 0, x + clampW * .5, 0);
  g.addColorStop(0, '#B9C8D2'); g.addColorStop(.42, '#E6EEF3'); g.addColorStop(.62, '#F2F7FA'); g.addColorStop(1, '#B4C4CF');
  ctx.fillStyle = g;
  roundedRect(ctx, x - clampW * .5, baseY, clampW, clampH, clampH * .35); ctx.fill();
  ctx.strokeStyle = 'rgba(23,52,75,.18)'; ctx.lineWidth = 1;
  roundedRect(ctx, x - clampW * .5, baseY, clampW, clampH, clampH * .35); ctx.stroke();
  ctx.fillStyle = 'rgba(34,122,135,.70)';
  ctx.fillRect(x - clampW * .5 + 4, baseY + clampH * .32, 2, clampH * .36);
  ctx.fillRect(x + clampW * .5 - 6, baseY + clampH * .32, 2, clampH * .36);
  ctx.fillStyle = 'rgba(23,52,75,.22)';
  ctx.fillRect(x - clampW * .12, baseY + clampH * .18, clampW * .24, clampH * .64);
}

/**
 * 空槽：夹座常驻；整排清空时再给残影框 + 下一波倒计时。
 * 之前靶具一断画面就是纯黑等待，看不出"在等下一波"。
 */
function drawEmptySlots(ctx, run, targets, now, w, h, reduced) {
  if (!targets.length || run.done) return;
  const dead = targets.filter((t) => t && !t.alive);
  if (!dead.length) return;
  const allDead = dead.length === targets.length;
  const { unit, bodyH } = targetMetrics(w, h, targets.some((t) => t.layout === 'stream'));
  const wait = Math.max(0, (Number(run.nextWaveAt) || 0) - (Number(run.elapsed) || 0));
  const span = Math.max(.8, (Number(run.nextWaveAt) || 0) - (Number(run.lastKillAt) || 0));
  const p = clamp(1 - wait / span, 0, 1);
  for (const t of dead) {
    const x = t.x * w, y = t.y * h;
    drawEmptyHanger(ctx, x, y - bodyH * .5, unit);
    if (!allDead) continue;
    const stream = t.layout === 'stream';
    const focus = stream ? t.slot === 1 : t.slot === 1;   // 只在中间工位报倒计时，三个数字一起跳太吵
    ctx.save();
    // 连续投放的架子本身就说明了"空位"，再画虚线框会像工程图；只在旧的三靶制里保留
    if (!stream) {
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = focus ? 'rgba(23,52,75,.14)' : 'rgba(23,52,75,.06)';
      ctx.lineWidth = 1;
      roundedRect(ctx, x - unit * .46, y - bodyH * .5, unit * .92, bodyH, unit * .1); ctx.stroke();
    }
    if (focus && !reduced) {
      const size = Math.max(11, unit * .22);
      const breathe = .5 + .5 * Math.sin(now * .006);
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(34,122,135,${.34 + p * .42 + breathe * .12})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, unit * .22, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(.02, p)); ctx.stroke();
      ctx.fillStyle = '#17344B';
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(wait > .05 ? wait.toFixed(1) : '…', x, y + 1);
      ctx.font = `600 ${Math.max(9, size * .44)}px system-ui, sans-serif`;
      ctx.fillStyle = '#526879';
      ctx.fillText('下一波', x, y + unit * .36);
    }
    ctx.restore();
  }
}

function drawMaterial(ctx, t, data, x, y, width, height, top, unit) {
  const r = width * .5;
  const type = t.type;
  if (type === 'rope') {
    const colors = COLORS.rope;
    const strandW = width * .205;   // 股与股贴紧，才像"一捆"而不是五根铅笔
    for (let k = 0; k < 5; k++) {
      const sx = x - width * .43 + k * width * .215;
      const sh = height * (.88 - (k % 2) * .06);
      const sy = y - sh * .5 + (k % 2) * height * .035;
      ctx.save(); roundedRect(ctx, sx - strandW * .5, sy, strandW, sh, strandW * .48); ctx.clip();
      const g = ctx.createLinearGradient(sx - strandW / 2, 0, sx + strandW / 2, 0);
      g.addColorStop(0, shade(colors[k], -.27)); g.addColorStop(.42, colors[k]); g.addColorStop(.56, '#f0e5c6'); g.addColorStop(.68, colors[k]); g.addColorStop(1, shade(colors[k], -.4));
      ctx.fillStyle = g; ctx.fillRect(sx - strandW, sy, strandW * 2, sh);
      ctx.strokeStyle = 'rgba(26,43,52,.50)'; ctx.lineWidth = Math.max(.7, unit * .015);
      for (let yy = sy - strandW; yy < sy + sh; yy += strandW * .78) {
        ctx.beginPath(); ctx.moveTo(sx - strandW * .7, yy); ctx.lineTo(sx + strandW * .7, yy + strandW * .9); ctx.stroke();
      }
      ctx.restore();
    }
  } else if (type === 'foam') {
    const colors = COLORS.foam;
    for (let k = 0; k < 4; k++) {
      const tubeW = width * .205;
      const sx = x - width * .31 + k * width * .205;
      const sy = top + height * .11;
      const sh = height * .79;
      ctx.save(); roundedRect(ctx, sx - tubeW / 2, sy, tubeW, sh, tubeW / 2); ctx.clip();
      const g = ctx.createLinearGradient(sx - tubeW / 2, 0, sx + tubeW / 2, 0);
      g.addColorStop(0, shade(colors[k], -.30)); g.addColorStop(.32, colors[k]); g.addColorStop(.65, shade(colors[k], .15)); g.addColorStop(1, shade(colors[k], -.36));
      ctx.fillStyle = g; ctx.fillRect(sx - tubeW, sy, tubeW * 2, sh);
      ctx.strokeStyle = 'rgba(245,255,249,.34)'; ctx.lineWidth = Math.max(1, unit * .018);
      ctx.beginPath(); ctx.moveTo(sx - tubeW * .17, sy + tubeW * .35); ctx.lineTo(sx - tubeW * .17, sy + sh - tubeW * .4); ctx.stroke();
      ctx.restore();
    }
  } else {
    const isWood = type === 'wood', isIce = type === 'ice', isMetal = type === 'metal', isPlastic = type === 'plastic';
    ctx.save();
    roundedRect(ctx, x - r, top, width, height, isMetal ? 2 : width * .08); ctx.clip();
    const baseColor = isWood ? COLORS.wood : isIce ? COLORS.ice : isMetal ? COLORS.metal : COLORS.plastic;
    const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
    g.addColorStop(0, shade(baseColor, -.40)); g.addColorStop(.22, baseColor); g.addColorStop(.52, shade(baseColor, .18)); g.addColorStop(.78, baseColor); g.addColorStop(1, shade(baseColor, -.38));
    ctx.fillStyle = g; ctx.fillRect(x - r, top, width, height);
    if (isWood) drawWoodGrain(ctx, x, y, width, height, unit);
    else if (isPlastic) drawPlasticTexture(ctx, x, y, width, height, unit);
    else if (isIce) drawIceFaces(ctx, x, y, width, height, unit);
    else drawMetalLayers(ctx, x, y, width, height, unit, t.layer);
    ctx.restore();
    ctx.strokeStyle = isIce ? 'rgba(223,252,255,.76)' : 'rgba(237,248,250,.44)';
    ctx.lineWidth = Math.max(1, unit * .018);
    roundedRect(ctx, x - r, top, width, height, isMetal ? 2 : width * .08); ctx.stroke();
  }
}

/** 捆扎带：两道深色绳 + 结。绳束/泡棉靠它读作"一捆"。 */
function drawBundleTies(ctx, x, y, width, height, unit) {
  const bandW = Math.max(1.3, height * .030);
  for (const fy of [-.27, .27]) {
    const by = y + height * fy;
    ctx.strokeStyle = 'rgba(64,46,26,.60)';
    ctx.lineWidth = bandW;
    ctx.beginPath(); ctx.moveTo(x - width * .47, by); ctx.lineTo(x + width * .47, by); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,244,214,.22)';
    ctx.lineWidth = Math.max(.8, bandW * .35);
    ctx.beginPath(); ctx.moveTo(x - width * .45, by - bandW * .28); ctx.lineTo(x + width * .40, by - bandW * .28); ctx.stroke();
    // 结
    ctx.fillStyle = 'rgba(64,46,26,.66)';
    ctx.beginPath(); ctx.arc(x + width * .12, by, Math.max(1.6, bandW * .8), 0, TAU); ctx.fill();
  }
}

function drawWoodGrain(ctx, x, y, width, height, unit) {
  ctx.strokeStyle = 'rgba(70,40,22,.39)'; ctx.lineWidth = Math.max(.7, unit * .014);
  for (let i = 0; i < 6; i++) {
    const gx = x - width * .42 + i * width * .165;
    ctx.beginPath(); ctx.moveTo(gx, y - height * .52);
    ctx.bezierCurveTo(gx + width * .14, y - height * .23, gx - width * .1, y + height * .2, gx + width * .02, y + height * .52); ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(x + width * .08, y + height * .04, width * .09, height * .12, -.1, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,166,.20)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - width * .35, y - height * .38); ctx.lineTo(x + width * .3, y - height * .38); ctx.stroke();
}

function drawPlasticTexture(ctx, x, y, width, height, unit) {
  ctx.fillStyle = 'rgba(38,71,86,.18)';
  const step = Math.max(4, unit * .09);
  for (let ix = -2; ix <= 2; ix++) for (let iy = -3; iy <= 3; iy++) ctx.fillRect(x + ix * step, y + iy * step, Math.max(1, unit * .014), Math.max(1, unit * .014));
  ctx.strokeStyle = 'rgba(248,255,255,.22)'; ctx.lineWidth = Math.max(1, unit * .018);
  ctx.beginPath(); ctx.moveTo(x - width * .35, y - height * .31); ctx.lineTo(x + width * .35, y - height * .31); ctx.stroke();
}

function drawIceFaces(ctx, x, y, width, height, unit) {
  ctx.fillStyle = 'rgba(224,252,255,.20)';
  ctx.beginPath(); ctx.moveTo(x - width * .43, y - height * .38); ctx.lineTo(x + width * .36, y - height * .31); ctx.lineTo(x - width * .13, y + height * .42); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(240,255,255,.15)';
  ctx.beginPath(); ctx.moveTo(x + width * .37, y - height * .30); ctx.lineTo(x + width * .43, y + height * .3); ctx.lineTo(x + width * .05, y + height * .49); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(238,255,255,.75)'; ctx.lineWidth = Math.max(1, unit * .02);
  ctx.beginPath(); ctx.moveTo(x + width * .18, y - height * .48); ctx.lineTo(x - width * .04, y - height * .07); ctx.lineTo(x + width * .12, y + height * .16); ctx.lineTo(x - width * .27, y + height * .49);
  ctx.moveTo(x - width * .04, y - height * .07); ctx.lineTo(x - width * .43, y - height * .20); ctx.stroke();
}

function drawMetalLayers(ctx, x, y, width, height, unit, layer) {
  const bands = 4;
  for (let i = 0; i < bands; i++) {
    const yy = y - height * .43 + i * height * .28;
    ctx.fillStyle = i % 2 ? 'rgba(28,50,64,.13)' : 'rgba(238,248,251,.12)';
    ctx.fillRect(x - width * .48, yy, width * .96, height * .20);
    ctx.strokeStyle = i === (layer ? 1 : 0) ? 'rgba(255,224,154,.66)' : 'rgba(240,250,255,.27)';
    ctx.lineWidth = i === (layer ? 1 : 0) ? Math.max(1.4, unit * .026) : Math.max(.7, unit * .012);
    ctx.beginPath(); ctx.moveTo(x - width * .44, yy + height * .20); ctx.lineTo(x + width * .44, yy + height * .20); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(239,249,251,.24)'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const yy = y - height * .4 + i * height * .2;
    ctx.beginPath(); ctx.moveTo(x - width * .43, yy); ctx.lineTo(x + width * .43, yy - height * .12); ctx.stroke();
  }
}

/**
 * 刀口：深缝 + 单侧高温边 + 两端碎屑。
 * 缝宽随进度增长；只有最新一刀带高温色，旧刀口冷却成暗缝 —— 一眼能看出"这一刀切到哪"。
 */
function drawKerf(ctx, t, x, y, width, height, top, unit, progress) {
  const cuts = t.cuts;
  if (!cuts?.length || !(progress > 0)) return;
  const count = Math.min(cuts.length, 3);
  ctx.save();
  ctx.lineCap = 'butt';
  roundedRect(ctx, x - width * .5, top, width, height, width * .06); ctx.clip();
  for (let i = cuts.length - count; i < cuts.length; i++) {
    const cut = cuts[i];
    const age = cuts.length - 1 - i;
    const angle = Number.isFinite(cut.angle) ? cut.angle : 0;
    const yoff = Number.isFinite(cut.y) ? clamp(cut.y * (height * 1.3), -height * .42, height * .42) : 0;
    // 刀口长度跟着材质轮廓走：泡棉只跨 4 根管，绳束跨 5 股，板类铺满整块。
    const spanRatio = t.type === 'foam' ? .60 : t.type === 'rope' ? .86 : .96;
    const len = width * spanRatio * (.94 + clamp(cut.progress || progress, 0, 1) * .06);
    const dx = Math.cos(angle) * len * .5;
    const dy = Math.sin(angle) * len * .5;
    const cy = y + yoff;
    const hot = age === 0;
    const gap = Math.max(1.4, unit * (hot ? .038 + progress * .04 : .026));
    // 先压一条更宽的暗影，再画深缝 —— 只有"缝有厚度"才像切进去，而不是画了条线。
    ctx.strokeStyle = 'rgba(6,12,18,.20)';
    ctx.lineWidth = gap * 1.5;
    ctx.beginPath(); ctx.moveTo(x - dx, cy - dy); ctx.lineTo(x + dx, cy + dy); ctx.stroke();
    ctx.strokeStyle = hot ? 'rgba(8,13,17,.95)' : 'rgba(14,21,27,.66)';
    ctx.lineWidth = hot ? gap * 1.25 : gap;
    ctx.beginPath(); ctx.moveTo(x - dx, cy - dy); ctx.lineTo(x + dx, cy + dy); ctx.stroke();
    if (hot) {
      // 只留"上唇"一条暖光：宽白边会把缝盖掉，看起来就像贴了根白条。
      const lip = t.type === 'ice' ? 'rgba(214,250,255,.62)' : 'rgba(255,232,186,.6)';
      ctx.strokeStyle = lip;
      ctx.lineWidth = Math.max(1, gap * .3);
      ctx.beginPath();
      ctx.moveTo(x - dx * .98, cy - dy * .98 - gap * .62);
      ctx.lineTo(x + dx * .98, cy + dy * .98 - gap * .62);
      ctx.stroke();
      ctx.fillStyle = CORE_COLORS[t.type] || 'rgba(240,240,230,.8)';
      ctx.globalAlpha = .55;
      for (const s of [-1, 1]) {
        const px = x + dx * s, py = cy + dy * s;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + gap * 1.1, py - gap * .6);
        ctx.lineTo(px + gap * .4, py + gap * .9);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  /* 楔口：切口中心被"切进去"的深度 = 进度。没有百分比文字，靠它读进度。 */
  const lastDir = Number.isFinite(t.lastAngle) ? t.lastAngle : 0;
  const dx0 = Math.cos(lastDir), dy0 = Math.sin(lastDir);
  const nx0 = -dy0, ny0 = dx0;
  const inSign = ny0 >= 0 ? 1 : -1;
  const notchW = width * .22;
  const notchD = unit * (.06 + progress * .26);
  const cy0 = y + (Number.isFinite(cuts[cuts.length - 1].y) ? clamp(cuts[cuts.length - 1].y * (height * 1.3), -height * .42, height * .42) : 0);
  ctx.save();
  const ng = ctx.createLinearGradient(x, cy0, x, cy0 + notchD * inSign);
  ng.addColorStop(0, 'rgba(10,16,20,.92)');
  ng.addColorStop(.65, 'rgba(10,16,20,.55)');
  ng.addColorStop(1, 'rgba(10,16,20,.05)');
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.moveTo(x - notchW * .5, cy0 - 1.2 * inSign);
  ctx.lineTo(x + notchW * .5, cy0 - 1.2 * inSign);
  ctx.lineTo(x, cy0 + notchD * inSign);
  ctx.closePath(); ctx.fill();
  // 两条亮边，说明"切开了"
  ctx.strokeStyle = CORE_COLORS[t.type] || 'rgba(240,240,230,.8)';
  ctx.lineWidth = Math.max(.9, unit * .016);
  ctx.beginPath();
  ctx.moveTo(x - notchW * .5, cy0 - 1.2 * inSign);
  ctx.lineTo(x, cy0 + notchD * inSign);
  ctx.lineTo(x + notchW * .5, cy0 - 1.2 * inSign);
  ctx.stroke();
  ctx.restore();

  // 材质化损伤：冰裂纹 / 木刺
  if (t.type === 'ice' && progress > .2) {
    ctx.strokeStyle = 'rgba(214,250,255,.72)';
    ctx.lineWidth = 1;
    for (const [sx, sy, ex, ey] of [[-.1, .1, -.34, .30], [.12, .08, .36, .26], [0, .16, .04, .44]]) {
      ctx.beginPath();
      ctx.moveTo(x + width * sx, cy0 + notchD * inSign * Math.abs(sy) * 2);
      ctx.lineTo(x + width * ex, cy0 + notchD * inSign * Math.abs(ey) * 2);
      ctx.stroke();
    }
  }
  if (t.type === 'wood' && progress > .15) {
    ctx.fillStyle = 'rgba(120,86,44,.55)';
    for (const s of [-1, 1]) {
      const px = x + s * notchW * .5;
      ctx.beginPath();
      ctx.moveTo(px, cy0);
      ctx.lineTo(px + s * unit * .10, cy0 - unit * .05);
      ctx.lineTo(px + s * unit * .05, cy0 + unit * .06);
      ctx.closePath(); ctx.fill();
    }
  }

  if (t.type === 'metal' && t.layer) {
    ctx.strokeStyle = 'rgba(255,222,150,.85)'; ctx.lineWidth = Math.max(1.5, unit * .026);
    ctx.beginPath(); ctx.moveTo(x - width * .43, y + height * .13); ctx.lineTo(x + width * .43, y + height * .13); ctx.stroke();
  }
  ctx.restore();
}

function drawTargetCaption(ctx, t, data, index, x, y, unit, guided, w, bodyH, progress) {
  const size = clamp(w * .032, 10, 13);
  const titleY = y + bodyH * .58 + 12;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `650 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = guided ? '#227A87' : '#17344B';
  ctx.fillText(MATERIAL_NAMES[t.type] || data.short || '材料', x, titleY);
  if (guided) {
    const tagY = y - bodyH * .5 - 28;
    ctx.font = `700 ${Math.max(9, size * .7)}px system-ui, sans-serif`;
    ctx.fillStyle = '#227A87';
    ctx.fillText('优先', x, tagY);
  }
  // 序号只在旧的三靶制里保留；连续投放里是噪声
  if (t.layout !== 'stream') {
    ctx.font = `500 ${Math.max(8, size * .68)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(82,104,121,.40)';
    ctx.fillText(String(index + 1).padStart(2, '0'), x, titleY + size * .92);
  }
}

function directionHint(angle) {
  if (!Number.isFinite(angle)) return '→';
  const dirs = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  return dirs[Math.round((((angle % TAU) + TAU) % TAU) / (TAU / 8)) % 8];
}

/* ══ 断块 ═══════════════════════════════════════════════ */

/**
 * 靶具被切断后的两半：沿刀口法线分离、各自带一点自旋与下落，断口面给一条亮边。
 * 数据由 arena.js 在 hit.complete 时推入（{x,y,type,angle,at}）。
 *
 * 断块要"像原来那个东西"：绳束给 5 股、泡棉给 4 管、板/冰/金属给整块，
 * 否则一刀下去变成两张绿卡片，比不断还怪。
 */
function drawDebris(ctx, debris, now, w, h) {
  if (!debris.length) return;
  const { unit, bodyW, bodyH } = targetMetrics(w, h);
  for (let i = 0; i < debris.length; i++) {
    const d = debris[i];
    const age = now - d.at;
    if (age < 0 || age > DEBRIS_LIFE) continue;
    const p = age / DEBRIS_LIFE;
    const alpha = 1 - Math.pow(p, 2.6);
    const angle = Number.isFinite(d.angle) ? d.angle : 0;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const nx = -dy, ny = dx;
    const cx = d.x * w, cy = d.y * h;
    const sep = (4 + p * unit * .34) * (1 - p * .25);
    const fall = p * p * bodyH * .5;
    const spin = p * .3;
    const core = CORE_COLORS[d.type] || 'rgba(240,240,230,.8)';
    const BIG = Math.max(bodyW, bodyH) * 1.4;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const side of [-1, 1]) {
      ctx.save();
      // 吊挂靶具：法线朝上的那一半还挂在线上（小幅摆动），另一半掉下去
      const hanging = ny * side < 0;
      if (hanging) {
        const sway = Math.sin(p * 7) * unit * .05 * (1 - p);
        ctx.translate(cx + nx * sep * side * .22 + sway, cy + ny * sep * side * .22 + p * bodyH * .06);
        ctx.rotate(spin * side * .22 + sway / Math.max(24, bodyH));
      } else {
        ctx.translate(cx + nx * sep * side, cy + ny * sep * side + fall);
        ctx.rotate(spin * side);
      }
      ctx.beginPath();
      ctx.moveTo(-dx * BIG, -dy * BIG);
      ctx.lineTo(dx * BIG, dy * BIG);
      ctx.lineTo(dx * BIG + nx * BIG * side, dy * BIG + ny * BIG * side);
      ctx.lineTo(-dx * BIG + nx * BIG * side, -dy * BIG + ny * BIG * side);
      ctx.closePath();
      ctx.clip();
      drawDebrisBody(ctx, d.type, bodyW, bodyH, unit);
      // 断口：沿切口那条线给一条暖白高光，碎块才有"刚被切开"的味道。
      ctx.strokeStyle = core;
      ctx.lineWidth = Math.max(1.2, unit * .026);
      ctx.beginPath();
      ctx.moveTo(-dx * bodyH * .55, -dy * bodyH * .55);
      ctx.lineTo(dx * bodyH * .55, dy * bodyH * .55);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}

/** 断块本体（以自身中心为原点）：按材质保留最后的可辨识轮廓。 */
function drawDebrisBody(ctx, type, width, height, unit) {
  const halfH = height * .5;
  if (type === 'rope' || type === 'foam') {
    const n = type === 'rope' ? 5 : 4;
    const colors = COLORS[type];
    const barW = width * (type === 'rope' ? .135 : .17);
    const span = type === 'rope' ? width * .86 : width * .62;
    const step = n > 1 ? (span - barW) / (n - 1) : 0;
    const inset = type === 'foam' ? height * .105 : 0;
    for (let k = 0; k < n; k++) {
      const bx = -span / 2 + barW * .5 + k * step;
      const g = ctx.createLinearGradient(bx - barW * .5, 0, bx + barW * .5, 0);
      g.addColorStop(0, shade(colors[k], -.32));
      g.addColorStop(.42, colors[k]);
      g.addColorStop(.62, shade(colors[k], .14));
      g.addColorStop(1, shade(colors[k], -.38));
      ctx.fillStyle = g;
      roundedRect(ctx, bx - barW * .5, -halfH + inset, barW, height - inset * 2, barW * .45);
      ctx.fill();
    }
    return;
  }
  const baseColor = type === 'wood' ? COLORS.wood : type === 'ice' ? COLORS.ice : type === 'metal' ? COLORS.metal : COLORS.plastic;
  const g = ctx.createLinearGradient(-width * .5, 0, width * .5, 0);
  g.addColorStop(0, shade(baseColor, -.36));
  g.addColorStop(.5, shade(baseColor, .1));
  g.addColorStop(1, shade(baseColor, -.3));
  ctx.fillStyle = g;
  roundedRect(ctx, -width * .5, -halfH, width, height, type === 'metal' ? 2 : width * .07);
  ctx.fill();
  ctx.strokeStyle = 'rgba(240,250,255,.22)';
  ctx.lineWidth = Math.max(.8, unit * .012);
  roundedRect(ctx, -width * .5, -halfH, width, height, type === 'metal' ? 2 : width * .07);
  ctx.stroke();
}

/* ══ 刀光 / 火花 / 文字 ═════════════════════════════════ */

function drawTrail(ctx, trail, now, w, h, reduced) {
  if (!trail.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // 三层：外发光（宽）→ 主体 → 高温芯（细）；越靠近笔尖越亮。
  for (let pass = 0; pass < 3; pass++) {
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < trail.length; i++) {
      const s = trail[i];
      if (!s.a || !s.b) continue;
      const alpha = clamp(1 - (now - s.at) / TRAIL_LIFE, 0, 1);
      if (alpha <= 0) continue;
      const t = i / Math.max(1, trail.length - 1);
      const taper = .35 + t * .65;
      const ax = s.a.x * w, ay = s.a.y * h, bx = s.b.x * w, by = s.b.y * h;
      if (pass === 0) {
        ctx.strokeStyle = `rgba(23,52,75,${alpha * .12 * taper})`;
        ctx.lineWidth = (reduced ? 6 : 14) * alpha * taper + .6;
      } else if (pass === 1) {
        ctx.strokeStyle = `rgba(34,122,135,${alpha * .50 * taper})`;
        ctx.lineWidth = (reduced ? 2.6 : 5.4) * alpha * taper + .4;
      } else {
        ctx.strokeStyle = `rgba(255,255,255,${alpha * .92 * taper})`;
        ctx.lineWidth = 1.6 * alpha * taper + .35;
      }
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawBursts(ctx, bursts, now, w, h, reduced) {
  for (let i = 0; i < bursts.length; i++) {
    const b = bursts[i];
    const age = now - b.at;
    if (age < 0 || age > BURST_LIFE) continue;
    const p = age / BURST_LIFE, alpha = (1 - p) * (b.complete ? 1 : .6);
    const x = b.x * w, y = b.y * h;
    const color = burstColor(b);
    ctx.save();
    ctx.globalAlpha = alpha;

    // 命中闪光：只在前 110ms，硬靶更大更亮。
    if (b.complete && age < 110) {
      const f = 1 - age / 110;
      const hard = b.type === 'metal' || b.type === 'ice' ? 1.5 : 1;
      const rr = (reduced ? 10 : 22) * hard;
      const flash = ctx.createRadialGradient(x, y, 0, x, y, rr);
      const warm = b.quality === 'PERFECT';
      flash.addColorStop(0, warm ? `rgba(167,123,56,${.34 * f})` : `rgba(34,122,135,${.30 * f})`);
      flash.addColorStop(.45, warm ? `rgba(167,123,56,${.14 * f})` : `rgba(34,122,135,${.12 * f})`);
      flash.addColorStop(1, warm ? 'rgba(167,123,56,0)' : 'rgba(34,122,135,0)');
      ctx.fillStyle = flash;
      ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.fill();
    }

    const radius = (reduced ? 4 : 8) + p * (reduced ? 3 : 16);
    ctx.strokeStyle = color;
    ctx.lineWidth = b.complete ? 1.6 : 1.1;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.stroke();

    if (!reduced) {
      const pieces = b.complete ? 8 : 4;
      const angle = Number.isFinite(b.angle) ? b.angle : 0;
      for (let k = 0; k < pieces; k++) {
        const a = angle + k * TAU / pieces + .37;
        const r0 = radius * .45 + p * 6;
        const r1 = radius + p * 14 + 4 + Math.sin(k * 2.3) * 5;
        ctx.lineWidth = k % 2 ? 1 : 1.4;
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.stroke();
      }
    }
    if (b.objective) {
      ctx.strokeStyle = 'rgba(128,236,222,.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, radius + 5, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
}

function burstColor(b) {
  if (b.objective) return '#195B65';
  if (b.quality === 'PERFECT') return '#A77B38';
  if (b.quality === 'ANGLE') return '#C4402F';
  if (b.type === 'ice') return '#1E8FB8';
  if (b.type === 'metal') return '#526879';
  return '#2E7077';
}

/** 连斩脉冲：连击 ≥2 且 0.9 秒内刚斩断时，在画面上三分之一处给一次提示。 */
function drawComboBanner(ctx, run, w, h, reduced) {
  const combo = Number(run.combo) || 0;
  if (combo < 2) return;
  const age = (Number(run.elapsed) || 0) - (Number(run.lastKillAt) || 0);
  if (age < 0 || age > .9) return;
  const p = clamp(age / .9, 0, 1);
  const alpha = (1 - p) * .95;
  const scale = reduced ? 1 : 1 + .2 * Math.max(0, .16 - p) / .16;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(w * .5, h * .215);
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${clamp(w * .072, 22, 30)}px system-ui, sans-serif`;
  ctx.fillStyle = '#A77B38';
  ctx.fillText(`×${combo}`, -w * .048, 1);
  ctx.font = `700 ${clamp(w * .038, 13, 16)}px system-ui, sans-serif`;
  ctx.fillStyle = '#195B65';
  ctx.fillText('连斩', w * .05, 2);
  ctx.restore();
}

/** 得分贴命中点上方；未命中贴边、缩小、更快淡出 —— 两者不再互相压住。 */
function drawLabels(ctx, labels, now, w, h, reduced) {
  const scored = labels.filter((l) => l.quality !== 'MISS');
  const missed = labels.filter((l) => l.quality === 'MISS');
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < scored.length; i++) {
    const hit = scored[i];
    const age = now - hit.at;
    if (age < 0 || age > LABEL_LIFE) continue;
    const p = age / LABEL_LIFE;
    const lane = Number(hit.slot) || 0;
    const x = clamp(hit.x * w, Math.min(w * .18, 68), w - Math.min(w * .18, 68));
    // 同一批击杀会同时出现，按顺序错开 22px，避免三个数字糊成一团
    const stagger = (i % 3) * 22;
    const y = hit.y * h - (reduced ? 54 : 54 + age * .028) - lane * 3 - stagger;
    const color = hit.quality === 'PERFECT' ? '#8C6D14' : hit.objective ? '#195B65' : '#17344B';
    ctx.globalAlpha = 1 - p * p;
    ctx.font = `800 ${clamp(w * .052, 16, 22)}px system-ui, sans-serif`;
    /* ★ rework T07：按**接触结果类型**给不同主文案。
       改造前只有“切入/弹刃/补刀”三种词，无法区分
       “破甲成功”与“强度不足根本打不动”。 */
    const ev = hit.contactEvent;
    const mainText = hit.complete
      ? `+${Math.round(Number(hit.points) || 0)}`
      : ev === 'armor' ? `破甲! ${Math.round((hit.progress || 0) * 100)}%`
      : ev === 'blocked' ? `强度不足 ${Math.round((hit.progress || 0) * 100)}%`
      : ev === 'deflect' ? `弹刀 ${Math.round((hit.progress || 0) * 100)}%`
      : `${hit.followup ? '补刀' : '切入'} ${Math.round((hit.progress || 0) * 100)}%`;
    ctx.fillStyle = color;
    ctx.fillText(mainText, x, y);
    ctx.font = `650 ${clamp(w * .029, 10, 13)}px system-ui, sans-serif`;
    let detail = QUALITY_NAMES[hit.quality] || '';
    if (hit.complete && hit.combo > 1) detail += `${detail ? ' · ' : ''}连斩 ×${hit.combo}`;
    if (hit.objective) detail += `${detail ? ' · ' : ''}目标 +${hit.objective}`;
    /* 未击破时：先按接触类型说清楚“为什么没切开”，再给方向提示 */
    else if (!hit.complete) {
      if (ev === 'armor') detail = `护甲已破 · 继续切`;
      else if (ev === 'blocked') detail = `护甲还在 · 换更硬的刀或加攻略`;
      else if (ev === 'deflect') detail = `角度偏了 · 刀身反感伤`;
      else detail = `沿刀痕继续切`;
      detail += ` ${directionHint(hit.angle)}`;
    }
    if (detail) { ctx.fillStyle = 'rgba(56,84,105,.92)'; ctx.fillText(detail, x, y + 18); }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < missed.length; i++) {
    const hit = missed[i];
    const age = now - hit.at;
    if (age < 0 || age > LABEL_LIFE * .7) continue;
    const p = age / (LABEL_LIFE * .7);
    const x = clamp(hit.x * w, w * .16, w * .84);
    const y = hit.y * h + 30 + p * 10;
    ctx.globalAlpha = (1 - p) * .6;
    ctx.font = `600 ${clamp(w * .032, 11, 13)}px system-ui, sans-serif`;
    ctx.fillStyle = '#C4402F';
    ctx.fillText('未命中', x, y);
  }
  ctx.restore();
}

function drawPointer(ctx, pointer, w, h, reduced) {
  const x = pointer.x * w, y = pointer.y * h;
  ctx.save();
  ctx.strokeStyle = 'rgba(227,252,250,.72)'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(x, y, reduced ? 5 : 7, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(102,219,220,.30)'; ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
  ctx.restore();
}

/** 震屏：只取最近三次爆发里 130ms 内的，幅度 ≤ 2.6px，硬靶更明显。 */
function shakeOffset(bursts, now) {
  let x = 0, y = 0;
  for (let i = bursts.length - 1; i >= 0 && i >= bursts.length - 3; i--) {
    const b = bursts[i];
    if (!b.complete) continue;
    const age = now - b.at;
    if (!(age >= 0) || age > 130) continue;
    const f = 1 - age / 130;
    const hard = b.type === 'metal' ? 1 : b.type === 'ice' ? .8 : b.type === 'wood' ? .6 : .35;
    const a = b.angle || 0;
    x += Math.cos(a + 1.57) * 2.6 * f * hard * (i % 2 ? 1 : -1);
    y += Math.sin(a + 1.57) * 1.6 * f * hard;
  }
  return { x, y };
}

/* ══ 工具 ═══════════════════════════════════════════════ */

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amount < 0) { r *= 1 + amount; g *= 1 + amount; b *= 1 + amount; }
  else { r += (255 - r) * amount; g += (255 - g) * amount; b += (255 - b) * amount; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w * .5, h * .5));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, radius); return; }
  ctx.moveTo(x + radius, y); ctx.lineTo(x + w - radius, y); ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius); ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - radius); ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
}
