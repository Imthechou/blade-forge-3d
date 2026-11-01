/**
 * 平台服务层 · 存档
 *
 * 职责单一：把一份 JSON 对象安全持久化，并在版本变化时迁移。
 * 它**不知道**存档里有什么字段 —— 结构定义与迁移规则由 core/progress 提供，
 * 这里只负责"读得到、写得进、跨版本不炸、后端可换"。
 *
 * 后端：浏览器 localStorage；无 localStorage 时退化为内存（小游戏/iOS 后续换成
 * wx.setStorageSync / 文件存储，只需替换 driver，上层不动）。
 */

import { env } from './env.js';
import { emit, EVENTS } from './bus.js';

const STORAGE_KEY = 'bladeforge.save';
export const SAVE_VERSION = 1;

const memoryDriver = (() => {
  let box = null;
  return {
    name: 'memory',
    read: () => box,
    write: (s) => { box = s; return true; },
    remove: () => { box = null; },
  };
})();

const localDriver = {
  name: 'localStorage',
  read: () => { try { return globalThis.localStorage.getItem(STORAGE_KEY); } catch (_) { return null; } },
  write: (s) => { try { globalThis.localStorage.setItem(STORAGE_KEY, s); return true; } catch (_) { return false; } },
  remove: () => { try { globalThis.localStorage.removeItem(STORAGE_KEY); } catch (_) {} },
};

export const driver = env.hasLocalStorage ? localDriver : memoryDriver;

// Browser-wide writer ownership plus a revision check for stale tabs.
const WRITER_LOCK = 'bladeforge.save.writer.v1';
let writerState = 'uninitialized', writerStart = null, releaseWriter = null;
let observedRevision = 0;
const revisionOf = value => Number.isSafeInteger(value?.saveRevision) && value.saveRevision >= 0 ? value.saveRevision : 0;

export function startWriterSession() {
  if (writerStart) return writerStart;
  if (driver !== localDriver || typeof globalThis.navigator?.locks?.request !== 'function') {
    writerState = 'revision-only';
    return Promise.resolve({ ok: true, mode: 'revision-only' });
  }
  writerStart = new Promise(resolve => {
    let settled = false;
    const done = value => { if (!settled) { settled = true; resolve(value); } };
    try {
      Promise.resolve(globalThis.navigator.locks.request(WRITER_LOCK, { mode: 'exclusive', ifAvailable: true }, async lock => {
        if (!lock) { writerState = 'blocked'; done({ ok: false, code: 'SAVE_IN_USE' }); return; }
        writerState = 'owner';
        done({ ok: true, mode: 'exclusive' });
        await new Promise(end => { releaseWriter = end; });
      })).catch(() => { writerState = 'blocked'; done({ ok: false, code: 'LOCK_UNAVAILABLE' }); });
    } catch (_) { writerState = 'blocked'; done({ ok: false, code: 'LOCK_UNAVAILABLE' }); }
  });
  return writerStart;
}

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('pagehide', () => {
    if (releaseWriter) { writerState = 'blocked'; releaseWriter(); releaseWriter = null; }
  });
  globalThis.addEventListener('pageshow', event => {
    if (event.persisted && writerState === 'blocked') globalThis.location?.reload?.();
  });
  globalThis.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    let actual = null;
    try { actual = event.newValue ? revisionOf(JSON.parse(event.newValue)) : 0; } catch (_) {}
    if (actual !== observedRevision) emit(EVENTS.SAVE_CONFLICT, { code: 'EXTERNAL_SAVE', actual, expected: observedRevision });
  });
}


/**
 * 注册迁移器。key = 从该版本升级到下一版本。
 * @type {Map<number, (data:object)=>object>}
 */
const migrations = new Map();

export function registerMigration(fromVersion, fn) {
  migrations.set(fromVersion, fn);
}

/** 创建一份空存档骨架（字段默认值由 core/progress 注册后填充） */
let factory = () => ({ version: SAVE_VERSION });

export function setDefaultsFactory(fn) {
  if (typeof fn === 'function') factory = fn;
}

export function defaults() {
  const d = factory();
  d.version = SAVE_VERSION;
  return d;
}

export function load() {
  const raw = driver.read();
  if (!raw) return defaults();
  let data;
  try { data = JSON.parse(raw); } catch (_) { backupCurrent(); return defaults(); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) { backupCurrent(); return defaults(); }
  const migrated = migrate(data);
  observedRevision = revisionOf(migrated);
  return migrated;
}

export function migrate(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('存档必须是 JSON 对象');
  if (Number(data.version) > SAVE_VERSION) throw new Error('此存档来自更新版本，请使用对应版本打开');
  const version = Number(data.version);
  let v = Number.isSafeInteger(version) && version >= 0 ? version : 0;
  let out = data;
  while (v < SAVE_VERSION) {
    const fn = migrations.get(v);
    out = fn ? fn(out) : { ...defaults(), ...out };
    v += 1;
    out.version = v;
  }
  return out;
}

export function save(data) {
  let ok = false, code = 'PERSIST_FAILED', expected = null, actual = null;
  try {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error('invalid save');
    if (writerState === 'blocked') code = 'SAVE_IN_USE';
    else {
      // Strict read: unreadable/corrupted data may never be treated as empty.
      const raw = driver === localDriver ? globalThis.localStorage.getItem(STORAGE_KEY) : driver.read();
      let current = null;
      if (raw != null) {
        try { current = JSON.parse(raw); } catch (_) { code = 'SAVE_CORRUPT'; }
        if (!current || typeof current !== 'object' || Array.isArray(current)) code = 'SAVE_CORRUPT';
      }
      expected = revisionOf(data);
      actual = revisionOf(current);
      if (code !== 'SAVE_CORRUPT') {
        if (expected !== actual || observedRevision !== actual) code = 'SAVE_CONFLICT';
        else if (actual === Number.MAX_SAFE_INTEGER) code = 'SAVE_REVISION_EXHAUSTED';
        else {
          const next = { ...data, version: SAVE_VERSION, saveRevision: actual + 1 };
          ok = driver.write(JSON.stringify(next)) === true;
          if (ok) { data.version = SAVE_VERSION; data.saveRevision = next.saveRevision; observedRevision = next.saveRevision; }
        }
      }
    }
  } catch (_) { code = 'PERSIST_FAILED'; }
  if (!ok && ['SAVE_IN_USE','SAVE_CORRUPT','SAVE_CONFLICT','SAVE_REVISION_EXHAUSTED'].includes(code))
    emit(EVENTS.SAVE_CONFLICT, { code, expected, actual });
  emit(ok ? EVENTS.SAVED : EVENTS.SAVE_FAILED, { driver: driver.name, code: ok ? null : code });
  return ok;
}

/** 修复前留一份原始文本；备份失败不覆盖主档，已有备份也不覆盖。 */
export function backupCurrent() {
  if (driver !== localDriver) return false;
  try {
    const key = STORAGE_KEY + '.recovery';
    const raw = driver.read();
    if (raw && !globalThis.localStorage.getItem(key)) globalThis.localStorage.setItem(key, raw);
    return true;
  } catch (_) { return false; }
}

export function reset() {
  const next = defaults();
  next.saveRevision = observedRevision;
  return save(next) ? next : null;
}

export function exportJson() {
  return JSON.stringify(load(), null, 2);
}

// 由核心注册的纯导入边界变换；平台仍不理解任何玩法字段。
let importBoundary = value => value;
export function setImportBoundary(fn) {
  if (typeof fn === 'function') importBoundary = fn;
}

export function importJson(text) {
  const parsed = JSON.parse(text);
  const data = importBoundary(migrate(parsed));
  // Imported revision belongs to the export, not the current active save.
  data.saveRevision = observedRevision;
  backupCurrent();
  if (!save(data)) throw new Error('保存失败，导入未生效，请重试');
  return data;
}

// National 的连续输入独立存储，绝不复用主档 driver 的单一 memory box。
const NATIONAL_CHECKPOINT_KEY = 'bladeforge.national-checkpoint.v1';
let nationalCheckpointMemory = null;
const checkpointDurability = () => env.hasLocalStorage ? 'persistent' : 'memory';
function checkpointReadRaw() {
  return env.hasLocalStorage ? globalThis.localStorage.getItem(NATIONAL_CHECKPOINT_KEY) : nationalCheckpointMemory;
}
function checkpointRemoveRaw() {
  if (env.hasLocalStorage) globalThis.localStorage.removeItem(NATIONAL_CHECKPOINT_KEY);
  else nationalCheckpointMemory = null;
}

export function readNationalCheckpoint() {
  let raw;
  try { raw = checkpointReadRaw(); }
  catch (_) { return { ok: false, code: 'CHECKPOINT_READ_FAILED' }; }
  if (raw == null) return { ok: true, value: null, durability: checkpointDurability() };
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid checkpoint');
    return { ok: true, value, durability: checkpointDurability() };
  } catch (_) {
    // 损坏数据逻辑丢弃；清理失败仍不能把它当成合法进度。
    let cleanupPending = false;
    try { checkpointRemoveRaw(); } catch (_) { cleanupPending = true; }
    return { ok: false, code: 'CHECKPOINT_CORRUPT', cleanupPending };
  }
}

export function writeNationalCheckpoint(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid checkpoint');
    const raw = JSON.stringify(value);
    // localStorage.setItem 是单 key 替换；失败时不删除旧值，也不降级到假持久化。
    if (env.hasLocalStorage) globalThis.localStorage.setItem(NATIONAL_CHECKPOINT_KEY, raw);
    else nationalCheckpointMemory = raw;
    return { ok: true, durability: checkpointDurability() };
  } catch (_) { return { ok: false, code: 'CHECKPOINT_WRITE_FAILED' }; }
}

export function clearNationalCheckpoint({ runId, matchId, bladeId, epoch, throughSeq } = {}) {
  let raw;
  try { raw = checkpointReadRaw(); }
  catch (_) { return { ok: false, code: 'CHECKPOINT_CLEAR_FAILED' }; }
  if (raw == null) return { ok: true, cleared: false };
  let value;
  try { value = JSON.parse(raw); }
  catch (_) { return { ok: false, code: 'CHECKPOINT_CLEAR_FAILED' }; }
  if (!value || value.runId !== runId || value.matchId !== matchId || value.bladeId !== bladeId
    || value.epoch !== epoch || !Number.isSafeInteger(value.seq) || value.seq < 1
    || !(Number.isSafeInteger(throughSeq) && throughSeq >= value.seq)) return { ok: true, cleared: false };
  try { checkpointRemoveRaw(); return { ok: true, cleared: true }; }
  catch (_) { return { ok: false, code: 'CHECKPOINT_CLEAR_FAILED' }; }
}

export default { load, save, reset, migrate, defaults, registerMigration, setDefaultsFactory, setImportBoundary, exportJson, importJson, driver, SAVE_VERSION, startWriterSession,
  readNationalCheckpoint, writeNationalCheckpoint, clearNationalCheckpoint };
