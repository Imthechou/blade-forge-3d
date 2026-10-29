import test from 'node:test';
import assert from 'node:assert/strict';
import { getStudioEnv, studioEnvInfo, releaseStudioEnv } from '../src/render/v2/studioEnv.js';

test('PMREM studio reflections belong to each renderer, never shared across WebGL contexts', () => {
  const previous = globalThis.THREE;
  let serial = 0;
  const disposed = new Set();
  globalThis.THREE = {
    RGBAFormat: 'rgba', HalfFloatType: 'half', LinearSRGBColorSpace: 'linear-srgb',
    EquirectangularReflectionMapping: 'equirect', LinearFilter: 'linear',
    DataUtils: { toHalfFloat: () => 0x3c00 },
    DataTexture: class {
      constructor(data) { this.image = {data}; }
      dispose() {}
    },
    PMREMGenerator: class {
      constructor(renderer) { this.renderer = renderer; }
      compileEquirectangularShader() {}
      fromEquirectangular() {
        const token = ++serial;
        return {
          texture: { renderer: this.renderer, token },
          dispose: () => disposed.add(token),
        };
      }
      dispose() {}
    },
  };
  try {
    const main = {name: 'main'}, thumbs = {name: 'archive-thumbnails'}, detail = {name: 'archive-detail'};
    const first = getStudioEnv(main);
    assert.equal(getStudioEnv(main), first, 'repeat render on same context should reuse PMREM');
    const second = getStudioEnv(thumbs);
    const third = getStudioEnv(detail);
    assert.notEqual(first, second, 'separate GPU contexts must never share a render target texture');
    assert.notEqual(second, third, 'each detail stage owns its own reflection texture');
    assert.equal(second.renderer, thumbs);
    assert.equal(studioEnvInfo().contexts, 3);
    assert.equal(releaseStudioEnv(detail), true);
    assert.equal(disposed.has(third.token), true);
    assert.equal(disposed.has(first.token), false, 'closing detail must not destroy main lighting');
    assert.equal(disposed.has(second.token), false, 'closing detail must not destroy thumbnail lighting');
    assert.equal(getStudioEnv(thumbs), second);
    assert.equal(releaseStudioEnv(thumbs), true);
    assert.notEqual(getStudioEnv(thumbs), second, 'remount after dispose must rebuild for that context');
  } finally {
    releaseStudioEnv();
    globalThis.THREE = previous;
  }
});
