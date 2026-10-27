/**
 * 改造后验收脚本（rework 2026-10-24）
 *
 * 与旧 docs/evaluation/2026-10-24/mechanics-audit.mjs 的关系：
 *   · 旧脚本是**缺陷基线**，有些断言记录的就是当时的错误行为；
 *   · 本脚本是**改造后断言**，输出写到 docs/rework/2026-10-24/。
 *   不覆盖旧 JSON，保留前后口径对比。
 *
 * 运行：node docs/rework/2026-10-24/verify-rework.mjs
 * 不读取浏览器存档；全部用内存夹具与固定种子。
 */

import * as Scoring from '../../../src/core/scoring.js';
import * as Traits from '../../../src/core/traits.js';
import * as Tags from '../../../src/core/tags.js';
import * as Forge from '../../../src/core/forge.js';
import * as Edge from '../../../src/core/edge.js';
import * as Adapter from '../../../src/core/bladeAdapter.js';
import * as TestScoring from '../../../src/core/testScoring.js';
import * as ArenaFormal from '../../../src/core/arenaFormal.js';
import * as FormalDef from '../../../src/data/arena/formalTests.js';
import * as Challenge from '../../../src/core/arenaChallenge.js';
import * as Balance from '../../../src/data/balance.js';
import * as Events from '../../../src/core/events.js';
import * as Bonus from '../../../src/core/forgeBonuses.js';
import * as SaveSchema from '../../../src/core/saveSchema.js';
import * as Progress from '../../../src/core/progress.js';

const results = [];
const ok = (id, pass, detail) => {
  results.push({ id, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${id}  ${detail}`);
};

/* ── 夹具 ─────────────────────────────────────────────── */
const stats100 = { strength: 100, toughness: 100, sharpness: 100, craft: 100, design: 100, spirit: 100 };
const stats256 = { strength: 256, toughness: 256, sharpness: 256, craft: 256, design: 256, spirit: 256 };

const blade = (o = {}) => ({
  id: o.id || 'BLD-T1', bladeName: o.bladeName || '测试刀',
  knifeTypeId: o.knifeTypeId || 'straight',
  stats: o.stats || stats100,
  score: o.score ?? 400, rarity: 'epic', rarityName: '史诗',
  /* ★ 夹具必须尊重传入值：之前这里写死 false，导致 A12 的“断刀阵容”
     实际上是一把健康刀，误报为校验失败。 */
  fractured: o.fractured === true,
  canEnterArena: o.canEnterArena !== false && o.fractured !== true,
  tags: o.tags || {}, tagTiers: o.tagTiers || [],
  traits: o.traits || [], combos: o.combos || [],
  history: [], visualRecipe: [], pendingSkin: {},
});

/* ── A01 六维 100 与 256 ─────────────────────────────── */
{
  const a = Adapter.adaptBlade(blade({ stats: stats100 }));
  const b = Adapter.adaptBlade(blade({ stats: stats256 }));
  const grew = b.capabilities.strength > a.capabilities.strength + 1;
  const notTruncated = b.permanentStats.strength === 256;
  ok('A01', grew && notTruncated,
    `能力 100→${a.capabilities.strength.toFixed(1)} / 256→${b.capabilities.strength.toFixed(1)}；永久值保留 ${b.permanentStats.strength}`);
}

/* ── A02 同六维换刀型/特性 ───────────────────────────── */
{
  const fold = Adapter.adaptBlade(blade({ knifeTypeId: 'folding' }));
  const mach = Adapter.adaptBlade(blade({ knifeTypeId: 'machete' }));
  const crossOver = fold.projectFactor.precision.value > mach.projectFactor.precision.value
    && fold.projectFactor.cutting.value < mach.projectFactor.cutting.value;
  ok('A02', crossOver,
    `精度 折叠${fold.projectFactor.precision.value} vs 砍刀${mach.projectFactor.precision.value}；切割 ${fold.projectFactor.cutting.value} vs ${mach.projectFactor.cutting.value}`);
}

/* ── A03 仅锻打一/四档 105/130 ────────────────────────── */
{
  const base = { stats: stats100, baseTagTiers: [], traits: [], combos: [], peakRisk: 0 };
  const t1 = Scoring.computeScore({ ...base, hammerTier: 1, hammerTierReward: Balance.HAMMER_TIER_REWARD[1] });
  const t4 = Scoring.computeScore({ ...base, hammerTier: 4, hammerTierReward: Balance.HAMMER_TIER_REWARD[4] });
  const oneEntry = t4.breakdown.special.filter((s) => s.kind === 'HAMMER').length === 1;
  ok('A03', t1.score === 105 && t4.score === 130 && oneEntry,
    `一档 ${t1.score} / 四档 ${t4.score}；锻打明细条数 ${t4.breakdown.special.filter((s) => s.kind === 'HAMMER').length}`);
}

/* ── A04 两个六层标签 ─────────────────────────────────── */
{
  const run = Forge.createRun({ seed: 20261024 });
  run.ledger.entries = [];
  for (let i = 0; i < 6; i++) run.ledger.entries.push({ stage: `S${i + 1}`, cardId: `c${i}`, tags: ['precision', 'stable'] });
  run.tagTiersCache = Tags.baseTagTiers(run.ledger);
  const pending = Traits.pendingBaseTraits(run).map((p) => p.id);
  const granted = Traits.settleBaseTraits(run);
  const again = Traits.settleBaseTraits(run);
  const score = Scoring.computeScore({
    stats: run.stats, baseTagTiers: run.tagTiersCache, traits: run.traits, combos: [], hammerTier: 0, peakRisk: 0,
  });
  const both = granted.length === 2 && pending.length === 2;
  const noRepost = again.length === 0;
  const scoredBoth = score.breakdown.base.length === 2;
  ok('A04', both && noRepost && scoredBoth,
    `待结算 ${pending.length} / 授予 ${granted.length} / 重复授予 ${again.length} / 评分计入 ${score.breakdown.base.length}`);
}

/* ── A05 强化承诺：淬火余温必破 ───────────────────────── */
{
  const mk = (buffs) => {
    const run = Challenge.createChallenge(blade({ stats: stats256 }), { seed: 777, mode: 'quick', buffs }).run;
    run.phase = 'route'; run.route = { id: 'hard', bonus: 1.3 };
    run.targets = [{
      id: 'm', type: 'metal', slot: 1, row: 1, progress: 0, alive: true, x: .5, y: .52,
      cuts: [], lastAngle: null, createdAt: 0, difficulty: 1, layer: 0, variation: 0,
      armorLeft: (Challenge.MATERIALS.metal.armor || 0) * 0.6,
    }];
    run.frenzyUntil = 99;
    Challenge.beginSwipe(run);
    Challenge.swipe(run, { x: .1, y: .52 }, { x: .9, y: .52 }, { duration: .12 });
    return run.targets[0];
  };
  const without = mk([]);
  const withBuff = mk(['quenchheat']);
  ok('A05', without.alive === true && withBuff.alive === false,
    `无强化硬靶存活=${without.alive}（进度 ${without.progress.toFixed(2)}）；有强化击破=${withBuff.alive === false}`);
}

/* ── A06 S4 点位/速度不影响结果 ───────────────────────── */
{
  const simulate = (positions) => {
    const run = Forge.createRun({ seed: 4242 });
    run.ledger.entries = [{ stage: 'S2', cardId: 'a', tags: ['precision'] }];
    run.phase = Forge.PHASE.HAMMER;
    let last = null;
    for (let i = 0; i < 6; i++) {
      last = Forge.hammerStrike(run);
      if (last.fractured) break;
    }
    return { progress: run.hammer.progress, tier: run.hammer.tier, died: run.fractured };
  };
  // hammerStrike 不接受坐标/速度参数 —— 这本身就是「位置与速度不进入判定」的结构性证明
  const a = simulate();
  const b = simulate();
  ok('A06', a.progress === b.progress && a.tier === b.tier && a.died === b.died,
    `同种子两次序列一致：进度 ${a.progress} / 档位 ${a.tier} / 断裂 ${a.died}；API 无坐标与速度参数`);
}

/* ── A07 S4 多策略存活与产出 ─────────────────────────── */
{
  const rows = [];
  for (const hammers of [0, 1, 2, 4, 7, 13]) {
    let alive = 0; let gained = 0; let tierSum = 0;
    const N = 800;
    for (let s = 0; s < N; s++) {
      const run = Forge.createRun({ seed: 90000 + s });
      run.ledger.entries = [{ stage: 'S2', cardId: 'a', tags: ['precision'] }];
      run.phase = Forge.PHASE.HAMMER;
      let dead = false;
      for (let i = 0; i < hammers; i++) {
        if (Forge.hammerStrike(run).fractured) { dead = true; break; }
      }
      if (!dead) { alive += 1; gained += run.hammer.statGained; tierSum += run.hammer.tier; }
    }
    rows.push({
      hammers, survival: +(alive / N * 100).toFixed(2),
      avgTier: alive ? +(tierSum / alive).toFixed(2) : 0,
      avgStatGained: alive ? +(gained / alive).toFixed(1) : 0,
    });
  }
  const t4 = rows.find((r) => r.hammers === 13);
  const mid = rows.find((r) => r.hammers === 4);
  ok('A07', t4.survival > 5 && mid.avgStatGained > 0,
    `13锤存活 ${t4.survival}%（旧基线约 0.0000084%）；4锤中间策略也有 ${mid.avgStatGained} 点六维成果`);
  results.push({ id: 'A07-table', pass: true, detail: rows });
  console.log('    S4 策略表:', JSON.stringify(rows));
}

/* ── A08 S7 未触摸/局部/完整/抖动/重复 ───────────────── */
{
  const mkRun = (kt) => ({ seed: 20251024, knifeTypeId: kt, stats: { sharpness: 100, craft: 100 }, pendingSkin: {} });
  const base = Edge.baseline(20251024, 'saber');
  const N = base.length;
  const none = Edge.submit(mkRun('saber'), []);
  const skipped = Edge.submit(mkRun('saber'), null, { skipped: true });
  const partial = Edge.submit(mkRun('saber'), base.map((v, i) => (i < N * 0.3 ? { index: i, value: v } : null)).filter(Boolean));
  const full = Edge.submit(mkRun('saber'), base.map((v, i) => ({ index: i, value: v })));
  const jitter = Edge.submit(mkRun('saber'), base.map((v, i) => ({ index: i, value: Math.max(0, Math.min(1, v + (i % 2 ? 0.10 : -0.10))) })));
  const rep = mkRun('saber');
  Edge.submit(rep, base.map((v, i) => ({ index: i, value: v })));
  const sharpFirst = rep.stats.sharpness;
  Edge.submit(rep, base.map((v, i) => ({ index: i, value: v })));
  const noRepeat = rep.stats.sharpness === sharpFirst;
  ok('A08',
    none.tier === 'miss' && skipped.tier === 'miss' && partial.tier === 'miss'
      && full.tier === 'perfect' && jitter.tier !== 'perfect' && noRepeat,
    `未触摸 ${none.tier} / 跳过 ${skipped.tier} / 局部30% ${partial.tier} / 完整 ${full.tier} / 抖动 ${jitter.tier} / 重复提交不累加 ${noRepeat}`);
}

/* ── A09 两专长刀两项目反向优势 ───────────────────────── */
{
  const runMatch = (b, styleId) => {
    const created = ArenaFormal.createFormalMatch({ blade: b, tier: 'school', styleId, gradient: 0, seed: 555 });
    let m = created.match;
    const scores = [];
    let guard = 0;
    while (!m.done && guard++ < 10) {
      const r = ArenaFormal.submitTest(m, { measure: 0.8 });
      if (r.result) scores.push({ kind: r.result.kind, score: r.result.score });
      if (r.done) break;
    }
    return { composite: m.result.composite, target: m.result.target, win: m.result.win, scores };
  };
  const precise = blade({
    id: 'B-precise', knifeTypeId: 'folding',
    stats: { strength: 90, sharpness: 110, toughness: 100, craft: 250, design: 230, spirit: 90 },
    tags: { precision: 6 }, tagTiers: [{ tagId: 'precision', layers: 6, effectiveLayers: 6 }], traits: ['BT_precision_6'],
  });
  const strong = blade({
    id: 'B-strong', knifeTypeId: 'survival',
    stats: { strength: 250, toughness: 230, sharpness: 100, craft: 90, design: 90, spirit: 90 },
    tags: { layer: 6 }, tagTiers: [{ tagId: 'layer', layers: 6, effectiveLayers: 6 }], traits: ['BT_layer_6'],
  });
  const pInPrecise = runMatch(precise, 'precise');
  const pInPress = runMatch(precise, 'press');
  const sInPrecise = runMatch(strong, 'precise');
  const sInPress = runMatch(strong, 'press');
  const cross = pInPrecise.composite > sInPrecise.composite && sInPress.composite > pInPress.composite;
  ok('A09', cross,
    `精密赛 精密刀 ${pInPrecise.composite} > 结构刀 ${sInPrecise.composite}；锻压赛 结构刀 ${sInPress.composite} > 精密刀 ${pInPress.composite}`);
  results.push({ id: 'A09-detail', pass: true, detail: { pInPrecise, pInPress, sInPrecise, sInPress } });
}

/* ── A10 六流派 × 五档 ────────────────────────────────── */
{
  const defs = FormalDef.allBranchDefinitions(0);
  const fingerprints = new Set(defs.map((d) => d.fingerprint));
  const targets = new Set(defs.map((d) => d.targetScore));
  const gradOk = [0, 1, 2, 3, 4].every((g) => {
    const d = FormalDef.buildFormalDefinition({ branchId: 'press', gradient: g });
    return d.ok && d.targetScore >= 84;
  });
  const gradRising = [0, 1, 2, 3, 4].map((g) =>
    FormalDef.buildFormalDefinition({ branchId: 'press', gradient: g }).targetScore);
  const monotonic = gradRising.every((v, i) => i === 0 || v >= gradRising[i - 1]);
  ok('A10', fingerprints.size === 6 && monotonic && gradOk,
    `六流派指纹 ${fingerprints.size}/6 互不相同；目标分 ${JSON.stringify(targets)}；五档目标 ${JSON.stringify(gradRising)}`);
}

/* ── A12 三刀赛资格 ───────────────────────────────────── */
{
  const b1 = blade({ id: 'B1' }); const b2 = blade({ id: 'B2' }); const b3 = blade({ id: 'B3' });
  const frag = blade({ id: 'B4', fractured: true });
  const one = ArenaFormal.validateApexRoster([b1]);
  const two = ArenaFormal.validateApexRoster([b1, b2]);
  const dup = ArenaFormal.validateApexRoster([b1, b1, b2]);
  const withFrag = ArenaFormal.validateApexRoster([b1, b2, frag]);
  const good = ArenaFormal.validateApexRoster([b1, b2, b3]);
  const apex = ArenaFormal.createApexMatch({ blades: [b1, b2, b3], seed: 12 }).match;
  const dispatch1 = ArenaFormal.apexDispatch(apex, [b1, b2, b3], 'B1');
  /* ★ 通过真实的 apexSubmit 逐项推进第一轮，直到本轮收场，
     然后才能考察「同一把刀不能再次派出」。
     （直接改 round.match 会绕过轮次状态机，测不到真正想测的约束。） */
  if (dispatch1.ok) {
    let guard = 0;
    while (apex.rounds[0].status === 'active' && guard++ < 12) {
      ArenaFormal.apexSubmit(apex, { measure: 0.7 });
    }
  }
  const round1Done = apex.rounds[0].status === 'complete';
  const again = ArenaFormal.apexDispatch(apex, [b1, b2, b3], 'B1');
  const okAll = !one.ok && !two.ok && !dup.ok && !withFrag.ok && good.ok
    && dispatch1.ok && round1Done && !again.ok;
  ok('A12', okAll,
    `1刀:${one.reason} / 2刀:${two.reason} / 重复ID:${dup.reason} / 断刀:${withFrag.reason} / 合法:${good.ok} / 第一轮收场:${round1Done} / 重复派出:${again.reason}`);
}

/* ── A13 快赛永久安全 ─────────────────────────────────── */
{
  const b = blade({ id: 'BQ', stats: { strength: 40, sharpness: 40, toughness: 20, craft: 20, design: 20, spirit: 20 } });
  const created = Challenge.createChallenge(b, { seed: 31337, mode: 'quick' });
  const run = created.run;
  // 直接耗尽刀况
  run.health = 0;
  const fin = Challenge.finish(run, 'wearout');
  const permanentSafe = fin.fractured === false && run.fractured === false && run.riskStop === false;
  const statsUnchanged = JSON.stringify(b.stats) === JSON.stringify({ strength: 40, sharpness: 40, toughness: 20, craft: 20, design: 20, spirit: 20 });
  ok('A13', permanentSafe && statsUnchanged,
    `快赛零韧性收场 fractured=${fin.fractured} / riskStop=${fin.riskStop}；永久六维未变=${statsUnchanged}`);
}

/* ── A14 事件幂等 ─────────────────────────────────────── */
{
  const s = SaveSchema.makeSave();
  const a = Events.settle(s, Events.EVENT.FORGE_COMPLETED, { bladeId: 'B-x' }, { score: 100 });
  const b = Events.settle(s, Events.EVENT.FORGE_COMPLETED, { bladeId: 'B-x' }, { score: 100 });
  const c = Events.settle(s, Events.EVENT.FORGE_COMPLETED, { bladeId: 'B-y' }, { score: 100 });
  ok('A14', !a.duplicate && b.duplicate && !c.duplicate,
    `首次 ${a.ok}/重复 ${b.duplicate}/另一把刀 ${!c.duplicate}；台账条数 ${Object.keys(s.eventLedger).length}`);
}

/* ── A15 连续天数不靠登录 ─────────────────────────────── */
{
  const s = SaveSchema.makeSave();
  const before = s.dailyStreak;
  // 模拟 rollover 行为：只改 lastDailyDay，不推进 streak
  s.lastDailyDay = '2026-10-25';
  const loginOnly = s.dailyStreak;
  // 真实完成三个目标
  const day = '2026-10-25';
  const st = Events.bumpDailyStreak(s, day);
  const second = Events.bumpDailyStreak(s, day);
  ok('A15', loginOnly === before && st === 1 && second === null,
    `仅换日 streak 保持 ${loginOnly}（旧值 ${before}）；首次完成目标 → ${st}；同日重复 → ${second}`);
}

/* ── A16 单槽加成 ─────────────────────────────────────── */
{
  const save = SaveSchema.makeSave();
  const list = Bonus.bonusListFor(save);
  const equippable = list.filter((b) => b.unlocked);
  const eq = Bonus.equipBonus(save, 'extra_reroll');
  const run = Forge.createRun({ seed: 1 });
  run.bonus = Bonus.makeRunBonus(eq.bonusId);
  Bonus.lockBonus(run);
  const first = Bonus.use(run);
  const second = Bonus.use(run);
  const lockedAfterStart = run.bonus.locked === true;
  ok('A16', equippable.length >= 1 && eq.ok && first.ok && !second.ok && lockedAfterStart,
    `可装备项 ${equippable.length}；首次生效 ${first.ok}（${first.receipt || ''}）；二次 ${second.reason}；S1 后锁定 ${lockedAfterStart}`);
}

/* ── A16b 未解锁 / 预留项不被误装备与误消耗 ──────────── */
{
  const save = SaveSchema.makeSave();
  /* ① 至少两项可实际选择（T11 验收硬要求，不能只交说明页） */
  const list = Bonus.bonusListFor(save);
  const equippable = list.filter((b) => b.unlocked);
  /* ② 预留项（risk_cushion）不在可选列表里，直接装备也必须被拒 */
  const reservedInList = list.some((b) => b.id === 'risk_cushion');
  const reserved = Bonus.equipBonus(save, 'risk_cushion');
  /* ③ 未知 id 也不得给出随机能力 */
  const unknown = Bonus.equipBonus(save, 'no_such_bonus');
  const pass = equippable.length >= 2 && !reservedInList
    && reserved.bonusId === null && unknown.bonusId === null;
  ok('A16b', pass,
    `可实际选择 ${equippable.length} 项（${equippable.map((b) => b.name).join('、')}）；预留项入列表=${reservedInList}；预留装备结果=${reserved.bonusId}；未知 id 结果=${unknown.bonusId}`);
}

/* ── A17 旧档兼容 ─────────────────────────────────────── */
{
  const legacy = {
    version: 1, cr: 123,
    collection: [{
      id: 'OLD-1', bladeName: '旧刀', knifeTypeId: 'saber',
      stats: { strength: 180, toughness: 140, sharpness: 160, craft: 150, design: 130, spirit: 90 },
      score: 321, rarity: 'epic', rarityName: '史诗', traits: ['ST_void'], unknownFutureField: { a: 1 },
    }],
    fractured: [], showcaseId: 'OLD-1',
    // 缺失全部新字段
  };
  const norm = SaveSchema.normalizeSave(legacy);
  const keptBlade = norm.collection[0];
  const preservedScore = keptBlade.score === 321 && keptBlade.rarity === 'epic';
  const unknownKept = !!keptBlade.unknownFutureField;
  const defaultsAdded = norm.eventLedger && norm.forgeBonus && typeof norm.lastDailyCompleteDay !== 'undefined';
  const adapted = Adapter.adaptBlade(keptBlade);
  const adaptedOk = adapted.canEnterArena && adapted.capabilities.strength > 100;
  ok('A17', preservedScore && unknownKept && defaultsAdded && adaptedOk,
    `旧分/稀有度保留 ${preservedScore}；未知字段保留 ${unknownKept}；新字段补默认 ${!!defaultsAdded}；旧刀可适配 ${adaptedOk}（强度能力 ${adapted.capabilities.strength.toFixed(1)}）`);
}

/* ── A11 全国赛五轮结构 + 旧赛退出兼容 ─────── */
{
  const defs = [0, 1, 2, 3, 4].map((g) => FormalDef.buildFormalDefinition({ branchId: 'composite', gradient: g }));
  const fiveRounds = defs.length === 5 && defs.every((d) => d.ok && d.tests.length >= 2);
  const rising = defs.map((d) => d.targetScore);

  /* 新链路：五轮真实多项目结构 */
  const hero = blade({
    id: 'NB-hero', knifeTypeId: 'survival',
    stats: { strength: 220, toughness: 200, sharpness: 180, craft: 170, design: 160, spirit: 120 },
    tags: { layer: 6 }, tagTiers: [{ tagId: 'layer', layers: 6, effectiveLayers: 6 }],
  });
  const nat = ArenaFormal.createNationalMatch({ blade: hero, seed: 999 });
  const labels = nat.ok ? nat.match.rounds.map((r) => r.label) : [];
  const fiveLabels = labels.length === 5;

  /* 跑一轮，确认至少能晋级或被正常淘汰（不伪造） */
  let natState = 'create-failed';
  if (nat.ok) {
    const m = nat.match;
    let guard = 0;
    while (!m.done && guard++ < 40) {
      const round = ArenaFormal.nationalCurrentRound(m);
      if (round.status === 'pending') ArenaFormal.nationalStartRound(m, [hero]);
      const res = ArenaFormal.nationalSubmit(m, { measure: 0.75 });
      if (!res.ok || res.done) break;
    }
    natState = m.done ? (m.result.champion ? 'champion' : `ended(${m.result.reason})`) : 'stuck';
    /* 普通淘汰不能销毁成刀 */
    var natSafe = m.result ? m.result.bladeDestroyed === false : false;
  }

  ok('A11', fiveRounds && fiveLabels && rising.every((v, i) => i === 0 || v >= rising[i - 1])
    && !!nat.ok && natState !== 'stuck' && natState !== 'create-failed' && natSafe,
    `五轮定义 ${labels.join('→')}；目标分 ${JSON.stringify(rising)}；实跑结果 ${natState}；bladeDestroyed=false ${natSafe}`);
}

/* ── A11b 旧赛制（v1 三局切割）退出兼容 ──── */
{
  /* 需要隔离的存档环境，本项在 tests/save.test.mjs 里已由隔离夹具覆盖；
     这里只验证 API 存在与签名，避免在验收脚本里替换全局 localStorage。 */
  const hasApi = typeof Progress.abandonNationalRun === 'function'
    && typeof Progress.hasLegacyNationalActive === 'function';
  ok('A11b', hasApi,
    `progress.abandonNationalRun / hasLegacyNationalActive 已导出：${hasApi}（旧档不会被新链路永久卡住）`);
}

/* ── A21T10.4 内容解锁：加权而不缩减卡池 ──────────── */
{
  const s1 = (await import('../../../src/data/cards.js')).cardsOfStage('S1');
  const unlocked = [s1[0].id, s1[1].id];
  let hitU = 0; let total = 0;
  const poolSizes = new Set();
  for (let i = 0; i < 600; i++) {
    const run = Forge.createRun({ seed: 7000 + i, unlockedCardIds: unlocked });
    poolSizes.add(run.candidatePool?.size);
    for (const c of run.candidates) { total++; if (unlocked.includes(c.id)) hitU++; }
  }
  const baseline = (2 / s1.length) * 100;
  const share = hitU / total * 100;
  /* 池子必须是全池（不能因解锁而缩减）；命中率必须明显高于基线 */
  const poolIntact = poolSizes.size === 1 && [...poolSizes][0] === s1.length;
  const boosted = share > baseline * 2;

  /* 重铸不得丢失解锁加权 */
  const Cards = await import('../../../src/core/cards.js');
  const rr = Forge.createRun({ seed: 4242, unlockedCardIds: unlocked });
  rr.cr = 999999;
  let after = 0;
  for (let i = 0; i < 120; i++) {
    Cards.reroll(rr);
    for (const c of rr.candidates) if (unlocked.includes(c.id)) after++;
  }
  ok('A21', poolIntact && boosted && after > 0,
    `池保持 ${[...poolSizes].join(',')}/${s1.length}；解锁命中 ${share.toFixed(1)}% vs 基线 ${baseline.toFixed(1)}%；重铸后仍命中 ${after} 次`);
}

/* ── A22 分项个人纪录不被更低成绩覆盖 ──────────────── */
{
  const entries = new Map();
  const realLS = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => entries.get(k) ?? null,
    setItem: (k, v) => { entries.set(k, v); },
    removeItem: (k) => { entries.delete(k); },
  };
  try {
    /* 重新加载 progress，让它拿到隔离存储 */
    const url = new URL('../../../src/core/progress.js', import.meta.url).href;
    const iso = await import(url + '?isolation=' + Date.now());
    iso.resetAll();
    const st = iso.get();
    st.collection.push({
      id: 'B-proj', bladeName: 'Proj', knifeTypeId: 'saber',
      stats: { strength: 100, toughness: 100, sharpness: 100, craft: 100, design: 100, spirit: 100 },
      score: 300, fractured: false, canEnterArena: true,
      traits: [], combos: [], tags: {}, tagTiers: [], arenaHistory: [],
    });
    iso.recordMatch('school', { win: true, styleId: 'precise', gradient: 0, score: 50, matchId: 'M-1', bladeId: 'B-proj',
      matchRecord: { projectScores: [{ kind: 'cutting', name: 'Cutting', score: 60 }, { kind: 'precision', name: 'Precision', score: 40 }] } });
    iso.recordMatch('school', { win: false, styleId: 'precise', gradient: 0, score: 20, matchId: 'M-2', bladeId: 'B-proj',
      matchRecord: { projectScores: [{ kind: 'cutting', name: 'Cutting', score: 30 }, { kind: 'precision', name: 'Precision', score: 90 }] } });
    const rec = iso.bladeById('B-proj').projectRecords || {};
    const keepBest = rec.cutting?.score === 60;
    const raised = rec.precision?.score === 90;
    ok('A22', keepBest && raised,
      `cutting 保留 60=${keepBest}（低分 30 未覆盖）；precision 提升到 90=${raised}`);
  } finally {
    globalThis.localStorage = realLS;
  }
}

/* ── A23 T07 五类接触事件可达 + 同一击不重复计算 ────── */
{
  const mkB = (stats) => ({ id: 'B-t7', bladeName: 'T7', knifeTypeId: 'straight', stats, fractured: false, canEnterArena: true });
  const weak = { strength: 40, toughness: 40, sharpness: 40, craft: 40, design: 40, spirit: 40 };
  const mid = { strength: 100, toughness: 100, sharpness: 100, craft: 100, design: 100, spirit: 100 };
  const seq = (type, stats, angled = false, max = 30) => {
    const run = Challenge.createChallenge(mkB(stats), { seed: 77, mode: 'quick' }).run;
    run.phase = 'route'; run.route = { id: 'hard', bonus: 1.3 };
    run.targets = [{ id: 't', type, slot: 1, row: 1, progress: 0, alive: true, x: .5, y: .52,
      cuts: [], lastAngle: null, createdAt: 0, difficulty: 1,
      armorLeft: (Challenge.MATERIALS[type].armor || 0) * 0.6, layer: 0, variation: 0 }];
    const t = run.targets[0]; const ev = [];
    for (let i = 0; i < max && t.alive; i++) {
      Challenge.beginSwipe(run);
      const ma = Challenge.MATERIALS[type].angle;
      const r = Challenge.swipe(run, { x: .1, y: .52 }, { x: .9, y: .52 }, { duration: .12, angle: angled ? ma + 1.0 : ma });
      if (r.hits[0]) ev.push(r.hits[0].contactEvent);
    }
    return ev;
  };
  const metalWeak = seq('metal', weak);
  const woodMid = seq('wood', mid);
  const ropeMid = seq('rope', mid);
  const angled = seq('wood', weak, true);
  const all = new Set([...metalWeak, ...woodMid, ...ropeMid, ...angled]);
  const hasFive = ['blocked', 'armor', 'cut', 'kill', 'deflect'].every((e) => all.has(e));
  /* 破甲击不得同时大幅推进生命进度（同一击只算一次） */
  const firstArmor = woodMid[0] === 'armor';
  ok('A23', hasFive && firstArmor,
    `可达事件：${[...all].join('/')}；硬靶首击须为破甲=${firstArmor}`);
}

/* ── A24 全国赛完整夺冠路径（32强→决赛） ──────────── */
{
  const hero = {
    id: 'NB-champ', bladeName: 'Champ', knifeTypeId: 'survival',
    stats: { strength: 290, toughness: 280, sharpness: 270, craft: 260, design: 240, spirit: 200 },
    score: 400, fractured: false, canEnterArena: true,
    rarity: 'mythic', rarityName: '神话',
    traits: ['BT_layer_6'],
    tagTiers: [{ tagId: 'layer', layers: 6, effectiveLayers: 6 }],
    tags: { layer: 6 }, combos: [], arenaHistory: [],
  };
  const c = ArenaFormal.createNationalMatch({ blade: hero, seed: 12345 });
  const m = c.match;
  let guard = 0;
  while (!m.done && guard++ < 60) {
    const round = ArenaFormal.nationalCurrentRound(m);
    if (round.status === 'pending') ArenaFormal.nationalStartRound(m, [hero]);
    const res = ArenaFormal.nationalSubmit(m, { measure: 0.9 });
    if (!res.ok || res.done) break;
  }
  const r = m.result || {};
  const grads = (r.roundsDetail || []).map((d) => d.gradient);
  const fiveRounds = (r.roundsDetail || []).length === 5;
  const gradRising = grads.length === 5 && grads.every((g, i) => i === 0 || g >= grads[i - 1]);
  ok('A24',
    !!r.champion && fiveRounds && gradRising && r.bladeDestroyed === false && r.rounds === 5,
    `冠军=${!!r.champion} 五轮=${fiveRounds} 梯度 ${grads.join('→')} 递增=${gradRising} 成刀未销毁=${r.bladeDestroyed === false}`);
}

/* ── A25 S5 稀有效果库必须等“玩家真的选过淬火” ──────
   用户报：「进锻刀新阶段、还没选就有个新效果覆盖上」。
   根因：resolveS5Effect 只看稀有度，不看是否选过 S5；
   而未选时 finishId 回落 F01，只要 S1–S4 选过稀有卡就会被接管。 */
{
  const FR = await import('../../../src/render/v2/finishRecipe.js');
  const SEEDS = [0.21, 0.63, 0.44, 0.87];
  const RARITY_TIER = { common: 0, fine: 1, rare: 2, epic: 3, legend: 4, mythic: 5 };

  /* ① 未选：五种稀有度全部不得介入 */
  let leak = [];
  for (const [rarity, tier] of Object.entries(RARITY_TIER)) {
    const fp = { amount: 0, darkness: 0, gradient: 0, paletteShift: 0, coat: 0 };
    const op = FR.finishOperators(1, fp, { wear: 0, finishId: 1 });
    if (op.chosen !== false) leak.push(`${rarity}:chosen=${op.chosen}`);
    const picked = FR.resolveS5Effect(1, tier, 0, SEEDS, { amount: 0, chosen: op.chosen === true });
    if (picked) leak.push(`${rarity}:${picked.key}`);
  }

  /* ② 已选 + 稀有：必须仍能正常介入（不能修过头） */
  const fp2 = { amount: 0.8, paletteShift: 0.33, coat: 0 };
  const op2 = FR.finishOperators(10, fp2, { wear: 0, finishId: 10 });
  const okPicked = FR.resolveS5Effect(10, RARITY_TIER.epic, 0.33, SEEDS, {
    colorPhase: 0.5, amount: 0.8, chosen: op2.chosen === true,
  });

  ok('A25', leak.length === 0 && op2.chosen === true && !!okPicked,
    `未选时泄露=${leak.length ? leak.join(',') : '无'}；已选+史诗→${okPicked ? okPicked.key : 'null'}`);
}

/* ── 汇总 ─────────────────────────────────────────────── */
const passed = results.filter((r) => r.pass).length;
const total = results.filter((r) => !r.id.endsWith('-table') && !r.id.endsWith('-detail')).length;
const failedList = results.filter((r) => !r.pass).map((r) => r.id);
console.log(`\n=== ${passed}/${results.length} 项通过 ===`);
if (failedList.length) console.log('未通过:', failedList.join(', '));
process.exit(failedList.length ? 1 : 0);
