import test from 'node:test';
import assert from 'node:assert/strict';

const entries = new Map();
let failWrites = false;
globalThis.localStorage = {
  getItem: key => entries.get(key) ?? null,
  setItem(key, value) { if (failWrites) throw new Error('quota exceeded'); entries.set(key, value); },
  removeItem: key => entries.delete(key),
};
const P = await import('../src/core/progress.js');
const Storage = await import('../src/platform/storage.js');
const { on, EVENTS } = await import('../src/platform/bus.js');
const { createRun } = await import('../src/core/forge.js');
const { appraise } = await import('../src/core/appraise.js');
const key = 'bladeforge.save';

function fresh() {
  failWrites = false;
  // Tests previously erased localStorage behind Progress's live cache, which
  // now (correctly) looks like a conflicting external write. Rebase the test
  // fixture explicitly, then use the production versioned reset path.
  Object.assign(P.get(), Storage.load());
  assert.ok(P.resetAll());
  entries.delete(key + '.recovery');
}

test('保存失败不发布奖励；恢复后重试只加一次', () => {
  fresh();
  const original = JSON.stringify(P.get());
  let failures = 0;
  const off = on(EVENTS.SAVE_FAILED, () => failures++);
  failWrites = true;
  assert.equal(P.addCr(10).code, 'PERSIST_FAILED');
  assert.equal(JSON.stringify(P.get()), original);
  assert.equal(entries.get(key), original);
  assert.equal(failures, 1);
  failWrites = false;
  assert.equal(P.addCr(10).cr, 60);
  assert.equal(JSON.parse(entries.get(key)).cr, 60);
  off();
});

test('旧档字段归一化保留有效刀具、未知字段及完整历史', () => {
  const saved = P.normalizeSave({ version: 1, cr: 123, custom: { keep: true }, collection: [null, {
    id: 'legacy-blade', bladeName: '旧刀', score: 100, stats: { strength: 66 }, traits: null, history: ['MAT01'], customBlade: 7,
  }], stats: null, arena: { school: { one: null }, national: null }, codex: { card: null }, daily: { tasks: null } });
  assert.equal(saved.collection.length, 1);
  assert.equal(saved.collection[0].stats.strength, 66);
  assert.equal(saved.collection[0].customBlade, 7);
  assert.deepEqual(saved.collection[0].history, ['MAT01']);
  assert.deepEqual(saved.collection[0].traits, []);
  assert.equal(saved.cr, 123);
  assert.equal(saved.custom.keep, true);
  assert.deepEqual(saved.arena.school.one.cleared, []);
  assert.equal(saved.stats.bestScore, 0);
  assert.ok(saved.daily.tasks.length);
  assert.deepEqual(P.normalizeSave({ collection: null }).collection, []);
});

test('改名、代表作、断刀和设置均在写盘成功后生效', () => {
  fresh();
  P.get().collection.push({ id: 'blade', bladeName: '原名', stats: {}, score: 10 });
  P.persist();
  const before = JSON.stringify(P.get());
  failWrites = true;
  assert.equal(P.renameBlade('blade', '新名'), false);
  assert.equal(P.setShowcase('blade'), false);
  assert.equal(P.fractureBlade('blade').code, 'PERSIST_FAILED');
  P.updateSettings({ sound: false });
  assert.equal(JSON.stringify(P.get()), before);
  failWrites = false;
  assert.equal(P.renameBlade('blade', '新名'), true);
  assert.equal(P.bladeById('blade').bladeName, '新名');
  assert.equal(P.setShowcase('blade'), true);
  assert.equal(P.fractureBlade('blade').ok, true);
  assert.equal(P.get().collection.length, 0);
  assert.equal(P.get().fractured[0].bladeName, '新名');
});

test('鉴定归档失败可以重试，不重复加奖励与锻造次数', () => {
  fresh();
  const run = createRun({ seed: 123 });
  run.fractured = true;
  const record = appraise(run);
  const before = JSON.stringify(P.get());
  failWrites = true;
  assert.equal(P.archive(record).code, 'PERSIST_FAILED');
  assert.equal(JSON.stringify(P.get()), before);
  failWrites = false;
  assert.equal(P.archive(record).ok, true);
  assert.equal(P.get().stats.forgeCount, 1);
  assert.equal(P.get().fractured.length, 1);
  assert.ok(P.get().cr >= 60); // 首锻成就可能另有奖励。
  const balance = P.get().cr;
  assert.equal(P.archive(record).duplicate, true);
  assert.equal(P.get().cr, balance);
  assert.equal(P.get().stats.forgeCount, 1);
});

test('赛事结算失败不改胜负，重试后 matchId 幂等', () => {
  fresh();
  const args = { win: false, matchId: 'match-test' };
  failWrites = true;
  assert.equal(P.recordMatch('school', args).code, 'PERSIST_FAILED');
  assert.equal(P.get().arena.matchLosses, 0);
  failWrites = false;
  const settled = P.recordMatch('school', args);
  const balance = P.get().cr;
  assert.ok(settled.cr > 0);
  assert.equal(P.recordMatch('school', args).duplicate, true);
  assert.equal(P.get().arena.matchLosses, 1);
  assert.equal(P.get().cr, balance);
});

/* ★ 2026-10-24：原「每日奖励失败不锁定领取，成功后防止重复领取」测试已删除。
   它断言的 `P.claimDailyBonus()` / `save.daily.allBonusClaimed` 随
   首页「今日目标」抽屉与全勤 50 CR 一并移除（用户确认）。
   单项任务奖励（40/40/50）仍由 core/events.settle 自动发放，
   对应口径由下方「事件幂等」相关断言覆盖。 */

test('全国赛逐轮补奖与整场履历原子写入且幂等', () => {
  fresh();
  const args = { win: false, matchId: 'slice-national', rewardTarget: 230 };
  const before = JSON.stringify(P.get());
  failWrites = true;
  assert.equal(P.recordMatch('national', args).code, 'PERSIST_FAILED');
  assert.equal(JSON.stringify(P.get()), before);
  failWrites = false;
  assert.equal(P.recordMatch('national', args).cr, 230);
  assert.equal(P.get().arena.history[0].reward, 230);
  const balance = P.get().cr;
  assert.equal(P.recordMatch('national', args).duplicate, true);
  assert.equal(P.get().cr, balance);
});

test('导入拒绝非法根节点和未来版本，写入失败不报告成功', () => {
  fresh();
  const original = entries.get(key);
  for (const text of ['null', '[]', '42', '{"version":999}']) assert.throws(() => Storage.importJson(text));
  assert.equal(entries.get(key), original);
  failWrites = true;
  assert.throws(() => Storage.importJson('{"version":1,"cr":900}'), /保存失败/);
  assert.equal(entries.get(key), original);
  failWrites = false;
  Storage.importJson('{"version":1,"cr":900,"collection":null}');
  assert.equal(JSON.parse(entries.get(key)).cr, 900);
  assert.deepEqual(JSON.parse(entries.get(key)).collection, []);
  assert.equal(Storage.migrate({ version: '-Infinity', cr: 75 }).cr, 75);
});

test('损坏 JSON 备份原文本，序列化异常返回失败', () => {
  fresh();
  entries.set(key, '{broken');
  assert.equal(Storage.load().cr, 50);
  assert.equal(entries.get(key + '.recovery'), '{broken');
  const circular = {}; circular.self = circular;
  assert.equal(Storage.save(circular), false);
  assert.equal(entries.get(key), '{broken');
});
