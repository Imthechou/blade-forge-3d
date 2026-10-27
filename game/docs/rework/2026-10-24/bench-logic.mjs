/**
 * 桌面可复现耗时采样（rework T15 部分证据）
 *
 * ⚠ 严格说明范围 —— 这份数据**只**测「纯逻辑」耗时：
 *     选卡抽取、成刀适配、分项计分、赛事构建、图鉴进度视图。
 *   它**不是**：
 *     · 移动设备帧率（需真机）
 *     · 渲染/GPU 首帧耗时（需浏览器 + WebGL 采样）
 *     · P95 选卡预览延迟（需真实浏览器布局与合成）
 *   这些仍未测，见 STATUS.md 剩余项。
 *
 * 运行：node docs/rework/2026-10-24/bench-logic.mjs
 */

import * as Forge from '../../../src/core/forge.js';
import * as Adapter from '../../../src/core/bladeAdapter.js';
import * as TestScoring from '../../../src/core/testScoring.js';
import * as ArenaFormal from '../../../src/core/arenaFormal.js';
import * as Catalog from '../../../src/data/codexCatalog.js';

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const fmt = (v) => `${v.toFixed(3)}ms`;

function bench(label, iterations, fn) {
  // warmup
  for (let i = 0; i < Math.min(20, iterations); i++) fn(i);
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn(i);
    times.push(performance.now() - t0);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  console.log(
    label.padEnd(34),
    'n=' + String(iterations).padStart(4),
    '| avg', fmt(avg).padStart(9),
    '| p50', fmt(pct(times, 50)).padStart(9),
    '| p95', fmt(pct(times, 95)).padStart(9),
    '| max', fmt(Math.max(...times)).padStart(9),
  );
  return { avg, p50: pct(times, 50), p95: pct(times, 95), max: Math.max(...times) };
}

const blade = (stats, extra = {}) => ({
  id: 'B-bench', bladeName: 'Bench', knifeTypeId: 'saber',
  stats, score: 400, rarity: 'epic', rarityName: '史诗',
  fractured: false, canEnterArena: true,
  traits: [], combos: [], tags: {}, tagTiers: [], arenaHistory: [],
  ...extra,
});

const stats100 = { strength: 100, toughness: 100, sharpness: 100, craft: 100, design: 100, spirit: 100 };
const stats256 = { strength: 256, toughness: 256, sharpness: 256, craft: 256, design: 256, spirit: 256 };

console.log('=== 逻辑耗时（桌面 Node，非移动帧率） ===\n');

/* 1. 选卡抽取（含解锁加权） */
bench('candidate roll (3 cards)', 2000, (i) =>
  Forge.createRun({ seed: 5000 + i, unlockedCardIds: ['MAT01', 'MAT02'] }));

/* 2. 成刀 → 测试能力适配 */
const b100 = blade(stats100);
const b256 = blade(stats256);
bench('adaptBlade (stats 100)', 3000, () => Adapter.adaptBlade(b100));
bench('adaptBlade (stats 256)', 3000, () => Adapter.adaptBlade(b256));

/* 3. 分项计分（单场 3 项） */
const view = Adapter.adaptBlade(b100);
bench('test session (3 projects)', 1000, () => {
  const s = TestScoring.createTestSession({ view, tests: ['cutting', 'strength', 'precision'] });
  for (const t of ['cutting', 'strength', 'precision']) {
    TestScoring.settleTest(s, view, { kind: t, measure: 0.8 });
    TestScoring.advance(s);
  }
  TestScoring.aggregate(s);
});

/* 4. 赛事构建（六流派） */
const branches = ['press', 'edge', 'precise', 'quench', 'composite', 'overload'];
bench('createFormalMatch (school)', 1000, (i) => {
  ArenaFormal.createFormalMatch({
    blade: b100, tier: 'school',
    styleId: branches[i % branches.length], gradient: i % 5, seed: 900 + i,
  });
});

/* 5. 图鉴进度视图（460 项） */
bench('codex progress view', 300, () => Catalog.codexProgressView({}));

/* 6. 全国赛五轮全通（逻辑） */
bench('national 5 rounds full', 200, (i) => {
  const nat = ArenaFormal.createNationalMatch({ blade: b100, seed: 700 + i });
  const m = nat.match;
  const hero = b100;
  let guard = 0;
  while (!m.done && guard++ < 40) {
    const round = ArenaFormal.nationalCurrentRound(m);
    if (round.status === 'pending') ArenaFormal.nationalStartRound(m, [hero]);
    const res = ArenaFormal.nationalSubmit(m, { measure: 0.85 });
    if (!res.ok || res.done) break;
  }
});

console.log('\n注：以上为纯逻辑耗时；渲染、布局与移动帧率未测（见 STATUS.md）。');
