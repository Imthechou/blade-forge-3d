/** Same-origin Chromium multi-tab verification; actual Web Locks and storage events. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { loadPlaywright, browserExecutable, baseUrl } from './lib/browser.mjs';
const out = path.resolve('unified-ux-evidence');
fs.mkdirSync(out, { recursive: true });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable(),
  args: ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--ignore-gpu-blocklist'] });
const findings = { errors: [], checks: [] };
let context;
try {
  context = await browser.newContext({ viewport: { width: 375, height: 667 }, locale: 'zh-CN' });
  await context.addInitScript(() => {
    const key = 'bladeforge.save';
    if (!localStorage.getItem(key))
      localStorage.setItem(key, JSON.stringify({ version: 1, cr: 500, settings: { tutorialSeen: true, sound: false, motion: 'reduced' } }));
  });
  const first = await context.newPage();
  first.on('pageerror', e => findings.errors.push('first: ' + String(e)));
  await first.goto(baseUrl);
  await first.waitForFunction(() => !!globalThis.__FORGE_PREP, null, { timeout: 120000 });
  assert.equal(await first.evaluate(() => !!navigator.locks?.request), true, 'Web Locks must be available for exclusive-writer test');
  findings.checks.push('first tab acquired writer');
  const second = await context.newPage();
  second.on('pageerror', e => findings.errors.push('second: ' + String(e)));
  await second.goto(baseUrl);
  await second.locator('#saveConflictOverlay').waitFor({ timeout: 45000 });
  assert.equal(await second.locator('#saveConflictOverlay button').innerText(), '重新载入存档');
  await second.screenshot({ path: path.join(out,'save-multitab-locked.png') });
  findings.checks.push('second tab blocked with actionable message');
  const diskBefore = await first.evaluate(() => localStorage.getItem('bladeforge.save'));
  const blocked = await second.evaluate(async () => {
    const Storage = await import('/src/platform/storage.js');
    const snapshot = Storage.load(); snapshot.cr = 1;
    return Storage.save(snapshot);
  });
  assert.equal(blocked, false, 'blocked second tab must not save');
  assert.equal(await first.evaluate(() => localStorage.getItem('bladeforge.save')), diskBefore);
  findings.checks.push('blocked tab cannot overwrite current save');
  await first.close();
  await second.waitForFunction(async () => {
    const locks = await navigator.locks.query();
    return !locks.held.some(lock => lock.name === 'bladeforge.save.writer.v1');
  }, null, { timeout: 15000 });
  await second.reload();
  await second.waitForFunction(() => !!globalThis.__FORGE_PREP && !document.querySelector('#saveConflictOverlay'), null, { timeout: 120000 });
  findings.checks.push('reopened tab acquires writer after original closes');
  const stale = await second.evaluate(async () => {
    const Storage = await import('/src/platform/storage.js');
    const old = Storage.load(), newer = structuredClone(old);
    newer.cr += 31;
    const firstWrite = Storage.save(newer);
    const secondWrite = Storage.save(old);
    return { firstWrite, secondWrite, actual: Storage.load().cr, expected: newer.cr };
  });
  assert.equal(stale.firstWrite,true);
  assert.equal(stale.secondWrite,false);
  assert.equal(stale.actual,stale.expected);
  await second.locator('#saveConflictOverlay').waitFor({ timeout: 3000 });
  findings.checks.push('old revision rejects a stale write and alerts the player');
  assert.deepEqual(findings.errors,[]);
  fs.writeFileSync(path.join(out,'save-multitab-report.json'), JSON.stringify(findings,null,2));
  console.log('PASS cross-tab writer and revision protection',findings.checks);
} finally {
  fs.writeFileSync(path.join(out,'save-multitab-report.json'), JSON.stringify(findings,null,2));
  await context?.close();
  await browser.close();
}
