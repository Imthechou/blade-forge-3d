/**
 * 每日快速赛事的兼容入口。
 * 每日挑战统一位于赛事页：使用每日固定种子，但每次完成都可获得按成绩结算的 CR。
 */
import { el, $, clear, mount } from '../dom.js';
import * as Core from '../../core/index.js';
import { openDailyChallenge } from './arena.js';

let root = null;
let body = null;
export function create() {
  root = $('.page[data-page="daily"]');
  if (!root) return;
  root.innerHTML = '';
  body = el('div', { class: 'stack', style: { padding: '16px' } });
  root.appendChild(body);
}
export function render() {
  if (!root) create();
  if (!body) return;
  Core.progress.rolloverDaily();
  const dayKey = Core.daily.dayKey();
  clear(body);
  mount(body, [
    el('section', { class: 'card' }, [
      el('div', { class: 'section-title', text: '每日挑战' }),
      el('div', { class: 'forge-question', text: dayKey }),
      el('div', { class: 'report-line', text: '相同靶序，挑战今天的最高分。每局 45 秒，收藏刀具不会受损。' }),
    ]),
    el('button', { class: 'btn btn--primary btn--block', text: '开始每日挑战 →', onclick: openDailyChallenge }),
  ]);
}
export default { create, render };
