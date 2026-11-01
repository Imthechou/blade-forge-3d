/**
 * 渲染层 · 工序热辐射（B1 熔炼 / B3 淬火的温度表现）
 *
 * 真实锻打里，金属在接近熔点时**自身会发光**（黑体辐射）：650°C 暗红、
 * 900°C 橙红、1200°C 橙黄、1500°C 接近白热。这不是「加一个发光特效」，
 * 而是材质的物理属性 —— 用 three 的 emissive 通道表达最准确，也最省。
 *
 * 为什么需要这个模块
 *   实测 S2「熔炼主工艺」阶段（`molten_sphere_small`）在真实 Chromium 里
 *   渲染成一块**黑色钝石**：既没有熔液流动感，也没有任何温度提示。
 *   玩家看不出「这是正在熔化的金属」还是「一块石头」，炉火环节的情绪
 *   完全丢失。S1 矿石与 S3 钢锭同样缺少温度层次。
 *
 * 设计约束（严格遵守）
 *   · **不改材质表、不改卡牌数据、不改任何玩法数值**：本模块只在渲染层
 *     按阶段给 emissive 通道写值，阶段结束立刻清零。
 *   · emissive 是 uniform 而非宏：`emissive` 从黑变亮不改变 program 缓存键
 *     （three 的 USE_EMISSIVEMAP 只看有没有贴图），因此不会引入重编译。
 *   · 必须可逆：离开该阶段、切换模型或释放 viewer 时，一定把
 *     emissiveIntensity 复位，绝不把「热」带到下一道工序或收藏页。
 *   · 支持 reducedMotion：减少动效时保留稳定的低温辉光，不做脉动。
 *
 * 纯数据 + 纯函数，不 import three，便于 Node 单测。
 */

/**
 * 黑体辐射色（按温度档位）。
 * 取自钢铁实际加热观感的近似值，避免用饱和的「假火焰色」。
 */
export const HEAT_COLORS = Object.freeze({
  ambient:  '#000000',   // 常温：不发光
  warm:     '#5c1a06',   // ~650°C  暗红，刚开始发红
  red:      '#a82a08',   // ~900°C  橙红
  orange:   '#d95a12',   // ~1200°C 橙黄
  yellow:   '#f0952a',   // ~1400°C 亮橙黄
  white:    '#ffe6b8',   // ~1500°C 近白热
});

/**
 * 每个工序阶段的热辐射配方。
 *
 * intensity 是 emissiveIntensity 的目标值：
 *   0     = 完全冷却，不发光
 *   0.4+  = 明显自发光（在浅色背景上仍然可读）
 * pulse  = 是否做缓慢的呼吸（模拟炉火/熔液流动），reducedMotion 下关闭
 * heat   = 语义温度档位名，便于调试与测试断言
 */
export const STAGE_HEAT = Object.freeze({
  /* S1 选料：冷矿，最多带一点余温（矿石刚出矿脉，不应发光） */
  S1: Object.freeze({ color: 'ambient', intensity: 0, pulse: false, heat: 'cold' }),
  /* S2 熔炼：主工艺把料烧到熔融，这是全场温度最高的时刻 */
  S2: Object.freeze({ color: 'orange', intensity: 0.62, pulse: true, heat: 'molten' }),
  /* S3 预锻：钢锭从炉里取出，仍然橙红，但已开始降温 */
  S3: Object.freeze({ color: 'red', intensity: 0.34, pulse: false, heat: 'hot' }),
  /* S4 锻打：钢坯处于可锻温度，暗红余温（不抢主视觉） */
  S4: Object.freeze({ color: 'warm', intensity: 0.16, pulse: false, heat: 'warm' }),
  /* ★ S5 淬火：真实淬火是把**通红**的刀身插入冷却液 ——
     入液那一刻刀身仍然炽热（橙红），随后骤降。这是淬火最重要的视觉，
     之前给 0.10 的「warm」等于什么都没表现。
     现在给 0.42 的 red：玩家一眼能看出「这是刚出炉的高温刀身」。 */
  S5: Object.freeze({ color: 'red', intensity: 0.42, pulse: false, heat: 'quenching' }),
  /* S6 回火：低温回火，几乎不发光（回火色是表面氧化色，不是自发光） */
  S6: Object.freeze({ color: 'ambient', intensity: 0, pulse: false, heat: 'tempering' }),
  /* S7 开刃及之后：常温 */
  S7: Object.freeze({ color: 'ambient', intensity: 0, pulse: false, heat: 'cold' }),
  S8: Object.freeze({ color: 'ambient', intensity: 0, pulse: false, heat: 'cold' }),
  S9: Object.freeze({ color: 'ambient', intensity: 0, pulse: false, heat: 'cold' }),
  S10: Object.freeze({ color: 'ambient', intensity: 0, pulse: false, heat: 'cold' }),
  S7: Object.freeze({ color: 'ambient', intensity: 0, pulse: false, heat: 'cold' }),
});

/**
 * 哪些模型属于「炉内 / 高温」模型，可以承载热辐射。
 * ore / molten / ingot 是原料与钢坯。
 */
const HEATABLE_MODELS = Object.freeze(new Set([
  'ore_small', 'molten_sphere_small', 'blank_ingot_small',
]));

/**
 * 哪些阶段允许**刀具模型**自身炽热。
 *
 * 这必须谨慎：真实的淬火是把通红刀身插入冷却液，入液那一刻刀身确实
 * 在发光 —— 这是淬火最重要的视觉。但锻打之后（S6 起）刀身必须回到冷钢，
 * 否则整把刀会变成发光棒，收藏页也会失真。
 *
 * 因此只有 S5 这一个阶段放开刀具模型的自发光。
 */
const BLADE_HEAT_STAGES = Object.freeze(new Set(['S5']));

/** 刀具模型 id 判断（knife_straight / knife_tangdao / …）。 */
const isBladeModel = (modelId) => /^knife_/.test(String(modelId || ''));

/**
 * 判断某个模型在某个阶段是否允许热辐射。
 *
 * @param {string} modelId
 * @param {string} [stageId] 省略时按「非刀具模型」的旧口径判断
 * @returns {boolean}
 */
export function canCarryHeat(modelId, stageId = null) {
  const id = String(modelId || '');
  if (HEATABLE_MODELS.has(id)) return true;
  /* 刀具模型只在淬火阶段可以炽热；其它阶段一律冷钢。 */
  if (isBladeModel(id)) return stageId != null && BLADE_HEAT_STAGES.has(String(stageId));
  return false;
}

/**
 * 取某阶段的热配方。未知阶段 → 常温（安全默认，绝不误发光）。
 * @param {string} stageId
 * @returns {{color:string,intensity:number,pulse:boolean,heat:string}}
 */
export function heatForStage(stageId) {
  return STAGE_HEAT[stageId] || STAGE_HEAT.S7;
}

/**
 * 计算某阶段在某一时刻实际要写入的 emissive 参数。
 *
 * @param {object} input
 * @param {string} input.stageId
 * @param {string} input.modelId
 * @param {boolean} [input.reducedMotion]
 * @param {number} [input.timeMs] 用于脉动的单调时间；缺省视为静止
 * @returns {{apply:boolean, colorHex:string, intensity:number, heat:string}}
 *   apply=false 表示不要触碰任何材质（保持模型自带外观）。
 */
export function heatStateFor({ stageId, modelId, reducedMotion = false, timeMs = 0 } = {}) {
  const recipe = heatForStage(stageId);
  if (!recipe.intensity || !canCarryHeat(modelId, stageId)) {
    return { apply: false, colorHex: HEAT_COLORS.ambient, intensity: 0, heat: recipe.heat };
  }
  let intensity = recipe.intensity;
  if (recipe.pulse && !reducedMotion) {
    /* 缓慢呼吸：周期约 2.4s，幅度 ±12%。模拟炉火/熔液对流，
       刻意做得比 UI 动画慢很多，避免变成廉价的闪烁。 */
    const phase = (Number(timeMs) || 0) / 2400 * Math.PI * 2;
    intensity *= 1 + 0.12 * Math.sin(phase);
  }
  return {
    apply: true,
    colorHex: HEAT_COLORS[recipe.color] || HEAT_COLORS.ambient,
    intensity: Math.max(0, Math.min(1, Math.round(intensity * 1000) / 1000)),
    heat: recipe.heat,
  };
}

export default { HEAT_COLORS, STAGE_HEAT, canCarryHeat, heatForStage, heatStateFor };
