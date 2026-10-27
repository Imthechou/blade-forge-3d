import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { createGameServer, projectId } = createRequire(import.meta.url)('../serve.cjs');

test('HTTP 首页、模块、健康检查、缓存和访问边界', async () => {
  const server = createGameServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(base);
    assert.equal(home.status, 200);
    assert.match(await home.text(), /bootstrap.js/);
    const unchanged = await fetch(base, { headers: { 'If-None-Match': home.headers.get('etag') } });
    assert.equal(unchanged.status, 304);
    const script = await fetch(base + '/src/app/bootstrap.js');
    assert.match(script.headers.get('content-type'), /javascript/);
    assert.equal((await fetch(base + '/__bladeforge_health').then(r => r.json())).projectId, projectId);
    assert.equal((await fetch(base + '/.workbuddy/private')).status, 403);
    assert.equal((await fetch(base + '/missing-file')).status, 404);
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.equal((await fetch(base, { method: 'HEAD' })).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
