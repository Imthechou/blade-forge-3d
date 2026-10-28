/**
 * 表现层 · 锻造页（S1–S9 选择 + S4 锻打 + S7 刃线 → S10 鉴定）
 *
 * 本页**不含**任何规则判断：所有判定都在 core/forge.js，
 * 这里只是把 Game 的状态渲染出来，并把点击转发给 Game。
 */

import { el, $, clear, mount, toast, sheet } from '../dom.js';
import { riskBar, statGrid, decisionCard, traitItem, rarityBadge } from '../components.js';
import { STAGES } from '../../data/stages.js';
import { HAMMER_TIERS } from '../../data/balance.js';
import { tagName } from '../../data/tags.js';
import * as Hammer from '../../core/hammer.js';
import * as Tags from '../../core/tags.js';
import * as Edge from '../../core/edge.js';
import { nextRerollCost } from '../../core/cards.js';
import { breakChance, band as riskBandOf } from '../../core/risk.js';
import Game from '../../app/game.js';
import router from '../router.js';
import { getStage } from '../../render/index.js';
import { env } from '../../platform/env.js';
import { createStageInspect } from '../stageControls.js';

let root = null;
let pickedCard = null;
let disposeInteraction = null;
/* 锻造页也带鉴赏图标（用户要求「锻刀阶段也要有」）。
   S4 锻打阶段热区铺满舞台，拖动会与挥锤打架 → 该阶段禁止开启。 */
let inspectCtl = null;
/* 上一阶段索引：用来判断“刚刚真的换阶段了”。
   ★ 为什么需要：S1–S9 里玩家点卡就是**预览**（3D 已经变成选完的样子），
   再点「确认」进入下一阶段时，画面几乎不变 —— 于是换阶段没有感知。
   有了这个值，就能在“阶段号变了”的那一刻给一次明确过渡。 */
let lastStageIndex = -1;
/* 阶段过渡 class 的清除定时器（避免连续推进时多次计时互相覆盖） */
let stageAdvanceTimer = 0;

/* Current GPU policy: home/daily/restart paths wait for the first candidate
 * prewarm before entering the forge. Within a run, later candidate pools are
 * queued asynchronously. Avoid reintroducing an additional forge-page delay:
 * the entry already owns that readiness check. */

export function create() {
  disposeInteraction?.();
  disposeInteraction = null;
  root = $('.page[data-page="forge"]');
  clear(root);
  inspectCtl = createStageInspect({
    canDrag: () => Game.run?.phase !== 'hammer',
    blockReason: '锻打阶段请先结束锻打，再拖动查看',
  });
  const stage = el('div', { class: 'stage', id: 'forgeStage' });
  stage.appendChild(inspectCtl.bar);
  root.appendChild(stage);
  root.appendChild(el('div', { class: 'forge-body', id: 'forgeBody' }));
}

export function render() {
  disposeInteraction?.();
  disposeInteraction = null;
  const run = Game.run;
  const body = $('#forgeBody', root);
  // 每次重绘先移除旧热区，防止阶段推进/重新进入后残留挥锤接线。
  $('#forgeStage .hammer-stage-hit', root)?.remove();
  root.classList.toggle('is-hammer', run?.phase === 'hammer');
  if (!run) {
    /* ★ 2026-10-14：空态**必须也往舞台上放一把刀**。
       玩家只要在 `#/forge` 上刷新（hash 会停在 #/forge）或从别处切进锻刀页，
       否则看到的就是一块"什么都没有"的 3D 区。
       这里用与首页同一把**幽灵唐刀**（Game.showDefault），保证"舞台永不空白"。

       ★ 2026-10-24（用户：「还没有开始锻造。可以删掉」）：
       原文案已移除 —— 幽灵刀 + 「开始锻刀」按钮已经说清了状态，
       再补一句“还没有开始锻造”是重复陈述。只保留可执行的那个按钮。 */
    Game.showDefault();
    mount(body, [el('div', { class: 'forge-pad' }, [
      el('button', { class: 'btn btn--primary btn--block', text: '开始锻刀', onclick: () => router.go('home') }),
    ])]);
    return;
  }
  const snap = Game.run; // 直接用 run，避免快照与可变状态不一致
  renderStageHead(run);
  /* ★ 锻造页的鉴赏图标：S4 锻打阶段直接禁用拖动开关（热区铺满舞台，
     拖动会与挥锤打架）；其余阶段允许开拖动。 */
  const hammering = run.phase === 'hammer';
  root.classList.toggle('is-no-drag', hammering);
  inspectCtl?.setBlocked?.(hammering);
  pickedCard = null;
  $('#forgeStage', root)?.classList.remove('is-previewing');
  $('#forgeStage .stage-preview', root)?.remove();
  body.innerHTML = '';

  if (run.phase === 'appraise' || run.phase === 'fractured') {
    router.go('appraise');
    return;
  }
  /* ★ 2026-10-15 修复：进入锻造页时必须把舞台交给**本局**。
     旧实现不调它 —— 于是「首页 → 继续锻刀」这条路（home 的 CTA 在
     canResume 时只 router.go，不重开一局）会把首页那把（半透明幽灵）刀
     一路带到锻造页，玩家看到的是"我的刀变成了别人的刀"。
     syncStage 同时会关掉幽灵态。 */
  Game.syncStage();

  /* 锻打 / 刃线：内容量不定，用自适应内衬 */
  if (run.phase !== 'select') $('#forgeStage .stage-readiness', root)?.remove();
  if (run.phase === 'hammer') return renderHammer(padFor(body), run);
  if (run.phase === 'edge') return renderEdge(padFor(body), run);
  renderSelect(body, run);
}

/** 给"内容量不确定"的面板套一层自适应内衬（不参与三条比例带的预算） */
function padFor(body) {
  const w = el('div', { class: 'forge-pad' });
  body.appendChild(w);
  return w;
}

/**
 * 舞台上缘浮层：阶段徽标 + 题面 + 构筑进度 chip。
 *
 * ★ 2026-10-15（用户：「我希望锻造页都是一屏」）——
 *   题面原来是 `.forge-body` 里的一个**独立块，实吃 47px**；而一屏的纵向预算
 *   总共只有 819px，这一块就吃掉 5.7%。
 *   原项目把它放在**阶段徽章同一行下方**（`.stage-chipbar` 的 `.sc-desc`），
 *   原文：「四段式布局里纵向空间极紧，阶段信息不该占一整行 ——
 *   压缩成舞台左上角一枚徽章…信息量不减，纵向只占 ~34px」。
 *   照搬：chipbar 绝对定位在舞台上缘，**纵向布局成本 = 0**。
 */
function renderStageHead(run) {
  const stage = $('#forgeStage', root);
  if (!run || !stage) return;
  const total = STAGES.length;          // 10 段（S1..S10）
  const idx = run.stageIndex;
  const def = STAGES[idx] || {};

  /* ★ 阶段切换反馈：只有**阶段号真的变了**才播一次过渡。
     玩家在 S1–S9 点卡时 3D 已经是“选完的样子”（预览），
     再点确认就会觉得“什么都没发生”—— 这里给一次明确的阶段推进回执。 */
  const stageChanged = lastStageIndex !== -1 && idx !== lastStageIndex && idx > lastStageIndex;
  lastStageIndex = idx;

  /* ★ 阶段色：JS **只改这一个变量**（写在 documentElement 上，
     这样 body::before 的舞台底染、PC 两侧纯色块也一起跟着换）。
     进度点 / 徽章 / 底染全部读 --stage-color 的派生量（--stage-wash/-line/-tint）。 */
  document.documentElement.style.setProperty('--stage-color', `var(--stage-${idx + 1})`);

  let bar = $('.stage-chipbar', stage);
  if (!bar) {
    bar = el('div', { class: 'stage-chipbar' });
    stage.appendChild(bar);
  }

  let badge = $('.stage-badge', bar);
  if (!badge) {
    badge = el('div', { class: 'chip chip--stage stage-badge' });
    bar.appendChild(badge);
  }
  badge.innerHTML = '';
  badge.appendChild(el('b', { text: String(idx + 1).padStart(2, '0') }));
  badge.appendChild(el('span', { text: def.name || '' }));
  badge.appendChild(el('i', { text: `${idx + 1}/${total}` }));

  let question = $('.stage-question', bar);
  if (!question) { question = el('div', { class: 'stage-question' }); bar.appendChild(question); }
  question.textContent = def.question || '';

  /* 编号式 10 段进度条：浮在舞台下缘。
     done 用阶段色淡底、active 用阶段色实心 —— 让玩家看见"走到第几段"。 */
  let prog = $('.stage-progress', stage);
  if (!prog) {
    prog = el('div', { class: 'stage-progress' });
    stage.appendChild(prog);
  }
  prog.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const isDone = !!run.finished || i < idx;
    prog.appendChild(el('div', {
      // ★ 类名表达式写在 class: 里（不先存局部变量）——
      //   让 tools/audit-classes.mjs 能抽到 sp-dot / done / active 三个类名。
      class: 'sp-dot' + (isDone ? ' done' : (i === idx ? ' active' : '')),
      title: STAGES[i].name,
    }, [
      el('span', { class: 'sp-num', text: String(i + 1) }),
      el('span', { class: 'sp-title', text: STAGES[i].name }),
    ]));
    if (i < total - 1) prog.appendChild(el('div', { class: 'sp-line' }));
  }

  /* ★★ 阶段切换回执（解决“换阶段没感觉”）
   *
   * 问题：预览时 3D 就已变成“选完的样子”，所以点「确认」进下一阶段时，
   *      画面几乎不变 —— 玩家分不清“我在预览”和“我已经进入下一阶段了”。
   *
   * 做法：阶段号真的前进时，在舞台上给一次**明确的短暂过渡**：
   *      ① 徽标与题面重播入场（flash + 微位移）；
   *      ② 舞台中央浮出一行“第 N 阶段 · 名称”，1.4s 自动淡出；
   *      ③ 尊重减少动效设置：reduced 时不做位移/动画，只保留可读文字。
   * 全部是 CSS class + 一个短定时器，不碰 3D、不改玩法状态。 */
  if (stageChanged) {
    document.documentElement.classList.remove('stage-advance');
    void document.documentElement.offsetWidth;   // 强制回流，保证同阶段连续推进会重播
    document.documentElement.classList.add('stage-advance');
    window.clearTimeout(stageAdvanceTimer);
    stageAdvanceTimer = window.setTimeout(() => {
      document.documentElement.classList.remove('stage-advance');
    }, 1500);

    /* 中央浮层：给“我确实进入了下一阶段”一个可读回执 */
    stage.querySelector('.stage-advance-toast')?.remove();
    const flash = el('div', { class: 'stage-advance-toast', role: 'status', 'aria-live': 'polite' }, [
      el('b', { text: `第 ${idx + 1} 阶段` }),
      el('span', { text: def.name || '' }),
    ]);
    stage.appendChild(flash);
    window.setTimeout(() => flash.remove(), 1400);
  }
}

/**
 * 「构筑进度」也做成舞台上缘的一枚 chip（原来是 body 里一个实吃高度的块）。
 * 点击展开抽屉看明细 —— 信息一点没少，只是从"常驻占位"变成"按需展开"。
 * ★ 为什么必须有这一手：标签层数到门槛时最多会同时出现好几条，每条两行 ≈ 50px；
 *   放进一屏预算里就是"要么挤掉 3D，要么挤掉卡区"，两者都是错的。
 */
function renderStageTraits(items) {
  const stage = $('#forgeStage', root);
  const bar = stage && $('.stage-chipbar', stage);
  if (!bar) return;
  let chip = $('.stage-traits', bar);
  if (!items.length) { if (chip) chip.remove(); return; }
  if (!chip) {
    chip = el('button', { class: 'chip stage-traits', type: 'button' });
    bar.appendChild(chip);
  }
  chip.textContent = `构筑进度 ${items.length} 项`;
  chip.onclick = () => sheet({ title: '构筑进度（待鉴定结算）', body: el('div', { class: 'stack' }, items) });
}

/* ── 选卡阶段 ─────────────────────────────────────────── */

function renderSelect(body, run) {
  /* ★ 2026-10-15：题面已移到**舞台上缘浮层**（见 renderStageHead）。
     它原来是这里的第一块（实吃 47px），而一屏纵向预算只有 819px。 */

  /* 带①：风险 + 六维 合一带（高度 == --stat-h）。
     两个 node 挂在同一个 rail 容器里，refresh() 各挂各的、互不干扰。 */
  const railNode = el('div', { class: 'forge-rail' });
  const riskNode = el('div', {});
  const statsNode = el('div', {});
  railNode.appendChild(riskNode);
  railNode.appendChild(statsNode);
  body.appendChild(railNode);

  const cardsRow = el('div', { class: 'cards' });
  body.appendChild(cardsRow);

  const actions = el('div', { class: 'actions' });
  body.appendChild(actions);

  // Keep cards and actions alive while selecting. Replacing all three cards on
  // every tap discarded keyboard focus and restarted the tactile transition.
  let mountedCards = '';
  let readinessKey = '';
  const rerollButton = el('button', { class: 'btn', onclick: () => {
    const r = Game.reroll();
    if (!r || !r.ok) { toast((r && r.reason) || '无法重铸', 'warn'); return; }
    toast(r.cost === 0 ? '本阶段首次重铸免费' : `已重铸，花费 ${r.cost} CR`);
    pickedCard = null;
    Game.clearPreview();
    refresh();
  } });
  const confirmButton = el('button', { class: 'btn btn--primary', onclick: () => {
    if (!pickedCard || confirmButton.disabled) return;
    confirmButton.disabled = true;
    const r = Game.confirmCard(pickedCard);
    if (!r || !r.ok) { confirmButton.disabled = false; toast((r && r.reason) || '无法提交', 'warn'); return; }
    pickedCard = null;
    render();
  } });
  actions.append(rerollButton, confirmButton);
  const selectionStatus = el('div', { class: 'forge-selection-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  actions.before(selectionStatus);

  function refresh() {
    // 风险：档位与概率都取自 core/risk（唯一真源，禁止 UI 自己重算）
    const band = riskBandOf(Game.run.risk.current);
    mount(riskNode, riskBar({
      current: Game.run.risk.current,
      peak: Game.run.risk.peak,
      chance: previewChance(),
      band,
    }));
    // 六维：只展示粗粒度强弱与候选卡方向，精确值留到 S10 揭晓。
    mount(statsNode, statGrid(Game.run.stats, pickedCard ? pickedCard.directions : null));
    // 卡（选中时另两张降权，把注意力收到选中那张）
    cardsRow.classList.toggle('is-picking', !!pickedCard);
    const previewStage = $('#forgeStage', root);
    previewStage?.classList.toggle('is-previewing', !!pickedCard);
    let preview = previewStage?.querySelector('.stage-preview');
    if (previewStage && !preview) {
      preview = el('div', { class: 'stage-preview', role: 'status', 'aria-live': 'polite' });
      previewStage.appendChild(preview);
    }
    if (preview) { preview.hidden = !pickedCard; preview.textContent = pickedCard ? `${pickedCard.name} · 预览` : ''; }
    const cardKey = Game.run.candidates.map(c => c.id).join(',');
    if (mountedCards !== cardKey) {
      mountedCards = cardKey;
      /* ★ rework T14：把本局当前的标签层数交给卡面，
         让每张卡直接写出“会把哪个标签补到哪一档”。
         层数来自账本（唯一真源），不在 UI 自己累计。 */
      const tagCounts = Tags.counts(Game.run.ledger);
      mount(cardsRow, Game.run.candidates.map(c => decisionCard(c, {
        tagCounts,
        onPick: card => {
          if (pickedCard?.id === card.id) { pickedCard = null; Game.clearPreview(); }
          else { pickedCard = card; Game.previewCard(card); }
          refresh();
        },
        onDetail: card => showDetail(card),
      })));
    }
    for (const node of cardsRow.children) {
      const selected = node.dataset.cardId === pickedCard?.id;
      node.classList.toggle('is-picked', selected);
      node.setAttribute('aria-pressed', String(selected));
      const card = Game.run.candidates.find(c => c.id === node.dataset.cardId);
      const label = node.querySelector('.dcard-meta > .grow');
      if (label) label.textContent = selected ? '预览' : card?.role || '点击预览';
    }
    rerollButton.textContent = `重铸 ${rerollCostText()}`;
    confirmButton.textContent = pickedCard ? '确认工艺 →' : '选择工艺卡';
    confirmButton.disabled = !pickedCard;
    selectionStatus.classList.toggle('has-selection', !!pickedCard);
    selectionStatus.textContent = pickedCard
      ? `预览：${pickedCard.name} · 尚未生效，确认后写入`
      : '';
    /* 待结算特性 → **舞台上缘的 chip**（原来是 body 里一个实吃高度的块：
       最多会同时出现好几条、每条两行 ≈ 50px，放进一屏预算里必然挤掉 3D 或卡区）。
       明细点开看，信息一点没少。 */
    const pending = Game.run.tagTiersCache || [];
    const items = [];
    for (const t of pending) {
      if (!t.tier || !t.tier.grantsTrait) continue;
      items.push(el('div', { class: 'trait trait--legacy' }, [
        el('div', {}, [
          el('div', { class: 'trait-name', text: `${tagName(t.tagId)} ${t.effectiveLayers} 层 · 待鉴定结算` }),
          el('div', { class: 'trait-desc', text: t.tier.name + (t.effectiveLayers < 6 ? `（下一档 ${nextNeed(t.effectiveLayers)} 层）` : '（已达最高档）') }),
        ]),
      ]));
    }
    renderStageTraits(items);
    if (items.length) {
      // 首次出现"待鉴定结算"的特性档位：解释为什么还不能看到效果
    }

    // 后续阶段准备不再静默：只展示真实任务状态，不遮模型、不用计时器假装完成。
    const stageHost = $('#forgeStage', root);
    let status = stageHost?.querySelector('.stage-readiness');
    if (stageHost && !status) {
      status = el('div', { class: 'stage-readiness', role: 'status', 'aria-live': 'polite' });
      stageHost.appendChild(status);
    }
    const owner = Game.run;
    const key = owner.stageId + ':' + owner.candidates.map(c => c.id).join(',');
    if (readinessKey === key) return;
    readinessKey = key;
    const task = Game.prewarmCandidates();
    const current = () => status?.isConnected && Game.run === owner
      && owner.phase === 'select'
      && key === owner.stageId + ':' + owner.candidates.map(c => c.id).join(',');
    if (status) {
      status.classList.toggle('is-ready', !task);
      status.textContent = task ? '工艺资源准备中…' : '';
    }
    if (task) Promise.resolve(task).then(result => {
      if (!current()) return;
      status.classList.toggle('is-ready', !!result?.ok);
      status.textContent = result?.ok ? '' : candidatePreparationFailureText();
    }).catch(() => {
      if (current()) { status.classList.remove('is-ready'); status.textContent = candidatePreparationFailureText(); }
    });
  }

  refresh();
}

/**
 * 供 bootstrap 在切页后调用：把鉴赏按钮对齐到画布真实状态。
 *
 * ★ 必需：锻造页自己不调 `attachTo`（由 bootstrap 的 onNavigate 接管），
 *   所以必须在挂载后回读一次，否则会出现“按钮亮着、实际拖不动”。
 */
export function syncInspect() {
  inspectCtl?.syncFromStage?.();
}

function candidatePreparationFailureText() {
  const stage = getStage();
  // 仅明确无 WebGL 且没有创建 3D 舞台时说明 2D 降级；未 ready 不等于无 WebGL。
  const in2DMode = env.hasWebGL === false && stage?.ready === false
    && stage.engine === null && stage.viewer === null;
  return in2DMode ? '当前以 2D 模式运行，选卡与锻造可继续' : '工艺资源未齐 · 选择卡牌可重试';
}

function nextNeed(layers) { return layers < 2 ? 2 : (layers < 4 ? 4 : 6); }

function rerollCostText() {
  const cost = Game.run ? nextRerollCost(Game.run) : 0;
  return cost === 0 ? '免费' : `${cost} CR`;
}

function previewChance() {
  const run = Game.run;
  if (!run) return 0;
  const base = run.risk.current + (pickedCard ? (pickedCard.riskDeltaPoints || 0) : 0);
  return breakChance(base, run.daily?.breakScale || 1);
}

function showDetail(card) {
  const tags = (card.tags || []).map((t) => el('span', { class: 'chip', text: tagName(t) }));
  const dirs = Object.entries(card.directions || {})
    .map(([k, d]) => el('div', { class: 'report-line', text: `${statCn(k)}：${d.label}` }));
  sheet({
    title: card.name,
    body: el('div', { class: 'stack' }, [
      // ★ 走 rarityBadge() 而不是手建 .rarity —— 神话档的记号是内联 SVG，
      //   手建的话这里的徽标会缺记号（全站唯一会漏的点就是它）。
      el('div', { class: 'row' }, [rarityBadge(card.rarity, card.rarityCn), el('span', { class: 'muted tiny', text: card.role })]),
      el('div', { class: 'dim', text: card.copy }),
      el('div', { class: 'section-title', text: '属性方向' }),
      ...(dirs.length ? dirs : [el('div', { class: 'muted tiny', text: '无显著变化' })]),
      el('div', { class: 'section-title', text: '工艺标签' }),
      el('div', { class: 'row row--wrap' }, tags),
      el('div', { class: 'section-title', text: '风险代价' }),
      el('div', { class: 'report-line', text: `风险点 ${card.riskDeltaPoints > 0 ? '+' : ''}${card.riskDeltaPoints}` }),
      card.visual?.targetDescription ? el('div', { class: 'section-title', text: '工艺结果' }) : null,
      card.visual?.targetDescription ? el('div', { class: 'report-line', text: card.visual.targetDescription }) : null,
    ]),
  });
}

function statCn(k) {
  return { strength: '强度', toughness: '韧性', sharpness: '锋利', craft: '工艺', design: '设计', spirit: '灵性' }[k] || k;
}

/* ── S4 自由锻打 ─────────────────────────────────────── */

function renderHammer(body, run) {
  // 首遇 S4：说明"可连续锤、可随时收手"（V2.1 §27 第 3 条）
  const info = Hammer.traitFor(run);
  body.classList.add('hammer-panel');
  const question = $('#forgeStage .stage-question', root);
  if (question) question.textContent = '自由锻打 · 继续强化或随时收手';

  /* ★ 修复：这行文案与舞台内的热区提示（hammer-stage-cue「点击此区域挥锤 · 无需瞄准」）
     完全重复，且多占一行高度（一屏纵向预算很紧）。只保留贴着手势热区的那一个。 */

  const hud = el('div', { class: 'hammer-stat', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  body.appendChild(hud);

  const riskNode = el('div', {});
  body.appendChild(riskNode);

  // 透明的原生按钮覆盖中央舞台：点击、触摸、Enter/Space 共用一次提交。
  // 不监听 pointerdown，避免同一次触摸再触发 click 导致双锤。
  const hit = el('button', { class: 'hammer-stage-hit', type: 'button', 'aria-label': '中央锻打区，点击挥锤', 'aria-describedby': 'hammerHelp' }, [
    el('span', { class: 'hammer-stage-cue', id: 'hammerHelp', text: '点击此区域挥锤 · 无需瞄准' }),
  ]);
  $('#forgeStage', root).appendChild(hit);

  const progNode = el('div', {});
  body.appendChild(progNode);

  // 独立于热区与可滚动 HUD；短屏和放大字体也不会把收手操作挤出视口。
  body.parentNode.appendChild(el('div', { class: 'hammer-actions' }, [el('button', {
    class: 'btn btn--primary btn--block', type: 'button', text: '结束锻打',
    onclick: () => {
      if (Game.run !== run || run.phase !== 'hammer') return;
      Game.endHammer(); render();
    },
  })]));

  function refresh(tierUpNotice = null) {
    const h = run.hammer;
    mount(hud, [
      el('div', {}, [el('b', { text: String(h.count) }), el('span', { text: '锤数' })]),
      el('div', {}, [el('b', { text: String(h.tier) }), el('span', { text: '强化档' })]),
      el('div', {}, [el('b', { text: String(Math.round(run.risk.current)) }), el('span', { text: '当前风险' })]),
    ]);
    const band = riskBandOf(run.risk.current);
    const scale = run.daily?.breakScale || 1;
    const nextDelta = Hammer.nextRiskDelta(h.count);
    const nextChance = breakChance(Math.min(100, run.risk.current + nextDelta), scale);
    mount(riskNode, riskBar({
      current: run.risk.current, peak: run.risk.peak,
      chance: breakChance(run.risk.current, scale), band, nextChance,
    }));

    const nt = Hammer.toNextTier(h.progress);
    /* ★ rework T04.4 / T04 修复：进度条分母必须用**真实最高门槛**。
       改造前这里写的是 `/ 126` —— 那是旧的四档门槛。
       门槛已重标为 12/30/54/82，写死 126 会让进度条到 65% 就再也不动。 */
    const maxNeed = HAMMER_TIERS[HAMMER_TIERS.length - 1].need;
    const keep = Hammer.tierReward(h.tier);

    mount(progNode, [
      el('div', { class: 'section-title', text: `额外锻打特性：${info.name}${info.mixed ? '（混合路线）' : ''}` }),
      el('div', { class: 'bar' }, [el('i', { style: { width: Math.min(100, (h.progress / maxNeed) * 100) + '%' } })]),
      el('div', { class: 'tiny muted', text: nt ? `距「${nt.name}」还差 ${nt.remain} 成果` : '已达最高强化档' }),
      /* 逐锤成果：让玩家看到“中间锤不是白冒风险” */
      el('div', { class: 'hammer-gain', role: 'status', 'aria-live': 'polite' }, [
        el('span', { text: `已得六维成果 ${h.statGained || 0}` }),
        el('span', { text: `已落 ${h.count} 锤` }),
      ]),
      /* ★ 修复：上游 riskBar 已经同时显示“本次断裂概率”与“下一锤 3.8%”，
         这里再写一遍「下一锤：Risk +2 → 单次断裂 3.8%」就是同一信息两次，
         所以只保留 riskBar 没给的**增量部分**。 */
      el('div', { class: 'tiny muted', text: h.ended ? '' : `下一锤 Risk 增量 +${nextDelta}` }),
      /* 收手保留内容（不泄露隐藏精确六维，只给档位与倍率） */
      el('div', { class: 'tiny muted', text: `现在收手：档位「${Hammer.tierName(h.tier)}」×${keep.scoreMult}，保留全部已得成果` }),
      /* 升档回执：就近写在 HUD，**不再**用覆盖舞台的 toast */
      tierUpNotice ? el('div', { class: 'hammer-tierup', role: 'status', 'aria-live': 'polite', text: tierUpNotice }) : null,
    ].filter(Boolean));
  }

  hit.addEventListener('click', () => {
    if (router.currentKey() !== 'forge' || Game.run !== run || run.phase !== 'hammer') return;
    const r = Game.hammerStrike();
    if (!r || !r.ok) return;
    hit.classList.remove('is-striking');
    void hit.offsetWidth;
    hit.classList.add('is-striking');
    getStage()?.effect('hammer');
    if (r.fractured || run.fractured) { render(); return; }
    /* ★ 修复：原先用 toast 报“强化达到第 N 档”，而 toast 在手机上固定在
       `bottom: calc(50dvh + safe-b)`，正好压在舞台底部的热区提示上
       （实测重叠 overlapY=35 / overlapX=116，两层文字叠印都读不清）。
       升档信息改为写进 HUD 自己的状态行，不再浮在舞台上。 */
    refresh(r.strike && r.strike.tierUp ? `强化达到第 ${r.strike.tierUp} 档` : null);
  });

  refresh();
}

/* ── S7 刃线模拟 ─────────────────────────────────────── */

function renderEdge(body, run) {
  // 首遇 S7：说明操作方式与影响范围
  const task = Edge.makeTask(run);
  body.appendChild(el('div', { class: 'forge-question' }, [
    document.createTextNode('刃线模拟'),
    el('span', { text: `沿深灰虚线滑动 · ${task.shape?.label || '刃线'} · 青色实线为当前刃线` }),
  ]));

  const canvas = el('canvas', {
    class: 'edge-canvas',
    'aria-label': '刃线绘制区：沿深灰虚线滑动，青色实线为当前轨迹',
  });
  body.appendChild(canvas);

  const info = el('div', { class: 'row row--between' });
  body.appendChild(info);

  /* ★ rework T05：允许跳过（记 MISS），不用强制描画卡住流程。 */
  const actions = el('div', { class: 'row' });
  actions.appendChild(el('button', {
    class: 'btn', text: '跳过描线（MISS）',
    onclick: () => submit({ skipped: true }),
  }));
  actions.appendChild(el('button', {
    class: 'btn btn--primary btn--block', text: '提交刃线',
    onclick: () => submit({}),
  }));
  body.appendChild(actions);

  const N = task.points.length;

  /* ★★ rework T05 ★★
     改造前这里 `new Array(N).fill(0.5)` 预填整条轨迹 ——
     于是“不操作”会被当作一条真实的 0.5 直线参与评分（实测 497/1000 得到 GOOD）。
     现在用**显式采样表**：只有玩家真正画过的 index 才有值，
     未画过的一律不在表里，submit 走 normalizeSamples 区分「未绘制 / 已绘制」。 */
  /** @type {Map<number, number>} */
  const samples = new Map();
  /* 用于每帧重绘的定长视图：null = 未绘制 */
  const view = new Array(N).fill(null);
  function syncView() {
    for (let i = 0; i < N; i++) view[i] = samples.has(i) ? samples.get(i) : null;
  }

  const ctx = canvas.getContext('2d');
  const accuracyLabel = el('span', { class: 'dim tiny' });
  info.append(accuracyLabel, el('span', { class: 'muted tiny', text: '失误 · 良好 · 优异 · 完美' }));
  let drawFrame = 0;
  let disposed = false;
  let displayedAccuracy = '';
  function scheduleDraw() {
    if (drawFrame || disposed) return;
    drawFrame = requestAnimationFrame(() => {
      drawFrame = 0;
      if (!disposed && canvas.isConnected) draw();
    });
  }
  function draw() {
    const r = canvas.getBoundingClientRect();
    const w = r.width; const h = r.height;
    if (!ctx || w <= 0 || h <= 0) return;
    // CSS 坐标仍是原来的输入/评分坐标；只提高显示采样密度，最高 2x 控制填充开销。
    const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    ctx.setTransform(bw / w, 0, 0, bh / h, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const px = (i) => (i / (N - 1)) * (w - 16) + 8;
    const py = (v) => h * 0.5 - (v - 0.5) * (h - 30);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // 基准线：浅底画布上用深墨（旧值 #F2F5F8 是深色主题遗留，浅底下完全看不见）
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = '#3F4A55'; ctx.lineWidth = 2; ctx.beginPath();
    task.points.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v))));
    ctx.stroke();
    /* 玩家轨迹：只画**已绘制**的连续段。
       改造前把所有格都当已绘制，于是未描画的区段也被画成一条“完美贴合的直线”。 */
    ctx.setLineDash([]);
    ctx.strokeStyle = '#227A87'; ctx.lineWidth = 2.5;
    let pen = false;
    for (let i = 0; i < N; i++) {
      const v = view[i];
      if (v === null) { pen = false; continue; }
      if (pen) ctx.lineTo(px(i), py(v));
      else { ctx.beginPath(); ctx.moveTo(px(i), py(v)); pen = true; }
    }
    if (pen) ctx.stroke();
    updateInfo();
  }
  function updateInfo() {
    /* 展示与提交共用同一套评价（T05：配置、面板与实际结算同源）。 */
    const normalized = Edge.normalizeSamples(samplesToArray(), N);
    const ev = Edge.evaluate(task.points, normalized);
    const text = ev.drawn === 0
      ? '尚未描线'
      : `贴合 ${(ev.fidelity * 100).toFixed(0)}% · 完成 ${(ev.coverage * 100).toFixed(0)}% · 稳定 ${(ev.stability * 100).toFixed(0)}%`;
    if (displayedAccuracy !== text) { accuracyLabel.textContent = text; displayedAccuracy = text; }
  }
  /** 采样表 → submit/normalizeSamples 需要的数组 */
  function samplesToArray() {
    const out = [];
    for (const [index, value] of samples) out.push({ index, value });
    return out;
  }
  /* 稀疏采样补齐：触摸事件的点间距较大时，在两点之间线性插值写入中间 index，
     避免“手指划过但采样点稀疏”被误判为完成度不足（T05 要求的触摸稀疏采样处理）。 */
  let lastIndex = null;
  function writeAt(index, value) {
    samples.set(index, value);
    if (lastIndex !== null && Math.abs(index - lastIndex) > 1) {
      const from = Math.min(lastIndex, index);
      const to = Math.max(lastIndex, index);
      const vFrom = samples.get(from) ?? value;
      const vTo = samples.get(to) ?? value;
      for (let i = from + 1; i < to; i++) {
        if (samples.has(i)) continue;
        const t = (i - from) / (to - from);
        samples.set(i, vFrom + (vTo - vFrom) * t);
      }
    }
    lastIndex = index;
    syncView();
  }
  function setAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    const x = (clientX - r.left - 8) / Math.max(1, r.width - 16);
    const y = (clientY - r.top) / Math.max(1, r.height);
    const i = Math.max(0, Math.min(N - 1, Math.round(x * (N - 1))));
    const v = 0.5 - (y - 0.5) * (r.height / Math.max(1, r.height - 30));
    writeAt(i, Math.max(0, Math.min(1, v)));
    // 仅把可见重绘合并到下一帧。
    scheduleDraw();
  }
  let activePointer = null;
  function inside(e) {
    const r = canvas.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX < r.right
      && e.clientY >= r.top && e.clientY < r.bottom;
  }
  function endStroke(e) {
    if (activePointer === null || e.pointerId !== activePointer) return;
    const id = activePointer;
    activePointer = null; // 先结束状态，释放捕获引发的事件不能恢复本笔。
    lastIndex = null;     // ★ 抬笔后断开插值链，下一次落笔不会跨笔画补线
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    updateInfo();
  }
  function onPointerDown(e) {
    if (disposed) return;
    if (activePointer !== null || e.button !== 0 || e.isPrimary === false || !inside(e)) return;
    activePointer = e.pointerId;
    lastIndex = null;     // ★ 新笔画起点：不跨笔画插值
    canvas.setPointerCapture(e.pointerId);
    setAt(e.clientX, e.clientY);
  }
  function onPointerMove(e) {
    if (disposed) return;
    if (e.pointerId !== activePointer) return;
    // 捕获保证收到松手；边界检查仍让离开画布立即收笔，不夹到边缘续画。
    if (!(e.buttons & 1) || !inside(e)) { endStroke(e); return; }
    setAt(e.clientX, e.clientY);
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  const strokeEndTypes = ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'];
  for (const type of strokeEndTypes) {
    canvas.addEventListener(type, endStroke);
  }

  /* ★ T05：暂停 / 失焦 / 页面隐藏都应清理输入状态，避免“离开后仍在续画”或卡住本笔。 */
  function onVisibility() { if (document.hidden) cancelStroke(); }
  function onBlur() { cancelStroke(); }
  function cancelStroke() {
    const id = activePointer;
    activePointer = null;
    lastIndex = null;
    if (id !== null) { try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch (_) { /* released */ } }
    scheduleDraw();
  }
  document.addEventListener('visibilitychange', onVisibility);
  globalThis.addEventListener('blur', onBlur);

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleDraw) : null;
  resizeObserver?.observe(canvas);
  globalThis.addEventListener('resize', scheduleDraw, { passive: true });
  disposeInteraction = () => {
    if (disposed) return;
    disposed = true;
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    for (const type of strokeEndTypes) canvas.removeEventListener(type, endStroke);
    document.removeEventListener('visibilitychange', onVisibility);
    globalThis.removeEventListener('blur', onBlur);
    if (drawFrame) cancelAnimationFrame(drawFrame);
    drawFrame = 0;
    resizeObserver?.disconnect();
    globalThis.removeEventListener('resize', scheduleDraw);
    const id = activePointer;
    activePointer = null;
    // A detached surface or a browser-side cancellation may already have released it.
    try { if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch (_) { /* released */ }
  };
  scheduleDraw();

  function submit({ skipped = false } = {}) {
    /* ★ T05：把**真实采样**交给 core 评价；未绘制区段不会被当成有效轨迹。 */
    const r = Game.submitEdge(skipped ? null : samplesToArray(), { skipped });
    if (!r || !r.ok) { toast('提交失败', 'warn'); return; }
    const e = r.edge || {};
    toast(`刃线 ${e.tierName || '完成'}`,
      e.tier === 'perfect' ? 'good' : e.tier === 'miss' ? 'warn' : 'info');
    render();
  }
}

export function leave() {
  disposeInteraction?.();
  disposeInteraction = null;
  $('#forgeStage .hammer-stage-hit', root)?.remove();
}

export default { create, render, leave };
