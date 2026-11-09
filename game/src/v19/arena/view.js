import {
  TARGET_NAMES, SCHOOLS, GRADIENTS, EVENTS, APEX_GOAL, bladeCount, bladeId, eligibleBlades, gate, roundNames,
  masteryOf, tournamentState, createEntry, courseFor, summarizeRound, settleRound, abandonEntry, dayKey,
} from '../tournament.js';
import { STAT_NAMES, signaturePerk } from '../forge.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const art = key => new URL('../../../assets/v19/targets/' + key + '.png', import.meta.url).href;
const modes = ['practice', 'quick', 'daily', 'school', 'national', 'apex'];
const glyphs = ['╱', '⟋⟋', '◷', '◇', '旗', '冠'];
const styles = { mix: '实战轮替', row: '横排连斩', heavy: '极限劈砍' };
const button = (action, text, kind = 'secondary', attrs = '') =>
  `<button class="${kind}" type="button" data-arena-action="${action}" ${attrs}>${text}</button>`;
const title = (kicker, name, caption = '') =>
  `<div class="arena-heading"><div class="eyebrow">${kicker}</div><h2 tabindex="-1">${name}</h2>${caption ? `<p>${caption}</p>` : ''}</div>`;
const eventId = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
const pct = n => Math.round(n * 100) + '%';

export function mountTournament(root, { getSave, commit, settings, onLegacy, hasLegacyCareer }) {
  const entry = { mode: eligibleBlades(getSave()).length ? 'school' : 'practice', school: 'edge', grade: 0, style: 'mix', material: '' };
  let chosen = [];
  let waiting = false, notice = '', confirming = false;
  const muted = () => settings().sound === false;
  let bout, engine, practiceRun;

  function state() {
    return tournamentState(getSave());
  }

  function syncSelection(preferred) {
    const blades = eligibleBlades(getSave()).map(bladeId);
    if (entry.mode === 'practice' && (preferred ?? chosen[0]) === 'training') {
      chosen = ['training'];
      return;
    }
    const valid = [preferred, ...chosen, ...blades].filter(id => blades.includes(id));
    chosen = [...new Set(valid)].slice(0, bladeCount(entry));
    if (!chosen.length && entry.mode === 'practice') chosen = ['training'];
  }

  function eventRules(data) {
    if (entry.mode === 'school') {
      const cleared = data.schools[entry.school] ?? 0;
      return `<div class="school-list" aria-label="赛事流派">${Object.entries(SCHOOLS).map(([key, school]) =>
        button('school', `<i>${school.glyph}</i><span><b>${school.name}</b><small>${school.focus}</small></span>`,
          'school-card', `data-value="${key}" aria-pressed="${key === entry.school}"`)).join('')}</div>
        <div class="arena-label"><b>进阶之路</b><span>已通过 ${cleared} / 5</span></div>
        <div class="arena-grades">${GRADIENTS.map((name, grade) => button('grade',
          `<i>${grade < cleared ? '✓' : '0' + (grade + 1)}</i>${name}`, 'grade-card',
          `data-value="${grade}" aria-pressed="${entry.grade === grade}" ${grade > cleared ? 'disabled' : ''}`)).join('')}</div>`;
    }
    if (entry.mode === 'practice') {
      return `<div class="arena-label"><b>练习方式</b><span>借刀也可上场</span></div>
        <div class="practice-styles">${Object.entries(styles).map(([key, name]) => button('style', name, 'secondary',
          `data-value="${key}" aria-pressed="${entry.style === key && !entry.material}"`)).join('')}</div>
        <div class="arena-label"><b>指定单靶</b><span>反复练习同一材料</span></div>
        <div class="target-picker">${Object.entries(TARGET_NAMES).map(([key, name]) => button('material',
          `<img src="${art(key)}" loading="lazy" alt=""><span>${name}</span>`, 'target-chip',
          `data-value="${key}" aria-pressed="${entry.material === key}"`)).join('')}</div>`;
    }
    const rounds = roundNames(entry.mode);
    if (rounds.length) {
      return `<ol class="series-steps">${rounds.map((name, i) =>
        `<li><i>0${i + 1}</i><b>${name}</b><small>45 秒</small></li>`).join('')}</ol>
        <p class="arena-note">${entry.mode === 'national' ?
          '一把刀出战全程，每轮达成目标即可晋级。失利结束本届，可再次报名。' :
          `三把成刀按报名顺序出战。三轮均须达标，总评至少 ${APEX_GOAL} 分方可夺冠。`}</p>`;
    }
    return `<div class="arena-mode-note"><b>${entry.mode === 'daily' ? dayKey().slice(5).replace('-', '.') + ' · 今日试场' : '45 秒连斩冲分'}</b>
      <p>${entry.mode === 'daily' ? '每日按北京时间换靶序。当天首次有效出战领取奖励，重试可以刷新纪录。' :
        '横排连切与重靶轮替，挥得越利落，连斩得分越高。打满 45 秒并命中至少 4 个不同靶具即可结算成长。'}</p>
      ${entry.mode === 'daily' ? '<a class="arena-link" href="#/daily">查看今日目标 ↗</a>' : ''}</div>`;
  }

  function targetPreview(course) {
    return `<div class="course-waves" aria-label="靶序">${course.waves.slice(0, course.rotate ? 2 : 3).map((wave, i) =>
      `<div><i>0${i + 1}</i><span>${wave.heavy ? '重劈' : '连斩'}</span><b>${wave.targets.map(key => TARGET_NAMES[key]).join(' · ')}</b></div>`).join('')}</div>`;
  }

  function bladeFields(blades) {
    const count = bladeCount(entry);
    const allowsLoan = entry.mode === 'practice';
    if (!blades.length && !allowsLoan) return '<p class="arena-note">鉴定完成后，成刀就会出现在参赛名单中。</p>';
    return Array.from({ length: count }, (_, index) => {
      const perk = signaturePerk(blades.find(blade => bladeId(blade) === chosen[index])?.signature);
      return `<label class="blade-field"><span>${count === 1 ? '当前出战刀' : '第 ' + (index + 1) + ' 轮'}</span>
      <select data-blade-slot="${index}" aria-label="${count === 1 ? '当前出战刀' : '第 ' + (index + 1) + ' 轮参赛刀'}">
        ${!chosen[index] ? '<option value="" selected disabled>待选成刀</option>' : ''}
        ${allowsLoan ? `<option value="training"${chosen[index] === 'training' ? ' selected' : ''}>工坊试刀 · 借用</option>` : ''}
        ${blades.map(blade => {
          const id = bladeId(blade);
          const picked = chosen[index] === id;
          return `<option value="${esc(id)}"${picked ? ' selected' : chosen.includes(id) ? ' disabled' : ''}>${esc(blade.name)} · ${esc(blade.score)} 分</option>`;
        }).join('')}
      </select>${perk ? `<small class="arena-note">${esc(perk.name)} · ${esc(perk.desc)}</small>` : ''}</label>`;
    }).join('');
  }

  function renderDeck(data) {
    const blades = eligibleBlades(getSave());
    const reason = gate(getSave(), entry);
    const course = courseFor({ ...entry, id: 'preview', reports: [] });
    const blade = blades.find(item => bladeId(item) === chosen[0]);
    const mastery = blade ? masteryOf(getSave(), blade) : null;
    const canRegister = !reason && (!data.active || entry.mode === 'practice');
    const notes = { practice: '试刀仅用于练习', quick: '有效出战可获信用点、经验和磨合', daily: '当天首次有效出战可获奖励',
      school: course.combo ? `斩完三波，并打出至少 ×${course.combo} 连斩` : '斩完三波即可通关',
      national: '本轮达标后进入下一轮', apex: '三刀轮换，累计评定分数' };
    return `<aside class="arena-deck" aria-label="报名卡">
      ${title('ENTRY / 报名卡', entry.mode === 'school' ? course.title : EVENTS[entry.mode].name, notes[entry.mode])}
      ${bladeFields(blades)}
      ${mastery ? `<div class="blade-mastery"><b>${mastery.level}</b><span>${mastery.project}专长 +${pct(mastery.bonus)} · 有效 ${mastery.matches} 场</span></div>
        <div class="arena-attributes" aria-label="出战刀六维">${blade.stats.map((value, i) =>
          `<div><small>${STAT_NAMES[i]}</small><b>${value}</b></div>`).join('')}</div>` : ''}
      ${entry.mode === 'school' || entry.mode === 'practice' ? targetPreview(course) : ''}
      ${reason ? `<p class="arena-lock">${reason}</p>` : ''}
      ${canRegister ? button('register', entry.mode === 'practice' ? '准备试刀' : '锁定出战刀 · 报名', 'primary') :
        !blades.length && entry.mode !== 'practice' ? '<a class="arena-link" href="#/forge">去锻造第一把刀 ↗</a>' : ''}
      ${data.active && !reason && entry.mode !== 'practice' ? '<p class="arena-note">已有一场报名，可从大厅顶部继续。</p>' : ''}
      <p class="arena-note">耐久只在本轮内消耗。不同靶具考验刀具的不同长处。</p>
    </aside>`;
  }

  function renderLobby() {
    const data = state();
    const hasBlade = eligibleBlades(getSave()).length > 0;
    const cleared = Object.values(data.schools).reduce((sum, value) => sum + value, 0);
    const active = data.active;
    const recent = data.history.slice(0, 6);
    root.innerHTML = `
      <header class="arena-hero">
        <div class="hero-art" aria-hidden="true">
          <img src="${art('gel')}" alt="" width="400" height="464"><img src="${art('shield')}" alt="" width="400" height="464"><img src="${art('rope')}" alt="" width="400" height="464">
          <small>09 / TARGETS</small>
        </div>
        <div class="arena-hero-copy">
          <div class="eyebrow"><i></i> THE FORGE TOURNAMENT / 赛季 01</div>
          <h1 tabindex="-1">斩试场<span>.</span></h1>
          <p>用亲手打出的刀，从第一斩走到巅峰。</p>
          <div class="hero-actions">${button('loan', '借刀试斩 ↗', 'primary')}${!hasBlade ? '<a class="arena-link" href="#/forge">去锻造 ↗</a>' : ''}</div>
        </div>
      </header>
      ${active ? `<div class="arena-checkpoint">
        <div><small>赛程已保存</small><b>${esc(courseFor(active).title)}</b><span>${active.reports.length ? '已结算 ' + active.reports.length + ' 轮' : '待开赛'} · ${active.roster.length} 把已锁定</span></div>
        <div>${button('continue', '继续赛事', 'primary')}${button('abandon', confirming ? '取消退出' : '结束本届')}</div>
      </div>${confirming ? `<div class="arena-checkpoint confirm"><p>结束本届将清除待打赛程，已结算的成长保留。</p>${button('confirm-abandon', '确认结束')}</div>` : ''}` : ''}
      ${hasLegacyCareer() ? `<div class="arena-checkpoint"><div><b>旧赛程待继续</b><span>保留已完成轮次与原赛制</span></div>${button('legacy-career', '继续旧赛程')}</div>` : ''}
      <p class="arena-alert" role="status" ${notice ? '' : 'hidden'}>${esc(notice)}</p>
      <div class="arena-layout">
        <div class="arena-track">
          <div class="arena-section-head">${title('TOURNAMENT / 赛事', '挑一场来打')}
            <span class="arena-emblem">流派 ${cleared} / 30 · 冠军 ${(data.titles.national ?? 0) + (data.titles.apex ?? 0)}</span></div>
          <div class="arena-events" aria-label="赛事类型">
            ${modes.map((mode, i) => {
              const locked = ['national', 'apex'].includes(mode) && gate(getSave(), { mode });
              return button('mode', `<i>${glyphs[i]}</i><span><b>${EVENTS[mode].name}</b><small>${EVENTS[mode].sub}</small></span>${locked ? '<em>待解锁</em>' : ''}`,
                'event-card', `data-value="${mode}" aria-pressed="${entry.mode === mode}"`);
            }).join('')}
          </div>
          ${eventRules(data)}
        </div>
        ${renderDeck(data)}
      </div>
      <section class="arena-log" aria-label="战报">
        <div class="arena-section-head">${title('RECORDS / 履历', '近期战报')}<span class="arena-emblem">快赛最高 ${data.best.quick ?? '—'}</span></div>
        ${recent.length ? `<div class="arena-log-list">${recent.map((record, index) => button('history',
          `<span><b>${esc(record.title)}</b><small>${esc(record.blade)}</small></span><strong>${record.report.score} 分 ↗</strong>`,
          'arena-log-item', `data-value="${index}"`)).join('')}</div>` : '<p class="arena-note">完成一轮赛事后，战报会记在这里。</p>'}
      </section>`;
  }

  function closeBout() {
    engine?.destroy();
    engine = null;
    bout = null;
  }

  function focusHeading() {
    root.querySelector('h1, h2')?.focus({ preventScroll: true });
  }

  function scrollTop() {
    root.closest('.page').scrollTop = 0;
    focusHeading();
  }

  async function prepare(run) {
    closeBout();
    const course = courseFor(run);
    const blade = run.roster[run.mode === 'apex' ? run.reports.length : 0];
    const next = bout = { run, course, blade };
    const rounds = roundNames(run.mode);
    const subtitle = rounds.length ? '第 ' + (run.reports.length + 1) + ' / ' + rounds.length + ' 轮' : EVENTS[run.mode].name;
    const goal = course.timedLoop ? '在限时内尽量斩断靶具' : '斩断三波全部靶具' + (course.combo ? '，并达成双靶连斩' : '');
    root.innerHTML = `
      <div class="arena-round-head">
        ${title('LIVE / ' + subtitle, course.title, esc(blade.name) + ' · ' + course.limit + ' 秒')}
        ${button('pause', '暂停', 'quiet round-pause', 'hidden')}
      </div>
      <div class="trial-frame">
        <canvas tabindex="0" aria-label="挥刀舞台。鼠标或手指快速划过靶具。键盘空格横斩，数字键选斩。" ></canvas>
        <div class="trial-hud">
          <div><small>实斩得分</small><b data-trial="score">0000</b><em data-trial="delta"></em></div>
          <div><small>剩余时间</small><b data-trial="time">${course.limit}″</b></div>
          <div><small>靶波</small><b data-trial="wave">—</b></div>
          <div><small>连斩</small><b data-trial="combo">—</b></div>
        </div>
        <div class="trial-verdict"><span data-trial="verdict" class="cut-callout"></span></div>
        <div class="trial-target"><small data-trial="kind"></small><b data-trial="target"></b></div>
        <div class="trial-bottom">
          <div><span>刀刃耐久 <b data-trial="durability">100%</b></span><progress data-trial="wear" aria-label="刀刃耐久" max="100" value="100"></progress></div>
          <p data-trial="tip">快速划过靶具</p>
          <div><span>已斩断 <b data-trial="hits">0</b></span></div>
        </div>
        <div class="trial-cover" data-cover>
          <div class="trial-card">
            <div class="eyebrow">ON THE LINE / 准备开斩</div>
            <h3>${goal}</h3>
            <p>按住并快速滑过靶具。硬靶可沿切痕反复挥砍。</p>
            ${targetPreview(course)}
            ${button('strike-start', '正在准备靶具…', 'primary', 'disabled')}
            ${button('lobby', '返回赛事大厅')}
          </div>
        </div>
      </div>
      <p class="trial-keyboard arena-note">键盘可聚焦舞台，空格横斩，数字键 1–4 单独挥砍，Esc 暂停。</p>`;
    scrollTop();
    try {
      next.module = await import('./trial.js');
      next.sprites = await next.module.loadTargets(course.waves.flatMap(wave => wave.targets), muted());
      if (bout !== next) return;
      const start = root.querySelector('[data-arena-action="strike-start"]');
      start.disabled = false;
      start.textContent = '开始挥刀';
    } catch {
      if (bout !== next) return;
      const start = root.querySelector('[data-arena-action="strike-start"]');
      start.disabled = false;
      start.dataset.arenaAction = 'reload-targets';
      start.textContent = '靶具载入失败 · 重试';
    }
  }

  function setCover(content) {
    const cover = root.querySelector('[data-cover]');
    cover.innerHTML = `<div class="trial-card">${content}</div>`;
    cover.hidden = false;
    root.querySelector('.round-pause').hidden = true;
    cover.querySelector('button')?.focus({ preventScroll: true });
  }

  function showPause() {
    setCover(`<div class="eyebrow">PAUSED / 暂停</div><h3>刀锋待命</h3><p>靶具状态和本轮时间已保留。</p>
      ${button('resume', '继续挥刀', 'primary')}${button('lobby', '回大厅 · 本轮重开')}`);
  }

  function begin() {
    if (!bout?.sprites || engine) return;
    const frame = root.querySelector('.trial-frame');
    const current = bout;
    try {
      engine = current.module.createTrial(frame, current.course, current.blade, current.sprites, {
        muted: muted(), volume: settings().volume, onPause: showPause, onFinish: result => { void finish(current, result); },
      });
    } catch {
      setCover(`<h3>切割舞台开启失败</h3><p>请检查浏览器的画布支持后重试。</p>${button('lobby', '返回大厅')}`);
      return;
    }
    resumeDisplay();
    engine.start();
  }

  function resumeDisplay() {
    root.querySelector('[data-cover]').hidden = true;
    root.querySelector('.round-pause').hidden = false;
    const canvas = root.querySelector('canvas');
    canvas.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    canvas.focus({ preventScroll: true });
  }

  async function finish(current, result) {
    if (current !== bout || waiting) return;
    if (current.run.mode === 'practice') {
      practiceRun = current.run;
      const report = summarizeRound(current.course, result);
      return renderReport({ mode: 'practice', done: true, title: report.title, blade: current.blade.name, report });
    }
    waiting = true;
    setCover('<div class="eyebrow">REPORT / 结算</div><h3>正在保存本轮战报…</h3>');
    const reply = await commit(draft => settleRound(draft, current.run.id, current.run.reports.length, result));
    waiting = false;
    if (current !== bout) return;
    if (reply.error) {
      current.result = result;
      setCover(`<h3>本轮保存遇到问题</h3><p>${esc(reply.error)}</p>
        ${button('retry-report', '重试保存', 'primary')}${button('lobby', '返回大厅')}`);
      return;
    }
    renderReport(reply.record);
  }

  function renderReport(record) {
    closeBout();
    const { report, mode } = record;
    const quick = ['practice', 'quick', 'daily'].includes(mode);
    const active = state().active;
    const heading = record.champion ? (mode === 'national' ? '全国大赛冠军' : '三刀巅峰赛冠军') :
      mode === 'practice' ? '试刀结束' : quick ? '快赛战报' :
      !record.done ? (mode === 'national' ? '获胜晋级' : '本轮已结算') :
      mode === 'national' ? '本届止步' : mode === 'apex' ? '三刀赛结束' : report.win ? '试炼通过' : '试炼待破';
    const reason = quick ? (mode === 'practice' ? '借刀试斩与材料练习不计入成长。' :
      record.paidDaily ? '今日奖励已领取，本次成绩已记录。' : record.qualified ? '有效出战，奖励已入账。' : '快赛奖励需要命中至少 4 个不同靶具。') :
      mode === 'apex' && record.done && !record.champion ? `夺冠需要三轮均达标，总评达到 ${APEX_GOAL} 分。` :
      report.win ? '本轮目标已达成。' : report.complete ? '靶具已斩完，本轮连斩尚未达标。' :
      report.reason === 'wear' ? '本轮刀刃耐久耗尽。' : '限时内仍有靶具未斩断。';
    const stats = quick ? [['实斩得分', report.score], ['已斩断', report.cut], ['最高连斩', '×' + report.combo]] :
      [['评定分', report.performance + ' / 1000'], ['已斩断', report.cut + ' / ' + report.targets], ['有效进度', pct(report.progress)]];
    root.innerHTML = `<section class="arena-report">
      <header>${title('RESULT / ' + esc(record.title), heading, esc(record.blade) + ' · ' + reason)}
        <div class="report-mark" aria-hidden="true">${record.champion ? '冠' : '斩'}</div></header>
      <div class="report-stats">${stats.map(([label, value]) => `<div><small>${label}</small><b>${value}</b></div>`).join('')}</div>
      ${mode !== 'practice' ? `<div class="report-rewards"><b>+ ${record.cr} CR</b><b>+ ${record.xp} XP</b><span>${record.mastery ?
        '磨合 +1 · ' + record.mastery.level + ' · ' + record.mastery.project + '专长 +' + pct(record.mastery.bonus) : '本轮磨合未增加'}</span></div>` : ''}
      ${record.rounds?.length > 1 || ['national', 'apex'].includes(mode) ? `<div class="report-rounds"><div class="arena-label"><b>本届轮次</b><span>总评 ${record.total}${mode === 'apex' ? ' / ' + APEX_GOAL : ''}</span></div>
        ${record.rounds.map(item => `<div><b>${esc(item.title)}</b><span>${esc(item.blade)}</span><strong>${item.win ? '' : '未达标 · '}${item.performance} 分</strong></div>`).join('')}</div>` : ''}
      <div class="report-actions">
        ${active?.id === record.id ? button('continue', '准备下一轮', 'primary') :
          mode === 'practice' ? button('retry-practice', '再试一轮', 'primary') : ''}
        ${button('lobby', '返回赛事大厅')}
        <a class="arena-link" href="#/forge">回到锻造工坊 ↗</a>
      </div></section>`;
    scrollTop();
  }

  async function register(loan = false) {
    const plan = loan ? { mode: 'practice', style: 'mix' } : { ...entry };
    const ids = loan || chosen[0] === 'training' ? [] : chosen;
    const id = eventId();
    if (plan.mode === 'practice') {
      const { run, error } = createEntry(getSave(), plan, ids, id);
      if (run) return prepare(run);
      notice = error;
    } else {
      waiting = true;
      root.querySelector('[data-arena-action="register"]').disabled = true;
      const { run, error } = await commit(draft => createEntry(draft, plan, ids, id));
      waiting = false;
      if (run) return prepare(run);
      notice = error;
    }
    renderLobby();
  }

  root.addEventListener('change', event => {
    const slot = event.target.dataset.bladeSlot;
    if (slot == null || waiting) return;
    chosen[Number(slot)] = event.target.value;
    renderLobby();
    root.querySelector(`[data-blade-slot="${slot}"]`)?.focus({ preventScroll: true });
  });

  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && engine?.pause()) event.preventDefault();
  });

  root.addEventListener('click', async event => {
    const target = event.target.closest('[data-arena-action]');
    if (!target || waiting) return;
    const { arenaAction: action, value } = target.dataset;
    notice = '';
    switch (action) {
      case 'legacy-career': return onLegacy();
      case 'loan': return register(true);
      case 'register': return register();
      case 'mode': entry.mode = value; syncSelection(); break;
      case 'school': entry.school = value; entry.grade = 0; break;
      case 'grade': entry.grade = Number(value); break;
      case 'style': entry.style = value; entry.material = ''; break;
      case 'material': entry.material = value; break;
      case 'continue': confirming = false; if (state().active) return prepare(state().active); break;
      case 'abandon': confirming = !confirming; break;
      case 'confirm-abandon': {
        waiting = true;
        const id = state().active?.id;
        const result = await commit(draft => abandonEntry(draft, id) ? {} : { error: '这场比赛已结束' });
        waiting = false;
        confirming = false;
        notice = result.error || '本届赛程已结束。';
        break;
      }
      case 'strike-start': return begin();
      case 'reload-targets': return prepare(bout.run);
      case 'pause': return engine?.pause();
      case 'resume': resumeDisplay(); return engine?.resume(settings());
      case 'retry-report': return finish(bout, bout.result);
      case 'history': return renderReport(state().history[Number(value)]);
      case 'retry-practice': return prepare({ ...practiceRun, id: eventId() });
      case 'lobby':
        closeBout();
        renderLobby();
        return scrollTop();
      default: return;
    }
    renderLobby();
    root.querySelector(`[data-arena-action="${action}"]${value == null ? '' : `[data-value="${value}"]`}`)?.focus({ preventScroll: true });
  });

  return {
    open({ bladeId, mode } = {}) {
      closeBout();
      if (mode) entry.mode = mode;
      else if (bladeId || (entry.mode === 'practice' && eligibleBlades(getSave()).length)) entry.mode = 'school';
      syncSelection(bladeId);
      renderLobby();
      focusHeading();
    },
    leave() { closeBout(); },
    pause: () => engine?.pause(),
  };
}
