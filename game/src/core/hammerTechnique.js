/**
 * 核心玩法层 · S4 锤击技巧（落点分区 + 瞄准精度）
 *
 * 原设计 §10.1 明确写着「点击位置与速度不影响收益」，于是 S4 只是一个
 * 点击计数器：砸 20 锤和砸 3 锤的差别只有数字，玩家没有可练的手感。
 * 本轮把两个本来就能被玩家感知、又完全可确定性复现的维度接进规则：
 *
 *   ① 落点分区（contact.x / contact.y，归一化到锻打区域）
 *      刀尖 → 锋利；刀腹 → 强度/工艺；刀根 → 韧性。
 *      落点同时写进 shapeProfile 驱动真实刀缘形变，
 *      所以「锤哪儿」在画面上也真的看得见。
 *
 *   ② 瞄准精度（落点与「本锤甜点」的距离）
 *      甜点每锤由一个确定性函数给出（同一个 seed 同一把刀完全相同），
 *      UI 把它画在刀身上。命中甜点 → 成果最多 +12%；偏离越远加成越低。
 *      这是真正可以练的瞄准技巧，而不是随机奖励。
 *
 * ★★ 为什么不改风险 ★★
 *   S4 的断裂概率必须遵守「唯一概率来源」不变量：
 *   `previewNextBreakChance()` 在玩家出手**之前**就要显示下一锤的断裂率，
 *   而玩家尚未决定怎么锤。任何让风险依赖落点或节奏的规则，都会让
 *   预览值不等于实际判定值 —— 项目文档明确禁止这种「显示一套、判定另一套」。
 *   因此本轮**风险增量仍完全由 balance.js 的 hammerRiskDelta 决定**，
 *   技巧只影响成果的量与去向。风险与收益的博弈依旧来自「锤不锤、锤几下」。
 *
 * ★ 设计约束（不能破的东西）
 *   · 单锤**基础成果**与**基础风险**仍完全由 balance.js 的
 *     progressOf / hammerRiskDelta 决定，本模块只做有界修正；
 *   · 未提供 contact 的旧调用方（模拟器、每日模式兜底、旧测试）
 *     走 neutral 路径，得到的数值与改造前逐字一致；
 *   · 所有分配保证各分项之和恰好等于总量，不留浮点残差。
 *
 * 纯逻辑：不碰 DOM、不读时钟、不碰渲染。
 */

/** 六维键（与 data/balance.js 的 STAT_KEYS 一致） */
const STAT_KEYS = Object.freeze(['strength', 'toughness', 'sharpness', 'craft', 'design', 'spirit']);

/** 命中甜点的最大成果加成（+12%）。导出以便 UI 提示与测试共用。 */
export const SWEET_SPOT_MAX_BONUS = 0.12;

/** 甜点容差半径（归一化坐标）。在此半径内线性衰减。 */
export const SWEET_SPOT_RADIUS = 0.13;

/** 方向向量与落点向量的混合权重：方向是主轴，落点是瞄准修正。 */
export const DIRECTION_WEIGHT = 0.6;

/**
 * 落点分区 → 六维倾向。每个向量自身归一（和 = 1）。
 * y 为锻打区域内自上而下的归一化坐标：0 是刀尖方向，1 是刀根方向。
 */
export const LANDING_ZONES = Object.freeze({
  tip:   Object.freeze({ id: 'tip',   name: '刀尖', vector: Object.freeze({ sharpness: .62, strength: .20, craft: .18 }) }),
  belly: Object.freeze({ id: 'belly', name: '刀腹', vector: Object.freeze({ strength: .42, craft: .26, toughness: .18, sharpness: .14 }) }),
  root:  Object.freeze({ id: 'root',  name: '刀根', vector: Object.freeze({ toughness: .50, strength: .28, craft: .22 }) }),
});

/** 落点分区边界（归一化 y）。导出以保持 UI 提示与判定同源。 */
export const LANDING_BANDS = Object.freeze({ tipMax: .33, bellyMax: .67 });

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v)));

/**
 * 归一化落点。非有限值或缺失 → null（neutral 路径）。
 * @param {{x:number,y:number}|null|undefined} contact
 */
export function normalizeLanding(contact) {
  if (!contact || typeof contact !== 'object') return null;
  const x = Number(contact.x), y = Number(contact.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const nx = clamp01(x), ny = clamp01(y);
  const zone = ny < LANDING_BANDS.tipMax ? 'tip' : ny < LANDING_BANDS.bellyMax ? 'belly' : 'root';
  return { x: nx, y: ny, zone, zoneName: LANDING_ZONES[zone].name };
}

/** 落点 → 分区对象；无效落点返回 null。 */
export function landingOf(contact) {
  const n = normalizeLanding(contact);
  return n ? LANDING_ZONES[n.zone] : null;
}

/**
 * 本锤的「甜点」位置（确定性）。
 *
 * 同一个 seed + 同一个锤序号永远给出同一点，因此：
 *   · 玩家可以练习、可以复现；
 *   · 测试可以精确断言；
 *   · 不需要额外 RNG 流，也不影响任何既有随机序列。
 *
 * 甜点在刀身中段到刀根之间摆动，横向在两侧刃面之间交替，
 * 迫使玩家每锤都要重新瞄准，而不是无脑点同一个位置。
 *
 * @param {number} seed
 * @param {number} strikeIndex 1-based 锤序号
 * @returns {{x:number,y:number}}
 */
export function sweetSpotOf(seed, strikeIndex) {
  const n = Math.max(1, Math.floor(Number(strikeIndex) || 1));
  const s = Number.isFinite(Number(seed)) ? Math.abs(Math.floor(Number(seed))) : 1;
  /* 手工混合：相邻 seed 与相邻锤序都必须给出明显不同的结果，
     否则玩家会看到甜点卡在同一处不动。不消耗游戏 RNG 流。 */
  const mix = (a, b) => {
    let h = (a >>> 0) ^ Math.imul(b >>> 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  };
  const hx = mix(s, n);
  const hy = mix((s ^ 0x5bf03635) >>> 0, (n ^ 0x27d4eb2f) >>> 0);
  const u = (hx & 0xffff) / 0xffff;
  const v = (hy & 0xffff) / 0xffff;
  return {
    x: Math.round((.30 + u * .40) * 1000) / 1000,
    y: Math.round((.28 + v * .44) * 1000) / 1000,
  };
}

/**
 * 瞄准精度评分：1 = 完全命中甜点，0 = 完全偏离。
 * @param {{x:number,y:number}} landing 归一化落点
 * @param {{x:number,y:number}} spot 归一化甜点
 * @returns {number} 0–1
 */
export function aimScore(landing, spot) {
  if (!landing || !spot) return 0;
  const dx = Number(landing.x) - Number(spot.x);
  const dy = Number(landing.y) - Number(spot.y);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (!Number.isFinite(dist)) return 0;
  return clamp01(1 - dist / SWEET_SPOT_RADIUS);
}

/**
 * 把「锻打方向向量」与「落点分区向量」混成一个归一化权重。
 * 两者都缺 → null（调用方退回旧的单属性行为）。
 * @param {object|null} directionVector 来自 data/traits.js HAMMER_DIRECTION_VECTORS
 * @param {object|null} zoneVector      来自 LANDING_ZONES[].vector
 * @returns {{weight:object, mixed:boolean}|null}
 */
export function blendLandingVector(directionVector, zoneVector) {
  const dir = directionVector && typeof directionVector === 'object' ? directionVector : null;
  const zone = zoneVector && typeof zoneVector === 'object' ? zoneVector : null;
  if (!dir && !zone) return null;
  const acc = {};
  let sum = 0;
  const add = (src, k) => {
    if (!src) return;
    for (const key of STAT_KEYS) {
      const v = Math.max(0, Number(src[key]) || 0) * k;
      if (!v) continue;
      acc[key] = (acc[key] || 0) + v;
      sum += v;
    }
  };
  if (dir && zone) { add(dir, DIRECTION_WEIGHT); add(zone, 1 - DIRECTION_WEIGHT); }
  else if (dir) add(dir, 1);
  else add(zone, 1);
  if (!(sum > 0)) return null;
  const weight = {};
  for (const key of STAT_KEYS) weight[key] = (acc[key] || 0) / sum;
  return { weight, mixed: !!(dir && zone) };
}

/**
 * 一次锤击的技巧判定（唯一入口）。
 *
 * @param {object} [input]
 * @param {object|null} [input.directionVector]
 * @param {object|null} [input.contact]
 * @param {number} [input.seed]
 * @param {number} [input.strikeIndex]
 * @returns {{
 *   active:boolean, landing:object|null, spot:{x:number,y:number},
 *   aim:number, gainScale:number, weight:object|null, mixed:boolean, zoneName:string|null
 * }}
 *   active=false 表示这是无技巧信息的旧调用路径，数值必须与改造前一致。
 */
export function hammerTechnique({ directionVector = null, contact = null, seed = 1, strikeIndex = 1 } = {}) {
  const landing = normalizeLanding(contact);
  const spot = sweetSpotOf(seed, strikeIndex);
  const aim = landing ? aimScore(landing, spot) : 0;
  const blended = blendLandingVector(directionVector, landing ? LANDING_ZONES[landing.zone].vector : null);
  return {
    active: !!landing,
    landing,
    spot,
    aim: Math.round(aim * 1000) / 1000,
    /* 只有真实落点才吃到瞄准加成；旧路径恒为 1，保持数值不变。 */
    gainScale: landing ? 1 + SWEET_SPOT_MAX_BONUS * aim : 1,
    /* ★ 无落点 → 权重为 null，调用方退回改造前的单属性路径。
       这保证模拟器、每日兜底与旧测试的数值逐字不变（平衡基线不被扰动）。 */
    weight: landing && blended ? blended.weight : null,
    mixed: landing && blended ? blended.mixed : false,
    zoneName: landing ? landing.zoneName : null,
  };
}

/**
 * 按权重把一份总成果拆到六维，且**保证各分项之和等于总量**（不留浮点残差）。
 * 权重缺失 → 全部落到 fallbackKey（旧行为的单属性路径）。
 *
 * @param {number} total 已含技巧修正的总成果
 * @param {object|null} weight 归一化权重
 * @param {string} [fallbackKey='strength']
 * @param {object|null} [vector] 原样回传给 UI 的向量
 * @returns {{delta:object, total:number, vector:object}}
 */
export function distributeGain(total, weight, fallbackKey = 'strength', vector = null) {
  const sum = Math.max(0, Math.round((Number(total) || 0) * 100) / 100);
  if (!weight) {
    return { delta: sum ? { [fallbackKey]: sum } : {}, total: sum, vector: vector || { [fallbackKey]: 1 } };
  }
  const delta = {};
  let assigned = 0;
  const keys = STAT_KEYS.filter((k) => (weight[k] || 0) > 0);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (i === keys.length - 1) {
      const rest = Math.round((sum - assigned) * 100) / 100;
      if (rest > 0) delta[k] = rest;
      break;
    }
    const part = Math.round(sum * weight[k] * 100) / 100;
    if (part > 0) { delta[k] = part; assigned += part; }
  }
  return { delta, total: sum, vector: vector || weight };
}

export default {
  SWEET_SPOT_MAX_BONUS, SWEET_SPOT_RADIUS, LANDING_ZONES, LANDING_BANDS, DIRECTION_WEIGHT,
  normalizeLanding, landingOf, sweetSpotOf, aimScore, blendLandingVector, hammerTechnique, distributeGain,
};
