/**
 * 平台服务层 · 音频
 *
 * 轻量混合：WebAudio 合成是全面回退；首次手势后预载小体积 Kenney
 * CC0 真实击断瞬态。解码和下载均不阻塞触控、赛事时钟与原有声音。
 *
 * 设计约束（设定文档 §29）：只有开关与音量，不做复杂音频系统。
 */

import { env } from './env.js';

let ctx = null;
let master = null;
let sharedNoise = null;
let sharedNoiseContext = null;
const state = { enabled: true, volume: 0.6 };

/* Five verified Kenney Impact Sounds CC0 OGG recordings. Rope retains its
 * original dry synthesized fiber to avoid a mismatched heavy punch sample.
 * Provenance and exact SHA-1s: assets/audio/kenney/LICENSE.md. */
export const CUT_SAMPLE_ASSETS=Object.freeze({
  soft:'impactSoft_heavy_000.ogg',
  wood:'impactWood_heavy_000.ogg',
  plastic:'impactPlate_medium_000.ogg',
  ice:'impactGlass_heavy_000.ogg',
  metal:'impactMetal_medium_000.ogg',
});
const cutSamples=new Map();
let cutSamplesContext=null,cutSamplesPromise=null;
export const cutSampleStatus=()=>({loaded:[...cutSamples.keys()],files:Object.keys(CUT_SAMPLE_ASSETS).length});
export function preloadCutSamples(){
  const c=state.enabled?ensure():null;
  if(!c||typeof globalThis.fetch!=='function'||typeof c.decodeAudioData!=='function')return Promise.resolve(false);
  if(c!==cutSamplesContext){cutSamplesContext=c;cutSamples.clear();cutSamplesPromise=null;}
  if(cutSamplesPromise)return cutSamplesPromise;
  cutSamplesPromise=Promise.all(Object.entries(CUT_SAMPLE_ASSETS).map(async([kind,file])=>{
    try{
      const url=new URL('../../assets/audio/kenney/'+file,import.meta.url);
      const response=await globalThis.fetch(url.href,{cache:'force-cache'});
      if(!response.ok)return false;
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength<1000||bytes.byteLength>32000)return false;
      const decoded=await c.decodeAudioData(bytes);
      if(decoded?.duration>0&&decoded.duration<4)cutSamples.set(kind,decoded);
      return cutSamples.has(kind);
    }catch{return false;} // offline, suspended audio, or Ogg-unsupported Safari
  })).then(results=>results.some(Boolean));
  return cutSamplesPromise;
}
function playRecordedSever(profile){
  if(!profile.completed||!state.enabled)return false;
  const buffer=cutSamples.get(profile.kind),c=ctx;
  if(!buffer||!c||c.state!=='running')return false;
  try{
    const t=c.currentTime,src=c.createBufferSource(),g=c.createGain();
    src.buffer=buffer;
    const length=Math.min(.18,Math.max(.08,buffer.duration));
    const gain=profile.kind==='metal'?.17:profile.kind==='ice'?.13:.115;
    g.gain.setValueAtTime(.0001,t);
    g.gain.linearRampToValueAtTime(gain,t+.004);
    g.gain.exponentialRampToValueAtTime(.0001,t+length);
    src.connect(g);g.connect(master);
    src.onended=()=>{src.disconnect();g.disconnect();};
    src.start(t);src.stop(t+length+.008);
    return true;
  }catch{return false;}
}

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
  if(state.enabled)void preloadCutSamples();
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

/** A single 0.5-second noise texture is shared across impacts; the envelope
 * gives each impact its shape. Previously every hit allocated a new float
 * AudioBuffer and filled it with Math.random() on the input hot path. */
function noise({ dur = 0.18, gain = 0.35, lowpass = 1800, delay = 0 }) {
  const c = ensure();
  if (!c || !state.enabled) return;
  const t0 = c.currentTime + delay;
  const length = Math.max(.008,Math.min(.49,Number(dur)||.18));
  if (sharedNoiseContext !== c || !sharedNoise) {
    const size = Math.ceil(c.sampleRate * .50);
    sharedNoise=c.createBuffer(1,size,c.sampleRate);
    const values=sharedNoise.getChannelData(0);
    for(let i=0;i<values.length;i++) values[i]=Math.random()*2-1;
    sharedNoiseContext=c;
  }
  const src = c.createBufferSource();
  src.buffer = sharedNoise;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.setValueAtTime(Math.max(.0001,gain),t0);
  g.gain.exponentialRampToValueAtTime(.0001,t0+length);
  src.connect(lp); lp.connect(g); g.connect(master);
  src.onended=()=>{src.disconnect();lp.disconnect();g.disconnect();};
  src.start(t0);src.stop(t0+length);
}

/** 音效表：语义化命名，业务层只调 play('hammer') */
const SFX = {
  tap: () => tone({ freq: 520, dur: 0.05, type: 'triangle', gain: 0.14 }),
  select: () => tone({ freq: 660, dur: 0.07, type: 'triangle', gain: 0.16 }),
  confirm: () => { tone({ freq: 523, dur: 0.09, type: 'triangle', gain: 0.2 }); tone({ freq: 784, dur: 0.12, type: 'triangle', gain: 0.16, delay: 0.07 }); },
  reroll: () => tone({ freq: 300, dur: 0.16, type: 'sawtooth', gain: 0.12, sweepTo: 620 }),
  // A dry steel-on-anvil "tak" with a very short ringing body; no celebratory chime.
  hammer: () => {
    noise({dur:.035,gain:.13,lowpass:3800});
    tone({freq:172,dur:.086,type:'triangle',gain:.115,sweepTo:117});
    tone({freq:515,dur:.055,type:'sine',gain:.038,sweepTo:410,delay:.009});
  },
  hammerRisk: () => {
    noise({dur:.055,gain:.17,lowpass:2750});
    tone({freq:142,dur:.12,type:'triangle',gain:.16,sweepTo:82});
    tone({freq:348,dur:.08,type:'sine',gain:.044,delay:.014});
  },
  hammerTier: () => {
    noise({dur:.045,gain:.14,lowpass:3900});
    tone({freq:178,dur:.09,type:'triangle',gain:.12,sweepTo:118});
    tone({freq:610,dur:.18,type:'sine',gain:.058,delay:.014});
  },
  // S7 honing: soft dry abrasive contact in short, sparse strokes. These are
  // deliberately much quieter than hammer or cut impact, not bright jingles.
  hone: () => {
    noise({ dur: 0.025, gain: 0.042, lowpass: 2750 });
    tone({ freq: 355, dur: 0.038, type: 'sine', gain: 0.015, sweepTo: 300 });
  },
  honeFinish: () => {
    noise({ dur: 0.042, gain: 0.047, lowpass: 3400 });
    tone({ freq: 590, dur: 0.12, type: 'sine', gain: 0.055, sweepTo: 720, delay: 0.012 });
  },
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

/** Distinct physical-material sound signatures, not a musical pitch ladder.
 * Pure data and bounded envelopes are testable even without WebAudio. */
export const CUT_SOUND_MATERIALS=Object.freeze({
  soft:   Object.freeze({low:315,mid:820,lowpass:1450,noise:.023,tail:.038,texture:.035,osc:'triangle'}),
  fiber:  Object.freeze({low:245,mid:685,lowpass:2900,noise:.042,tail:.058,texture:.052,osc:'triangle'}),
  wood:   Object.freeze({low:145,mid:375,lowpass:2350,noise:.068,tail:.094,texture:.085,osc:'triangle'}),
  plastic:Object.freeze({low:179,mid:555,lowpass:3750,noise:.046,tail:.078,texture:.060,osc:'triangle'}),
  ice:    Object.freeze({low:215,mid:1125,lowpass:5900,noise:.065,tail:.083,texture:.052,osc:'sine'}),
  metal:  Object.freeze({low:112,mid:515,lowpass:6900,noise:.088,tail:.120,texture:.070,osc:'sawtooth'}),
});
export function cutSoundProfile(impact){
  const kind=impact?.sound||'fiber';
  const preset=CUT_SOUND_MATERIALS[kind]||CUT_SOUND_MATERIALS.fiber;
  const weight=Math.max(0,Math.min(1,Number(impact?.weight)||.3));
  const blocked=['blocked','deflect','avoid-hit'].includes(impact?.event||impact?.contactEvent);
  return {
    ...preset,kind,weight,
    lowGain:(blocked?.035:.045)+weight*.075,
    midGain:(blocked?.023:.037)+weight*.046,
    noiseGain:blocked?.021:preset.texture*(.70+weight*.38),
    duration:blocked?preset.tail*.62:preset.tail,
    completed:!!impact?.completed&&!blocked,blocked,
  };
}
/**
 * Six tailored, non-musical attacks: softened foam, raspy rope, dry wood,
 * laminated polymer, brittle ice and cold-cut steel. No file requests and
 * no additional concurrency beyond the existing 60ms sound throttle.
 */
export function playCutImpact(impact) {
  if(!impact||!state.enabled)return;
  const p=cutSoundProfile(impact);
  if(!cutSamplesPromise&&state.enabled)void preloadCutSamples();
  try {
    const recorded=playRecordedSever(p);
    tone({freq:p.low,dur:p.duration,type:'triangle',gain:p.lowGain*(recorded?.50:1),
      sweepTo:p.low*.66});
    if(!recorded)tone({freq:p.mid,dur:p.duration*.55,type:p.osc,gain:p.midGain,
      sweepTo:p.mid*(p.kind==='ice'?.93:.72),delay:.007});
    noise({dur:p.noise,gain:p.noiseGain*(recorded?.42:1),lowpass:p.lowpass,
      delay:p.kind==='metal'?.011:.003});
    // Real sampled impact has its own decay; never layer a redundant ring.
    if(!recorded&&p.completed&&p.weight>.53){
      const ring=p.kind==='metal'?.09:p.kind==='ice'?.07:.034;
      tone({freq:p.mid*(p.kind==='metal'?1.36:1.12),
        dur:ring,type:'sine',gain:p.kind==='metal'?.018:.022,delay:.023});
    }
  } catch(_) { /* failed audio never blocks pointer input */ }
}

export function play(name) {
  const fn = SFX[name];
  if (!fn) return;
  try { fn(); } catch (_) { /* 音频失败绝不影响玩法 */ }
}

export const list = () => Object.keys(SFX);

export default { play, playCutImpact, preloadCutSamples, cutSampleStatus, list, setEnabled, setVolume, settings, unlock };
