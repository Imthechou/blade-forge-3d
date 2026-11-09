import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadPlaywright, browserExecutable } from './lib/browser.mjs';

const { chromium } = await loadPlaywright();
const base = process.env.FORGE_URL || 'http://127.0.0.1:8123/';
const out = path.resolve(process.env.FORGE_QA_OUT || 'v19-acceptance');
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(), args: ['--no-sandbox', '--disable-dev-shm-usage',
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' };
const errors = [];
const audit = page => {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
};

async function runFlow() {
  const context = await browser.newContext(mobile);
  const page = await context.newPage();
  audit(page);
  const cdp = await context.newCDPSession(page);
  await page.addInitScript(() => {
    window.drawCount = 0;
    const draw = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (...args) {
      window.drawCount++;
      return draw.apply(this, args);
    };
  });
  const shot = name => page.screenshot({ path: path.join(out, name + '.png') });
  const forge = name => page.locator(`[data-action="${name}"]`);
  const arena = name => page.locator(`[data-arena-action="${name}"]`);
  const save = () => page.evaluate(() => JSON.parse(localStorage.getItem('bladeforge.save')));
  try {
    await page.goto(base);
    await page.getByRole('button', { name: '开始锻刀' }).waitFor();
    await page.waitForFunction(() => window.drawCount > 0);
    await shot('01-home');
    await page.getByRole('button', { name: '开始锻刀' }).tap();
    await page.waitForFunction(() => document.querySelectorAll('.ore-thumbnail.is-loaded').length === 3);
    await shot('02-ore');
    await forge('inspect-light').tap();
    await forge('window-ore').tap();
    await forge('buy').tap();
    await forge('to-refine').tap();
    const heat = page.locator('#heat-button');
    const bounds = await heat.boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{
      x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2,
    }] });
    await page.waitForFunction(() => parseInt(document.getElementById('heat-number')?.textContent) >= 64);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => document.getElementById('heat-step')?.textContent === '熔球稳温');
    await shot('03-refine');
    await page.reload();
    await heat.focus();
    assert.match(await heat.textContent(), /续炼/);
    await page.keyboard.down('Space');
    let blowing = true;
    for (let i = 0; i < 300; i++) {
      const data = await page.evaluate(() => {
        const get = id => document.getElementById(id);
        return {
          mode: get('stage').dataset.mode, temp: parseInt(get('heat-number')?.textContent),
          low: Number(get('thermo')?.dataset.lower), high: Number(get('thermo')?.dataset.upper),
          quality: parseInt(get('heat-quality')?.textContent), step: get('heat-step')?.textContent,
        };
      });
      if (data.mode !== 'refine' || data.quality >= 65) break;
      const target = data.step === '原石升温' ? 67 : (data.low + data.high) / 2;
      const next = blowing ? data.temp < target - 1 : data.temp < target - 2;
      if (next !== blowing) {
        await page.keyboard[next ? 'down' : 'up']('Space');
        blowing = next;
      }
      await page.waitForTimeout(35);
    }
    if (blowing) await page.keyboard.up('Space');
    if (await forge('pour-refine').isEnabled()) await forge('pour-refine').tap();
    await page.locator('#stage[data-mode="forge"]').waitFor();
    await page.locator('#scene').focus();
    for (let hit = 1; hit <= 6; hit++) {
      await page.keyboard.press('Space');
      await page.waitForFunction(count => parseInt(document.getElementById('hit-count')?.textContent) >= count, hit);
      await page.waitForTimeout(260);
    }
    await shot('04-forge');
    await forge('finish').tap();
    await forge('select-fit').first().tap();
    await forge('focus-grip').tap();
    await page.waitForTimeout(400);
    await shot('05-fit');
    await forge('appraise').tap();
    await page.locator('#stage[data-mode="appraise"]').waitFor();
    await page.waitForTimeout(700);
    await shot('06-appraise');
    const forged = await save();
    assert.equal(forged.collection.length, 1);
    assert.equal(forged.workshopV41.xp, 10);
    const blade = forged.collection[0];
    await page.reload();
    await forge('open-collection').tap();
    await page.locator('.blade-card-v2').first().tap();
    await page.locator('.blade-detail-stage canvas').waitFor();
    await page.locator('.blade-detail-stage-status').waitFor({ state: 'detached' });
    await shot('07-collection');
    await page.getByRole('button', { name: '12秒短试刀' }).tap();
    await arena('mode').and(page.locator('[data-value="school"]')).tap();
    await shot('08-lobby');
    assert.equal(await page.locator('[data-blade-slot="0"]').inputValue(), blade.id);
    await arena('register').tap();
    const enrolled = (await save()).v19.arena.active.id;
    await page.reload();
    await arena('continue').tap();
    assert.equal((await save()).v19.arena.active.id, enrolled);
    await arena('strike-start').tap();
    await arena('pause').tap();
    await arena('resume').tap();
    const canvas = page.locator('.trial-frame canvas');
    const box = await canvas.boundingBox();
    await shot('09-arena');
    for (let swipe = 0; swipe < 24 && await canvas.isVisible(); swipe++) {
      const y = Math.round(box.y + box.height * (swipe % 2 ? .466 : .49));
      const x0 = Math.round(box.x + 6);
      const span = Math.round(box.width - 12);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
      for (let segment = 1; segment <= 8; segment++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + span * segment / 8, y }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      if (swipe === 2) await shot('10-strike');
      await page.waitForTimeout(145);
    }
    await page.locator('.arena-report').waitFor({ timeout: 46_000 });
    const after = await save();
    assert.equal(after.v19.arena.active, null);
    assert.deepEqual(after.collection[0].stats, blade.stats);
    assert.equal(after.arena.history.at(-1).v19.report.win, true);
    assert.ok(after.cr > forged.cr && after.workshopV41.xp > forged.workshopV41.xp);
    assert.ok(after.collection[0].projectRecords.cutting.score > 0);
    await shot('11-result');
    await page.reload();
    assert.equal((await save()).arena.history.at(-1).v19.report.win, true);
    console.log('390×844 · 选料、控温续炼、锻打、鉴定、藏刀、触控赛事、结算刷新通过');
  } finally {
    await context.close();
  }
}

async function smallScreens() {
  for (const [width, height] of [[320, 568], [360, 640], [430, 932]]) {
    const context = await browser.newContext({ ...mobile, viewport: { width, height } });
    const page = await context.newPage();
    audit(page);
    try {
      await page.goto(new URL('#/arena', base).href);
      await page.locator('.arena-hero').waitFor();
      assert.equal(await page.locator('.page.is-active').evaluate(node => node.scrollWidth <= node.clientWidth), true);
      await page.locator('[data-arena-action="loan"]').tap();
      await page.locator('[data-arena-action="strike-start"]').tap();
      const stage = await page.locator('.trial-frame').boundingBox();
      const bottom = await page.locator('.trial-bottom').boundingBox();
      assert.ok(bottom.y >= stage.y && bottom.y + bottom.height < stage.y + stage.height);
      assert.ok(bottom.y + bottom.height <= height);
      await page.screenshot({ path: path.join(out, `trial-${width}x${height}.png`) });
      console.log(`${width}×${height} · 大厅无横向溢出，开赛后底部耐久栏完整可见`);
    } finally {
      await context.close();
    }
  }
}

try {
  await runFlow();
  await smallScreens();
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
