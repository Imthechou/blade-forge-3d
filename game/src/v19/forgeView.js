import {
  WINDOW_PRICE, LOT_SIZE, BATCHES, HEAT, fittingPrice, PHASES, GRADES, ORE_TIERS, rareOdds, oreMaterialOf, MODELS, LOOKS, FITS, STAT_NAMES,
  offers, familyOf, stabilityOf, buyOre, beginRefining, advanceHeat, pourRefining, heatBand, refinementRank,
  REFINEMENT_RESULTS, REFINEMENT_FAILURES, fractureRisk, strike, finishForge,
  fitOptions, refreshFittings, signature, signaturePerk, inspectOre, mineralHeritage, oreInspection, oreModelId,
} from './forge.js';
import { attachForgeStage, releaseForgeStage } from './sharedStage.js';
import { forgeMarkup } from './forgeMarkup.js';
import { ForgeSound } from './sound.js';
import { get as getProgress } from '../core/progress.js';
import { commitFurnace, finishAppraisal, forgeSession, openFurnace } from '../core/v19Progress.js';
import { haptics } from '../platform/index.js';

export function mountForge(root, { onArena, onCollection }) {
  root.innerHTML = forgeMarkup;
  const get = id => root.querySelector('#' + id);
  const stageBox = get('stage');
  const actions = get('actions');
  const tray = get('tray');
  const readout = get('readout');
  const msg = get('stage-message');
  const sound = new ForgeSound();
  const stepNames = ['选料', '精炼', '锻打', '装配', '鉴定'];
  const stationNames = ['原石检视台', '精炼炉口', '锻造铁砧', '装配工作台', '成刀展台'];
  const roman = ['', ' I', ' II', ' III'];
  const fmt = p => (p * 100).toFixed(p === 0 ? 0 : 1) + '%';
  const signed = n => (n < 0 ? '−' : n > 0 ? '+' : '') + Math.abs(n);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  let save;
  let active = false;
  let canvas;
  let frameId;
  let revealTimer;
  let pendingCheckpoint = false;
  let stage;
  let busy = false;
  let queuedHit;
  let queuedStop = false;
  let resultPause = false;
  let revealPending = false;
  let heatInput;
  let heatHud;
  let saveTask;
  let drag;
  let trayKey;
  let webglError = false;
  let inspectionMode = 'natural';
  let toolStone = '';
  let echoTimer;
  function showStorageNotice(message) {
    const notice = get('save-notice');
    notice.textContent = message;
    notice.hidden = !message;
  }

  function cancelIdleSave() {
    if (!saveTask) return;
    if (saveTask.idle) cancelIdleCallback(saveTask.id);
    else clearTimeout(saveTask.id);
    saveTask = null;
  }

  function apply(change, checkpoint = false) {
    cancelIdleSave();
    const result = commitFurnace(save.run, change);
    if (!result.ok) {
      if (result.error) showStorageNotice(result.error + (checkpoint ? ' · 点此重试' : ''));
      if (checkpoint) pendingCheckpoint = true;
      return null;
    }
    pendingCheckpoint = false;
    save = { run: result.run, credits: result.credits };
    showStorageNotice('');
    return result.result;
  }

  function persist() {
    const saved = apply(undefined, true);
    if (!saved && heatInput) {
      heatInput = null;
      cancelAnimationFrame(frameId);
      drawHeat();
    }
    return saved;
  }

  function persistWhenIdle() {
    if (saveTask) return;
    const idle = typeof requestIdleCallback === 'function';
    const write = () => { saveTask = null; persist(); };
    saveTask = { idle, id: idle ? requestIdleCallback(write, { timeout: 500 }) : setTimeout(write, 80) };
  }

  function button(action, label, { kind = 'primary', off = false, id = '' } = {}) {
    return `<button type="button" class="${kind}" data-action="${action}" ${id ? `id="${id}"` : ''} ${off ? 'disabled' : ''}>${label}</button>`;
  }

  function title(eyebrow, heading, copy) {
    get('eyebrow').textContent = eyebrow;
    get('title').textContent = heading;
    get('description').textContent = copy;
  }

  function info(label, text, copy = '', side = '') {
    return `<div class="info-block"><div class="info-line"><small>${label}</small>${side && `<b class="readout-number">${side}</b>`}</div><strong>${text}</strong>${copy && `<p>${copy}</p>`}</div>`;
  }

  function lookChips(run) {
    const fields = Object.entries(LOOKS).filter(([slot]) => LOOKS[slot][run.skin[slot]]);
    const combination = signature(run.skin);
    return `<div class="look-list">${fields.map(([slot, names]) => `<span class="look-chip ${run.skin.levels[slot] >= 3 ? 'rarity' : ''}">${names[run.skin[slot]]}${roman[run.skin.levels[slot]] || ''}</span>`).join('')}${combination ? `<span class="look-chip rarity">${combination}</span>` : ''}</div>`;
  }

  function render() {
    if (!save?.run) return;
    const run = save.run;
    heatHud = null;
    const { phase } = run;
    const failedRefining = run.last?.type === 'refine-fail';
    const navPhase = phase === 'reveal' ? 'ore' : phase === 'broken' ? failedRefining ? 'refine' : 'forge' : phase;
    const idx = PHASES.indexOf(navPhase);
    const ore = phase === 'ore' ? offers(run)[run.selected] : run.ore;
    const fit = FITS.find(item => item.id === run.fit);
    stageBox.dataset.mode = phase;
    if (phase !== 'refine') stageBox.dataset.danger = 'false';
    get('ore-nav').hidden = phase !== 'ore';
    get('ore-position').textContent = '第 ' + (run.batch + 1) + ' 批 · ' + (run.selected + 1) + ' / ' + LOT_SIZE;
    get('steps').innerHTML = stepNames.map((label, n) => `<div class="step ${n === idx ? 'current' : n < idx ? 'past' : ''}" ${n === idx ? 'aria-current="step"' : ''}><i>0${n + 1}</i>${label}</div>`).join('');
    get('stage-code').textContent = 'STATION 0' + (idx + 1);
    get('stage-name').textContent = stationNames[idx];
    const status = { ore: '原石在台', reveal: '已开料', refine: '炉温实时', forge: '可自由落锤', fit: '试装预览', appraise: '成品已入藏', broken: '炉次结束' };
    get('stage-state').textContent = webglError ? '3D 暂不可用' : status[phase];
    const hints = {
      ore: '拖动转石', reveal: '同源矿相 · 拖动检视', refine: '松手仍有余热 · 可提前浇注',
      forge: matchMedia('(pointer: coarse)').matches ? '轻点刀身 · 落点影响出纹' : '直接轻点刀身 · 空格落锤', fit: '拖动转刀，比较装配',
      appraise: '拖动检视成刀', broken: failedRefining ? '本炉钢料已报废' : '保留本次锻打记录',
    };
    get('stage-hint').textContent = hints[phase];
    if (phase === 'ore') {
      const family = familyOf(ore.family), mineral = oreMaterialOf(ore);
      title('01 / SELECT A STONE', family.name, mineral.name + ' · ' + ORE_TIERS[ore.tier]);
      readout.innerHTML = `<div class="ore-decision"><span>开料 <b>${ore.price} CR</b></span><span>价位稀质率 <b>${rareOdds(run, ore.tier)}%</b></span></div>`;
      actions.innerHTML = button('buy', '切开原石 · ' + ore.price + ' CR', { off: ore.price > save.credits }) +
        button('next-batch', run.batch === BATCHES - 1 ? '最后一批' : '换一批 · 免费', { kind: 'secondary', off: run.batch === BATCHES - 1 }) +
        `<span class="action-note">${ore.price > save.credits ? '余额不足，请选价格更低的原石' : '余额 ' + save.credits + ' → ' + (save.credits - ore.price) + ' CR · 切开后不能退料'}</span>`;
    } else if (phase === 'reveal') {
      const family = familyOf(ore.family);
      if (revealPending) {
        title('01 / THE CUT', '开石见芯', '');
        readout.innerHTML = `<div class="info-block ore-report ore-suspense">
          <div class="info-line"><small>开料完成 · LOT ${ore.number}</small><b class="readout-number">−${ore.price} CR</b></div>
          <strong>石皮分离中…</strong>
          <div class="ore-suspense-track"><i></i></div>

        </div>`;
        actions.innerHTML = button('to-refine', '切面鉴定中…', { off: true });
      } else {
        const mineral = oreMaterialOf(ore), heritage = mineralHeritage(ore);
        title('01 / INSIDE THE STONE', GRADES[ore.grade] + ' · ' + family.name, '矿相已揭晓');
        readout.innerHTML = `<div class="ore-report ore-result grade-${ore.grade}">
          <div class="ore-grade"><span class="ore-grade-icon">${['◆','✦','✧'][ore.grade]}</span><div><small>${mineral.name}</small><strong>${GRADES[ore.grade]}矿芯</strong></div><small>选料 −${ore.price + Object.keys(run.inspections || {}).length * WINDOW_PRICE} CR</small></div>
          <div class="mineral-meters">
            <div><span>纯净度</span><b id="ore-purity">${ore.purity}</b><i style="--value:${ore.purity}%"></i></div>
            <div><span>稳定性</span><b id="ore-stability">${stabilityOf(ore.stability)}</b><i style="--value:${ore.stability}%"></i></div>
          </div>
          <button type="button" class="heritage-preview" data-action="preview-mineral" aria-pressed="false"><span class="heritage-swatch" style="--core:${heritage.core};--steel:${heritage.tone}"></span><span><small>${heritage.tintName} · ${heritage.clarityName}</small><b>${heritage.name}</b></span><strong>预览刀身 ↗</strong></button>
        </div>`;
        actions.innerHTML = button('to-refine', '送去精炼');
      }
    } else if (phase === 'refine') {
      title('02 / HEAT CONTROL', '控住火候', '追随绿区排渣，满意就浇注。持续过热或凝固会废炉。');
      readout.innerHTML = `<div class="info-block temperature">
        <div class="info-line"><strong id="heat-step">原石升温</strong><span class="heat-clock" id="heat-clock">待点火</span><b class="readout-number" id="heat-number">35°</b></div>
        <div class="thermo" role="progressbar" aria-label="炉温" aria-valuemin="0" aria-valuemax="100" aria-valuenow="35" id="thermo"><i class="thermo-fill" id="heat-fill"></i><i class="thermo-range" id="heat-range"></i><i class="thermo-danger"></i><i class="thermo-needle" id="heat-needle"></i></div>
        <div class="info-line"><small>排渣区 <b id="heat-target"></b></small><small id="heat-draft">按住点火</small></div>
        <div class="info-line"><strong id="heat-rank">尚未成坯</strong><b class="readout-number" id="heat-quality">0 / 100</b></div>
        <div class="heat-progress" role="progressbar" aria-label="精炼质量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="heat-quality-meter"><span id="heat-progress"></span><i style="left:22%"></i><i style="left:65%"></i><i style="left:86%"></i></div>
        <div class="heat-thresholds"><small>22 成坯</small><small>65 良好</small><small>86 极佳</small></div>
        <div class="info-line"><small>炉料损伤</small><b class="heat-damage-value" id="heat-damage-value">0%</b></div>
        <div class="risk-bar heat-damage"><span id="heat-damage"></span></div>
        <small id="heat-note">先把原石加热到 65°</small>
      </div>`;
      actions.innerHTML = button('heat', '按住鼓风', { id: 'heat-button' }) +
        button('pour-refine', '排渣中…', { kind: 'secondary', id: 'pour-button', off: true });
      heatHud = { nodes: Object.fromEntries(['thermo', 'heat-step', 'heat-number', 'heat-clock', 'heat-fill',
        'heat-needle', 'heat-range', 'heat-target', 'heat-draft', 'heat-rank', 'heat-quality', 'heat-quality-meter',
        'heat-progress', 'heat-damage', 'heat-damage-value', 'heat-note', 'heat-button', 'pour-button'].map(id => [id, get(id)])),
        values: Object.create(null), updated: -Infinity, state: '' };
      drawHeat();
    } else if (phase === 'forge') {
      const risk = fractureRisk(run);
      title('03 / THE ANVIL', '下一锤，怎么打？', run.hits ? '在刀腹找纹，在刃侧找光。喜欢眼前这把刀，就可以收锤。' : '直接点刀胚。刀腹、刃侧和刀尖，能敲出不同方向的变化。');
      readout.innerHTML = `<div class="info-block"><div class="risk-line"><small>下一锤断率</small><strong class="risk-value ${risk >= .075 ? 'alert' : ''}" id="risk">${fmt(risk)}</strong></div><div class="risk-bar"><span style="width:${risk / .9 * 100}%"></span></div><div class="info-line"><small>${MODELS[run.model]} · 纯净 ${run.purity} · ${stabilityOf(run.stability)}</small><b class="readout-number" id="hit-count">${run.hits} 锤</b></div></div>${run.refinement?.quality != null ? `<div class="refinement-result ${run.refinement.result}"><b>${REFINEMENT_RESULTS[run.refinement.result].label} · ${run.refinement.quality}</b><span>纯净 ${signed(run.purity - ore.purity)} · 稳定 ${signed(run.stability - ore.stability)}</span></div>` : ''}${lookChips(run)}`;
      const fallback = webglError ? '<div class="v19-zones">' + ['belly', 'edge', 'tip'].map((zone, index) =>
        button('strike-fallback', ['刀腹', '刃侧', '刀尖'][index], { id: 'strike-' + zone, kind: 'secondary' })).join('') + '</div>' : '';
      actions.innerHTML = fallback + button('finish', '收锤 · 保住这一把', { off: run.hits < 6 }) +
        `<span class="action-note">${run.hits < 6 ? '第 6 锤后可收锤 · 前六锤稳定' : '收锤后直接进入装配'}</span>`;
    } else if (phase === 'fit') {
      title('04 / FITTINGS', '挑一套配件', '点选试装，拖动转刀。查看刀柄可近看材质和端箍。');
      readout.innerHTML = fit ? info('当前试装', fit.name, fit.parts) : info('锻打完成', MODELS[run.model], '已经保留 ' + run.hits + ' 锤的结果。');
      const price = fittingPrice(run);
      actions.innerHTML = button('appraise', '确认装配 · 鉴定', { off: !fit }) +
        button('refresh', run.refreshed ? '本炉已刷新' : run.freeFitting ? '备料余裕 · 免费刷新' : '刷新一轮 · ' + price + ' CR', { kind: 'secondary', off: run.refreshed || save.credits < price });
    } else if (phase === 'appraise') {
      const record = run.record;
      if (!record) {
        title('05 / THE REVEAL', '成刀已鉴定', '可以前往藏刀阁或再开一炉。');
        readout.replaceChildren();
        actions.innerHTML = button('open-collection', '前往藏刀阁') + button('restart', '再开一炉', { kind: 'secondary' });
        return;
      }
      title('05 / THE REVEAL', record.name, '已收入藏刀阁');
      const perk = signaturePerk(record.signature);
      readout.innerHTML = info('成刀鉴定', `<span class="result-grade">${esc(record.grade)}</span> · ${esc(record.score)} 分`,
        ['品质 ' + record.quality, record.refinement?.quality != null && '精炼质量 ' + record.refinement.quality, perk?.desc].filter(Boolean).join(' · '),
        '+' + record.credit + ' CR') +
        lookChips(record) +
        `<div class="stat-list">${record.stats.map((n, i) => `<div class="stat"><span>${STAT_NAMES[i]}</span><span class="stat-track"><i style="width:${Number(n)}%"></i></span><b>${Number(n)}</b></div>`).join('')}</div>`;
      actions.innerHTML = button('enter-tournament', '带此刀参赛') + button('open-collection', '前往藏刀阁', { kind: 'secondary' }) + button('restart', '再开一炉', { kind: 'secondary' }) +
        '<span class="action-note">本次成刀 · 工坊 +10 XP</span>';
    } else {
      if (failedRefining) {
        title('02 / FURNACE LOST', '精炼失败', REFINEMENT_FAILURES[run.refinement.reason]);
        readout.innerHTML = info('炉次报废', '未生成成刀', '本炉选料已消耗 ' + (ore.price + Object.keys(run.inspections || {}).length * WINDOW_PRICE) + ' CR。') +
          info('下次控温', { burnt: '提前松手，留意余热', frozen: '及时鼓风，别让熔钢降到 55°', unmelted: '先按住鼓风，把原石熔化', slag: '跟随绿区排渣，质量至少达到 22' }[run.refinement.reason]);
      } else {
        title('03 / FRACTURE', '这一炉，断了', '锤头落下，裂痕贯穿了刀身。换一块矿，试一条不同的路。');
        readout.innerHTML = info('断裂记录', '第 ' + run.hits + ' 锤 · ' + fmt(run.last.risk), '本炉开料已消耗 ' + ore.price + ' 信用点。');
      }
      actions.innerHTML = button('restart', '再开一炉');
    }
    stage?.sync(run, ore, fit);
    renderGripFocus();
    renderTools(run,ore);
    renderTray(run, fit);
  }

  function renderGripFocus() {
    const button = get('grip-focus');
    button.hidden = save.run.phase !== 'fit' || !stage || webglError;
    button.setAttribute('aria-pressed', String(Boolean(stage?.gripFocus)));
    button.querySelector('span').textContent = stage?.gripFocus ? '查看全刀' : '查看刀柄';
  }

  function renderTools(run,ore) {
    get('ore-tools').hidden=run.phase!=='ore';
    stageBox.dataset.inspection=run.phase==='ore' ? inspectionMode : 'natural';
    if(run.phase!=='ore')return;
    const key=run.seed+'|'+ore.id;
    if(toolStone!==key){inspectionMode='natural';toolStone=key;}
    stageBox.dataset.inspection=inspectionMode;
    const checked=oreInspection(ore);
    get('inspection-note').textContent=inspectionMode==='lamp' ? '打灯 · '+checked.lamp : ore.window ? '小窗只是局部，内部仍有未知' : '转动原石，寻找露脉与石皮';
    root.querySelectorAll('[data-action="inspect-light"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===inspectionMode)));
    const windowButton=get('window-ore');
    windowButton.disabled=ore.window || save.credits<ore.price+WINDOW_PRICE;
    windowButton.querySelector('span').innerHTML=ore.window ? '已擦窗' : '擦窗 <small>'+WINDOW_PRICE+' CR</small>';
    windowButton.setAttribute('aria-label',ore.window ? '这块原石已经擦窗' : '擦开一小块石皮，花费'+WINDOW_PRICE+'信用点');
  }

  function toggleOreBlade(control) {
    const preview = stage?.toggleMineralPreview();
    control.setAttribute('aria-pressed', String(Boolean(preview)));
    control.querySelector('strong').textContent = preview ? '回看切面 ↩' : '预览刀身 ↗';
    get('stage-hint').textContent = preview ? '同源钢纹预览 · 后续锤击仍会变化' : '同源矿相 · 拖动检视';
  }

  function renderTray(run, fit) {
    const { phase } = run;
    const key = [run.seed, phase, run.batch, run.selected, run.refreshed, run.fit, JSON.stringify(run.inspections), phase === 'forge' && run.last?.hit].join('|');
    if (key === trayKey) return;
    trayKey = key;
    if (phase === 'ore') {
      tray.innerHTML = `<div class="ore-grid">${offers(run).map((stone,n) => {
        const rock=familyOf(stone.family);
        return `<button type="button" class="ore-card ${n===run.selected ? 'is-selected' : ''}" data-action="select-ore" data-id="${n}" aria-pressed="${n===run.selected}" aria-label="第${n+1}块 ${rock.name}，${stone.price}信用点，价位稀质率${rareOdds(run, stone.tier)}%">
          <span class="ore-card-top"><b>${stone.number}</b><span>${stone.window ? '已擦窗' : ORE_TIERS[stone.tier]}</span></span>
          <span class="ore-thumbnail"><img data-stone="${stone.id}" alt="${rock.name}实物缩略图"><i></i></span>
          <b class="ore-card-name">${rock.name}</b><span class="ore-card-footer"><strong>${stone.price} CR</strong><span>${rareOdds(run, stone.tier)}%</span></span>
        </button>`;
      }).join('')}</div>`;
      const { batch, seed } = run;
      for(const stone of offers(run)) stage?.oreThumbnail(stone).then(src => {
        if (!active || save.run.phase !== 'ore' || save.run.seed !== seed || save.run.batch !== batch) return;
        const img=tray.querySelector(`img[data-stone="${stone.id}"]`);
        if(img){img.src=src;img.closest('.ore-thumbnail').classList.add('is-loaded');}
      }).catch(error => console.warn('Specimen preview',error));
    } else if (phase === 'fit') {
      tray.innerHTML = `<div class="tray-head"><h2>挑选配件</h2><small>FITTING TRAY / ${run.refreshed ? '02' : '01'}</small></div><div class="fit-grid">${fitOptions(run).map(item => `<button type="button" class="fit-card" data-action="select-fit" data-id="${item.id}" aria-pressed="${fit?.id === item.id}"><span class="fit-colors"><i style="--sample:${item.color}"></i><i style="--sample:${item.accent}"></i><small>${item.role}</small></span><b>${item.name}</b><small>${item.parts}</small><small class="fit-stats">${item.delta.map((n, i) => n ? STAT_NAMES[i] + ' ' + (n > 0 ? '+' : '−') + Math.abs(n) : '').filter(Boolean).join(' · ')}</small></button>`).join('')}</div>`;
    } else {
      const note = {
        reveal: ['矿石已切开', '工艺倾向来自这块矿。'],
        refine: ['火候与取舍', '追随窄绿区排渣；提前浇注保料，继续控温争取更高质量。'],
        forge: [run.last ? (run.last.fusion || run.last.label) : '铁砧已就位', run.last ? '最近一锤 · ' + String(run.hits).padStart(2, '0') : '刀腹偏纹 · 刃侧偏膜 · 刀尖偏特效'],
        appraise: ['藏刀阁', '这一炉的刀面和装配已留档。'],
        broken: ['钢料损失', '连续失手后，最低价工坊矿仍可用。'],
      }[phase];
      tray.innerHTML = `<div class="brief"><b>${note[0]}</b><span>${note[1]}</span></div>`;
    }
  }

  function say(text, type = '') {
    msg.className = 'stage-message ' + type;
    msg.textContent = text;
    void msg.offsetWidth;
    msg.classList.add('show');
    get('announcer').textContent = text;
  }

  function drawHeat(now = performance.now(), force = false) {
    const heat = save.run.refining;
    if (!heat || !heatHud) return;
    const { nodes, values } = heatHud;
    const put = (key, value, apply) => { if (values[key] !== value) { values[key] = value; apply(value); } };
    const text = (id, value) => put(id, value, value => { nodes[id].textContent = value; });
    const transform = (id, value) => put(id, value, value => { nodes[id].style.transform = value; });
    const temperature = Math.round(heat.temperature);
    const band = heatBand(heat);
    const green = heat.step === 'molten' && heat.temperature >= band.lower && heat.temperature <= band.upper;
    const danger = heat.step === 'molten' && (heat.temperature >= 82 || heat.temperature <= 58 || heat.damage >= 65);
    const rank = refinementRank(heat.quality);
    const outcome = REFINEMENT_RESULTS[rank];
    const paused = !heatInput && heat.step !== 'cast';
    // Keep motion and the simulation at display cadence, without relaying out the
    // panel. Numeric text is sampled separately and unchanged content is untouched.
    transform('heat-fill', `scaleX(${(heat.temperature / 100).toFixed(4)})`);
    transform('heat-needle', `translateX(${heat.temperature.toFixed(2)}%)`);
    transform('heat-range', `translateX(${band.lower.toFixed(2)}%)`);
    transform('heat-progress', `scaleX(${(heat.quality / 100).toFixed(4)})`);
    transform('heat-damage', `scaleX(${(heat.damage / 100).toFixed(4)})`);
    stage?.setHeat(heat, Boolean(heatInput));
    if (heatInput) {
      if (green && !heatInput.green && performance.now() - (heatInput.lastCue ?? 0) > 450) {
        sound.play('heat');
        heatInput.lastCue = performance.now();
      }
      heatInput.green = green;
    }
    const canPour = heat.step === 'molten' && heat.elapsed >= HEAT.minimum && heat.quality >= HEAT.minQuality;
    const state = [heat.step, danger, rank, paused, Boolean(heatInput?.blowing), canPour].join('|');
    if (!force && state === heatHud.state && now - heatHud.updated < 80) return;
    heatHud.state = state;
    heatHud.updated = now;
    text('heat-step', { ore: '原石升温', molten: '熔球稳温', cast: '浇注成坯' }[heat.step]);
    text('heat-number', temperature + '°');
    text('heat-clock', heat.step === 'cast' ? '浇注中' : paused ? heat.elapsed ? '待续炼' : '待点火' : Math.max(0, (heat.step === 'ore' ? HEAT.preheat : HEAT.window) - heat.elapsed).toFixed(1) + ' s');
    text('heat-target', band.lower.toFixed(0) + '–' + band.upper.toFixed(0) + '°');
    put('lower', band.lower.toFixed(2), value => { nodes.thermo.dataset.lower = value; });
    put('upper', band.upper.toFixed(2), value => { nodes.thermo.dataset.upper = value; });
    text('heat-draft', paused ? heat.elapsed ? '按住续炼' : '按住点火' : heat.draft > .5 ? '余热 ↑' : '散热 ↓');
    text('heat-rank', rank === 'failed' ? '尚未成坯' : outcome.label);
    text('heat-quality', Math.floor(heat.quality) + ' / 100');
    put('quality-aria', Math.floor(heat.quality), value => nodes['heat-quality-meter'].setAttribute('aria-valuenow', value));
    text('heat-damage-value', Math.round(heat.damage) + '%');
    text('heat-note', paused && heat.elapsed ? '火候已保留 · 按住继续，松手散热' : heat.step === 'ore' ? '加热到 65° 熔化 · 松手仍有余热' : heat.step === 'cast' ? outcome.label + ' · 熔钢入模' :
      heat.temperature >= 82 ? '过热烧损 · 立即松手' : heat.temperature <= 58 ? '即将凝固 · 立即鼓风' :
        green ? '绿区排渣中 · 可择机浇注' : '追随绿区 · 提前松手留余热');
    put('temperature-aria', temperature, value => nodes.thermo.setAttribute('aria-valuenow', value));
    put('step', heat.step, value => { stageBox.dataset.heat = value; });
    put('danger', danger, value => { stageBox.dataset.danger = String(value); });
    put('heat-disabled', heat.step === 'cast', value => { nodes['heat-button'].disabled = value; });
    text('heat-button', paused && heat.elapsed ? '按住续炼' : '按住鼓风');
    put('blowing', heat.step !== 'cast' && Boolean(heatInput?.blowing), value => nodes['heat-button'].classList.toggle('heating', value));
    put('pour-disabled', !canPour, value => { nodes['pour-button'].disabled = value; });
    text('pour-button', heat.step === 'cast' ? '浇注中…' : !canPour ? '排渣后浇注' : '浇注 · ' + ({ excellent: '极佳', good: '良好', fair: '普通', poor: '勉强' })[rank]);
  }

  function heatFrame(now) {
    if (!active || !heatInput || save.run.phase !== 'refine') return;
    const previous = heatInput.now;
    heatInput.now = now;
    if (!document.hidden) {
      const run = save.run;
      const before = run.refining.step;
      let remaining = Math.min(.18, Math.max(0, (now - previous) / 1000));
      while (remaining > 0 && run.phase === 'refine') {
        const frame = Math.min(remaining, 1 / 60);
        advanceHeat(run, frame, heatInput.blowing);
        remaining -= frame;
      }
      if (run.phase !== 'refine') {
        heatInput = null;
        if (!persist()) { render(); return; }
        render();
        const label = REFINEMENT_RESULTS[run.refinement.result].label;
        const difference = run.purity - run.ore.purity;
        const result = label + (run.phase === 'broken' ? ' · 炉次报废' : ' · 纯净 ' + signed(difference));
        sound.play(run.phase === 'broken' ? 'break' : 'cast');
        say(result, run.refinement.result === 'failed' ? 'scar' : 'surge');
        return;
      }
      if (before !== run.refining.step) {
        stage?.sync(run, run.ore, null);
        sound.play(run.refining.step === 'molten' ? 'melt' : 'cast');
      }
      if (now - heatInput.saved > 1200 || before !== run.refining.step) {
        if (before !== run.refining.step) persist();
        else persistWhenIdle();
        if (heatInput) heatInput.saved = now;
      }
      drawHeat(now);
    }
    if (heatInput) frameId = requestAnimationFrame(heatFrame);
  }

  function startHeat(blowing) {
    if (save.run.phase !== 'refine' || !save.run.refining || save.run.refining.step === 'cast' && blowing) return;
    if (!heatInput) {
      heatInput = { now: performance.now(), saved: 0, blowing };
      frameId = requestAnimationFrame(heatFrame);
    }
    heatInput.blowing = blowing;
    drawHeat();
  }

  function charge() {
    if (pendingCheckpoint) return;
    sound.configure(getProgress().settings);
    sound.unlock();
    sound.prepare();
    startHeat(true);
  }

  function releaseHeat() {
    if (!heatInput) return;
    heatInput.blowing = false;
    drawHeat();
  }

  function hitBlade(hit) {
    sound.configure(getProgress().settings);
    if (!hit || save.run.phase !== 'forge' || queuedStop || pendingCheckpoint) return;
    if (busy) {
      if (stage?.blow?.landed && !resultPause) queuedHit = hit;
      return;
    }
    const result = apply(({ run }) => strike(run, hit.zone, hit.position));
    if (!result) return;
    sound.unlock();
    busy = Boolean(stage);
    resultPause = result.notable;
    const impact = () => {
      if (result.notable || result.type === 'break') queuedHit = null;
      sound.impact(result, save.run.purity);
      haptics.feedback(result.type === 'break' ? 'fracture' : result.notable ? 'trait' : 'hammer');
      stage?.impact(hit, result);
      render();
      if (save.run.phase === 'forge' && [.10, .25, .50].some(level => result.risk < level && fractureRisk(save.run) >= level)) {
        sound.play('tension', 1, .12);
      }
      if (result.type === 'break' || result.type === 'scar' || result.fusion || result.change) {
        say(result.fusion || result.label, result.fusion ? 'surge' : result.type);
      }
    };
    if (!stage) { impact(); return; }
    sound.play('swish');
    stage.swing(hit, result, impact, () => {
      busy = false;
      resultPause = false;
      const next = queuedHit;
      queuedHit = null;
      if (queuedStop) {
        queuedStop = false;
        closeAnvil();
      } else if (next) hitBlade(next);
    });
  }

  function closeAnvil() {
    if (!apply(({ run }) => finishForge(run))) return;
    sound.play('polish');
    render();
  }

  function selectOre(run, action, id) {
    if (run.phase !== 'ore') return false;
    if (action === 'next-batch' && run.batch < BATCHES - 1) {
      run.batch++;
      run.selected = 0;
    } else if (action === 'select-ore' && Number.isInteger(Number(id)) && Number(id) >= 0 && Number(id) < LOT_SIZE) {
      run.selected = Number(id);
    } else if (action === 'ore-prev' || action === 'ore-next') {
      run.selected = (run.selected + (action === 'ore-next' ? 1 : LOT_SIZE - 1)) % LOT_SIZE;
    } else return false;
    return true;
  }

  root.addEventListener('click', event => {
    if (event.target === get('save-notice') && pendingCheckpoint) {
      if (persist()) render();
      return;
    }
    const control = event.target.closest('[data-action]');
    if (!control || !active || !save?.run || pendingCheckpoint) return;
    const { action, id } = control.dataset;
    const run = save.run;
    if (busy) {
      if (action === 'finish' && run.phase === 'forge' && run.hits >= 6) {
        queuedStop = true;
        queuedHit = null;
        control.textContent = '正在收锤…';
      }
      return;
    }
    sound.configure(getProgress().settings);
    sound.unlock();
    switch (action) {
      case 'enter-tournament': return onArena(run.resultId);
      case 'open-collection': return onCollection();
      case 'inspect-light':
        inspectionMode = inspectionMode === id ? 'natural' : id;
        stage?.setInspection(inspectionMode);
        return renderTools(run, offers(run)[run.selected]);
      case 'tap-ore': {
        const stone = offers(run)[run.selected];
        stage?.tapOre();
        sound.inspect(stone);
        const echo = get('ore-echo');
        echo.classList.remove('is-echoing');
        void echo.offsetWidth;
        echo.classList.add('is-echoing');
        echo.style.setProperty('--ring', (.35 + stone.density / 100) + 's');
        get('inspection-note').textContent = stone.density >= 70 ? '叩声清亮 · 余音较长' : stone.density < 49 ? '叩声低闷 · 余音短' : '叩声偏实 · 回音适中';
        clearTimeout(echoTimer);
        echoTimer = setTimeout(() => {
          echo.classList.remove('is-echoing');
          if (save.run.phase === 'ore') renderTools(save.run, offers(save.run)[save.run.selected]);
        }, 1500);
        return;
      }
      case 'window-ore':
        if (!apply(inspectOre)) return;
        inspectionMode = 'window';
        stage?.setInspection('window');
        sound.play('polish', .75);
        break;
      case 'preview-mineral': return toggleOreBlade(control);
      case 'select-ore':
      case 'ore-prev':
      case 'ore-next':
      case 'next-batch':
        if (!apply(({ run }) => selectOre(run, action, id))) return;
        break;
      case 'buy':
        if (!apply(buyOre)) return;
        revealPending = Boolean(stage);
        sound.play('ore');
        stage?.reveal();
        if (revealPending) revealTimer = setTimeout(() => {
          if (!active || save.run.phase !== 'reveal') return;
          revealPending = false;
          render();
          const ore = save.run.ore;
          sound.play(ore.grade === 2 ? 'surge' : 'shift');
          say(GRADES[ore.grade] + '矿芯 · 纯净 ' + ore.purity, ore.grade === 2 ? 'surge' : '');
        }, 1050);
        break;
      case 'to-refine':
        if (revealPending || !apply(({ run }) => beginRefining(run))) return;
        sound.prepare();
        break;
      case 'pour-refine':
        if (!apply(({ run }) => pourRefining(run))) return;
        releaseHeat();
        startHeat(false);
        sound.play('cast');
        return;
      case 'finish': return closeAnvil();
      case 'strike-fallback': return hitBlade({ zone: control.id.slice(7) });
      case 'focus-grip':
        stage.setGripFocus(!stage.gripFocus);
        return renderGripFocus();
      case 'select-fit':
        if (!apply(({ run }) => {
          if (run.phase !== 'fit' || !fitOptions(run).some(item => item.id === id)) return false;
          run.fit = run.fit === id ? null : id;
          return true;
        })) return;
        break;
      case 'refresh':
        if (!apply(refreshFittings)) return;
        sound.play('polish');
        break;
      case 'appraise':
        if (!apply(finishAppraisal)) return;
        sound.play('appraise');
        say(save.run.record.grade + ' · ' + save.run.record.score, 'surge');
        break;
      case 'restart': {
        const result = openFurnace({ restart: true });
        if (!result.ok) return showStorageNotice(result.error);
        save = forgeSession();
        root.closest('.page').scrollTop = 0;
        say('新一炉', 'surge');
        break;
      }
      default: return;
    }
    render();
    if (action === 'select-fit') tray.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  });

  root.addEventListener('pointerdown', event => {
    if (event.target.id !== 'heat-button' || !event.isPrimary) return;
    event.preventDefault();
    event.target.setPointerCapture(event.pointerId);
    charge();
  });
  root.addEventListener('pointerup', event => {
    if (event.isPrimary && heatInput && event.target.id === 'heat-button') releaseHeat();
  });
  root.addEventListener('pointercancel', event => {
    if (event.target.id === 'heat-button') releaseHeat();
  });
  root.addEventListener('lostpointercapture', event => {
    if (event.target.id === 'heat-button') releaseHeat();
  });
  function pauseHeat() {
    if (!active || !heatInput) return;
    heatInput = null;
    cancelAnimationFrame(frameId);
    drawHeat();
    persist();
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseHeat(); });
  window.addEventListener('blur', pauseHeat);
  window.addEventListener('pagehide', pauseHeat);
  root.addEventListener('keydown', event => {
    if (!active || ![' ', 'Enter'].includes(event.key) || event.repeat) return;
    if (event.target.id === 'heat-button') {
      event.preventDefault();
      charge();
    } else if (event.key === ' ' && save.run.phase === 'forge' && event.target.tagName !== 'BUTTON') {
      event.preventDefault();
      hitBlade(stage?.keyboardHit() || (!stage ? { zone: 'belly' } : null));
    }
  });
  root.addEventListener('keyup', event => {
    if ([' ', 'Enter'].includes(event.key) && heatInput && event.target.id === 'heat-button') releaseHeat();
  });

  root.addEventListener('pointerdown', event => {
    if (event.target !== canvas || !event.isPrimary || !stage) return;
    if (['ore', 'reveal', 'fit', 'appraise'].includes(save.run.phase)) {
      canvas.setPointerCapture(event.pointerId);
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    } else if (save.run.phase === 'forge') {
      const hit = stage.hit(event.clientX, event.clientY);
      hitBlade(hit);
    }
  });
  root.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    stage.turn(event.clientX - drag.x, event.clientY - drag.y);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  root.addEventListener('lostpointercapture', () => { drag = null; });


  return {
    pause() {
      if (save?.run.refining?.step !== 'cast') pauseHeat();
    },
    enter() {
      active = true;
      const result = openFurnace();
      if (!result.ok) { showStorageNotice(result.error); return; }
      if (pendingCheckpoint) persist();
      else {
        save = forgeSession();
        showStorageNotice('');
      }
      sound.configure(getProgress().settings);
      try {
        const stones = save.run.phase === 'ore' ? offers(save.run) : [];
        const models = stones.length ? [stones[save.run.selected], ...stones].map(oreModelId) : [];
        stage = attachForgeStage(stageBox, models);
        canvas = stage.canvas;
        webglError = false;
      } catch {
        stage = null;
        webglError = true;
      }
      render();
      if (save.run.phase === 'refine' && save.run.refining.step === 'cast') startHeat(false);
    },
    leave() {
      if (!active) return;
      pauseHeat();
      cancelIdleSave();
      clearTimeout(revealTimer);
      clearTimeout(echoTimer);
      revealPending = busy = resultPause = queuedStop = false;
      queuedHit = drag = undefined;
      releaseForgeStage(stageBox);
      active = false;
    },
  };
}
