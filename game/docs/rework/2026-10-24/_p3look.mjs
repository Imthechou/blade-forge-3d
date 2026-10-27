/**
 * P3.5 · 小图视觉核验（省 token 的看图方式）
 *
 * ── 为什么要专门写这个 ──────────────────────────────────────────
 * 上一轮我在 S1 上连续调参数（金属度、albedo 断面、粗糙度分级），
 * 全部只用像素统计判断 —— 而 P3 交付文档自己就把「无人眼验收」列为缺口。
 * 继续调数值只会越调越瞎。
 *
 * 但直接 `read` 全尺寸截图正是把上个会话撑到 70MB / 413 的原因。
 * 所以这里做两件事：
 *   ① 只裁**模型包围盒**（带 12% 余量），不要整屏 UI；
 *   ② 缩小到固定宽度 360px，JPEG 质量 82 → 单张约 15–25KB。
 *
 * 产出：docs/rework/2026-10-24/shots/p3look/<stage>.jpg
 *
 * 用法：node docs/rework/2026-10-24/_p3look.mjs
 *      FORGE_STAGES=S1,S2,S3 node ..._p3look.mjs
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const PW = process.env.PLAYWRIGHT_MODULE
  || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const BASE = process.env.FORGE_URL || 'http://127.0.0.1:8123/';
const CHROME = process.env.CHROME_PATH
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const OUT = path.join('docs', 'rework', '2026-10-24', 'shots', 'p3look');
fs.mkdirSync(OUT, { recursive: true });

const WANT = (process.env.FORGE_STAGES || 'S1,S2,S3').split(',').map((s) => s.trim().toUpperCase());
const OUT_W = Number(process.env.P3LOOK_W || 360);
/* ★★ 2026-10-26（重要教训）：DPR 默认从 1 改成 3。

   原来这里写死 deviceScaleFactor: 1，理由是“看结构不用高分辨率”——**这个理由错的**。
   矿石只占视口约 47%×37%，在 390×844@DPR1 下只有约 180×140 px，
   而输出宽固定 360px → 等于 2× 上采样。
   于是我看到的“方块”很可能是**我自己的采样管线**造成的，而不是产品。
   我据此连续“修”了两处代码（floor→平滑噪声、texGate），证据全部无效。

   教训：截图装置的分辨率必须高于被评估对象的像素尺度，否则评测对象变成评测装置。 */
const DPR = Number(process.env.P3LOOK_DPR || 3);

const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
/* DPR 提高到 3：矿石在画布上的实际采样数从 ~180px 提到 ~540px，
   再降采样到 360px 输出 → 干干净净的结构，不含重采样阶梯 */
const page = await (await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true,
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

/** 模型在**页面坐标**里的包围盒（含余量），并保证落在画布可视区内 */
const bboxOf = () => page.evaluate(async () => {
  const { getStage } = await import('/src/render/index.js');
  const v = getStage()?.viewer;
  if (!v || !v.renderer) return null;
  const cv = v.renderer.domElement;
  const W = cv.width, H = cv.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(cv, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;
  let minX = W, maxX = -1, minY = H, maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] / 255 < 0.02) continue;
      const lum = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      if (lum >= 0.965) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  /* 画布像素 → CSS 像素 */
  const rect = cv.getBoundingClientRect();
  const sx = rect.width / W, sy = rect.height / H;
  let bx = rect.left + minX * sx, by = rect.top + minY * sy;
  let bw = (maxX - minX + 1) * sx, bh = (maxY - minY + 1) * sy;
  /* ★★ 2026-10-26（重要）：这里曾经强制正方形（side = max(w,h)）。

     S3 刀胚 fillW 只有 17.3%，模型在画布上原生只有 101×404 像素。
     压成正方形后刀身只剩 ~85px 宽 → 细密纹理出现**摩尔纹**，
     看起来像“交叉网格纹”。

     判决证据（_p3alias.mjs，同一帧只改输出方式）：
        强制正方形 340 : hf=0.12783
        自然比例 340   : hf=0.032224  (−75%)
        自然比例 900   : hf=0.007027  (−94%)

     代价很贵：我据此在 S3 上“修”了三轮参数，全是修自己的采样假象。
     现改为**自然长宽比** + 高平滑插值。 */
  const pad = 0.10 * Math.max(bw, bh);
  bx -= pad; by -= pad; bw += pad * 2; bh += pad * 2;
  bx = Math.max(0, Math.min(bx, innerWidth - 1));
  by = Math.max(0, Math.min(by, innerHeight - 1));
  bw = Math.min(bw, innerWidth - bx);
  bh = Math.min(bh, innerHeight - by);
  return { x: Math.round(bx), y: Math.round(by), width: Math.round(bw), height: Math.round(bh) };
});

const report = [];
for (let step = 0; step < 30; step++) {
  const st = await page.evaluate(async () => {
    const g = (await import('/src/app/game.js')).default;
    if (!g.run) return null;
    return { phase: g.run.phase, idx: g.run.stageIndex, id: g.run.stageId };
  });
  if (!st || st.idx > 4) break;
  await dismiss();

  if (st.phase === 'select') {
    await page.evaluate(async () => {
      document.querySelector('.cards .dcard')?.click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await page.waitForTimeout(1100);

    /* ★★ 2026-10-26：必须等 program 编译完。
       否则画布还是空的 → bbox 检测退化 → 截到页面文字（S1 就踩了，8.3KB）。
       S1 是首阶段，冷编译最慢，最容易踫上。 */
    for (let k = 0; k < 12; k++) {
      const busy = await page.evaluate(async () => {
        const { getStage } = await import('/src/render/index.js');
        const v = getStage()?.viewer;
        return !!(v && (v._compiling || v._compilePromise || v.deferCompile));
      });
      if (!busy) break;
      await page.waitForTimeout(1200);
    }
    await page.waitForTimeout(500);
    await dismiss();

    if (WANT.includes(st.id)) {
      /* 强制一次同步重绘，保证裁到的是当前阶段 */
      await page.evaluate(async () => {
        const { getStage } = await import('/src/render/index.js');
        const v = getStage()?.viewer;
        if (v && v.renderer) v.renderer.render(v.scene, v.camera);
      });
      const box = await bboxOf();
      if (box && box.width > 8 && box.height > 8) {
        const raw = path.join(OUT, `_raw-${st.id}.png`);
        await page.screenshot({ path: raw, clip: box });
        /* 缩到固定宽度（单张 15–25KB，读图不炸上下文） */
        const small = await page.evaluate(async ({ dataUrl, targetW }) => {
          const img = new Image();
          await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
          const scale = Math.min(1, targetW / img.width);
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          const cx = c.getContext('2d');
          cx.imageSmoothingQuality = 'high';
          cx.drawImage(img, 0, 0, c.width, c.height);
          return c.toDataURL('image/jpeg', 0.82);
        }, { dataUrl: 'data:image/png;base64,' + fs.readFileSync(raw).toString('base64'), targetW: OUT_W });
        const jpg = path.join(OUT, `${st.id}.jpg`);
        fs.writeFileSync(jpg, Buffer.from(small.split(',')[1], 'base64'));
        fs.unlinkSync(raw);
        const kb = (fs.statSync(jpg).size / 1024).toFixed(1);
        report.push({ stage: st.id, file: jpg, kb });
        console.log(`  ${st.id}  → ${jpg}  (${kb} KB, 裁剪 ${box.width}×${box.height})`);
      } else {
        console.log(`  ${st.id}  未能定位模型包围盒`);
      }
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

console.log('\n产出小图：');
for (const r of report) console.log(`  ${r.stage}  ${r.kb} KB  ${r.file}`);
console.log(`总计 ${report.reduce((a, r) => a + Number(r.kb), 0).toFixed(1)} KB  (DPR=${DPR})`);
console.log('pageerror:', errs.length ? errs.slice(0, 4) : '无');
await browser.close();
