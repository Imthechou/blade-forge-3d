import { ForgeStage } from './stage.js';
import { FITS } from './forge.js';
import { motion } from '../platform/index.js';
import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

let stage;
let host;
let canvas;

motion.subscribe(reduced => { if (stage) stage.reduceMotion = reduced; });

export function attachForgeStage(next, initialModels) {
  if (!canvas) {
    canvas = Object.assign(document.createElement('canvas'), { id: 'scene', tabIndex: 0 });
    canvas.addEventListener('keydown', event => {
      const angles = { ArrowLeft: [-14, 0], ArrowRight: [14, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
      if (event.key === 'Home') stage.resetView();
      else if (angles[event.key]) stage.turn(...angles[event.key]);
      else return;
      event.preventDefault();
    });
  }
  canvas.className = 'v19-canvas';
  canvas.setAttribute('aria-label', '3D 预览，方向键旋转，Home 键复位');
  next.prepend(canvas);
  try {
    stage ??= new ForgeStage(canvas, initialModels);
    stage.reduceMotion = motion.reduced();
    host = next;
    stage.setRendering(true);
    stage.resize();
    return stage;
  } catch (error) {
    canvas.remove();
    throw error;
  }
}

export function releaseForgeStage(owner) {
  if (host !== owner) return;
  stage.setRendering(false);
  canvas.remove();
  host = null;
}

export function showForgedBlade(host, visual, { fractured = false } = {}) {
  const stage = attachForgeStage(host);
  const canvas = stage.canvas;
  const abort = new AbortController();
  const { signal } = abort;
  let pointer;
  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, { signal });
  canvas.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    stage.turn(event.clientX - pointer.x, event.clientY - pointer.y);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, { signal });
  canvas.addEventListener('lostpointercapture', () => { pointer = null; }, { signal });
  const controls = el('div', { class: 'blade-view-controls' }, [
    el('span', { text: '拖动旋转' }),
    el('button', { type: 'button', class: 'blade-reset', title: '复位视角', 'aria-label': '复位视角',
      onclick: () => stage.resetView() }, [icon('refresh')]),
  ]);
  host.dataset.preview = 'blade';
  host.append(controls);
  stage.resetView();
  const phase = fractured ? 'broken' : 'appraise';
  const ready = stage.sync({ ...visual, phase }, visual.ore, FITS.find(item => item.id === visual.fit));
  const close = () => {
    abort.abort();
    controls.remove();
    delete host.dataset.preview;
    releaseForgeStage(host);
  };
  return { close, ready: Promise.resolve(ready ?? true) };
}
