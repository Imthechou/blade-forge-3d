/**
 * 移动端布局审计（rework T15 / 待办 #10 的可执行部分）
 *
 * ⚠ 这不是真机测试。它做的是**真机前能自动化的**部分：
 *   · 多视口横向溢出（最常见的移动端破版）
 *   · 触控目标尺寸（< 44px 难以点中）
 *   · 关键页面是否能在窄屏打开、有无覆盖式遮挡
 *
 * 真机独有、这里测不到的：GPU 限制、散热降频、内存压力、iOS/Android 浏览器差异。
 *
 * 运行：
 *   node docs/rework/2026-10-24/audit-mobile.mjs
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const PW = process.env.PLAYWRIGHT_MODULE
  || path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const BASE = process.env.FORGE_URL || 'http://127.0.0.1:8123/';
const CHROME = process.env.CHROME_PATH
  || ['C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

if (!PW || !fs.existsSync(PW)) {
  console.error('找不到 Playwright。设置 PLAYWRIGHT_MODULE 指向 playwright 的 index.mjs。');
  process.exit(2);
}
const { chromium } = await import(pathToFileURL(PW).href);

/* 常见真机视口（CSS px） */
const VIEWPORTS = [
  { name: 'iPhone SE', w: 320, h: 568, dpr: 2 },
  { name: 'Android 小屏', w: 360, h: 640, dpr: 2 },
  { name: 'iPhone 14', w: 390, h: 844, dpr: 3 },
  { name: 'iPhone Pro Max', w: 430, h: 932, dpr: 3 },
];

const browser = await chromium.launch({
  executablePath: CHROME || undefined,
  headless: process.env.FORGE_HEADLESS === '1',
  args: ['--disable-dev-shm-usage'],
});

const findings = [];
const record = (sev, viewport, page, what) => {
  findings.push({ sev, viewport, page, what });
  console.log(`  [${sev}] ${viewport} · ${page} · ${what}`);
};

for (const vp of VIEWPORTS) {
  console.log(`\n=== ${vp.name} ${vp.w}x${vp.h} @DPR${vp.dpr} ===`);
  const context = await browser.newContext({
    viewport: { width: vp.w, height: vp.h },
    deviceScaleFactor: vp.dpr,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!document.querySelector('#homeBody'), { timeout: 30000 }).catch(() => {});

  /* 隔离夹具：有刀、有解锁卡，才能测到藏刀阁/图鉴/赛事 */
  await page.evaluate(async () => {
    const mod = await import('/src/core/saveSchema.js');
    const s = mod.makeSave();
    const mk = (id, kt, tag) => ({
      id, bladeName: id, knifeTypeId: kt, knifeType: null,
      stats: { strength: 180, toughness: 160, sharpness: 170, craft: 150, design: 140, spirit: 120 },
      score: 420, rarity: 'epic', rarityName: '史诗', quality: 'A', qualityName: 'A',
      fractured: false, canEnterArena: true,
      traits: [`BT_${tag}_6`], traitSources: {}, tags: { [tag]: 6 },
      tagTiers: [{ tagId: tag, layers: 6, effectiveLayers: 6 }],
      combos: [], comboDiscoveries: [], history: [], visualRecipe: [], pendingSkin: {},
      arenaHistory: [], createdAt: Date.now(),
    });
    s.collection = [mk('B-1', 'saber', 'edge'), mk('B-2', 'folding', 'precision'), mk('B-3', 'machete', 'layer')];
    s.showcaseId = 'B-1';
    s.unlockedCardIds = ['MAT01', 'MAT02'];
    localStorage.setItem('bladeforge.save', JSON.stringify(s));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!document.querySelector('#homeBody'), { timeout: 30000 }).catch(() => {});

  const goto = async (name) => {
    await page.evaluate(async (n) => {
      const router = (await import('/src/ui/router.js')).default;
      router.go(n);
    }, name);
    await page.waitForTimeout(400);
  };

  const measure = async (label) => {
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const overflowing = [];
      /* 找出真正超出视口右边界的元素（排除固定装饰与已裁剪容器） */
      const vw = window.innerWidth;
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 1.5 || r.left < -1.5) {
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.overflow === 'hidden' || cs.visibility === 'hidden') continue;
          /* 允许横向滚动容器内部超出 */
          let p = el.parentElement; let inScroller = false;
          while (p && p !== document.body) {
            const pcs = getComputedStyle(p);
            if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll') { inScroller = true; break; }
            p = p.parentElement;
          }
          if (inScroller) continue;
          overflowing.push({
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || '').slice(0, 40),
            right: Math.round(r.right),
          });
        }
      }
      /* 触控目标 < 44px */
      const smallTargets = [];
      for (const el of document.querySelectorAll('button, a, input, [role="button"], summary')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        if (r.height < 44 || r.width < 24) {
          smallTargets.push({
            tag: el.tagName.toLowerCase(),
            cls: String(el.className || '').slice(0, 30),
            w: Math.round(r.width), h: Math.round(r.height),
          });
        }
      }
      return {
        scrollW: de.scrollWidth,
        innerW: window.innerWidth,
        horizontalOverflow: de.scrollWidth > window.innerWidth + 1,
        overflowing: overflowing.slice(0, 5),
        smallTargets: smallTargets.slice(0, 6),
        smallCount: smallTargets.length,
      };
    });

    if (m.horizontalOverflow) {
      record('ERR', vp.name, label,
        `横向溢出 scrollW=${m.scrollW} > innerW=${m.innerW}` +
        (m.overflowing.length ? `；例：${m.overflowing.map((o) => `${o.tag}.${o.cls}(right=${o.right})`).join(', ')}` : ''));
    }
    if (m.smallCount > 0) {
      record('WARN', vp.name, label,
        `${m.smallCount} 个触控目标偏小；例：` +
        m.smallTargets.map((t) => `${t.tag}.${t.cls} ${t.w}x${t.h}`).join(', '));
    }
    return m;
  };

  for (const route of ['home', 'forge', 'arena', 'workshop']) {
    await goto(route);
    await measure(route);
  }

  /* 工坊各分页（藏刀阁/成就/加成/图鉴） */
  await goto('workshop');
  for (const tabId of ['collection', 'achievements', 'bonuses', 'codex']) {
    await page.evaluate(async (id) => {
      const w = await import('/src/ui/pages/workshop.js');
      w.openTab(id);
    }, tabId);
    await page.waitForTimeout(350);
    await measure(`workshop:${tabId}`);
  }

  /* 图鉴搜索框可用性（刚修过的 iOS 放大问题） */
  const search = await page.evaluate(() => {
    const i = document.querySelector('.codex-search');
    if (!i) return null;
    const cs = getComputedStyle(i);
    return { fontSize: parseFloat(cs.fontSize), touchAction: cs.touchAction, w: Math.round(i.getBoundingClientRect().width) };
  });
  if (!search) {
    record('ERR', vp.name, 'workshop:codex', '找不到图鉴搜索框');
  } else {
    if (search.fontSize < 16) {
      record('ERR', vp.name, 'workshop:codex', `搜索框字号 ${search.fontSize}px < 16px（iOS 聚焦会强制放大）`);
    }
    if (search.w < vp.w * 0.5) {
      record('WARN', vp.name, 'workshop:codex', `搜索框偏窄：${search.w}px`);
    }
  }

  if (errors.length) {
    record('ERR', vp.name, 'runtime', `pageerror: ${errors.slice(0, 3).join(' | ')}`);
  }

  await context.close();
}

await browser.close();

/* 汇总 */
const errs = findings.filter((f) => f.sev === 'ERR');
const warns = findings.filter((f) => f.sev === 'WARN');
console.log('\n=== 汇总 ===');
console.log('视口数 :', VIEWPORTS.length);
console.log('ERR    :', errs.length);
console.log('WARN   :', warns.length);
if (errs.length) {
  console.log('\n必须修复：');
  errs.forEach((f) => console.log(` - ${f.viewport} · ${f.page} · ${f.what}`));
}
if (warns.length) {
  console.log('\n建议改进（触控尺寸）：');
  warns.forEach((f) => console.log(` - ${f.viewport} · ${f.page} · ${f.what}`));
}
console.log('\n注：本审计不是真机测试；GPU/散热/内存与 iOS/Android 引擎差异未覆盖。');

process.exit(errs.length ? 1 : 0);
