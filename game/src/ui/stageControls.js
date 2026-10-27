/**
 * 表现层 · 舞台鉴赏控制（单个拖动开关）
 *
 * ★ 用户要求：
 *   ① 把「拖动刀具 · 自由鉴赏」做成 **右下角图标**；
 *   ② 锻刀阶段也要有；
 *   ③ 点掉拖动会自动复原 → **只留一个拖动按钮**，不再单独放「复原」。
 *
 * 所以这里只有一个按钮，语义是「拖动开 / 拖动关」：
 *   · 开启 → 可以拖拽旋转（`aria-pressed=true`，图标点亮）
 *   · 关闭 → **自动回到默认机位**，并恢复页面滚动
 * 需要复原时就是「关掉再开」—— 少一个常驻按钮，也少一个容易误解的入口。
 *
 * 图标一律内联 SVG 描边，与项目其他图标同一语言，不引入图片资源。
 * 文字只放 title / aria-label —— 不占舞台宽度、不遮刀。
 */

import { el, toast } from './dom.js';
import { getStage } from '../render/index.js';

const NS = 'http://www.w3.org/2000/svg';

function svgIcon(paths) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of paths) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

/** 四向箭头：拖动旋转。开启后由 CSS 填充点亮，不换图标以免位置跳动。 */
const ICON_DRAG = () => svgIcon([
  'M12 3v18', 'M3 12h18',
  'M12 3l-2.5 2.5', 'M12 3l2.5 2.5',
  'M12 21l-2.5-2.5', 'M12 21l2.5-2.5',
  'M3 12l2.5-2.5', 'M3 12l2.5 2.5',
  'M21 12l-2.5-2.5', 'M21 12l-2.5 2.5',
]);

/**
 * 生成舞台鉴赏控制（单个拖动开关）。
 *
 * @param {object} [o]
 * @param {() => boolean} [o.canDrag] 当前是否允许开启拖动（锻造 S4 会返回 false）
 * @param {string} [o.blockReason] 不允许时的提示
 * @returns {{bar: HTMLElement, setMode: (on:boolean)=>void, sync: ()=>void, setBlocked: (b:boolean)=>void, isOn: ()=>boolean}}
 */
export function createStageInspect({ canDrag = () => true, blockReason = '当前阶段不能拖动' } = {}) {
  let on = false;

  const toggle = el('button', {
    class: 'stage-icon stage-inspect-toggle', type: 'button',
    'aria-pressed': 'false',
    'aria-label': '开启拖动',
    title: '开启后可拖动刀具查看细节；再点一次复原并恢复页面滚动',
    onclick: () => setMode(!on),
  }, [ICON_DRAG()]);

  const bar = el('div', {
    class: 'stage-inspect', role: 'group', 'aria-label': '刀具鉴赏控制',
  }, [toggle]);

  function sync() {
    toggle.setAttribute('aria-pressed', String(on));
    toggle.setAttribute('aria-label', on ? '关闭拖动并复原' : '开启拖动');
    toggle.title = on
      ? '关闭拖动：自动复原到默认位置并恢复页面滚动'
      : '开启后可拖动刀具查看细节；再点一次复原并恢复页面滚动';
  }

  /**
   * 把按钮状态对齐到**画布的客观状态**。
   *
   * ★ 为什么需要：切页时 `attachTo` 会把控件重置回该页默认值（首页/锻造页默认关），
   *   但本模块的 `on` 不会跟着变 —— 实测「首页开拖动 → 进锻造页 → 回首页」后
   *   按钮显示 pressed=true，画布却已经关了（状态不一致）。
   *   页面在 `attachTo()` 之后调一次 `syncFromStage()`，两边就永远一致。
   */
  function syncFromStage() {
    const live = getStage()?.isInteractive?.();
    if (typeof live === 'boolean') on = live;
    sync();
  }

  /**
   * 把拖动开关标成不可用（例如锻造 S4 锻打：热区铺满舞台）。
   * ★ 直接设 `disabled` 而**不是**只加个 CSS 类 —— 实测类名挂在 .page 上时
   *   选择器链路太长、容易被后续规则盖掉，且无障碍上也不会真的禁用。
   */
  function setBlocked(blocked) {
    const off = !!blocked;
    toggle.disabled = off;
    toggle.setAttribute('aria-disabled', String(off));
    if (off && on) {
      /* 已开着拖动却进入禁用阶段 → 主动关掉，避免热区被抢。 */
      on = false;
      getStage()?.setInteractive?.(false);
      sync();
    }
  }

  function setMode(next) {
    const want = !!next;
    if (want && (!canDrag() || toggle.disabled)) {
      if (blockReason) toast(blockReason, 'info');
      return;
    }
    on = want;
    const stage = getStage();
    stage?.setInteractive?.(on);
    /* ★ 关闭 = 复原：用户指出「点掉拖动会自动复原」，因此不再单独做复原按钮。
       这同时避免玩家被锁在“拖歪了”的视角里、误以为尺寸坏了。 */
    if (!on) stage?.resetView?.();
    sync();
  }

  sync();
  return { bar, setMode, sync, syncFromStage, setBlocked, isOn: () => on };
}

export default { createStageInspect };
