import test from 'node:test';
import assert from 'node:assert/strict';
const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key,value) => values.set(key,value),
  removeItem: key => values.delete(key)
};
const Storage = await import('../src/platform/storage.js');
const Progress = await import('../src/core/progress.js');
const { on, EVENTS } = await import('../src/platform/bus.js');
const key = 'bladeforge.save';

test('stale progress transaction cannot publish or replace remote rewards', () => {
  assert.ok(Progress.resetAll());
  const original = Progress.get();
  const remote = structuredClone(Storage.load());
  remote.cr += 70;
  assert.equal(Storage.save(remote), true);
  const previous = original.cr;
  const result = Progress.addCr(30, 'test:stale-tab');
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PERSIST_FAILED');
  assert.equal(original.cr, previous);
  assert.equal(Storage.load().cr, previous + 70);
  assert.equal(Progress.persist(), false);
  assert.equal(Progress.resetAll(), false);
});

test('two snapshots cannot both commit; stale write raises conflict', () => {
  const a = Storage.load(), b = structuredClone(a);
  const conflicts = [];
  const off = on(EVENTS.SAVE_CONFLICT, v => conflicts.push(v));
  a.cr += 31;
  assert.equal(Storage.save(a), true);
  assert.equal(a.saveRevision, b.saveRevision + 1);
  b.cr = 0;
  assert.equal(Storage.save(b), false);
  assert.equal(Storage.load().cr, a.cr);
  assert.equal(b.saveRevision, a.saveRevision - 1);
  assert.equal(conflicts.at(-1)?.code, 'SAVE_CONFLICT');
  off();
});

test('corrupt existing disk save fails closed', () => {
  const clean = values.get(key);
  const snap = Storage.load();
  values.set(key, '{invalid');
  assert.equal(Storage.save(snap), false);
  assert.equal(values.get(key), '{invalid');
  values.set(key, clean);
});

test('legacy save without revision upgrades safely', () => {
  values.set(key, JSON.stringify({ version: 1, cr: 45, collection: [] }));
  const loaded = Storage.load();
  assert.equal(loaded.saveRevision, undefined);
  assert.equal(Storage.save(loaded), true);
  assert.equal(Storage.load().saveRevision, 1);
  assert.equal(Storage.load().cr, 45);
});
