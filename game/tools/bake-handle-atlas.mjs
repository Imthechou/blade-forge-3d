/**
 * 生成柄材质图集 `assets/handle-atlas.png`（审计 #8 的收口手段）
 *
 * 为什么要预烘而不是运行时烘：
 *   运行时烘焙必须按 kind 特化 GLSL —— 24 种柄 = 24 支 program，
 *   活跃集合从 8 涨到 30（审计 #8 未达标），S8 的 22 次 link 也全在这里。
 *   三条"运行时省掉"的路都已被实测堵死：
 *     ① kind 走 uniform  → 一支 24 路分支的管线，首张卡 39 → 814/876 ms（RESULT §3.18(g)）；
 *     ② JS 复刻          → 视觉对不上（见 RESULT §3.20(a)：`k3dHHash` 的 sin 在 GPU 上
 *                          不可复现，连最小自变量都对不齐，24 格平均差 14.65/255）；
 *     ③ 离线烘成图集    ← 本文件。逐位精确（就是 GPU 自己的输出），运行时 0 支柄 program。
 *   仓库里已有同类先例：`src/render/legacy/skin/s3TexMapsData.js` 也是预烘纹理。
 *
 * 用法：
 *   node tools/bake-handle-atlas.mjs            # 重新生成 + 打印体积
 *   node tools/bake-handle-atlas.mjs --verify   # 只对比：磁盘上的 PNG vs 现烘一遍
 *
 * ⚠ 只要 `legacy/skin/shader/handleLook.js` 里的 `k3dHandleLook` 改了，就必须重跑本脚本，
 *   否则图集与源码不一致。`--verify` 就是用来抓这个的（逐位比对，不是目测）。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const pngPath = path.join(root, 'assets/handle-atlas.png');
const verify = process.argv.includes('--verify');

/* ---------------- 极简 PNG 编码（RGBA8，无依赖） ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
/** @param {Uint8Array} rgba 行 0 在**上** */
function encodePNG(rgba, w, h) {
  /* 逐行选最优过滤器（None / Sub / Up / Paeth），这是体积的主要来源 */
  const bpp = 4, stride = w * bpp;
  const out = Buffer.alloc((stride + 1) * h);
  const prev = new Uint8Array(stride);
  /* ⚠ PNG 的过滤器编号：0=None,1=Sub,2=Up,3=Average,4=Paeth。
     这里只用 0/1/2/4 —— 早先误把 Paeth 写成 3，写出的图能看却解不回来。 */
  const F = [0, 1, 2, 4];
  const cand = F.map(() => new Uint8Array(stride));
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let o = 0;
  for (let y = 0; y < h; y++) {
    const row = rgba.subarray(y * stride, y * stride + stride);
    let best = 0, bestSum = Infinity;
    for (let fi = 0; fi < F.length; fi++) {
      const f = F[fi];
      const c = cand[fi];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? row[i - bpp] : 0;
        const b = prev[i];
        const cc = i >= bpp ? prev[i - bpp] : 0;
        const v = f === 0 ? row[i]
          : f === 1 ? (row[i] - a) & 0xff
          : f === 2 ? (row[i] - b) & 0xff
          : (row[i] - paeth(a, b, cc)) & 0xff;
        c[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = fi; }
    }
    out[o++] = F[best];
    out.set(cand[best], o); o += stride;
    prev.set(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const idat = zlib.deflateSync(out, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* 极简 PNG 解码（只支持我们自己写出来的 8bit RGBA、filter 0-4）—— 用于 --verify */
function decodePNG(buf) {
  let p = 8, w = 0, h = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const out = new Uint8Array(stride * h);
  const prev = new Uint8Array(stride);
  const paeth = (a, b, c) => {
    const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let o = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[o++];
    const row = out.subarray(y * stride, y * stride + stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? row[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      const x = raw[o + i];
      row[i] = (f === 0 ? x : f === 1 ? x + a : f === 2 ? x + b
        : f === 3 ? x + ((a + b) >> 1) : x + paeth(a, b, c)) & 0xff;
    }
    o += stride;
    prev.set(row);
  }
  return { w, h, data: out };
}

/* ---------------- 用真 GPU 烘一遍 ---------------- */

const pwPath = process.env.PLAYWRIGHT_MODULE ||
  'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const { chromium } = await import(pathToFileURL(pwPath).href);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--no-first-run'],
});
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8123/?backend=v2&quality=high', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => window.__FORGE_PREP && (window.__FORGE_PREP.ready || window.__FORGE_PREP.problems?.length),
  null, { timeout: 120000 },
);
await page.waitForTimeout(400);

const baked = await page.evaluate(async () => {
  const { getStage } = await import('/src/render/index.js');
  const bake = await import('/src/render/v2/handleLookBake.js');
  const stage = getStage();
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:600px;z-index:99999';
  document.body.appendChild(host);
  stage.attachTo(host); stage.resize(); stage.setGhost(false);
  await new Promise((r) => setTimeout(r, 120));
  const r = stage.viewer.renderer;
  /* 强制走运行时烘焙，否则拿到的是预烘资源本身（那就不叫"验证"了） */
  bake.resetHandleAtlasForBake();
  const t0 = performance.now();
  for (let k = 0; k < 24; k++) bake.acquireHandleLook(r, k);
  const ms = +(performance.now() - t0).toFixed(1);
  const tgt = bake.getHandleAtlasTarget();
  const w = tgt.width, h = tgt.height;
  const buf = new Uint8Array(w * h * 4);
  r.readRenderTargetPixels(tgt, 0, 0, w, h, buf);
  /* 转 base64 传出来（6.3 MB 走 evaluate 的序列化会慢，base64 最稳） */
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < buf.length; i += CH) s += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
  return { w, h, ms, b64: btoa(s) };
});
await browser.close();

const W = baked.w, H = baked.h;
const gpu = new Uint8Array(Buffer.from(baked.b64, 'base64'));
console.log(`GPU 烘 24 格 ${baked.ms} ms · 图集 ${W}×${H}（${(gpu.length / 1048576).toFixed(2)} MiB 原始）`);

/* readback 行 0 在下；PNG 也按这个顺序写（行 0 = 图集最下面一行），
   加载时 flipY=false → 采样坐标与 render target 完全一致，中间不翻转。 */
const png = encodePNG(gpu, W, H);
console.log(`PNG ${(png.length / 1024).toFixed(0)} KiB（${(png.length / 1048576).toFixed(2)} MiB）`);

if (verify) {
  /* 先做 codec 自检：encode → decode 必须逐字节回得去，否则后面的比较没有意义 */
  {
    const rt = decodePNG(encodePNG(gpu, W, H));
    let d = 0;
    for (let i = 0; i < gpu.length; i++) if (rt.data[i] !== gpu[i]) d++;
    console.log(d === 0 ? '✓ codec 自检通过（encode→decode 逐字节一致）' : `✗ codec 自检失败：${d} 字节不符`);
    if (d !== 0) process.exit(2);
  }
  if (!fs.existsSync(pngPath)) { console.log('✗ 磁盘上没有 handle-atlas.png'); process.exit(1); }
  const disk = decodePNG(fs.readFileSync(pngPath));
  if (disk.w !== W || disk.h !== H) { console.log(`✗ 尺寸不符 ${disk.w}×${disk.h}`); process.exit(1); }
  let diff = 0, max = 0, sum = 0;
  for (let i = 0; i < gpu.length; i++) {
    const d = Math.abs(gpu[i] - disk.data[i]);
    if (d) { diff++; sum += d; if (d > max) max = d; }
  }
  const pct = (100 * diff / gpu.length).toFixed(3);
  console.log(diff === 0
    ? '✓ 逐字节一致（磁盘图集 = 现烘结果）'
    : `✗ 不一致：${diff} 字节 / ${pct}%（最大差 ${max}，平均 ${(sum / diff).toFixed(2)}）`);
  process.exit(diff === 0 ? 0 : 1);
} else {
  fs.mkdirSync(path.dirname(pngPath), { recursive: true });
  fs.writeFileSync(pngPath, png);
  console.log('wrote', path.relative(root, pngPath));
}
