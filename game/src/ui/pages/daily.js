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
  const seed = Core.daily.seedOfDay(dayKey);
  clear(body);
  mount(body, [
    el('section', { class: 'card' }, [
      el('div', { class: 'section-title', text: '每日快速赛事已移入赛事页' }),
      el('div', { class: 'forge-question', text: `${dayKey} · 固定挑战种子` }),
      el('div', { class: 'report-line', text: '使用同一组每日目标序列，带上藏刀阁中的成刀进行 45 秒 2D 切割挑战。每日挑战可重复游玩，每局按成绩赚取信用点。' }),
      el('div', { class: 'muted tiny', text: `今日固定 Seed：${seed}` }),
    ]),
    el('button', { class: 'btn btn--primary btn--block', text: '前往赛事 · 开始每日挑战', onclick: openDailyChallenge }),
  ]);
}
export default { create, render };
