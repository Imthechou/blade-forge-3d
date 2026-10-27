/**
 * 实机试玩与改造文档对照检查（playtest）
 *
 * 目标：不是跑断言，而是**像玩家一样走一遍**，在每个阶段截图 + 记录可见问题。
 * 对照：docs/REWORK_PLAN_2026-10-24.md 的 T05/T13/T14 等体验条款。
 *
 * 运行：node docs/rework/2026-10-24/playtest.mjs
 * 截图输出：docs/rework/2026-10-24/shots/
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

const OUT = path.join('docs', 'rework', '2026-10-24', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch({
  executablePath: CHROME || undefined,
  headless: process.env.FORGE_HEADLESS === '1',
  args: ['--disable-dev-shm-usage'],
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const findings = [];
const note = (sev, where, what) => {
  findings.push({ sev, where, what });
  console.log(`[${sev}] ${where} · ${what}`);
};
let shotNo = 0;
const shot = async (label) => {
  await dismissSheets();
  shotNo++;
  const name = `${String(shotNo).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: path.join(OUT, name) });
  return name;
};

/* 阶段名取自 data/stages.js，用于核对 UI 是否真的进到该阶段 */
const STAGE_NAMES = ['原料', '熔炼', '锻打', '定型', '淬火', '回火', '开刃', '装配', '调校'];

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!document.querySelector('#homeBody'), { timeout: 60000 });
// 等首帧就绪遮罩消失（否则截图是加载页）
await page.waitForFunction(() => {
  const r = document.querySelector('.stage-readiness');
  return !r || getComputedStyle(r).display === 'none';
}, { timeout: 60000 }).catch(() => {});

/* 隔离夹具：全新档，50 CR */
await page.evaluate(async () => {
  const mod = await import('/src/core/saveSchema.js');
  localStorage.setItem('bladeforge.save', JSON.stringify(mod.makeSave()));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!document.querySelector('#homeBody'), { timeout: 60000 });
await page.waitForTimeout(600);

/* ★ 必须关掉新手引导：它是模态遮罩（aria-modal），不关会盖住后续所有页面。
   bootstrap 用 setTimeout(…, 360) **延迟**弹出，而 360ms 是从 bootstrap 结束开始算的 ——
   GPU 着色器准备可能持续数秒，所以引导会在**玩家已经进入锻造后**才弹出。
   这里先确认它真的出现了，并记录相对时间点。 */
let guideAppearedAt = null;
const bootT0 = Date.now();
for (let i = 0; i < 120; i++) {          // 最长等 6s
  if (await page.evaluate(() => !!document.querySelector('.sheet-mask'))) {
    guideAppearedAt = Date.now() - bootT0;
    break;
  }
  await page.waitForTimeout(50);
}
if (guideAppearedAt != null) {
  await page.evaluate(() => document.querySelector('.sheet-x')?.click());
  await page.waitForTimeout(350);
}
const stillOpen = await page.evaluate(() => !!document.querySelector('.sheet-mask'));
console.log(`新手引导：出现于 reload 后 ${guideAppearedAt ?? '未出现'}ms；关闭后残留=${stillOpen}`);
if (stillOpen) note('ERR', 'tutorial', '点「关闭」后引导遮罩未消失');

/* 兜底：任何阶段截图前若还有遮罩，都先关掉，避免假象 */
const dismissSheets = async () => {
  for (let i = 0; i < 3; i++) {
    const has = await page.evaluate(() => !!document.querySelector('.sheet-mask'));
    if (!has) return false;
    await page.evaluate(() => document.querySelector('.sheet-x')?.click());
    await page.waitForTimeout(220);
  }
  return true;
};

console.log('\n########## 1. 首页 ##########');
await shot('home');
const home = await page.evaluate(() => {
  const goal = document.querySelector('.home-goal');
  const start = document.querySelector('.home-start');
  const stats = [...document.querySelectorAll('.home-stats > div')].map((d) => d.textContent.trim());
  return {
    hasStart: !!start,
    startText: start?.textContent?.trim() || null,
    goalText: goal?.textContent?.trim() || null,
    stats,
    entryCount: document.querySelectorAll('.home-entry-btn').length,
    readinessVisible: !!document.querySelector('.stage-readiness')?.offsetParent,
  };
});
console.log('首页:', JSON.stringify(home, null, 0));
if (!home.hasStart) note('ERR', 'home', '找不到「开始锻刀」主按钮');
if (!home.goalText) note('ERR', 'home', '缺少「下一个目标」卡片（T12 要求）');
if (home.readinessVisible) note('WARN', 'home', '加载遮罩仍可见');

console.log('\n########## 2. 进入锻造 S1 ##########');
await page.evaluate(async () => {
  const g = (await import('/src/app/game.js')).default;
  g.startForge({ mode: 'normal', seed: 20261024 });
  (await import('/src/ui/router.js')).default.go('forge');
});
await page.waitForSelector('.cards .dcard', { timeout: 30000 });
await page.waitForTimeout(500);
await shot('forge-S1-cards');

const s1 = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.cards .dcard')];
  return {
    cardCount: cards.length,
    cards: cards.map((c) => ({
      title: c.querySelector('.dcard-title')?.textContent,
      dirs: c.querySelector('.dcard-dirs')?.textContent,
      tier: c.querySelector('.dcard-tier')?.textContent || null,
      risk: c.querySelector('.dcard-head')?.textContent,
    })),
    riskPanel: document.querySelector('.forge-rail')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160),
    confirmDisabled: document.querySelector('.actions .btn--primary')?.disabled,
    statGrid: document.querySelector('.stat-grid')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 140),
  };
});
console.log('S1:', JSON.stringify(s1, null, 0));
if (s1.cardCount !== 3) note('ERR', 'forge:S1', `候选卡不是 3 张，而是 ${s1.cardCount}`);
if (!s1.confirmDisabled) note('WARN', 'forge:S1', '未选卡时「确认」按钮竟可点');
/* T14：卡面要能表达“补到哪档标签” */
if (s1.cards.some((c) => !c.tier)) note('WARN', 'forge:S1', '部分卡片缺少「标签补档」行（T14 要求）');

console.log('\n########## 3. 预览 → 切换 → 确认（T14 检查切卡残留） ##########');
const previewProbe = await page.evaluate(async () => {
  const cards = [...document.querySelectorAll('.cards .dcard')];
  const out = [];
  for (let i = 0; i < cards.length; i++) {
    cards[i].click();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.push({
      picked: document.querySelectorAll('.cards .dcard.is-picked').length,
      status: document.querySelector('.forge-selection-status')?.textContent?.trim() || '',
      confirmDisabled: document.querySelector('.actions .btn--primary')?.disabled,
    });
  }
  return out;
});
console.log('预览切换:', JSON.stringify(previewProbe, null, 0));
if (previewProbe.some((p) => p.picked !== 1)) note('ERR', 'forge:S1', '同时高亮多张或没有高亮（切卡残留）');
if (previewProbe.some((p) => p.confirmDisabled)) note('ERR', 'forge:S1', '选卡后「确认」仍禁用');
await shot('forge-S1-preview');

/* 真正推进所有阶段 */
console.log('\n########## 4. 走完 S1–S9 ##########');
const stageLog = [];
for (let step = 0; step < 20; step++) {
  const st = await page.evaluate(async () => {
    const g = (await import('/src/app/game.js')).default;
    const run = g.run;
    return run ? { phase: run.phase, stageId: run.stageId, stageIndex: run.stageIndex, fractured: run.fractured } : null;
  });
  if (!st) break;
  if (st.phase === 'select' && st.stageIndex <= 8) {
    const name = STAGE_NAMES[st.stageIndex] || st.stageId;
    await page.waitForTimeout(120);
    await shot(`forge-${st.stageId}-select`);
    const cardInfo = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.cards .dcard')];
      return {
        n: cards.length,
        titles: cards.map((c) => c.querySelector('.dcard-title')?.textContent),
        tiers: cards.map((c) => c.querySelector('.dcard-tier')?.textContent || null),
      };
    });
    stageLog.push({ stage: st.stageId, name, ...cardInfo });
    await page.evaluate(async () => {
      const cards = [...document.querySelectorAll('.cards .dcard')];
      cards[0].click();
      await new Promise((r) => requestAnimationFrame(r));
      document.querySelector('.actions .btn--primary').click();
    });
    await page.waitForTimeout(260);
    continue;
  }
  if (st.phase === 'hammer') {
    await shot('forge-S4-hammer');
    /* 注意：evaluate 内部变量名必须与返回对象的键一致，
       否则会报 ReferenceError: hud is not defined。 */
    const hud = await page.evaluate(() => {
      const hudText = document.querySelector('.hammer-stat')?.textContent?.replace(/\s+/g, ' ').trim();
      const gain = document.querySelector('.hammer-gain')?.textContent?.replace(/\s+/g, ' ').trim();
      const prog = document.querySelector('.hammer-panel')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 260);
      return { hud: hudText, gain, prog };
    });
    console.log('S4 HUD:', JSON.stringify(hud, null, 0));
    if (!hud.gain) note('WARN', 'forge:S4', '看不到「已得六维成果」行（T04.4 要求逐锤成果可见）');
    /* 打 3 锤再收手 */
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => document.querySelector('.hammer-stage-hit')?.click());
      await page.waitForTimeout(220);
    }
    await shot('forge-S4-after3hits');
    const after = await page.evaluate(() =>
      document.querySelector('.hammer-panel')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 300));
    console.log('S4 三锤后:', after);
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.hammer-actions .btn')];
      btns[0]?.click();
    });
    await page.waitForTimeout(300);
    continue;
  }
  if (st.phase === 'edge') {
    await shot('forge-S7-edge-empty');
    const edgeUI = await page.evaluate(() => ({
      hasCanvas: !!document.querySelector('.edge-canvas'),
      hasSkip: [...document.querySelectorAll('.edge-canvas ~ *, .actions .btn, button')].some((b) => (b.textContent || '').includes('跳过')),
      info: document.querySelector('.row.row--between')?.textContent?.trim() || null,
    }));
    console.log('S7 UI:', JSON.stringify(edgeUI, null, 0));
    if (!edgeUI.hasCanvas) note('ERR', 'forge:S7', '找不到刃线画布');
    if (!edgeUI.hasSkip) note('WARN', 'forge:S7', '找不到「跳过描线」按钮（T05 要求可跳过）');
    /* 先测“完全不画就提交” */
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('提交刃线'));
      b?.click();
    });
    await page.waitForTimeout(400);
    const noneResult = await page.evaluate(async () => {
      const g = (await import('/src/app/game.js')).default;
      return g.run?.edge || null;
    });
    console.log('S7 未描线提交:', JSON.stringify(noneResult, null, 0));
    if (noneResult && noneResult.tier && noneResult.tier !== 'miss') {
      note('ERR', 'forge:S7', `未描线却得到 ${noneResult.tier}（T05/A08 要求必须 MISS）`);
    }
    continue;
  }
  if (st.phase === 'appraise') break;
  if (st.fractured) { note('WARN', 'forge', '本局断刀（可能影响后续检查）'); break; }
  break;
}

console.log('\n阶段记录:');
for (const s of stageLog) {
  console.log(`  ${s.stage} ${s.name} · 卡数 ${s.n} · 补档行 ${s.tiers.filter(Boolean).length}/${s.tiers.length} · ${s.titles.join(' / ')}`);
}
const stagesSeen = new Set(stageLog.map((s) => s.stage));
for (const need of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9']) {
  if (!stagesSeen.has(need) && need !== 'S4' && need !== 'S7') {
    note('WARN', 'forge', `没有走到 ${need}（阶段推进可能中断）`);
  }
}

/* 若已到 S10，检查鉴定揭晓 */
console.log('\n########## 5. 鉴定揭晓顺序（T13.3） ##########');
const atAppraise = await page.evaluate(async () => {
  const g = (await import('/src/app/game.js')).default;
  return g.run ? { phase: g.run.phase, fractured: g.run.fractured } : null;
});
console.log('当前:', JSON.stringify(atAppraise));
if (atAppraise?.phase === 'appraise') {
  await page.evaluate(async () => {
    const g = (await import('/src/app/game.js')).default;
    const rec = g.appraise();
    (await import('/src/ui/router.js')).default.go('appraise');
  });
  await page.waitForTimeout(300);
  /* ★ 按**墙钟时间**采样，不能按帧数：
     本机 180Hz，60 帧只有 ~330ms，而六维在 660ms、特性在 1000ms 才揭晓，
     按帧数会误判成「揭晓链断裂」。 */
  const order = await page.evaluate(async () => {
    const seen = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 4000) {
      for (const sec of document.querySelectorAll('.ap-sec')) {
        const step = sec.dataset.step;
        if (!step || seen.includes(step)) continue;
        if (sec.classList.contains('is-in')) seen.push(step);
      }
      await new Promise((r) => requestAnimationFrame(r));
    }
    return seen;
  });
  console.log('揭晓顺序:', order.join(' → '));
  await shot('appraise-reveal-end');
  const iSix = order.indexOf('six');
  const iTraits = order.indexOf('traits');
  const iBd = order.indexOf('bd');
  const scoreShown = await page.evaluate(() => document.querySelector('.ap-final-score .ap-stat-v')?.textContent?.trim());
  console.log('最终分显示:', scoreShown);
  if (iSix < 0 || iTraits < 0 || iBd < 0) {
    note('ERR', 'appraise', '六维/特性/倍率未在概览可见（T13.3 揭晓链断裂）');
  } else if (!(iSix < iTraits && iTraits < iBd)) {
    note('ERR', 'appraise', `揭晓顺序不对：${order.join('→')}`);
  }
  if (!scoreShown || scoreShown === '—') note('WARN', 'appraise', '最终分未显示');

  /* 跳过按钮 */
  const skip = await page.evaluate(() => !!document.querySelector('.ap-skip'));
  if (!skip) note('WARN', 'appraise', '找不到「跳过揭晓」');

  /* 归档 */
  await page.evaluate(async () => {
    const g = (await import('/src/app/game.js')).default;
    const r = g.archive();
    return r;
  });
  await page.waitForTimeout(300);
  await shot('appraise-archived');
}

/* 藏刀阁 + 共用卡 */
console.log('\n########## 6. 藏刀阁（T13 共用卡/筛选/比较） ##########');
await page.evaluate(async () => (await import('/src/ui/router.js')).default.go('workshop'));
await page.waitForTimeout(700);
await shot('workshop-collection');
const ws = await page.evaluate(() => ({
  cards: document.querySelectorAll('.blade-card-v2').length,
  controls: !!document.querySelector('.ws-collection-controls'),
  compareBtns: document.querySelectorAll('.bcv-compare-btn').length,
  hasLegacyCards: document.querySelectorAll('.blade-card:not(.blade-card-v2)').length,
}));
console.log('藏刀阁:', JSON.stringify(ws));
if (!ws.controls) note('WARN', 'workshop', '缺少筛选/排序控件（T13.4）');
if (ws.hasLegacyCards) note('WARN', 'workshop', '仍有旧卡结构（未统一到共用卡）');

/* 图鉴 */
console.log('\n########## 7. 图鉴（T12 目录/搜索） ##########');
await page.evaluate(async () => (await import('/src/ui/pages/workshop.js')).openTab('codex'));
await page.waitForTimeout(600);
await shot('workshop-codex');
const codex = await page.evaluate(() => ({
  groups: document.querySelectorAll('.codex-group').length,
  hasSearch: !!document.querySelector('.codex-search'),
  percent: document.querySelector('.card .row b')?.textContent,
  groupNames: [...document.querySelectorAll('.codex-group > summary b')].map((b) => b.textContent),
}));
console.log('图鉴:', JSON.stringify(codex));
if (!codex.hasSearch) note('ERR', 'workshop:codex', '缺少搜索框（T12）');
if (codex.groups < 9) note('WARN', 'workshop:codex', `分类只有 ${codex.groups} 个（应为 10）`);

/* 赛事 */
console.log('\n########## 8. 赛事（T06/T08 六流派） ##########');
await page.evaluate(async () => (await import('/src/ui/router.js')).default.go('arena'));
await page.waitForTimeout(800);
await shot('arena-hub');
const arena = await page.evaluate(() => ({
  branches: [...document.querySelectorAll('.hub-branch b')].map((b) => b.textContent),
  launch: document.querySelector('.hub-launch')?.textContent,
  note: document.querySelector('.hub-ready-note')?.textContent,
}));
console.log('赛事:', JSON.stringify(arena));

console.log('\n########## 汇总 ##########');
console.log('截图数:', shotNo, '→', OUT);
console.log('console errors:', errors.length ? errors.slice(0, 5) : '无');
const errs = findings.filter((f) => f.sev === 'ERR');
const warns = findings.filter((f) => f.sev === 'WARN');
console.log(`ERR ${errs.length} / WARN ${warns.length}`);
if (errs.length) errs.forEach((f) => console.log('  ERR:', f.where, f.what));
if (warns.length) warns.forEach((f) => console.log('  WARN:', f.where, f.what));

await browser.close();
process.exit(errs.length ? 1 : 0);
