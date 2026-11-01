/**
 * 核心玩法层 · S4 自由锻打小游戏（V2.1 §10 + rework T04）
 *
 * 规则落地：
 *   · 中央锻打区域任意位置点击都算一锤；
 *   · 每次锤击推进强化成果并增加 Risk，Risk 增量随累计锤数递增；
 *   · Risk 增加后**立即**执行断裂判定；
 *   · 存活后自动更新锤数/进度/Risk/下一锤提示，不弹逐锤确认；
 *   · 随时可以"结束锻打"，按钮不属于锻打区域；
 *   · 不设锤击次数上限，Risk 到 100 仍可继续；
 *   · 一锤未打就结束时，仍需在离开 S4 时检查一次 —— 由 forge.js 调度。
 *
 * ★ 本轮（技能化）新增：落点与瞄准真正影响结果
 *   原 §10.1 规定「点击位置与速度不影响收益」，玩家只是在点计数器。
 *   现在：
 *   · **落点分区**决定这一锤把成果分配到哪个六维（刀尖→锋利、刀腹→
 *     强度/工艺、刀根→韧性），并写入 shapeProfile 驱动真实刀缘形变；
 *   · **瞄准精度**：每锤有一个由 seed+锤序确定的「甜点」，命中最多 +12%
 *     成果；UI 画出甜点，玩家可以练、可以复现。这是真正可练的技巧。
 *   · **风险增量完全不变**：S4 断裂率必须由 previewNextBreakChance()
 *     在出手前准确预告，因此风险绝不参与技巧修正 —— 见 hammerTechnique.js。
 *   单锤基础成果与基础风险仍由 balance.js 唯一决定，本层只做有界修正。
 *   未传 contact 的旧调用方（模拟器、旧测试、每日模式兜底）走 neutral 路径，
 *   数值与改造前逐字一致。
 *
 * 纯逻辑：不碰 DOM，不碰渲染。
 */

import { HAMMER_PROGRESS, HAMMER_TIERS, HAMMER_TIER_REWARD, hammerRiskDelta, HAMMER_GAIN_SCALE } from '../data/balance.js';
import { hammerTierOf } from '../data/balance.js';
import { HAMMER_TRAITS, hammerDirectionVector } from '../data/traits.js';
import * as Attr from './attributes.js';
import * as Risk from './risk.js';
import { effectiveRiskScale } from './arenaV41Growth.js';
import { noteSafeRisk } from './arenaV41Specialties.js';
import * as Tags from './tags.js';
import { hammerTechnique, distributeGain } from './hammerTechnique.js';

export function makeState() {
  return {
    count: 0, progress: 0, tier: 0, ended: false,
    /* rework T04.3：本局锻打方向（由 S4 前积累的主导标签决定，锤击过程中不变） */
    direction: null,
    /* rework T04.2：逐锤成果累计写进六维的点数（UI 展示“已经拿到什么”） */
    statGained: 0,
  };
}

/**
 * 本锤的六维成果分配（rework T04.2 / T04.3）。
 *
 * ★ 改造前：成果只累加进 progress，没跨档的锤（如第 3–5 锤）**只加 Risk**，
 *   不留下任何有效收益 —— 中间锤变成纯亏损。
 *   现在每锤都把 `gain × HAMMER_GAIN_SCALE` 点按**方向向量**写进六维，
 *   档位只负责身份 / 评分倍率。
 *
 * ★ 改造前：九个方向共用完全相同的 statDelta 与 scoreMult，
 *   标签只换了特性名字。现在方向向量真的不同，所以锻造路线真的不同。
 *
 * @returns {{delta:object, total:number, vector:object}}
 */
export function statGainOf(gain, directionTagId, weight = null) {
  const vector = hammerDirectionVector(directionTagId);
  const total = Math.max(0, Number(gain) || 0) * HAMMER_GAIN_SCALE;
  /* 有落点/方向权重时按权重拆分；无权重（旧调用方）退回单属性路径，
     数值与改造前逐字一致。 */
  const out = distributeGain(total, weight, 'strength', vector);
  return { delta: out.delta, total: out.total, vector };
}

/** 第 n 锤（1-based）的成果：前期明确、后期递减（V2.1 §10.4） */
export function progressOf(strikeIndex) {
  // First tap +1, second +2, every subsequent strike +n.
  // No cap: late high-stakes hits retain a meaningful Strength reward.
  return Math.max(1, Math.floor(Number(strikeIndex) || 1));
}

/** 下一锤的 Risk 增量（UI 提示用，与 strike() 用同一函数） */
export const nextRiskDelta = (count) => hammerRiskDelta(count + 1);

/** One authoritative preview: identical protection and post-hit risk to strike().
 * A safe strike still has 0% fracture even when risk was high before S4. */
export function previewNextBreakChance(run) {
  if (!run?.hammer || run.hammer.count < 10) return 0;
  const risk = Math.min(100, (Number(run.risk?.current) || 0) + nextRiskDelta(run.hammer.count));
  return Risk.breakChance(risk, effectiveRiskScale(run.workshop,
    run.specialist?.id === 'press' ? run.specialist.boost : 0,
    run.daily?.breakScale || 1));
}

/**
 * 锤一击。
 * @param {object} run RunState
 * @param {() => number} rng
 * @param {{contact?:{x:number,y:number}|null, intervalMs?:number|null}} [technique]
 *   contact 为锻打区域归一化落点；intervalMs 为距上一锤的毫秒数。
 *   两者缺失（模拟器、每日兜底、旧测试）→ neutral 路径，数值与改造前一致。
 * @returns {{ok:boolean, fractured?:boolean, strike?:object}}
 */
export function strike(run, rng, technique = null) {
  if (run.hammer.ended) return { ok: false, reason: '已结束锻打' };

  const index = run.hammer.count + 1;
  const baseDelta = hammerRiskDelta(index);
  const baseGain = progressOf(index);

  /* 方向在第一次锤击时锁定（S4 前的标签账本不再变化） */
  if (!run.hammer.direction) {
    const dom = Tags.dominantBaseTag(run.ledger);
    run.hammer.direction = dom.mixed ? 'mixed' : dom.tagId;
  }

  /* ★ 技巧层：落点决定成果去向，瞄准甜点的精度在 +12% 内提升成果。
     风险增量完全不参与技巧修正 —— S4 的断裂概率必须在玩家出手**之前**
     就能被 previewNextBreakChance() 准确预告，任何让风险依赖落点的规则
     都会造成「预览一套、判定另一套」。 */
  const tech = hammerTechnique({
    directionVector: hammerDirectionVector(run.hammer.direction),
    contact: technique?.contact || null,
    seed: run.seed,
    strikeIndex: index,
  });
  const gain = Math.round(baseGain * tech.gainScale * 100) / 100;
  const delta = baseDelta;

  Risk.apply(run.risk, delta);
  run.peakRisk = run.risk.peak;
  run.hammer.count = index;
  run.hammer.progress = Math.round((run.hammer.progress + gain) * 100) / 100;

  /* ★ rework T04.2：逐锤成果即时写进六维 —— 中间锤也有有效收益。
     这是一份**永久六维**，与档位评分倍率分工，不重复计算。 */
  const statGain = statGainOf(gain, run.hammer.direction, tech.weight);
  if (Object.keys(statGain.delta).length) Attr.apply(run.stats, statGain.delta);
  run.hammer.statGained = Math.round((run.hammer.statGained + statGain.total) * 100) / 100;

  // ★ Risk 增加后立即判定（V2.1 §10.2）
  // Ten safe strikes even when prior-stage card risk is nonzero.
  const check = index <= 10
    ? { risk: run.risk.current, chance: 0, roll: null, fractured: false, protected: true }
    : Risk.check(run.risk.current,rng,effectiveRiskScale(run.workshop,
        run.specialist?.id==='press' ? run.specialist.boost : 0,
        run.daily?.breakScale || 1));

  if(index>10 && !check.fractured)noteSafeRisk(run,check.chance);
  const tierBefore = run.hammer.tier;
  run.hammer.tier = hammerTierOf(run.hammer.progress).id;

  const result = {
    ok: true,
    fractured: check.fractured,
    check,
    strike: {
      index,
      riskDelta: delta,
      riskAfter: run.risk.current,
      progressGain: Math.round(gain * 100) / 100,
      progress: run.hammer.progress,
      tier: run.hammer.tier,
      tierUp: run.hammer.tier > tierBefore ? run.hammer.tier : null,
      breakChance: check.chance,
      /** rework T04.2：本锤实际拿到的六维成果（UI 必须展示，否则玩家看不到中间锤的收益） */
      statDelta: statGain.delta,
      statGain: statGain.total,
      statGained: run.hammer.statGained,
      direction: run.hammer.direction,
      /** ★ 本轮：本锤的技巧判定（落点分区 + 瞄准精度 + 甜点），UI 用它做真实反馈 */
      technique: {
        active: tech.active,
        zoneName: tech.zoneName,
        landing: tech.landing,
        spot: tech.spot,
        aim: tech.aim,
        gainScale: tech.gainScale,
      },
      nextRiskDelta: nextRiskDelta(run.hammer.count),
      nextBreakChance: previewNextBreakChance(run),
      /** 下一档距离与收手保留内容（rework T04.4：不泄露隐藏精确六维） */
      nextTier: toNextTier(run.hammer.progress),
      keepOnStop: {
        tier: run.hammer.tier,
        tierName: tierName(run.hammer.tier),
        scoreMult: tierReward(run.hammer.tier).scoreMult,
        statGained: run.hammer.statGained,
      },
    },
  };
  return result;
}

/** 结束锻打（锁定当前成果，进入 S5） */
export function end(run) {
  run.hammer.ended = true;
  return { count: run.hammer.count, progress: run.hammer.progress, tier: run.hammer.tier };
}

/**
 * S4 额外锻打特性的类型（V2.1 §8.4）：
 * 「由此前积累的主要基础标签决定；混合路线使用已定义的混合特性」
 * @returns {{tagId:string|null, mixed:boolean, traitId:string, name:string}}
 */
export function traitFor(run) {
  const dom = Tags.dominantBaseTag(run.ledger);
  const key = dom.mixed ? 'mixed' : dom.tagId;
  const def = HAMMER_TRAITS[key] || HAMMER_TRAITS.mixed;
  return { tagId: dom.tagId, mixed: dom.mixed, traitId: def.id, name: def.name, desc: def.desc };
}

/** 强化档位的六维与倍率奖励（V2.1 §8.4：与标签特性分工，不重复计算同一效果） */
export const tierReward = (tierId) => HAMMER_TIER_REWARD[tierId] || HAMMER_TIER_REWARD[0];

export const tierName = (tierId) => (HAMMER_TIERS.find((t) => t.id === tierId) || HAMMER_TIERS[0]).name;

/** 距离下一强化档还差多少成果（UI 进度条用） */
export function toNextTier(progress) {
  for (const t of HAMMER_TIERS) {
    if (progress < t.need) return { need: t.need, remain: Math.round((t.need - progress) * 10) / 10, id: t.id, name: t.name };
  }
  return null;
}

export default {
  makeState, strike, end, traitFor, tierReward, tierName,
  progressOf, nextRiskDelta, toNextTier, statGainOf,
};
