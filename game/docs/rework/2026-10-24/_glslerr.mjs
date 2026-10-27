/**
 * 抓 GLSL 真实编译错误（addInitScript 在页面加载前就打开自检）
 *
 * ── 为什么需要它 ────────────────────────────────────────────────
 * 症状：S1/S4 全部 `empty frame`，但 `pageerror` 为空。
 * 伴随一条 WebGL warning：`useProgram: program not valid`
 * → 这是**片元着色器编译/链接失败**，而 three 默认不打印 info log。
 *
 * 前一个脚本（_shadererr.mjs）是在页面已经跑起来之后才设
 * `renderer.debug.checkShaderErrors = true`，此时 program 已经
 * 编译（并失败）过，缓存里是失败态，所以只看到 warning 看不到 ERROR 文本。
 *
 * 本脚本用 `page.addInitScript` 在**任何 JS 之前**注入：
 *   · 打开 checkShaderErrors
 *   · 包一层 console.error / WebGL getShaderInfoLog，把原文留下来
 *
 * 用法：node docs/rework/2026-10-24/_glslerr.mjs
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const PW = process.env.PLAYWRIGHT_MODULE
  || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const BASE = process.env.FORGE_URL || 'http://127.0.0.1:8123/';
const CHROME = process.env.CHROME_PATH
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const OUT = path.join('docs', 'rework', '2026-10-24', 'shots');

const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();

/* 在任何页面脚本之前注入：打开自检 + 拦截 WebGL info log */
await page.addInitScript(() => {
  globalThis.__GLSL_LOGS = [];
  const push = (kind, text) => {
    const s = String(text || '');
    if (!s) return;
    globalThis.__GLSL_LOGS.push({ kind, text: s.slice(0, 4000) });
  };

  /* 1) 拦截 shader source 与 infoLog —— 抓到最原始的编译器输出 */
  const P = WebGL2RenderingContext.prototype;
  const origShaderSource = P.shaderSource;
  const origCompile = P.compileShader;
  const origGetInfo = P.getShaderInfoLog;
  const origGetProgramInfo = P.getProgramInfoLog;
  const origLink = P.linkProgram;
  const shaderSrc = new WeakMap();

  P.shaderSource = function (sh, src) {
    shaderSrc.set(sh, src);
    return origShaderSource.call(this, sh, src);
  };
  P.compileShader = function (sh) {
    const r = origCompile.call(this, sh);
    try {
      if (!this.getShaderParameter(sh, this.COMPILE_STATUS)) {
        const log = origGetInfo.call(this, sh);
        const src = shaderSrc.get(sh) || '';
        push('COMPILE_FAIL', log);
        /* 把出错的源码也存下来（只存前 20 万字符，够定位）*/
        globalThis.__GLSL_BAD_SRC = (globalThis.__GLSL_BAD_SRC || '') + '\n=====\n' + src.slice(0, 200000);
      }
    } catch (_) { /* ignore */ }
    return r;
  };
  P.linkProgram = function (pr) {
    const r = origLink.call(this, pr);
    try {
      if (!this.getProgramParameter(pr, this.LINK_STATUS)) {
        push('LINK_FAIL', origGetProgramInfo.call(this, pr));
      }
    } catch (_) { /* ignore */ }
    return r;
  };

  /* 2) 同时用 console.error 兜底（three 在 checkShaderErrors 时会打印）*/
  const origErr = console.error;
  console.error = function (...args) {
    try { push('console.error', args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ')); } catch (_) { }
    return origErr.apply(console, args);
  };

  /* 3) 打开 three 自检（THREE 是外部全局，稍后才会挂上）*/
  const tick = setInterval(() => {
    if (globalThis.K3D && globalThis.THREE) {
      globalThis.__GLSL_WANT_CHECK = true;
    }
  }, 200);
  setTimeout(() => clearInterval(tick), 20000);
});

const logs = [];
page.on('console', (m) => logs.push({ t: m.type(), x: m.text() }));
page.on('pageerror', (e) => logs.push({ t: 'pageerror', x: e.message }));

const dismiss = async () => {
  for (let i = 0; i < 6; i++) {
    if (!(await page.evaluate(() => !!document.querySelector('.sheet-mask')))) return;
    await page.evaluate(() => document.querySelector('.sheet-x')?.click());
    await page.waitForTimeout(180);
  }
};

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!document.querySelector('#homeBody'), { timeout: 60000 });
await page.waitForTimeout(2800);
await dismiss();

/* 打开 three 自检并强制重编译 */
await page.evaluate(async () => {
  const { getStage } = await import('/src/render/index.js');
  const v = getStage()?.viewer;
  if (!v) return;
  v.renderer.debug.checkShaderErrors = true;
  let mat = null;
  v.scene.traverse((o) => {
    if (mat) return;
    const h = o.material?.userData?.__k3dHooks;
    if (h?.get?.('bladeSkin')) mat = o.material;
  });
  if (mat) {
    /* 换 cacheKey 逼 three 重新编译 */
    const prev = mat.customProgramCacheKey;
    mat.customProgramCacheKey = function () { return prev.call(this) + '|diag' + Date.now(); };
    mat.needsUpdate = true;
  }
  v.needsRender = true;
  v.renderer.render(v.scene, v.camera);
  await new Promise((r) => setTimeout(r, 900));
  v.renderer.render(v.scene, v.camera);
});
await page.waitForTimeout(1200);

/* 取回拦截到的日志 */
const data = await page.evaluate(() => ({
  logs: globalThis.__GLSL_LOGS || [],
  badSrc: globalThis.__GLSL_BAD_SRC || '',
}));

console.log('=== 拦截到的着色器日志 ===');
if (!data.logs.length) {
  console.log('  （无 —— 可能 program 复用了缓存，没触发重新编译）');
} else {
  for (const l of data.logs.slice(0, 8)) {
    console.log(`\n[${l.kind}]`);
    console.log(l.text);
  }
}

/* 关键：把出错源码存下来，并打印 first error 附近的行 */
if (data.badSrc) {
  fs.writeFileSync(path.join(OUT, '_badshader.txt'), data.badSrc);
  console.log(`\n出错源码已存: ${path.join(OUT, '_badshader.txt')}  (${data.badSrc.length} 字符)`);

  /* 解析 "ERROR: 0:1234: ..." 里的行号，把上下文打出来 */
  const all = data.logs.map((l) => l.text).join('\n');
  const m = [...all.matchAll(/ERROR:\s*\d+:(\d+):/g)].map((x) => Number(x[1]));
  const firstSrc = data.badSrc.split('\n=====\n')[0];
  const lines = firstSrc.split('\n');
  const uniq = [...new Set(m)].slice(0, 5);
  if (uniq.length) {
    console.log('\n=== 出错行上下文 ===');
    for (const ln of uniq) {
      console.log(`\n--- 行 ${ln} ---`);
      for (let i = Math.max(0, ln - 4); i < Math.min(lines.length, ln + 3); i++) {
        console.log(`${String(i + 1).padStart(6)}${i + 1 === ln ? ' >>' : '   '} ${lines[i]}`);
      }
    }
  } else {
    console.log('（日志里没有可解析的行号，请直接看 _badshader.txt）');
  }
} else {
  console.log('\n未捕获到编译失败的源码。');
}

console.log('\npage console 中与 shader 相关的条目：');
const rel = logs.filter((l) => /shader|glsl|program|compile|link|INVALID/i.test(l.x));
if (!rel.length) console.log('  无');
else for (const l of rel.slice(0, 6)) console.log(`  [${l.t}] ${l.x.slice(0, 300)}`);

await browser.close();
