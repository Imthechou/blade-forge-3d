/**
 * 数据层 · 赛事切割强化（buff / 海克斯）
 *
 * 三局随机构筑：每局开始前从池子里抽 3 张，选 1 张；三局的 buff 同时生效。
 * 同一个 buff 可以被重复抽到并叠加（第 2 层起按 +60% 计），这是构筑的主线。
 *
 * 只影响单场切割参数，不写永久存档 —— 由 core/cutParams.js 统一折成参数。
 *
 * mods 键名约定：
 *   · 结尾 Mult 的是乘算（1.15 = +15%），叠层按 1 + (v-1)×1.6 计
 *   · 其余为加算
 */

export const BUFF_TIERS = Object.freeze({
  silver: { id: 'silver', name: '银', weight: 0.55, color: '#C9D6DC' },
  gold: { id: 'gold', name: '金', weight: 0.33, color: '#E8C57A' },
  prismatic: { id: 'prismatic', name: '彩', weight: 0.12, color: '#9FE3DA' },
});

export const BUFF_FAMILIES = Object.freeze({
  blade: '刀强化',
  run: '局内',
  score: '结算',
  risk: '风险',
});

export const BUFFS = Object.freeze([
  /* ── 银：手感补齐 ───────────────────────────────── */
  { id: 'whetstone', name: '磨石', tier: 'silver', family: 'blade', desc: '刀况上限 +15',
    mods: { healthMaxAdd: 15 } },
  { id: 'sharpening', name: '开刃', tier: 'silver', family: 'blade', desc: '角度容差 +15%',
    mods: { toleranceMult: 1.15 } },
  { id: 'grindwheel', name: '砂轮', tier: 'silver', family: 'blade', desc: '切割半径 +8%',
    mods: { radiusMult: 1.08 } },
  { id: 'bloodgroove', name: '血槽', tier: 'silver', family: 'score', desc: '跨划连击窗口 +0.25 秒（连击段位提高得分）',
    mods: { comboWindow: 0.25 } },
  { id: 'withgrain', name: '顺纹', tier: 'silver', family: 'score', desc: '软靶得分 +15%',
    mods: { softScoreMult: 1.15 } },
  { id: 'cladsteel', name: '包钢', tier: 'silver', family: 'risk', desc: '硬靶刀损 −15%',
    mods: { wearHardMult: 0.85 } },
  { id: 'steadyhand', name: '稳手', tier: 'silver', family: 'risk', desc: '偏斜（弹刃）刀损 −30%',
    mods: { wearShiftMult: 0.7 } },
  { id: 'pickings', name: '拾遗', tier: 'silver', family: 'risk', desc: '刀况低于 60% 时，每斩断 1 件回复 1 点',
    mods: { killHeal: 1 } },
  { id: 'quickhand', name: '快手', tier: 'silver', family: 'blade', desc: '手势速度对进度的加成 +15%',
    mods: { speedBonusMult: 1.15 } },

  /* ── 金：玩法倾向 ───────────────────────────────── */
  { id: 'sanmai', name: '夹钢', tier: 'gold', family: 'risk', desc: '硬靶每破一层，刀况回复 5',
    mods: { layerHeal: 5 } },
  { id: 'claycoat', name: '覆土烧刃', tier: 'gold', family: 'risk', desc: '每局前 6 秒不扣刀况',
    mods: { noWearUntil: 6 } },
  { id: 'foldedsteel', name: '折叠锻打', tier: 'gold', family: 'score', desc: '每完成一次三连，本局得分倍率 +0.06（上限 +0.36）',
    mods: { tripleBonus: 0.06 } },
  { id: 'longblade', name: '长刃', tier: 'gold', family: 'blade', desc: '切割半径 +18%',
    mods: { radiusMult: 1.18 } },
  { id: 'layerbreak', name: '破层', tier: 'gold', family: 'blade', desc: '硬靶每刀进度 +12%',
    mods: { hardPowerMult: 1.12 } },
  { id: 'piecework', name: '计件', tier: 'gold', family: 'score', desc: '每斩断 1 件额外 +12 固定分',
    mods: { flatPerKill: 12 } },
  { id: 'chainmult', name: '连乘', tier: 'gold', family: 'score', desc: '连击倍率每级 +0.08',
    mods: { comboStep: 0.08 } },
  { id: 'tempering', name: '回火', tier: 'gold', family: 'risk', desc: '每局一次：刀况低于 30% 时立即回复 30',
    mods: { emergencyHeal: 30 } },

  /* ── 彩：构筑核心 ───────────────────────────────── */
  { id: 'noself', name: '无我', tier: 'prismatic', family: 'score', desc: '狂热阈值 8→5 连，狂热期得分 ×2.0',
    mods: { frenzyThreshold: 5, frenzyMult: 2.0 } },
  { id: 'smithsoul', name: '铁匠之魂', tier: 'prismatic', family: 'blade', desc: '韧性视为 +30',
    mods: { toughAdd: 30 } },
  { id: 'grandslam', name: '满贯', tier: 'prismatic', family: 'score', desc: '本局零漏切时结算 ×1.3',
    mods: { flawlessMult: 1.3 } },
  { id: 'allin', name: '孤注', tier: 'prismatic', family: 'risk', desc: '本局得分 ×1.4，但刀况上限 −35%',
    mods: { scoreMult: 1.4, healthMaxMult: 0.65 } },
  { id: 'bloodblade', name: '血刃', tier: 'prismatic', family: 'score', desc: '刀况越低得分越高，最高 ×2',
    mods: { lowHealthScore: 1 } },
  { id: 'artisansoul', name: '匠魂', tier: 'prismatic', family: 'score', desc: '已赢下的每一局，让本局得分 ×1.15（可叠）',
    mods: { winStreakMult: 1.15 } },
  { id: 'quenchheat', name: '淬火余温', tier: 'prismatic', family: 'blade', desc: '狂热期间硬靶一刀必破（完整硬靶同样击破，正常记分并承担刀损）',
    mods: { frenzyHardBreak: 1 } },
]);

export const BUFF_BY_ID = Object.freeze(Object.fromEntries(BUFFS.map((b) => [b.id, b])));

/** 按档位权重抽 n 张，且优先给"已持有、还能再叠"的 buff（保证叠层摸得到）。 */
export function rollBuffChoices(rng, owned = [], count = 3) {
  const ownedCount = new Map();
  for (const id of owned) ownedCount.set(id, (ownedCount.get(id) || 0) + 1);
  const used = new Set();
  const picks = [];
  for (let i = 0; i < count; i++) {
    const pool = BUFFS.filter((b) => !used.has(b.id) && (ownedCount.get(b.id) || 0) < 3);
    if (!pool.length) break;
    const weights = pool.map((b) => {
      const stackable = ownedCount.get(b.id) ? 1.8 : 1;
      return BUFF_TIERS[b.tier].weight * stackable;
    });
    const total = weights.reduce((a, c) => a + c, 0);
    let roll = rng() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) { roll -= weights[idx]; if (roll <= 0) break; }
    const pick = pool[Math.min(idx, pool.length - 1)];
    used.add(pick.id);
    picks.push(pick.id);
  }
  return picks;
}

export default { BUFFS, BUFF_BY_ID, BUFF_TIERS, BUFF_FAMILIES, rollBuffChoices };
