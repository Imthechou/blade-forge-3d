/**
 * 核心玩法层 · 决策卡抽取与提交（V2.1 §5 / §25.3）
 *
 * 职责边界：
 *   · 抽候选（按稀有度加权、按阶段、按解锁池）；
 *   · 重铸（只刷新当前阶段候选，不重置整局 —— V2.1 §25.3）；
 *   · 提交（**唯一提交点**：预览不调用本文件，见 preview 说明）。
 *
 * ★ 预览必须是纯函数：UI 想看"选这张卡会怎样"用 previewPick()，
 *   它返回一份**新的**计算结果，不修改 run。
 */

import { CARDS, BY_STAGE, RARITY_WEIGHT, STAGE_ORDER } from '../data/cards.js';
import { rerollCost } from '../data/balance.js';
import * as RNG from '../platform/rng.js';
import * as Attr from './attributes.js';
import * as Risk from './risk.js';

export const CANDIDATE_COUNT = 3;

/**
 * 已解锁卡在候选中的权重倍率（T10.4）。
 * 2.2 = 同稀有度下明显更容易遇到，但不保证必出（保留随机感）。
 * ⚠ 可调初版；它**不会**缩减卡池，所以不会拿走任何人已有的内容。
 */
export const UNLOCKED_WEIGHT_BOOST = 2.2;

/** 抽当前阶段的候选（不重复） */
export function rollCandidates(run, { unlockedIds = null } = {}) {
  const stageId = run.stageId;
  const base = (BY_STAGE[stageId] || []).slice();
  let pool = base;

  /* ★★ rework T10.4：解锁卡的语义是「**多一个选择**」，不是「只剩这几张」。

     改造这里之前的写法是 `pool = base.filter(c => set.has(c.id))` ——
     一旦把存档里的 `unlockedCardIds` 接进来，卡片总数会从 218 张
     **缩减**到已解锁的那几张（旧档通常为空 → 走到 `if (!pool.length)` 兵底）。
     这正是任务书 T10.4 明令禁止的「拿掉旧档已经拥有的 218 张内容」。

     所以改成**只提升权重、绝不缩减池子**：
       基础池（77）始终可得；已解锁卡（成就/图鉴奖励发的 `card:` token）
       在该阶段的候选里出现得明显更频繁（×2.2）。
     这样「解锁」真的能在开锻时被看见，而又不会把内容从任何人手里拿走。 */
  const unlocked = Array.isArray(unlockedIds) && unlockedIds.length ? new Set(unlockedIds) : null;

  const rng = RNG.stream(run.seed, 'candidates', stageId, run.rerollCountByStage[stageId] || 0);
  const picked = [];
  const bag = pool.slice();
  const weightOf = (c) => {
    const w = RARITY_WEIGHT[c.rarity] ?? 10;
    return unlocked && unlocked.has(c.id) ? w * UNLOCKED_WEIGHT_BOOST : w;
  };
  const unlockedCount = unlocked ? base.filter((c) => unlocked.has(c.id)).length : 0;

  while (picked.length < CANDIDATE_COUNT && bag.length) {
    const card = RNG.pickWeighted(rng, bag, weightOf);
    if (!card) break;
    picked.push(card);
    bag.splice(bag.indexOf(card), 1);
  }
  run.candidates = picked;
  /* 供 UI/诊断：本阶段池内实际享受加成解锁的卡数（不参与判定） */
  run.candidatePool = { size: base.length, unlockedInPool: unlockedCount };
  return picked;
}

/**
 * 重铸（V2.1 §25.3）。
 * 「重铸只刷新当前阶段候选，不重置整局，也不擦除已积累标签、Risk、特性候选或视觉结果」
 * 价格按**阶段内**次数计算：每个阶段第一次免费，之后递增。
 */
export function reroll(run) {
  const stageId = run.stageId;
  const n = run.rerollCountByStage[stageId] || 0;
  const cost = rerollCost(n);
  if (run.daily && run.daily.maxReroll != null && run.rerollTotal >= run.daily.maxReroll) {
    return { ok: false, cost: 0, reason: `今日挑战限制：最多重铸 ${run.daily.maxReroll} 次` };
  }
  if (run.cr < cost) return { ok: false, cost, reason: 'CR 不足', short: cost - run.cr };

  run.cr -= cost;
  run.rerollCountByStage[stageId] = n + 1;
  run.rerollTotal += 1;
  /* ★ rework T10.4：重铸必须沿用本局的解锁列表。
     否则「重铸一次」就会把已解锁卡的加权静默抹掉（改造前的实际缺陷）。 */
  rollCandidates(run, { unlockedIds: run.unlockedCardIds || null });
  return { ok: true, cost };
}

/** 下一阶段的重铸价格（UI 提示用） */
export const nextRerollCost = (run) => rerollCost(run.rerollCountByStage[run.stageId] || 0);

/**
 * 预览：选这张卡之后的六维与风险（**纯函数**，不改 run）。
 * V2.1 §5：「点击卡牌先预览，确认后才正式提交；切换候选必须能撤销上一张卡的预览结果」
 * —— 因为不改 run，切换候选天然不留残留。
 */
export function previewPick(run, card) {
  if (!card) return null;
  const stats = Attr.clone(run.stats);
  Attr.apply(stats, card.statDelta);
  return {
    card,
    stats,
    statDelta: card.statDelta,
    riskAfter: Risk.after(run.risk, card.riskDeltaPoints),
    riskDelta: card.riskDeltaPoints,
    breakChanceAfter: Risk.breakChance(Risk.after(run.risk, card.riskDeltaPoints), run.daily?.breakScale || 1),
  };
}

/**
 * ★ 唯一提交点：把一张候选卡写进本局。
 * 只做"数据与状态"的写入，**不做风险检查**（时机由 core/forge.js 按 §9.2 统一调度）。
 */
export function commit(run, card) {
  if (!card) return { ok: false, reason: '卡不存在' };
  if (run.finished) return { ok: false, reason: '本局已结束' };

  run.history.push(card.id);
  Attr.apply(run.stats, card.statDelta);
  Risk.apply(run.risk, card.riskDeltaPoints);
  run.peakRisk = run.risk.peak;

  // 标签账本（唯一来源）
  run.ledger.entries.push({ stage: run.stageId, cardId: card.id, tags: card.tags.slice() });
  if (!run.completedStages.includes(run.stageId)) run.completedStages.push(run.stageId);

  // 视觉写入（结构化：卡表已把 write + visualSpec 合并进 card.visual）
  applyVisual(run, card);

  return { ok: true };
}

function applyVisual(run, card) {
  const w = card.visual?.write || {};
  const ps = run.pendingSkin;
  if (w.materialId) ps.materialId = w.materialId;
  if (w.textureId) ps.textureId = w.textureId;
  if (w.finishId) ps.finishId = w.finishId;
  if (w.knifeType) {
    ps.knifeType = w.knifeType;
    run.knifeTypeId = w.knifeType;
  }
  if (w.wear != null) ps.wear = w.wear;
  if (w.handle) ps.handle = { ...(ps.handle || {}), ...w.handle };
  const variants = { ...(card.visual?.variants || {}), ...(w.variants || {}) };
  for (const k of Object.keys(variants)) {
    ps.variants[k] = { ...(ps.variants[k] || {}), ...variants[k] };
  }
  // 记录每阶段的视觉配方，供藏刀阁复现
  run.visualRecipe.push({
    stage: run.stageId, cardId: card.id,
    recipeKey: card.visual?.recipeKey || null,
    slots: (card.visual?.slots || []).slice(),
    assetRef: card.visual?.assetRef || null,
  });
}

export { CARDS, STAGE_ORDER };
export default { rollCandidates, reroll, nextRerollCost, previewPick, commit, CANDIDATE_COUNT };
