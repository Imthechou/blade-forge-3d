/**
 * P3 测量装置（替换 _p3base.mjs 的采样部分）
 *
 * ── 为什么重写 ────────────────────────────────────────────────
 * `_p3base.mjs` 产出的 `_rows.json` 里 **S1 与 S2 的像素统计完全相同**
 * （lumMean 0.621 / lumStd 0.218 / satMean 0.221 / hueHist 精确到 0.1% 全等），
 * 而两者模型分别是 `ore_small` 与 `molten_sphere_small`，几何并不相同。
 * 因此原基线**不可信**，不能拿它做 P3 的"改动前"对照。
 *
 * 可能原因（本次一并消除）：
 *   ① 读帧时机竞争 —— viewer 在 `_isAnimating()` 为假时会 `pauseRender()`，
 *      画布停留在**上一阶段**的最后一帧；原脚本固定等 900ms 后读，
 *      可能在新阶段还没出帧前就读到了旧缓冲。
 *   ② 原脚本用 `document.querySelector('#forgeStage canvas')` 选择画布，
 *      不保证就是 viewer 真正在画的那一块。
 *
 * 本脚本的做法：
 *   · 直接从 `getStage().viewer.renderer` 取**真实画布**；
 *   · 读帧前**强制同步重绘一次** `renderer.render(scene, camera)`
 *     （`preserveDrawingBuffer: true`，viewer.js:142），保证读到的是当前阶段；
 *   · 相位一致性自检：同一阶段连读两次，若不一致则重试（最多 3 次）。
 *
 * ── 指标定义（写进文档，可复现）────────────────────────────────
 *   hlEnergy   = mean( max(0, L - 0.70)^2 )               高光能量（镜面强度）
 *   hiPct      = 100 * #{L > 0.784} / n                   高光占比（luma>200）
 *   lumMean/lumStd/satMean/coloredPct/hueHist              与原口径一致
 *   hfEnergy   = mean( |Laplacian(L)| )                   表面细节能量（凹凸是否真的参与）
 *   stageDist  = 与其它阶段的像素平均绝对差（证明阶段间"看得出区别"）
 *
 * 用法：
 *   node docs/rework/2026-10-24/_p3probe.mjs            # 只测，不写文件
 *   node docs/rework/2026-10-24/_p3probe.mjs --save     # 写 _p3_probe.json + 截图
 *   FORGE_STAGES=S1,S2,S3,S4,S5 node ..._p3probe.mjs
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const PW = process.env.PLAYWRIGHT_MODULE
  || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const BASE = process.env.FORGE_URL || 'http://127.0.0.1:8123/';
const CHROME = process.env.CHROME_PATH
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const SAVE = process.argv.includes('--save');
const OUT = path.join('docs', 'rework', '2026-10-24', 'shots', 'p3probe');
if (SAVE) fs.mkdirSync(OUT, { recursive: true });

const WANT = (process.env.FORGE_STAGES || 'S1,S2,S3,S4,S5')
  .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
})).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const dismiss = async () => {
  for (let i = 0; i < 6; i++) {
    if (!(await page.evaluate(() => !!document.querySelector('.sheet-mask')))) return;
    await page.evaluate(() => document.querySelector('.sheet-x')?.click());
    await page.waitForTimeout(180);
  }
};

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!document.querySelector('#homeBody'), { timeout: 60000 });
await page.waitForTimeout(3200);
await dismiss();
await page.evaluate(async () => {
  const g = (await import('/src/app/game.js')).default;
  g.startForge({ mode: 'normal', seed: 20261024 });
  (await import('/src/ui/router.js')).default.go('forge');
});
await page.waitForSelector('.cards .dcard', { timeout: 30000 });
await page.waitForTimeout(1400);
await dismiss();

/** 在页面里执行：强制重绘 + 采样 + 自检相位一致 */
const grab = async () => page.evaluate(async () => {
  const { getStage } = await import('/src/render/index.js');
  const st = getStage();
  const v = st && st.viewer;
  if (!v || !v.renderer || !v.scene || !v.camera) return { error: 'no viewer' };
  if (v._compiling || v._compilePromise || v.deferCompile) return { error: 'compiling' };

  const readOnce = () => {
    const cv = v.renderer.domElement;
    const W = cv.width, H = cv.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, 0, 0);
    return ctx.getImageData(0, 0, W, H);
  };

  /* 强制同步重绘 → 立刻读，保证是「当前阶段」的帧，而不是 paused 的旧帧 */
  v.renderer.render(v.scene, v.camera);
  const img1 = readOnce();
  /* 相位自检：再画一次再读，一致说明缓冲稳定（非撕裂/非旧帧） */
  v.renderer.render(v.scene, v.camera);
  const img2 = readOnce();

  const W = img1.width, H = img1.height;
  const d1 = img1.data, d2 = img2.data;
  let diff = 0;
  for (let i = 0; i < d1.length; i += 4 * 97) diff += Math.abs(d1[i] - d2[i]);
  const stable = diff / (d1.length / (4 * 97)) < 1.5;

  const N = W * H;
  const L = new Float32Array(N);
  let minX = W, maxX = -1, minY = H, maxY = -1;
  let sum = 0, satS = 0, colored = 0, hi = 0;
  const hues = new Array(12).fill(0);
  let bg = 0;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x, i = p * 4;
      const r = d1[i] / 255, g = d1[i + 1] / 255, b = d1[i + 2] / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      L[p] = lum;
      /* 背景判定：alpha=0 或近白（场景是 alpha:true，透明像素在合成后为白）*/
      const a = d1[i + 3] / 255;
      if (a < 0.02 || lum >= 0.965) { bg++; continue; }
      sum += lum;
      if (lum > 0.784) hi++;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const S = mx === 0 ? 0 : (mx - mn) / mx;
      satS += S;
      if (S > 0.12) {
        colored++;
        let hue = 0;
        if (mx === mn) hue = 0;
        else if (mx === r) hue = ((g - b) / (mx - mn)) % 6;
        else if (mx === g) hue = (b - r) / (mx - mn) + 2;
        else hue = (r - g) / (mx - mn) + 4;
        hue = ((hue * 60) + 360) % 360;
        hues[Math.floor(hue / 30) % 12]++;
      }
    }
  }
  const n = N - bg;
  if (n <= 0) return { error: 'empty frame' };
  const mean = sum / n;

  /* 高光能量 + 方差 + 拉普拉斯高频能量（只在主体像素上算）*/
  let hl = 0, vs = 0, hf = 0, hfN = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      const v0 = L[p];
      const a = d1[p * 4 + 3] / 255;
      const isFg = !(a < 0.02 || v0 >= 0.965);
      if (isFg) {
        const t = Math.max(0, v0 - 0.70);
        hl += t * t;
        const q = v0 - mean; vs += q * q;
      }
      const lap = Math.abs(4 * v0 - L[p - 1] - L[p + 1] - L[p - W] - L[p + W]);
      const isFg2 = isFg && !(L[p - 1] >= 0.965 || L[p + 1] >= 0.965 || L[p - W] >= 0.965 || L[p + W] >= 0.965);
      if (isFg2) { hf += lap; hfN++; }
    }
  }

  /* 主体下采样指纹（64x64 灰度，用于跨阶段距离）*/
  const FP = 64;
  const fp = new Float32Array(FP * FP);
  for (let gy = 0; gy < FP; gy++) {
    for (let gx = 0; gx < FP; gx++) {
      const x0 = Math.floor(gx * W / FP), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * W / FP));
      const y0 = Math.floor(gy * H / FP), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * H / FP));
      let s = 0, c = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { s += L[y * W + x]; c++; }
      fp[gy * FP + gx] = c ? s / c : 0;
    }
  }

  const U = (() => {
    let spec = null;
    v.scene.traverse((o) => {
      if (spec) return;
      const s = o.material?.userData?.__k3dHooks?.get?.('bladeSkin');
      if (s?.uniforms?.uV2Surf) spec = s;
    });
    return spec ? spec.uniforms : null;
  })();
  const numU = (k) => { const a = U?.[k]?.value; return a != null && typeof a !== 'object' ? +Number(a).toFixed(4) : null; };
  const arrU = (k, n2) => (U?.[k]?.value?.length ? Array.from(U[k].value).slice(0, n2).map((x) => +Number(x).toFixed(3)) : null);

  return {
    stable,
    model: st.modelId,
    W, H,
    px: {
      fgPct: +(n / N * 100).toFixed(1),
      fillW: maxX >= 0 ? +((maxX - minX + 1) / W * 100).toFixed(1) : 0,
      fillH: maxY >= 0 ? +((maxY - minY + 1) / H * 100).toFixed(1) : 0,
      lumMean: +mean.toFixed(4),
      lumStd: +Math.sqrt(vs / n).toFixed(4),
      satMean: +(satS / n).toFixed(4),
      coloredPct: +(colored / n * 100).toFixed(1),
      hlEnergy: +(hl / n).toFixed(6),
      hiPct: +(hi / n * 100).toFixed(2),
      hfEnergy: +(hfN ? hf / hfN : 0).toFixed(6),
      hueHist: hues.map((v2) => (colored ? +(v2 / colored * 100).toFixed(1) : 0)),
    },
    fp: Array.from(fp, (x) => +x.toFixed(4)),
    u: {
      preserve: numU('uV2Preserve'),
      proc: arrU('uV2Proc', 4),
      surf: arrU('uV2Surf', 4),
      surfTile: arrU('uV2SurfTile', 4),
      metal: numU('uBladeMetalness'),
      rough: numU('uBladeRoughness'),
      env: numU('uBladeEnvIntensity'),
      stageCfg: arrU('uV2StageCfg', 36),
    },
  };
});

/** 采样：相位不稳则重试
 *
 * ★ 2026-10-26（P3.5）：compiling 要等更久。
 *   FAMILY_VERSION 改过一次（bladeV2:47 → :48）后，S1 的 program 需要重新编译，
 *   原来的 4 × 900ms 窗口不够 → 稳定报 “S1 采样失败: compiling”，
 *   而 S1 恰好是 P3.5 唯一要看的阶段。
 *   现在把 compiling 单独分成一条重试线（最多 10 × 2000ms），
 *   不与“相位不稳”的短重试抢预算。 */
async function sampleStage() {
  for (let i = 0; i < 10; i++) {
    const r = await grab();
    if (r && !r.error && r.stable) return r;
    if (r && r.error === 'compiling') { await page.waitForTimeout(2000); continue; }
    if (r && r.error === 'no viewer') { await page.waitForTimeout(1500); continue; }
    await page.waitForTimeout(420);
  }
  return await grab();
}

const rows = [];
for (let step = 0; step < 30; step++) {
  const st = await page.evaluate(async () => {
    const g = (await import('/src/app/game.js')).default;
    if (!g.run) return null;
    return { phase: g.run.phase, idx: g.run.stageIndex, id: g.run.stageId };
  });
  if (!st || st.idx > 5) break;
  if (WANT.length && !WANT.includes(st.id)) {
    if (st.phase === 'select') {
      await page.evaluate(() => document.querySelector('.cards .dcard')?.click());
      await page.waitForTimeout(300);
      await page.evaluate(() => document.querySelector('.actions .btn--primary')?.click());
      await page.waitForTimeout(400);
      continue;
    }
  }
  await dismiss();

  if (st.phase === 'select') {
    await page.evaluate(async () => {
      document.querySelector('.cards .dcard')?.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await page.waitForTimeout(1000);
    await dismiss();

    const card = await page.evaluate(() => {
      const c = document.querySelector('.cards .dcard.is-picked');
      return c ? (c.querySelector('.dcard-title')?.textContent || '').trim() : null;
    });
    const got = await sampleStage();
    if (got && !got.error) {
      rows.push({ stage: st.id, idx: st.idx, card, ...got });
      console.log(`\n--- ${st.id} [${card}] model=${got.model} stable=${got.stable} ---`);
      console.log(`  画面 fg=${got.px.fgPct}% fill=${got.px.fillW}x${got.px.fillH}% 亮度=${got.px.lumMean} σ=${got.px.lumStd} 饱和=${got.px.satMean}`);
      console.log(`  高光 hlEnergy=${got.px.hlEnergy} hiPct=${got.px.hiPct}%  细节 hfEnergy=${got.px.hfEnergy}`);
      console.log(`  uV2Proc=${JSON.stringify(got.u.proc)} uV2Surf=${JSON.stringify(got.u.surf)} metal=${got.u.metal} rough=${got.u.rough} env=${got.u.env}`);
      if (SAVE) await page.screenshot({ path: path.join(OUT, `${String(rows.length).padStart(2, '0')}-${st.id}.png`) });
    } else {
      console.log(`\n--- ${st.id} 采样失败: ${got?.error} ---`);
    }

    await page.evaluate(() => document.querySelector('.actions .btn--primary')?.click());
    await page.waitForTimeout(420);
    continue;
  }
  if (st.phase === 'hammer') {
    await page.evaluate(() => { document.querySelector('.hammer-stage-hit')?.click(); document.querySelector('.hammer-actions .btn')?.click(); });
    await page.waitForTimeout(360); continue;
  }
  if (st.phase === 'edge') {
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('跳过')); (b || document.querySelector('.actions .btn--primary'))?.click(); });
    await page.waitForTimeout(360); continue;
  }
  break;
}

/* ── 报告 ── */
const P = (v, n) => String(v ?? '-').padStart(n);
console.log('\n\n=== P3 阶段表（强制重绘后采样）===');
console.log('阶段 模型'.padEnd(34), 'preserve'.padStart(9), 'hlEnergy'.padStart(10), 'hiPct'.padStart(8), 'hfEnergy'.padStart(10), '亮度'.padStart(8), 'σ'.padStart(8), '饱和'.padStart(8));
for (const r of rows) {
  console.log(
    `${r.stage} ${String(r.model || '-')}`.padEnd(34),
    P(r.u.preserve, 9), P(r.px.hlEnergy, 10), P(r.px.hiPct, 8), P(r.px.hfEnergy, 10),
    P(r.px.lumMean, 8), P(r.px.lumStd, 8), P(r.px.satMean, 8),
  );
}

/* 阶段区分度：两两 64x64 指纹平均绝对差 */
if (rows.length > 1 && rows.every((r) => r.fp)) {
  console.log('\n=== 阶段两两区分度 (64x64 指纹 MAE，越大越不同) ===');
  const head = rows.map((r) => r.stage.padStart(7)).join('');
  console.log(''.padEnd(6) + head);
  for (const a of rows) {
    const cells = rows.map((b) => {
      if (a === b) return '      -';
      let s = 0;
      for (let i = 0; i < a.fp.length; i++) s += Math.abs(a.fp[i] - b.fp[i]);
      return (s / a.fp.length).toFixed(4).padStart(7);
    }).join('');
    console.log(a.stage.padEnd(6) + cells);
  }
  const warns = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      let s = 0;
      for (let k = 0; k < rows[i].fp.length; k++) s += Math.abs(rows[i].fp[k] - rows[j].fp[k]);
      const mae = s / rows[i].fp.length;
      if (mae < 0.01) warns.push(`${rows[i].stage}≈${rows[j].stage} (MAE ${mae.toFixed(4)}) —— 几乎一模一样`);
    }
  }
  console.log(warns.length ? '\n⚠ 疑似重复阶段：\n  ' + warns.join('\n  ') : '\n✔ 所有阶段对 MAE ≥ 0.01（无明显重复）');
}

if (SAVE) {
  const clean = rows.map(({ fp, ...rest }) => rest);
  fs.writeFileSync(path.join(OUT, '_p3_probe.json'), JSON.stringify(clean, null, 2));
  console.log(`\n已写 ${path.join(OUT, '_p3_probe.json')}`);
}
console.log('\npageerror:', errs.length ? errs.slice(0, 4) : '无');
await browser.close();
