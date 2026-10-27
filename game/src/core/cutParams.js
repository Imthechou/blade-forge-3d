/**
 * 核心层 · 切割参数（测试能力 + buff → 一组可读的手感参数）
 *
 * 唯一出口：`arenaChallenge.swipe()` 与 UI 的「本刀参数」都从这里取，
 * 避免"面板显示的数和实际判定用的数"两套。
 *
 * ★ rework T01：输入是**经曲线换算后的测试能力值**（0…STAT_CURVE_CEILING），
 *   不再是硬截到 100 的永久六维。改造前这里 clamp(0,100)，
 *   于是六维 100 与 256 得到完全相同的切割参数（审计问题 1）。
 *   现在高于 100 的部分按 balance.applyStatCurve 的饱和曲线继续生效。
 *   原始永久六维 → 能力的换算只能在 core/bladeAdapter 里发生一次，
 *   本文件不接受裸永久六维，避免同一份收益被两次换算。
 */
import { BUFF_BY_ID } from '../data/arena/buffs.js';
import { STAT_CURVE_CEILING } from '../data/balance.js';
import { adaptBlade } from './bladeAdapter.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 把 buff 列表折成 mods（同名叠加：第 2 层起按 +60% 计） */
export function foldBuffMods(buffs = []) {
  const counts = new Map();
  for (const id of buffs) counts.set(id, (counts.get(id) || 0) + 1);
  const add = {};
  const mult = {};
  for (const [id, n] of counts) {
    const def = BUFF_BY_ID[id];
    if (!def) continue;
    const k = 1 + 0.6 * (n - 1);
    for (const [key, raw] of Object.entries(def.mods || {})) {
      const v = num(raw);
      if (key.endsWith('Mult')) {
        // 乘算项叠加：1.15 → 1 + 0.15×k
        mult[key] = (mult[key] ?? 1) * (1 + (v - 1) * k);
      } else {
        add[key] = (add[key] ?? 0) + v * k;
      }
    }
  }
  return { add, mult, counts };
}

/**
 * @param {object} stats 测试能力值（0…STAT_CURVE_CEILING；见 core/bladeAdapter）
 * @param {string[]} buffs 本场已持有的 buff id（可重复）
 */
export function deriveCutParams(stats, buffs = []) {
  /* ★ 能力值已经是曲线后的值；这里只做物理上限保护。
     传入大于 100 的能力会**得到大于 100 的效果** —— 这正是 T01 要的行为。 */
  const cap = (v) => clamp(num(v), 0, STAT_CURVE_CEILING);
  const s = {
    strength: cap(stats?.strength),
    sharpness: cap(stats?.sharpness),
    toughness: cap(stats?.toughness),
    craft: cap(stats?.craft),
    design: cap(stats?.design),
    spirit: cap(stats?.spirit),
  };
  const { add, mult } = foldBuffMods(buffs);
  const m = (key, dflt = 1) => mult[key] ?? dflt;

  // 铁匠之魂等：把韧性抬起来再参与刀况计算
  const tough = clamp(s.toughness + num(add.toughAdd), 0, STAT_CURVE_CEILING + 40);

  return {
    /* 命中几何 */
    radius: 0.095 * m('radiusMult'),
    tolerance: (0.275 + s.design * 0.0028 + s.craft * 0.00075) * m('toleranceMult'),
    perfectMult: m('perfectMult'),

    /* 进度 */
    softBase: 1.05 + (s.sharpness - 50) * 0.0064 + (s.craft - 50) * 0.0018,
    hardBase: 0.37 + (s.strength - 50) * 0.0042 + (s.sharpness - 50) * 0.0016 + (s.craft - 50) * 0.0015,
    speedBonus: 1.35 * m('speedBonusMult'),
    hardPowerMult: m('hardPowerMult'),

    /* 连击 */
    comboWindow: 1.65 + num(add.comboWindow),
    comboStep: 0.09 + num(add.comboStep),
    comboCap: 0.7,
    tripleBonus: num(add.tripleBonus),

    /* 得分 */
    spiritMult: 0.9 + s.spirit * 0.0029,
    softSharpWall: (s.sharpness - 55) * 0.0018,
    scoreMult: m('scoreMult'),
    softScoreMult: m('softScoreMult'),
    flatPerKill: num(add.flatPerKill),
    flawlessMult: m('flawlessMult'),
    lowHealthScore: !!num(add.lowHealthScore),
    winStreakMult: m('winStreakMult'),

    /* 刀况 */
    healthMax: Math.max(20, (120 + (tough - 50) * 0.5 + num(add.healthMaxAdd)) * m('healthMaxMult')),
    healthStart: num(add.healthStart),
    wearHardMult: m('wearHardMult'),
    wearShiftMult: m('wearShiftMult'),
    noWearUntil: num(add.noWearUntil),
    killHeal: num(add.killHeal),
    layerHeal: num(add.layerHeal),
    emergencyHeal: num(add.emergencyHeal),
    wearBase: { hard: 2.2, hardK: 3.4, shift: 0.6, soft: 0.1, softK: 0.003 },
    tough, design: s.design, stats: s,

    /* 狂热 */
    frenzyThreshold: add.frenzyThreshold ? num(add.frenzyThreshold) : 8,
    frenzyMult: Math.max(1.5, num(add.frenzyMult) || 1.5),
    frenzyHardBreak: !!num(add.frenzyHardBreak),

    /* 投放 */
    intervalMult: m('intervalMult', 1),
    materialBias: num(add.materialBias),
  };
}

/**
 * 从一把成刀（BladeRecord 或已适配视图）直接得到切割参数。
 *
 * ★ 这是 UI / 赛事入口应该用的那个函数：它内部只经 bladeAdapter 换算一次，
 *   调用方不需要（也不应该）自己准备能力值。传入裸六维也可以工作，
 *   因为 adaptBlade 会按同一条曲线换算 —— 不会出现两套标尺。
 *
 * @param {object} blade BladeRecord 或 adaptBlade() 的结果
 * @param {string[]} buffs
 */
export function deriveCutParamsForBlade(blade, buffs = []) {
  const view = blade && blade.version && blade.capabilities
    ? blade                 // 已经是适配视图，不重复换算
    : adaptBlade(blade);
  const params = deriveCutParams(view.capabilities, buffs);
  // 把适配结果挂在参数上，供 UI 展示「为什么这把刀在这项更强」
  params.adaptation = {
    version: view.version,
    effectVersion: view.effectVersion,
    bladeId: view.bladeId,
    knifeTypeId: view.knifeTypeId,
    knifeProfileLabel: view.knifeProfileLabel,
    projectFactor: view.projectFactor,
    effectSummary: view.effectSummary,
  };
  return params;
}

/** 给 UI 的「本刀参数」卡：五条可读指标 */
export function describeParams(P) {
  return [
    { key: 'radius', name: '刃长', value: `+${Math.round((P.radius / 0.095 - 1) * 100)}%`, ratio: clamp((P.radius - 0.095) / 0.03, 0, 1) },
    { key: 'hard', name: '突破', value: P.hardBase.toFixed(2), ratio: clamp((P.hardBase - 0.28) / 0.25, 0, 1) },
    { key: 'tol', name: '容差', value: `${Math.round(P.tolerance * 180 / Math.PI)}°`, ratio: clamp((P.tolerance - 0.27) / 0.18, 0, 1) },
    { key: 'combo', name: '连击窗', value: `${P.comboWindow.toFixed(2)}s`, ratio: clamp((P.comboWindow - 1.65) / 0.6, 0, 1) },
    { key: 'score', name: '得分', value: `×${(P.spiritMult * P.scoreMult).toFixed(2)}`, ratio: clamp((P.spiritMult * P.scoreMult - 0.9) / 0.5, 0, 1) },
  ];
}

export default { deriveCutParams, deriveCutParamsForBlade, foldBuffMods, describeParams };
