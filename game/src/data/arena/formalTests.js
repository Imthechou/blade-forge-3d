/**
 * 数据配置层 · 正式赛事统一定义（rework T06 / T08）
 *
 * ★ 要修什么（审计问题 4）：改造前主入口 `Game.startSliceMatch()` → arenaSlice，
 *   单刀赛是**三次 35 秒切割**加逐局 buff 三选一。
 *   同刀同种子学徒档的六分支实验拿到完全相同的目标分（3035/3570/4284）、
 *   相同的首批强化候选与相同的靶具指纹 —— 换流派等于没换比赛。
 *
 * ★ 本文件是**唯一**的正式赛事真源：
 *   每场赛事 = mode + 资格 + 项目序列 + 每项规则/靶具 + 目标分 + 权重 + 奖励。
 *   不同流派必须有不同的**项目组合**，而不只是更高的目标分。
 *
 * ★ 五档（学徒→传奇）提高的是：项目数、操作要求、靶具硬度与目标分，
 *   并提供可理解的解锁条件（不是幽灵目标分）。
 *
 * ⚠ 以下配方是**可调实施方案**（T08 标注为「推荐初版」），不是用户锁定的精确赛程。
 */

import { TEST_PROJECTS } from '../balance.js';

/** 赛事规则版本：改项目/权重/目标分都要升版本，历史战绩标注旧版本 */
export const FORMAL_RULES_VERSION = 'formal-1';

/**
 * 六个流派（id 与 data/arena/branches.js、legacy/arenaStyles.js 一致）。
 *
 * tests —— 该项目序列必须**互不相同**，这是 A10 的判定依据；
 * weights —— 项目权重（已归一），体现该流派的取舍重点；
 * focus —— 玩家能读懂的「这场比赛考什么」。
 */
export const BRANCH_FORMATS = Object.freeze({
  press: Object.freeze({
    id: 'press', name: '锻压',
    focus: '强度 + 耐久：抗冲击与结构承载',
    tests: ['strength', 'durability'],
    weights: { strength: 0.55, durability: 0.45 },
    brief: '重锤压制的结构赛。先看承载，再看持续负荷下的保持。',
  }),
  edge: Object.freeze({
    id: 'edge', name: '锋刃',
    focus: '切割 + 耐久：连续切断与性能保持',
    tests: ['cutting', 'durability'],
    weights: { cutting: 0.60, durability: 0.40 },
    brief: '连续切断赛。首项看刃口效率，次项看切到后半程还剩多少。',
  }),
  precise: Object.freeze({
    id: 'precise', name: '精密',
    focus: '精度 + 切割：狭窄目标与稳定操作',
    tests: ['precision', 'cutting'],
    weights: { precision: 0.60, cutting: 0.40 },
    brief: '窄幅精准赛。先过刃线容差，再在限定窗口内完成切断。',
  }),
  quench: Object.freeze({
    id: 'quench', name: '淬彩',
    focus: '耐久 + 极限：热处理特性适配',
    tests: ['durability', 'extreme'],
    weights: { durability: 0.55, extreme: 0.45 },
    brief: '热处理赛。看组织稳定性，再看超负荷时的余量。不仅比外观。',
  }),
  composite: Object.freeze({
    id: 'composite', name: '复合',
    focus: '切割 + 强度 + 精度：综合取舍',
    tests: ['cutting', 'strength', 'precision'],
    weights: { cutting: 0.34, strength: 0.33, precision: 0.33 },
    brief: '三项综合赛。没有单项特别占优的刀也能靠均衡取胜。',
  }),
  overload: Object.freeze({
    id: 'overload', name: '过载',
    focus: '强度 + 极限：达标后自主收手与超载',
    tests: ['strength', 'extreme'],
    weights: { strength: 0.50, extreme: 0.50 },
    brief: '超载赛。先证明承载，再在明确警告下选择收手还是加压。',
  }),
});

export const BRANCH_FORMAT_LIST = Object.freeze(Object.values(BRANCH_FORMATS));
export const branchFormat = (id) => BRANCH_FORMATS[id] || null;

/**
 * 五档梯度（id 与 branches.GRADIENTS 的序位一致：0..4）。
 *
 * 每档提高：
 *   extraTest   —— 是否追加第三项（复合/精密在高档变三项）
 *   targetBase  —— 目标分基数（合成分量级，0–100+）
 *   targetStep  —— 每档递增
 *   hardness    —— 靶具/操作要求倍率（1.0 起）
 *   window      —— 操作窗口（秒，或精度测试的容差窗口占比）
 *   require     —— 玩家可见的解锁/挑战条件说明
 */
export const GRADIENT_RULES = Object.freeze([
  { tier: 0, name: '学徒', targetBase: 84, targetStep: 0, hardness: 1.00, window: 1.00,
    require: '入门档：完成两项测试即可，靶具为标准硬度。' },
  { tier: 1, name: '能手', targetBase: 88, targetStep: 0, hardness: 1.06, window: 0.95,
    require: '难度提升：靶具略硬、操作窗口收窄约 5%。' },
  { tier: 2, name: '专家', targetBase: 92, targetStep: 0, hardness: 1.12, window: 0.90,
    require: '专家档：靶具更硬，操作窗口收窄约 10%。' },
  { tier: 3, name: '大师', targetBase: 96, targetStep: 0, hardness: 1.18, window: 0.85,
    require: '大师档：靶具明显偏硬，窗口收窄约 15%。' },
  { tier: 4, name: '传奇', targetBase: 100, targetStep: 0, hardness: 1.24, window: 0.80,
    require: '传奇档：最硬靶具与最窄窗口，只有真正适配的刀能稳过。' },
]);

export const gradientRule = (tier) => GRADIENT_RULES[Math.max(0, Math.min(GRADIENT_RULES.length - 1, tier | 0))];

/**
 * 每种测试项目的操作规则（T06.2 的「项目规则」）。
 *
 * kind：
 *   sweep    —— 滑切手势（切割/复合）
 *   trace    —— 沿路径描线（精度）
 *   sustain  —— 可见负荷施加与结构反应（强度）
 *   hold     —— 持续测试中的能力保持（耐久）
 *   overload —— 达标后选择收手或加压（极限）
 */
export const PROJECT_RULES = Object.freeze({
  cutting: Object.freeze({
    kind: 'sweep', seconds: 45, materials: ['rope', 'foam', 'wood', 'plastic'],
    label: '限定时间内沿目标连切，软靶可一刀断，硬靶保留损伤',
    measureLabel: '切断效率',
  }),
  precision: Object.freeze({
    kind: 'trace', seconds: 20, tolerance: 0.30,
    label: '沿指定刃线沉稳描画，偏差与抖动都会扣分',
    measureLabel: '贴合与稳定',
  }),
  strength: Object.freeze({
    kind: 'sustain', seconds: 18, loadSteps: 4,
    label: '逐步施加负荷，观察结构反应与承载结果',
    measureLabel: '承载表现',
  }),
  durability: Object.freeze({
    kind: 'hold', seconds: 24, decay: 0.06,
    label: '持续测试中保持能力，越到后期越考验韧性',
    measureLabel: '能力保持',
  }),
  extreme: Object.freeze({
    kind: 'overload', seconds: 15, warningAt: 0.6,
    label: '达标后可选择收手或继续加压；加压计入得分但有临时损伤',
    measureLabel: '超载余量',
  }),
});

export const projectRule = (id) => PROJECT_RULES[id] || null;

/**
 * 生成一场正式赛的完整定义。
 *
 * @param {object} o
 * @param {string} o.branchId   流派 id（六选一）
 * @param {number} o.gradient   档位 0–4
 * @param {number} [o.seed]     固定种子（用于可复现）
 * @returns {object} 赛事定义（含项目序列、权重、目标分、规则）
 */
export function buildFormalDefinition({ branchId, gradient = 0, seed = null } = {}) {
  const branch = branchFormat(branchId);
  if (!branch) return { ok: false, reason: '未知流派' };
  const g = gradientRule(gradient);

  /* 项目序列必须至少 2 项，且全部是已知项目 */
  const tests = branch.tests.filter((t) => TEST_PROJECTS[t]);
  if (tests.length < 2) return { ok: false, reason: '该流派缺少有效测试项目' };

  /* 权重：只保留实际出现的项目，并归一 */
  let weights = {};
  let wsum = 0;
  for (const t of tests) wsum += Math.max(0, Number(branch.weights[t]) || 0);
  for (const t of tests) {
    weights[t] = wsum > 0 ? Math.max(0, Number(branch.weights[t]) || 0) / wsum : 1 / tests.length;
  }

  const targetScore = round1(g.targetBase);

  return {
    ok: true,
    version: FORMAL_RULES_VERSION,
    branchId: branch.id,
    branchName: branch.name,
    focus: branch.focus,
    brief: branch.brief,
    gradient: g.tier,
    gradientName: g.name,
    require: g.require,
    seed: seed == null ? null : Number(seed) >>> 0,
    tests,
    weights,
    targetScore,
    hardness: g.hardness,
    window: g.window,
    /** 每项的完整规则（UI 赛前情报直接读这里） */
    rules: tests.map((t) => ({
      // 项目 ID 与交互操作种类必须分开；kind 保留给旧舞台选择 Canvas 操作。
      // 不可让 projectRule(t).kind = 'sweep' 覆盖 cutting 的检索 ID。
      projectId: t,
      name: TEST_PROJECTS[t].name,
      ...(projectRule(t) || {}),
      weight: round1(weights[t] * 100) / 100,
      stats: [...(TEST_PROJECTS[t].stats || [])],
    })),
    /** 赛事指纹：同刀同种子不同流派必须不同（A10 判定依据） */
    fingerprint: tests.join('+'),
  };
}

function round1(v) { return Math.round(v * 10) / 10; }

/** 六流派在给定档位的定义（用于「换流派真的不同场」的审计） */
export function allBranchDefinitions(gradient = 0) {
  return BRANCH_FORMAT_LIST.map((b) => buildFormalDefinition({ branchId: b.id, gradient }));
}

export default {
  FORMAL_RULES_VERSION, BRANCH_FORMATS, BRANCH_FORMAT_LIST, GRADIENT_RULES,
  PROJECT_RULES, branchFormat, gradientRule, projectRule,
  buildFormalDefinition, allBranchDefinitions,
};
