/** 首页：以真实刀具展台为中心，开始锻刀是唯一主行动。 */
import { el, $, clear, toast } from '../dom.js';
import { ICONS } from '../components.js';
import * as Progress from '../../core/progress.js';
import Game from '../../app/game.js';
import router from '../router.js';
import * as Workshop from './workshop.js';
import { getStage } from '../../render/index.js';
import { createStageInspect } from '../stageControls.js';

let root, body, stageHost;
/* ★ 首页鉴赏控制（图标版，与锻造页共用 stageControls 模块）。
   · 默认 **关**：舞台不吃指针、页面可正常滚动、也不持续重绘（性能）；
   · 打开后才允许拖拽/缩放看细节（可玩性）。 */
let inspectCtl = null;
const ENTRIES = [
  { label: '赛事', icon: 'arena', go: () => router.go('arena') },
  { label: '藏刀阁', icon: 'collection', go: () => Workshop.openTab('collection') },
  { label: '工坊', icon: 'workshop', go: () => Workshop.openTab('bonuses') },
  { label: '图鉴', icon: 'codex', go: () => Workshop.openTab('codex') },
];

export function create() {
  root = $('.page[data-page="home"]');
  if (!root) return;
  clear(root);
  inspectCtl = createStageInspect();
  stageHost = el('div', { class: 'stage home-showcase', id: 'homeStage' }, [
    el('div', { class: 'showcase-label' }, [el('i'), el('span', { text: '待你锻造' })]),
    /* 右下角两个图标：四向箭头（开/关拖动）+ 回转箭头（复原）。 */
    inspectCtl.bar,
  ]);
  body = el('div', { id: 'homeBody', class: 'home-dashboard' });
  root.append(stageHost, body);
}

/* ★ 2026-10-24（用户：「今日目标那一块我感觉可以删掉」+「50 CR 全勤奖励也删了一起」）：
   删掉了「今日目标」入口及其抽屉（含全勤奖励领取按钮）。
   连带删除：Daily.claimAllBonus / Progress.claimDailyBonus / DAILY_ALL_BONUS /
   save.daily.allBonusClaimed / .home-mission 样式 / .goal 样式。

   为什么可以安全删（已核实）：
   · 单项任务的 CR（40/40/50）由 core/events.settle **自动发放**，与这个 UI 无关；
   · 全勤 50 CR 确实只能从这个抽屉领，所以按用户要求一并取消，
     而不是删了界面、把奖励留成永远领不到的死数据。

   首页现在只有：主 CTA → 4 个入口 → 「下一个目标」→ 长期统计。 */
export function render() {
  if (!root || !body) create();
  if (!body) return;
  Progress.rolloverDaily();
  const summary = Progress.homeSummary();
  clear(body);
  const canResume = !!(Game.run && !Game.run.finished);
  const label = stageHost.querySelector('.showcase-label span');
  if (label) label.textContent = summary.showcase ? '代表作' : '唐刀 · 待你锻造';

  body.append(
    el('button', {
      class: 'btn btn--primary btn--block home-start',
      'aria-label': canResume ? '继续锻刀' : '开始锻刀',
      onclick: async (event) => {
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        const title = button.querySelector('.home-start-title');
        if (title) title.textContent = '正在准备工艺…';
        try {
          if (!canResume) Game.startForge({ mode: 'normal' });
          await Game.prewarmCandidates();
          router.go('forge');
        } catch (error) {
          console.warn('[forge] preparation', error);
          toast('工艺准备未完成，请重试', 'warn');
        } finally {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          if (title) title.textContent = canResume ? '继续锻刀' : '开始锻刀';
        }
      },
    }, [
      ICONS.forge(true),
      el('div', { class: 'home-start-copy' }, [
        el('span', { class: 'home-start-title', text: canResume ? '继续锻刀' : '开始锻刀' }),
        el('small', { text: canResume ? '接续工序 · 保留当前构筑' : '十道工序 · 自由构筑' }),
      ]),
      el('b', { text: '→', 'aria-hidden': 'true' }),
    ]),
    el('nav', { class: 'home-entry', 'aria-label': '游戏主导航' }, ENTRIES.map((entry) => el('button', {
      class: 'home-entry-btn',
      type: 'button',
      'aria-label': entry.label,
      onclick: entry.go,
    }, [ICONS[entry.icon](false), el('span', { text: entry.label })]))),
    /* ★ rework T12：「下一个目标」——只给一件具体、可执行的事，并直接跳过去。
       改造前首页只有静态数字，玩家锻完、打完也看不到下一步干什么。 */
    goalCard(summary.nextGoal),
    el('div', { class: 'home-stats', 'aria-label': '长期进度' }, [
      summaryItem('最高评分', summary.bestScore),
      summaryItem('赛事胜场', summary.matchWins),
      summaryItem('藏刀', `${summary.collectionCount} 把`),
      summaryItem('图鉴', `${Math.round(summary.codexProgress * 100)}%`),
    ]),
  );

  if (stageHost) {
    const stage = getStage();
    stage.attachTo(stageHost);
    stage.resize();
    /* ★ attachTo 会把控件重置回本页默认值（首页默认关），
       按钮必须跟着回读，否则会“亮着但拖不动”。 */
    inspectCtl?.syncFromStage?.();
    if (summary.showcase) Game.showRecord(summary.showcase);
    else Game.showDefault();
  }
}

/**
 * 供 bootstrap 在切页后调用：把鉴赏按钮对齐到画布真实状态。
 * ★ 必需：切页时 bootstrap 的 attachTo 发生在 page.render() 之后，
 *   页面自己那一次同步回读是早的，需要在这里再校一次。
 */
export function syncInspect() {
  inspectCtl?.syncFromStage?.();
}

function summaryItem(label, value) {
  return el('div', {}, [el('span', { text: label }), el('b', { text: String(value) })]);
}

/**
 * 「下一个目标」卡片。
 * ★ 目标由 Progress.nextGoal() 计算（core 侧单一真源），页面只负责展示与跳转。
 * ★ 跳转不要绕过 prepwarm：进锻造前仍要等候选资源就绪，否则首卡会白屏。
 */
function goalCard(goal) {
  if (!goal) return null;
  return el('button', {
    class: 'home-goal', type: 'button',
    'aria-label': `下一个目标：${goal.title}`,
    onclick: async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      if (goal.route === 'forge') {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
          if (!(Game.run && !Game.run.finished)) Game.startForge({ mode: 'normal' });
          await Game.prewarmCandidates();
          router.go('forge');
        } catch (error) {
          console.warn('[forge] preparation', error);
          toast('工艺准备未完成，请重试', 'warn');
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
        return;
      }
      if (goal.route === 'workshop') {
        Workshop.openTab(goal.tab || 'collection');
        return;
      }
      router.go(goal.route || 'forge');
    },
  }, [
    el('span', { class: 'home-goal-kicker', text: '下一个目标' }),
    el('b', { class: 'home-goal-title', text: goal.title }),
    el('span', { class: 'home-goal-desc', text: goal.desc || '' }),
    el('span', { class: 'home-goal-action', text: `${goal.action || '前往'} →` }),
  ]);
}

export default { create, render };
