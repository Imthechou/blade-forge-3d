/**
 * 平台服务层 · 音频
 *
 * 全部音效由 WebAudio 实时合成 —— 不依赖任何音频资源文件，
 * 省掉 小游戏/App 的包体与加载问题，迁移时替换为宿主 API 即可。
 *
 * 设计约束（设定文档 §29）：只有开关与音量，不做复杂音频系统。
 */

import { env } from './env.js';

let ctx = null;
let master = null;
const state = { enabled: true, volume: 0.6 };

function ensure() {
  if (ctx) return ctx;
  if (!env.hasWebAudio) return null;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = state.enabled ? state.volume : 0;
  master.connect(ctx.destination);
  return ctx;
}

/** 浏览器要求首次用户手势后才能出声 */
export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function setEnabled(v) {
  state.enabled = !!v;
  if (master) master.gain.value = state.enabled ? state.volume : 0;
}

export function setVolume(v) {
  state.volume = Math.min(1, Math.max(0, Number(v) || 0));
  if (master && state.enabled) master.gain.value = state.volume;
}

export const settings = () => ({ ...state });

/** 基础音：一个振荡器 + 包络 */
function tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.3, sweepTo = null, delay = 0 }) {
  const c = ensure();
  if (!c || !state.enabled) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.015, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

/** 噪声脉冲：锤击、火花、断裂的"撞击"成分 */
function noise({ dur = 0.18, gain = 0.35, lowpass = 1800, delay = 0 }) {
  const c = ensure();
  if (!c || !state.enabled) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(lp); lp.connect(g); g.connect(master);
  src.start(t0);
}

/** 音效表：语义化命名，业务层只调 play('hammer') */
const SFX = {
  tap: () => tone({ freq: 520, dur: 0.05, type: 'triangle', gain: 0.14 }),
  select: () => tone({ freq: 660, dur: 0.07, type: 'triangle', gain: 0.16 }),
  confirm: () => { tone({ freq: 523, dur: 0.09, type: 'triangle', gain: 0.2 }); tone({ freq: 784, dur: 0.12, type: 'triangle', gain: 0.16, delay: 0.07 }); },
  reroll: () => tone({ freq: 300, dur: 0.16, type: 'sawtooth', gain: 0.12, sweepTo: 620 }),
  hammer: () => { noise({ dur: 0.14, gain: 0.4, lowpass: 2400 }); tone({ freq: 150, dur: 0.1, type: 'square', gain: 0.16, sweepTo: 80 }); },
  spark: () => noise({ dur: 0.1, gain: 0.22, lowpass: 5200 }),
  riskUp: () => tone({ freq: 220, dur: 0.14, type: 'sawtooth', gain: 0.12, sweepTo: 160 }),
  riskSafe: () => tone({ freq: 440, dur: 0.12, type: 'sine', gain: 0.16, sweepTo: 560 }),
  fracture: () => {
    noise({ dur: 0.4, gain: 0.5, lowpass: 1200 });
    tone({ freq: 180, dur: 0.5, type: 'sawtooth', gain: 0.24, sweepTo: 40 });
  },
  trait: () => { tone({ freq: 659, dur: 0.1, type: 'sine', gain: 0.18 }); tone({ freq: 988, dur: 0.16, type: 'sine', gain: 0.14, delay: 0.09 }); },
  combo: () => { tone({ freq: 523, dur: 0.1, type: 'sine', gain: 0.16 }); tone({ freq: 659, dur: 0.1, gain: 0.16, delay: 0.08 }); tone({ freq: 1046, dur: 0.22, type: 'sine', gain: 0.18, delay: 0.16 }); },
  reveal: () => tone({ freq: 330, dur: 0.5, type: 'sine', gain: 0.18, sweepTo: 880 }),
  win: () => { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.16, delay: i * 0.09 })); },
  lose: () => { [440, 392, 330].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.14, delay: i * 0.11 })); },
};

export function play(name) {
  const fn = SFX[name];
  if (!fn) return;
  try { fn(); } catch (_) { /* 音频失败绝不影响玩法 */ }
}

export const list = () => Object.keys(SFX);

export default { play, list, setEnabled, setVolume, settings, unlock };
