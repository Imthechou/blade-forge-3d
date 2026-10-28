/** 工坊：藏刀阁、成就、锻造加成与图鉴；保留长期玩法与完整检视信息。 */
import { el, $, clear, mount, toast, sheet } from '../dom.js';
import { rarityBadge, statRail } from '../components.js';
import { bladeCardModel, bladeCard, bladeCardDetail, compareModels } from '../bladeCard.js';
import * as Core from '../../core/index.js';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from '../../data/achievements.js';
import { COMBOS } from '../../data/combos.js';
import { KNIFE_TYPES, resolveModelId } from '../../data/knifeTypes.js';
import { tagName } from '../../data/tags.js';
import { getTrait } from '../../data/traits.js';
import { Game } from '../../app/game.js';
import { BladeStage } from '../../render/index.js';
import { mountCollectionPreview, disconnectCollectionPreviews } from '../../render/collectionPreview.js';
import * as CodexCatalog from '../../data/codexCatalog.js';
import router from '../router.js';

const TABS = [
  { id: 'collection', name: '藏刀阁' },
  { id: 'achievements', name: '成就' },
  { id: 'bonuses', name: '锻造加成' },
  { id: 'codex', name: '图鉴' },
];

let root = null;
let body = null;
let tabHost = null;
let tab = 'collection';
let detailSequence = 0;

/* ★ rework T13.4：收藏的筛选/排序/比较多刀。
   与 tab 一样是模块态，跨 render 保留；不写存档。 */
const SORTS = [
  { id: 'score', name: '评分' },
  { id: 'recent', name: '最新' },
  { id: 'arena', name: '赛事经历' },
  { id: 'name', name: '名称' },
];
const FILTERS = [
  { id: 'all', name: '全部' },
  { id: 'arena', name: '有赛事经历' },
  { id: 'trait', name: '有高阶特性' },
];
let collectionSort = 'score';
let collectionFilter = 'all';
/** 比较选择（最多 2 把） */
let compareIds = [];

/* ★ rework T12：图鉴的搜索与筛选状态（模块态，跨 render 保留）。
   图鉴有 460 项，没有搜索就只能一页页翻。 */
let codexQuery = '';
let codexOnlyMissing = false;

export function create() {
  root = $('.page[data-page="workshop"]');
  if (!root) return;
  clear(root);
  tabHost = el('div', { class: 'pill-tabs ws-tabhost', role: 'tablist', 'aria-label': '工坊分类' });
  body = el('div', { class: 'ws-body', role: 'tabpanel', id: 'workshopPanel', tabindex: '0' });
  root.append(tabHost, body);
}

export function render() {
  if (!root) create();
  if (!body) return;
  mount(tabHost, TABS.map((item) => el('button', {
    class: 'pill-tab' + (item.id === tab ? ' is-on' : ''),
    type: 'button', role: 'tab',
    'aria-selected': String(item.id === tab), 'aria-controls': 'workshopPanel', id: `workshopTab-${item.id}`, tabindex: item.id === tab ? '0' : '-1',
    onkeydown: event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const index = TABS.findIndex(entry => entry.id === tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
      tab = TABS[next].id; render(); tabHost.querySelector('[aria-selected="true"]')?.focus();
    },
    text: item.name,
    onclick: () => { tab = item.id; render(); tabHost.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true }); },
  }))); 
  body.setAttribute('aria-labelledby', `workshopTab-${tab}`);
  disconnectCollectionPreviews();
  clear(body);
  ({ collection: renderCollection, achievements: renderAchievements, bonuses: renderBonuses, codex: renderCodex })[tab]();
}

/** 首页快捷导航可直接进入指定工坊分类。 */
export function openTab(id) {
  if (TABS.some((item) => item.id === id)) tab = id;
  router.go('workshop');
}

/* ── 藏刀阁 ───────────────────────────────────────────── */
function renderCollection() {
  const list = Core.progress.collection();
  const fractures = Core.progress.fracturedList();
  body.appendChild(el('button', {
    class: 'card ws-fracture-entry', type: 'button',
    'aria-haspopup': 'dialog', onclick: openFractures,
  }, [
    el('span', {}, [
      el('b', { text: `断刀册 · ${fractures.length} 把` }),
      el('span', { class: 'muted tiny', text: fractures.length ? '查看断裂记录与详情' : '暂无断刀记录' }),
    ]),
    el('span', { text: '查看 ›', 'aria-hidden': 'true' }),
  ]));
  if (!list.length) {
    body.appendChild(el('div', { class: 'card ws-empty', text: '还没有成刀。锻出第一把刀后，它会永久留在这里。' }));
    return;
  }

  body.appendChild(el('div', { class: 'section-title', text: `成刀 ${list.length} 把` }));

  /* ★ rework T13.4：筛选与排序控件 */
  body.appendChild(el('div', { class: 'ws-collection-controls' }, [
    el('div', { class: 'ws-control-row', role: 'group', 'aria-label': '排序' }, [
      el('span', { class: 'muted tiny', text: '排序' }),
      ...SORTS.map((s) => el('button', {
        class: 'chip' + (collectionSort === s.id ? ' chip--accent' : ''),
        type: 'button', 'aria-pressed': String(collectionSort === s.id), text: s.name,
        onclick: () => { collectionSort = s.id; render(); },
      })),
    ]),
    el('div', { class: 'ws-control-row', role: 'group', 'aria-label': '筛选' }, [
      el('span', { class: 'muted tiny', text: '筛选' }),
      ...FILTERS.map((f) => el('button', {
        class: 'chip' + (collectionFilter === f.id ? ' chip--accent' : ''),
        type: 'button', 'aria-pressed': String(collectionFilter === f.id), text: f.name,
        onclick: () => { collectionFilter = f.id; render(); },
      })),
    ]),
    compareIds.length ? el('div', { class: 'ws-control-row' }, [
      el('span', { class: 'muted tiny', text: `已选 ${compareIds.length}/2 把` }),
      el('button', {
        class: 'btn btn--primary', type: 'button', text: '比较这两把',
        disabled: compareIds.length < 2,
        onclick: () => openCompare(),
      }),
      el('button', { class: 'btn', type: 'button', text: '取消选择', onclick: () => { compareIds = []; render(); } }),
    ]) : null,
  ].filter(Boolean)));

  /* 筛选 → 排序（只影响展示顺序，不改存档） */
  let shown = list.slice();
  if (collectionFilter === 'arena') shown = shown.filter((b) => (b.arenaHistory || []).length > 0);
  else if (collectionFilter === 'trait') {
    shown = shown.filter((b) => (b.tagTiers || []).some((t) => (t.effectiveLayers ?? t.layers ?? 0) >= 6)
      || (b.traits || []).some((id) => getTrait(id)?.kind === 'SPECIAL_TAG'));
  }
  shown.sort((a, b) => {
    if (collectionSort === 'recent') return (b.createdAt || 0) - (a.createdAt || 0);
    if (collectionSort === 'name') return String(a.bladeName || a.id).localeCompare(String(b.bladeName || b.id), 'zh');
    if (collectionSort === 'arena') return (b.arenaHistory || []).length - (a.arenaHistory || []).length;
    return (b.score || 0) - (a.score || 0);
  });

  if (!shown.length) {
    body.appendChild(el('div', { class: 'card ws-empty', text: '当前筛选条件下没有成刀。' }));
    return;
  }

  const grid = el('div', { class: 'ws-collection-grid' });
  body.appendChild(grid);
  for (const blade of shown) {
    /* ★ rework T13.1：用**共用**展示模型与卡片，不在这里另拼一套。
       3D 缩略图仍由 mountCollectionPreview 挂到卡面主视觉位。 */
    const model = bladeCardModel(blade, { kind: 'collection' });
    const art = el('div', { class: 'blade-thumb', 'aria-hidden': 'true' });
    const visual = Game.resolveVisualState(blade, {}, { modelId: model.modelId, viewPreset: 'forge' });
    mountCollectionPreview(art, blade, visual);

    const picked = compareIds.includes(blade.id);
    const card = bladeCard(model, { art, onOpen: () => inspect(blade) });
    card.appendChild(el('div', { class: 'bcv-top bcv-compare-row', style: { gap: '6px' } }, [
      el('button', {
        /* ★ 移动端：卡片内的“加入比较”也是可点控件。
           移动审计（audit-mobile.mjs）在 4 个视口都报它只有 66×24。
           加专门类名，由 CSS 顶到 ≥44px（桌面仍可紧凑）。 */
        class: 'chip bcv-compare-btn' + (picked ? ' chip--accent' : ''), type: 'button',
        'aria-pressed': String(picked),
        text: picked ? '✓ 待比较' : '加入比较',
        onclick: (e) => {
          e.stopPropagation();
          const i = compareIds.indexOf(blade.id);
          if (i >= 0) compareIds.splice(i, 1);
          else if (compareIds.length < 2) compareIds.push(blade.id);
          else { toast('最多比较两把刀', 'warn'); return; }
          render();
        },
      }),
    ]));
    grid.appendChild(card);
  }
}

/** 两刀比较（T13.4：突出项目专长、特性与纪录，不只按总分判优） */
function openCompare() {
  const models = compareIds
    .map((id) => Core.progress.bladeById(id))
    .filter(Boolean)
    .map((b) => bladeCardModel(b, { kind: 'collection' }));
  if (models.length < 2) return;
  const { rows, labels } = compareModels(models);
  const table = el('div', { class: 'ws-compare' }, [
    el('div', { class: 'ws-compare-row is-head' }, [
      el('span', { text: '' }),
      ...labels.map((l) => el('b', { text: l })),
    ]),
    ...rows.map((row) => el('div', { class: 'ws-compare-row' }, [
      el('span', { class: 'muted tiny', text: row.label }),
      ...row.values.map((v, i) => el('span', {
        class: row.best === i ? 'is-best' : '',
        text: v,
      })),
    ])),
  ]);
  sheet({ title: '比较成刀', body: el('div', { class: 'stack' }, [
    table,
    el('p', { class: 'muted tiny', text: '高亮表示该项更优；相同则不标。评分高不等于所有项目都更强 —— 请结合刀型与特性看项目专长。' }),
  ]) });
}

/** 断刀档案只读展示；不依赖完整成刀，也不提供参赛或收藏操作。 */
function openFractures() {
  const content = el('div', { class: 'stack ws-fracture-content' });
  const archive = sheet({ title: '断刀册', body: content });
  archive.panel.classList.add('ws-fracture-sheet');
  archive.panel.querySelector('.sheet-x').textContent = '返回工坊';
  const scroll = archive.panel.querySelector('.sheet-body');
  const title = archive.panel.querySelector('.sheet-title');
  const line = (label, value) => el('div', { class: 'report-line', text: `${label}：${value ?? '未记录'}` });
  let listScroll = 0;
  function showList(focusIndex) {
    title.textContent = '断刀册';
    const records = Core.progress.fracturedList();
    mount(content, el('div', { class: 'muted tiny', text: `断刀 ${records.length} 把 · 仅供查看记录` }));
    if (!records.length) content.appendChild(el('div', {
      class: 'card ws-empty', text: '暂无断刀记录。断裂记录会保留在这里，可返回工坊继续查看其他档案。',
    }));
    records.forEach((blade, index) => content.appendChild(el('button', {
      class: 'card ws-fracture-item', type: 'button',
      'aria-label': `查看断刀详情：${blade.bladeName || blade.id || `断刀 ${index + 1}`}`,
      onclick: () => { listScroll = scroll.scrollTop; showDetail(blade, index); },
    }, [
      el('b', { text: blade.bladeName || blade.id || `断刀 ${index + 1}` }),
      el('span', { text: `断裂于 ${blade.fractureInfo?.stageName || blade.fractureInfo?.stageId || '未记录阶段'}` }),
      el('span', { class: 'muted tiny', text: `风险：${blade.fractureInfo?.risk ?? '未记录'} · 查看详情 ›` }),
    ])));
    scroll.scrollTop = listScroll;
    if (focusIndex != null) content.querySelectorAll('.ws-fracture-item')[focusIndex]?.focus({ preventScroll: true });
  }
  function showDetail(blade, index) {
    const info = blade.fractureInfo || {};
    const type = KNIFE_TYPES.find(item => item.id === blade.knifeTypeId);
    title.textContent = '断刀详情';
    const back = el('button', { class: 'btn ws-fracture-back', type: 'button', text: '返回断刀列表', onclick: () => showList(index) });
    mount(content, back,
      el('h3', { class: 'ws-fracture-name', text: blade.bladeName || blade.id || `断刀 ${index + 1}` }),
      el('div', { class: 'muted tiny', text: '断刀档案仅供回顾，不可作为完整成刀参赛。' }),
      el('div', { class: 'card stack' }, [
        line('档案编号', blade.id), line('刀型', type?.name || blade.knifeTypeId),
        line('来源', info.source === 'arena' ? '赛事断裂' : info.source || '锻造断裂'),
        line('断裂阶段', info.stageName || info.stageId), line('原因', info.cause || info.reason),
        line('风险', info.risk), line('峰值风险', info.peakRisk ?? blade.riskPeak),
        line('断裂概率', Number.isFinite(info.chance) ? `${Number((info.chance * 100).toFixed(2))}%` : null),
        ...(info.matchId ? [line('赛事编号', info.matchId)] : []),
      ]),
      el('div', { class: 'section-title', text: '六维属性' }), statRail(blade.stats || {}, null, true),
      line('评分', blade.score), line('品质', blade.qualityName),
      line('永久特性', (blade.traits || []).map(id => getTrait(id)?.name || id).join('、') || '无'),
      line('隐藏连携', (blade.combos || []).map(id => COMBOS.find(item => item.id === id)?.name || id).join('、') || '无'),
      line('工艺路线', (blade.history || []).join(' → ') || '未记录'),
      ...(info.evidence ? [el('details', { class: 'ws-fracture-evidence' }, [
        el('summary', { text: '结构失效记录' }),
        el('pre', { text: JSON.stringify(info.evidence, null, 2) }),
      ])] : []),
    );
    scroll.scrollTop = 0;
    back.focus({ preventScroll: true });
  }
  showList();
}

function inspect(blade) {
  const type = KNIFE_TYPES.find((item) => item.id === blade.knifeTypeId);
  const modelId = resolveModelId(blade, blade.knifeTypeId);
  const visual = Game.resolveVisualState(blade, {}, { modelId, viewPreset: 'forge' });
  const previewHost = el('div', { class: 'blade-detail-stage', role: 'img', 'aria-label': `${blade.bladeName || '成刀'}三维档案外观` });
  const previewStatus = el('div', { class: 'blade-detail-stage-status', text: BladeStage.supported ? '正在载入档案外观…' : '此设备不支持 WebGL，档案外观不可预览' });
  /* ★ rework T13.1：详情也读**同一份**展示模型（含赛事经历、工艺、风险）。
     改造前这里另拼了一套 trait/六维/履历，与卡面、赛报各说一套。 */
  const model = bladeCardModel(blade, { kind: 'collection' });
  const details = el('div', { class: 'stack' }, [
    el('div', { class: 'blade-detail-hero' }, [previewHost, previewStatus]),
    el('div', { class: 'blade-detail-head' }, [
      rarityBadge(blade.rarity, blade.rarityName),
      el('span', { class: 'chip', text: `品质 ${blade.qualityName || '未记录'}` }),
      el('span', { class: 'chip', text: `评分 ${blade.score ?? '—'}` }),
      model.arenaWins > 0 ? el('span', { class: 'chip chip--accent', text: `${model.arenaWins} 胜` }) : null,
    ].filter(Boolean)),
    /* 卡背：六维、特性（标注赛场职责）、连携、赛事经历、工艺与档案 */
    bladeCardDetail(model),
    el('div', { class: 'blade-detail-actions' }, [
      el('button', {
        class: 'btn', text: '设为代表作',
        onclick: () => { if (Core.progress.setShowcase(blade.id)) toast('已设为代表作', 'good'); },
      }),
      el('button', {
        class: 'btn', text: '重命名',
        onclick: () => {
          const nextName = globalThis.prompt('新的刀名', blade.bladeName || '');
          if (nextName && Core.progress.renameBlade(blade.id, nextName)) {
            const currentName = Core.progress.bladeById(blade.id)?.bladeName || nextName;
            detailSheet.panel.querySelector('.sheet-title').textContent = currentName;
            detailSheet.panel.setAttribute('aria-label', currentName);
            previewHost.setAttribute('aria-label', `${currentName}三维档案外观`);
            toast('已重命名'); render();
          }
        },
      }),
    ]),
  ]);
  const sequence = ++detailSequence;
  let detailStage = null;
  const detailSheet = sheet({
    title: blade.bladeName || blade.id,
    body: details,
    onClose: () => {
      if (detailSequence === sequence) detailSequence++;
      if (detailStage) detailStage._seq++;
      detailStage?.dispose();
      detailStage = null;
    },
  });
  detailSheet.panel.classList.add('blade-detail-sheet');
  // 仅调整 UI 层级：操作区离开滚动正文，原按钮及其行为保持不变。
  detailSheet.panel.appendChild(details.querySelector('.blade-detail-actions'));
  if (!modelId || !visual?.skin) {
    previewStatus.textContent = '档案缺少刀型或视觉数据，无法预览';
    return;
  }
  if (!BladeStage.supported) return;
  detailStage = new BladeStage();
  (async () => {
    const stage = detailStage;
    const mounted = await stage.mount(previewHost);
    if (detailSequence !== sequence || !previewHost.isConnected) { stage.dispose(); return; }
    if (!mounted?.ok) {
      previewStatus.textContent = '档案外观暂不可预览';
      stage.dispose();
      if (detailStage === stage) detailStage = null;
      return;
    }
    const environment = await stage.loadEnvironment();
    if (detailSequence !== sequence || !previewHost.isConnected) { stage.dispose(); return; }
    const shown = await stage.show(modelId, { viewPreset: visual.viewPreset || 'forge' });
    if (detailSequence !== sequence || !previewHost.isConnected) { stage.dispose(); return; }
    if (!shown?.ok) {
      previewStatus.textContent = '档案外观暂不可预览';
      stage.dispose();
      if (detailStage === stage) detailStage = null;
      return;
    }
    stage.applySkin(visual.skin, { coverAll: !visual.handle?.explicit });
    stage.applyHandle(visual.handle?.explicit ? visual.handle : null, visual.skin);
    stage.applyGlow(visual.glowCardId || null);
    try { await stage.viewer?._compilePromise; } catch (_) { /* 仍保留可用的 GLB 外形 */ }
    if (detailSequence !== sequence || !previewHost.isConnected) { stage.dispose(); return; }
    if (environment?.ok) previewStatus.remove();
    else previewStatus.textContent = '环境反射不可用，当前档案外观为降级预览';
  })().catch(() => {
    if (detailSequence === sequence) previewStatus.textContent = '档案外观暂不可预览';
  });
}

/* ── 成就 ─────────────────────────────────────────────── */
function renderAchievements() {
  const state = Core.progress.get();
  for (const group of ACHIEVEMENT_GROUPS) {
    const items = ACHIEVEMENTS.filter((achievement) => achievement.group === group.id);
    if (!items.length) continue;
    body.appendChild(el('div', { class: 'section-title', text: group.name }));
    for (const achievement of items) {
      const done = !!state.achievements[achievement.id];
      body.appendChild(el('div', { class: 'ach-item' + (done ? ' is-done' : '') }, [
        el('span', { class: 'ach-check', text: done ? '✓' : '○', 'aria-hidden': 'true' }),
        el('div', {}, [
          el('div', { class: 'trait-name', text: achievement.name }),
          el('div', { class: 'trait-desc', text: achievement.desc }),
          el('div', { class: 'tiny muted', text: achievement.reward?.cr ? `奖励 ${achievement.reward.cr} CR` : '' }),
        ]),
      ]));
    }
  }
}

/* ── 锻造加成（rework T11） ───────────────────────────── */
function renderBonuses() {
  const state = Core.progress.get();
  const view = Core.progress.forgeBonusView();

  /* ★ rework T11：这不是说明页，而是可装备的单槽选择。
     只能装一项；已解锁/未解锁条件直接写出来；开锻后就不能再换。 */
  body.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'section-title', text: '开锻前装备（单槽）' }),
    el('div', { class: 'report-line', text: view.equipped
      ? `已装备：${view.equipped.name} —— ${view.equipped.desc}`
      : '尚未装备任何加成。装备一项后，下一次普通开锻生效。' }),
    el('div', { class: 'report-line muted', text: '· 一次只能装一项，进入 S1 后锁定，本局中途不能更换' }),
    el('div', { class: 'report-line muted', text: '· 限制的是每局机会，不是反复付费维持；解锁后永久拥有' }),
    el('div', { class: 'report-line muted', text: '· 不做永久基础六维加点，也不是研究树' }),
  ]));

  body.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'section-title', text: '可装备加成' }),
    ...view.list.map((b) => {
      const equipped = view.equippedId === b.id;
      const btn = el('button', {
        class: 'btn' + (equipped ? ' btn--primary' : ''),
        disabled: !b.unlocked,
        'aria-pressed': String(equipped),
        text: equipped ? '已装备' : b.unlocked ? '装备' : '未解锁',
        onclick: () => {
          const r = Core.progress.equipForgeBonus(equipped ? null : b.id);
          if (!r?.ok) { toast(r?.reason || '装备失败', 'warn'); return; }
          toast(equipped ? '已卸下加成' : `已装备：${b.name}`, 'good');
          render();
        },
      });
      return el('div', { class: 'report-line' }, [
        el('div', {}, [
          el('b', { text: `${b.icon || '·'} ${b.name}` }),
          el('div', { class: 'muted tiny', text: b.desc }),
          el('div', { class: 'muted tiny', text: b.detail }),
          el('div', { class: 'muted tiny', text: b.unlocked
            ? `已解锁 · 每局 ${b.usesPerRun} 次`
            : `解锁条件：${b.unlockText}${Number.isFinite(b.have) ? `（当前 ${b.have}/${b.need}）` : ''}` }),
        ]),
        btn,
      ]);
    }),
  ]));

  body.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'section-title', text: '已解锁内容' }),
    el('div', { class: 'report-line', text: `永久解锁卡牌：${(state.unlockedCardIds || []).length} 张` }),
    el('div', { class: 'report-line', text: `称号：${(state.unlockedTitles || []).join('、') || '无'}` }),
    el('div', { class: 'report-line', text: `刃线外观：${(state.unlockedEdgeSkins || []).join('、') || '无'}` }),
  ]));

  body.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'section-title', text: '本轮的边界' }),
    el('div', { class: 'report-line muted', text: '· 风险干预类加成尚未开放：需要先定好它与基础 Risk 曲线的关系与上限' }),
    el('div', { class: 'report-line muted', text: '· 收藏数量不直接转换为无限叠加战力' }),
  ]));
}

/* ── 图鉴（rework T12）──────────────────────────────── */
/**
 * 图鉴：按**统一目录**展示全部 10 个分类。
 *
 * ★ 改造前只展示刀型 / 隐藏连携 / 工艺标签 三类，
 *   而分母却把材料、纹理、工艺、卡牌、特性、赛事全算进去 ——
 *   玩家既看不到它们，也永远开不满进度。
 *
 * ★ 现在每个分类都有真实分母，未发现给**线索**（不直接给答案），
 *   已发现给实际条件/效果/来源。
 */
function renderCodex() {
  const state = Core.progress.get();
  const view = CodexCatalog.codexProgressView(state.codex);

  body.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'row row--between' }, [
      el('span', { text: '图鉴完成度' }),
      el('b', { text: `${view.percent}%` }),
    ]),
    el('div', { class: 'bar', style: { marginTop: '8px' } }, [el('i', { style: { width: view.percent + '%' } })]),
    el('div', { class: 'muted tiny', style: { marginTop: '6px' },
      text: `已发现 ${view.found} / ${view.total} 项 · 断刀记录单独保存` }),
  ]));

  /* ★ rework T12：搜索 + 「只看未发现」。
     搜索只匹配**已发现**的名称/描述；未发现项只按线索匹配，
     不会因为搜索而泄露答案（未发现项名字仍为「???」）。 */
  const searchInput = el('input', {
    class: 'codex-search', type: 'search',
    placeholder: '搜索已发现内容 / 线索',
    'aria-label': '搜索图鉴',
    value: codexQuery,
    oninput: (e) => { codexQuery = e.target.value; renderCodexList(); },
  });
  body.appendChild(el('div', { class: 'ws-collection-controls' }, [
    searchInput,
    el('div', { class: 'ws-control-row', role: 'group', 'aria-label': '筛选' }, [
      el('button', {
        class: 'chip' + (codexOnlyMissing ? ' chip--accent' : ''), type: 'button',
        'aria-pressed': String(codexOnlyMissing), text: '只看未发现',
        onclick: () => { codexOnlyMissing = !codexOnlyMissing; render(); },
      }),
      codexQuery || codexOnlyMissing ? el('button', {
        class: 'chip', type: 'button', text: '清除',
        onclick: () => { codexQuery = ''; codexOnlyMissing = false; render(); },
      }) : null,
    ].filter(Boolean)),
  ]));

  /* 目录容器：搜索时局部重绘，不重建输入框（保持光标与输入焦点） */
  const listHost = el('div', { class: 'codex-host' });
  body.appendChild(listHost);

  function renderCodexList() {
    clear(listHost);
    const q = codexQuery.trim().toLowerCase();
    let shownGroups = 0;
    for (const group of view.groups) {
      let entries = group.entries;
      if (codexOnlyMissing) entries = entries.filter((e) => !e.found);
      if (q) {
        entries = entries.filter((e) => {
          const hay = [e.name || '', e.desc || '', e.hint || '', e.group || '', group.name]
            .join(' ').toLowerCase();
          return hay.includes(q);
        });
      }
      if ((q || codexOnlyMissing) && !entries.length) continue;
      shownGroups++;

      const ratio = group.total ? `${group.found}/${group.total}` : `${group.found} 条`;
      const summary = el('summary', {}, [
        el('b', { text: group.name }),
        el('span', { class: 'muted tiny', text: ` ${ratio}` }),
      ]);
      const list = el('div', { class: 'codex-list' }, entries.length
        ? entries.map((entry) => el('div', { class: 'codex-item' + (entry.found ? '' : ' is-locked') }, [
          el('div', {}, [
            el('div', { class: 'trait-name', text: entry.found ? entry.name : '???' }),
            el('div', { class: 'trait-desc', text: entry.found
              ? (entry.desc || entry.group || '已发现')
              : entry.hint }),
          ]),
        ]))
        : [el('div', { class: 'muted tiny', text: group.eventOnly
          ? '还没有断刀记录。断裂的刀会连身份与履历一起保存在断刀册。'
          : '这一类暂无内容。' })]);
      /* 搜索/筛选时强制展开，方便直接看到结果 */
      const forceOpen = !!(q || codexOnlyMissing);
      listHost.appendChild(el('details', {
        class: 'codex-group',
        open: forceOpen || (group.found > 0 && group.total <= 30),
      }, [summary, list]));
    }
    if (!shownGroups) {
      listHost.appendChild(el('div', { class: 'card ws-empty',
        text: q ? `没有匹配「${codexQuery}」的条目。` : '没有符合条件的条目。' }));
    }
  }

  renderCodexList();
}

export default { create, render };
