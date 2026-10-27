/**
 * 数据配置层 · 图鉴统一目录（rework T12）
 *
 * ★ 要修什么（审计问题 12 的图鉴部分）：
 *   改造前 `codexTotal()` 是 `CARDS + COMBOS + KNIFE_TYPES + BRANCHES×GRADIENTS + 60`
 *   —— 最后那个 **写死的 60** 不对应任何真实内容集合。
 *   同时 `material` / `finish` / `arena` 三个目录**从来没有写入过**，
 *   于是完成度分母包含玩家永远开不满的项目，进度条注定走不到 100%。
 *
 * ★ 本文件是图鉴**唯一**的内容与分母真源：
 *   每个分类声明自己的条目列表、总数与「未发现时给什么线索」。
 *   UI 只读这里，不自己拼第二套清单。
 *
 * ⚠ 断裂记录（fracture）是**事件型**分类，没有固定分母：
 *   它记录「玩家真实断过的刀」，因此 total 为 null，不参与完成度百分比。
 */

import { CARDS } from './cards.js';
import { COMBOS } from './combos.js';
import { KNIFE_TYPES } from './knifeTypes.js';
import { TAGS } from './tags.js';
import { BASE_TAG_TRAITS, SPECIAL_TAG_TRAITS, HAMMER_TIER_TRAITS, setLegacyTraits, legacyTraits } from './traits.js';
import { traitsV11 } from './legacy/traitsV11.js';
import { BRANCHES, GRADIENTS } from './arena/branches.js';
import { materials } from './legacy/materials.js';
import { knifeTypes } from './legacy/knifeTypes.js';

/** 确保 LEGACY 特性已注册（图鉴是纯展示层，不能依赖 run 先跑过） */
let legacyReady = false;
function ensureLegacy() {
  if (legacyReady || legacyTraits().length) { legacyReady = true; return; }
  setLegacyTraits((traitsV11.TRAITS || []).map((t) => ({
    id: t.id, kind: 'LEGACY', name: t.name,
    desc: t.trigger || '', statDelta: { ...(t.statDelta || {}) },
    tier: t.tier || 'normal', scoreMult: 1, rarityFloor: null,
  })));
  legacyReady = true;
}

/** 纹理中文名（来自 legacy/knifeTypes 的前缀表 = 真实名字） */
const TEXTURE_NAME = knifeTypes.TEXTURE_PREFIX || {};
const FINISH_NAME = knifeTypes.FINISH_PREFIX || {};

/**
 * 分类定义。
 * `items()` 返回 `[{id, name, desc, hint, group}]`；
 * `total` 为 null 表示事件型分类（无固定分母）。
 */
export const CODEX_CATALOG = Object.freeze([
  {
    id: 'knife',
    name: '刀型',
    desc: '十二款真实刀模',
    items: () => KNIFE_TYPES.map((k) => ({
      id: k.id, name: k.name, desc: k.desc || '', group: null,
      hint: '未锻造过的刀型',
    })),
  },
  {
    id: 'material',
    name: '材料',
    desc: 'S1 原料可选的材料',
    items: () => (materials.MATERIALS || []).map((m) => ({
      id: m.id, name: m.name, desc: m.note || '', group: m.rarity || null,
      hint: `稀有度 ${m.rarity || '未知'} 的原料`,
    })),
  },
  {
    id: 'texture',
    name: '纹理',
    desc: 'S2/S3 形成的锻纹',
    items: () => Object.entries(TEXTURE_NAME)
      .filter(([, name]) => !!name)
      .map(([id, name]) => ({
        id, name, desc: '', group: null,
        hint: '尚未形成的锻纹',
      })),
  },
  {
    id: 'finish',
    name: '工艺',
    desc: 'S5/S6 的热处理与表面工艺',
    items: () => Object.entries(FINISH_NAME)
      .filter(([, name]) => !!name)
      .map(([id, name]) => ({
        id, name, desc: '', group: null,
        hint: '尚未使用的表面工艺',
      })),
  },
  {
    id: 'card',
    name: '工艺卡',
    desc: '九阶段的决策卡',
    items: () => CARDS.map((c) => ({
      id: c.id, name: c.name, desc: c.copy || '', group: c.stage || null,
      hint: `${c.stage || '未知阶段'} 的候选卡`,
    })),
  },
  {
    id: 'tag',
    name: '工艺标签',
    desc: '基础、特殊与风味标签',
    items: () => TAGS.map((t) => ({
      id: t.id, name: t.name, desc: t.desc || '', group: null,
      hint: '尚未积累的工艺倾向',
    })),
  },
  {
    id: 'trait',
    name: '特性',
    desc: '基础成长、特殊、锻打与卡池特性',
    items: () => {
      ensureLegacy();
      const out = [];
      for (const t of Object.values(BASE_TAG_TRAITS)) out.push({ id: t.id, name: t.name, desc: t.desc, group: '基础标签' });
      for (const t of Object.values(SPECIAL_TAG_TRAITS)) out.push({ id: t.id, name: t.name, desc: t.desc, group: '特殊标签' });
      for (const t of Object.values(HAMMER_TIER_TRAITS)) out.push({ id: t.id, name: t.name, desc: t.desc, group: 'S4 锻打' });
      for (const t of legacyTraits()) out.push({ id: t.id, name: t.name, desc: t.desc, group: '卡池特性' });
      return out.map((t) => ({ ...t, hint: `${t.group || '未知来源'}中的一条特性` }));
    },
  },
  {
    id: 'combo',
    name: '隐藏组合',
    desc: '条件隐藏 Combo',
    items: () => COMBOS.map((c) => ({
      id: c.id, name: c.name, desc: c.conditions || '', group: c.rarity || null,
      /** 未发现时只给线索，不泄露配方（T12 验收要求） */
      hint: c.hint || '尚未发现触发条件',
    })),
  },
  {
    id: 'arena',
    name: '赛事',
    desc: '六流派 × 五档',
    items: () => BRANCHES.flatMap((b) => GRADIENTS.map((g) => ({
      id: `${b.id}:${g.tier}`, name: `${b.name} · ${g.name}`,
      desc: b.desc || '', group: b.name,
      hint: '尚未通关的对阵',
    }))),
  },
  {
    id: 'fracture',
    name: '断刀记录',
    desc: '真实断过的刀（事件型，无固定分母）',
    /** 事件型：没有固定集合，total = null，不参与完成度 */
    items: () => [],
    eventOnly: true,
  },
]);

export const CATALOG_BY_ID = Object.freeze(
  Object.fromEntries(CODEX_CATALOG.map((c) => [c.id, c])),
);

/** 某个分类的完整条目（惰性计算并缓存） */
const cache = new Map();
export function itemsOf(categoryId) {
  const def = CATALOG_BY_ID[categoryId];
  if (!def) return [];
  if (!cache.has(categoryId)) cache.set(categoryId, def.items());
  return cache.get(categoryId);
}

/** 某个分类的固定分母（事件型返回 null） */
export function totalOf(categoryId) {
  if (CATALOG_BY_ID[categoryId]?.eventOnly) return null;
  return itemsOf(categoryId).length;
}

/** 参与完成度计算的分类（排除事件型） */
export const COUNTED_CATEGORIES = Object.freeze(
  CODEX_CATALOG.filter((c) => !c.eventOnly).map((c) => c.id),
);

/** 图鉴总分母：由**真实内容集合**推导，不再是写死的 +60 */
export function catalogTotal() {
  return COUNTED_CATEGORIES.reduce((sum, id) => sum + (totalOf(id) || 0), 0);
}

/** 某分类已发现数量 */
export function foundCount(codexState, categoryId) {
  const bucket = codexState?.[categoryId];
  return bucket && typeof bucket === 'object' ? Object.keys(bucket).length : 0;
}

/**
 * 完整进度视图（UI 直接渲染）。
 * @param {object} codexState 存档里的 `codex`
 */
export function codexProgressView(codexState = {}) {
  let found = 0;
  let total = 0;
  const groups = CODEX_CATALOG.map((def) => {
    const items = itemsOf(def.id);
    const bucket = codexState?.[def.id] || {};
    const foundItems = items.filter((it) => !!bucket[it.id]);
    const eventOnly = !!def.eventOnly;
    const groupTotal = eventOnly ? null : items.length;
    if (!eventOnly) { found += foundItems.length; total += items.length; }
    return {
      id: def.id,
      name: def.name,
      desc: def.desc,
      eventOnly,
      total: groupTotal,
      found: eventOnly ? Object.keys(bucket).length : foundItems.length,
      /** 未发现条目带 hint，已发现带真实 desc */
      entries: items.map((it) => {
        const hit = !!bucket[it.id];
        return {
          id: it.id,
          name: hit ? it.name : null,
          group: it.group || null,
          desc: hit ? (it.desc || '') : null,
          hint: it.hint || '未发现',
          found: hit,
        };
      }),
    };
  });
  return {
    found,
    total,
    percent: total > 0 ? Math.min(100, Math.round((found / total) * 100)) : 0,
    groups,
  };
}

export default CODEX_CATALOG;
