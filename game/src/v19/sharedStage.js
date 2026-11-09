import { ForgeStage } from './stage.js';
import { FITS } from './forge.js';
import { motion } from '../platform/index.js';

let stage;
let host;
let canvas;

motion.subscribe(reduced => { if (stage) stage.reduceMotion = reduced; });

export function attachForgeStage(next, initialModels) {
  canvas ??= Object.assign(document.createElement('canvas'), { id: 'scene', tabIndex: 0 });
  canvas.className = 'v19-canvas';
  canvas.setAttribute('aria-label', '3D 刀具与原料预览');
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
    if (!event.isPrimary) return;
    canvas.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, { signal });
  canvas.addEventListener('pointermove', event => {
    if (pointer?.id !== event.pointerId) return;
    stage.turn(event.clientX - pointer.x, event.clientY - pointer.y);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, { signal });
  canvas.addEventListener('lostpointercapture', () => { pointer = null; }, { signal });
  stage.turnX = stage.turnY = 0;
  const phase = fractured ? 'broken' : 'appraise';
  const ready = stage.sync({ ...visual, phase }, visual.ore, FITS.find(item => item.id === visual.fit));
  const close = () => { abort.abort(); releaseForgeStage(host); };
  return { close, ready: Promise.resolve(ready ?? true) };
}
