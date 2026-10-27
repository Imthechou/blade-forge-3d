/**
 * 核心玩法层 · 2D 切割赛事单局
 * 所有随机序列状态可 JSON 往返；快速挑战绝不断刀。
 * 正式测试只输出失效证据，由赛事结算转移收藏，不改永久锻造属性。
 */
import { emit, EVENTS } from '../platform/bus.js';
import { deriveCutParams } from './cutParams.js';
import { adaptBlade } from './bladeAdapter.js';
import { createEncounter, selectEncounterMaterial, phaseQuota, stageSpawnInterval } from './arenaEncounters.js';

// 待定参数不是 0%：未批准曲线前，不执行猜测性的随机销毁。
export const FORMAL_RISK_TBD = Object.freeze({
  probabilityCurve: null, // TBD：负荷、结构能力、受力结果、累积损伤 → 概率
  crossTestDamage: null, // TBD：跨项目受损延续
  withdrawalPolicy: null, // TBD：极限测试收手细则
});
export const CHALLENGE_SECONDS = 45;

/**
 * 六种靶具（rework T07：拆开 Armor / Health / Damage）。
 *
 * ★ 要修什么（审计问题 3）：
 *   改造前只有 `hard` 系数 + 统一 `progress` + 金属层数。
 *   强度/锋利/工艺合并贡献同一个 progress，没有分别处理破甲与生命伤害，
 *   也没说清“刀具临时反作用损伤”是谁承担的。
 *
 * ★ 三层含义（T07.1）：
 *   armor  —— 切入抗性（强度主导破甲）
 *   health —— 击破生命（锋利主导削减）
 *   damage —— 刀具临时反作用损伤（韧性/设计承担）
 *   结算顺序固定：破甲 → 生命 → 反作用损伤，同一击不重复计算。
 *
 * `hard` 保留为**兼容字段**（旧探针与 buff 公式仍读它），语义 = armor 的归一值。
 */
export const MATERIALS = Object.freeze({
  rope:    { name: '编织绳束', short: '绳束', points: 60, hard: 0,    armor: 0,    health: 1.0, damage: 0.02, angle: 0,                color: '#e7b65e' },
  foam:    { name: '塑料泡棉', short: '泡棉', points: 50, hard: 0,    armor: 0,    health: 1.1, damage: 0.01, angle: Math.PI * .77,  color: '#83c9aa' },
  wood:    { name: '纹理木桩', short: '木桩', points: 85, hard: .45, armor: .45, health: 1.5, damage: 0.30, angle: Math.PI * .47,  color: '#b88455' },
  plastic: { name: '工程塑料板', short: '塑板', points: 105, hard: .60, armor: .60, health: 1.7, damage: 0.38, angle: 0,            color: '#dbe5e9' },
  ice:     { name: '透明冰块', short: '冰块', points: 120, hard: .62, armor: .62, health: 1.4, damage: 0.26, angle: Math.PI * .25,  color: '#8fd8e8' },
  /* 实心合金金属块：难度来自坚实整体抗性，而非空心管壁。保留现有
     固定 armor / health / damage 数值，不跟随赛事档位变化。 */
  metal:   { name: '金属块', short: '金属块', points: 160, hard: 1, armor: 1, health: 1.3, damage: 0.72, angle: 0, color: '#b7c4cc', solid: true },
});
export const ROUTES = Object.freeze([
  { id: 'soft', name: '连切路线', tag: '低风险 · 软靶阵列', types: ['rope', 'foam', 'rope'], bonus: 1.04 },
  { id: 'mixed', name: '穿透路线', tag: '中风险 · 绳束夹板', types: ['rope', 'plastic', 'rope'], bonus: 1.18 },
  { id: 'hard', name: '硬核路线', tag: '高分 · 强度挑战', types: ['wood', 'plastic', 'metal'], bonus: 1.30 },
]);
export const FINALES = Object.freeze([
  { id: 'safe', name: '稳健收分', tag: '连续切割 · 低刀损', types: ['rope', 'foam', 'wood'], bonus: 1.20 },
  { id: 'rush', name: '高分冲刺', tag: '冰裂 + 金属 · 高刀损与退赛风险', types: ['ice', 'metal', 'plastic'], bonus: 1.70 },
]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 破甲量（rework T07）。
 *
 * 软靶（绳束/泡棉）armor=0 → 无破甲阶段，一刀可直接断（设定：软靶可一刀断）。
 * 硬靶按材料 armor 给出：0.45（木桩）/ 0.60（塑板）/ 0.62（冰块）/ 1.0（金属块）。
 * ⚠ 取 armor × 0.6 而非全值：全值会让硬靶多出两击才破，改变了整体手感；
 *   0.6 让「强度专长」能明显感知（强度低 → 破甲击数明显变多），
 *   而同等能力下总击数与改造前接近。可调初版，见 BALANCE_REPORT。
 */
const ARMOR_SCALE = 0.6;
const armorOf = (type) => Math.max(0, (Number(MATERIALS[type]?.armor) || 0) * ARMOR_SCALE);
const copy = (x) => JSON.parse(JSON.stringify(x));
const angleDiff = (a, b) => { let d = Math.abs((a - b) % Math.PI); return Math.min(d, Math.abs(Math.PI - d)); };
/** Mulberry32 step written into state: challenge saves survive JSON serialize/restore. */
function random(run) {
  run.rngState = (run.rngState + 0x6D2B79F5) >>> 0;
  let t = run.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * 创建一局切割。
 *
 * mode='quick'   ：45 秒、三靶一波、绝不掉刀（训练场，行为与改造前一致）
 * mode='formal'  ：35 秒、连续投放、可能断刀（赛事用；buff 与幽灵分由 arenaSlice 传入）
 */
export function createChallenge(blade, { seed = null, daily = false, mode = 'quick', buffs = [], ghost = null, winStreak = 1, matchId = null, seconds = null, encounter = null } = {}) {
  if (!blade || blade.fractured || blade.canEnterArena === false) return { ok: false, reason: '只能使用完整成刀参加挑战' };
  if (!['quick', 'formal'].includes(mode)) return { ok: false, reason: '未知测试模式' };
  /* ★ rework T01：不再 `clamp(blade.stats, 0, 100)`。
     改造前永久六维被硬截到 100，于是六维 100 与 256 得到完全相同的切割参数，
     工艺进步不再改善试刀能力。现在统一经 bladeAdapter 换成测试能力值
     （高于 100 的部分走饱和曲线），并把刀型/特性/版本一并带进本局。 */
  const adaptation = adaptBlade(blade);
  const stats = { ...adaptation.capabilities };
  const actualSeed = seed == null ? (Date.now() >>> 0) : Number(seed) >>> 0;
  const params = deriveCutParams(stats, buffs);
  params.adaptation = {
    version: adaptation.version,
    effectVersion: adaptation.effectVersion,
    bladeId: adaptation.bladeId,
    knifeTypeId: adaptation.knifeTypeId,
    knifeProfileLabel: adaptation.knifeProfileLabel,
    projectFactor: adaptation.projectFactor,
    effectSummary: adaptation.effectSummary,
  };
  // 训练场保持原口径：刀况 100、不吃 buff（避免"剩余刀况 129%"这种数）
  if (mode !== 'formal') { params.healthMax = 100; params.scoreMult = 1; params.intervalMult = 1; }
  const plan = mode === 'formal' && encounter ? createEncounter(encounter) : null;
  const total = seconds == null ? (mode === 'formal' ? 35 : CHALLENGE_SECONDS)
    : clamp(Number(seconds) || CHALLENGE_SECONDS, 5, CHALLENGE_SECONDS);
  const run = {
    id: `C-${actualSeed.toString(36)}-${Date.now().toString(36)}`, seed: actualSeed, daily: !!daily, mode,
    blade: {
      id: adaptation.bladeId || blade.id,
      name: adaptation.bladeName || blade.bladeName || blade.name || blade.id,
      stats, score: Number(blade.score) || 0,
      /* ★ T01：刀型、适用特性与适配依据随局传递 —— 改造前这里全部丢失，
         于是「同六维换刀型/特性」在任何入口都看不出差异。 */
      knifeTypeId: adaptation.knifeTypeId,
      knifeProfileLabel: adaptation.knifeProfileLabel,
      projectFactor: { ...adaptation.projectFactor },
      effectSummary: adaptation.effectSummary.map((e) => ({ ...e })),
      effects: Object.fromEntries(Object.entries(blade.effects || {}).map(([k,v]) => [k, clamp(Number(v)||0,0,.5)])),
    },
    adaptation, buffs: [...buffs], params, ghost, matchId, winStreak,
    encounter: plan, spawnStage: null, stageSpawned: 0, stagePrefill: 0,
    encounterHistory: plan ? Object.fromEntries(['warmup','route','speed','finale'].map(phase=>[
      phase,{spawned:0,materials:{}}])) : null,
    total, elapsed: 0, remaining: total, phase: 'warmup', paused: false, done: false, result: null,
    spawnMode: mode === 'formal' ? 'stream' : 'wave',
    score: 0, kills: 0, combo: 0, maxCombo: 0, bestSwipe: 0, gestureKills: 0, misses: 0,
    health: params.healthMax, maxHealth: params.healthMax, damage: 0,
    fractureChecks: 0, riskStop: false, fractured: false, carry: [],
    route: null, finale: null, targets: [], wave: 0, nextWaveAt: 0, nextSpawnAt: 0, targetLife: 3.0, lastKillAt: -10,
    hitIds: [], typeCounts: {}, log: [], rngState: actualSeed || 1, guide: null,
    tripleCount: 0, frenzyUntil: -1, emergencyUsed: false,
    risk: { status: mode === 'formal' ? 'ready' : 'safe', chance: mode === 'formal' ? null : 0,
      message: mode === 'formal' ? '正式测试可能断刀；留意硬靶受力与累积受损' : '快速挑战完全安全，不会断刀',
      failure: null, lastContact: null },
  };
  if (run.spawnMode === 'stream') {
    /* 开场不空场：一进来就有 3 件可切，第一刀就有连击机会（原型 §5「几秒内感受到爽感」）。 */
    if (run.encounter) enterSpawnStage(run, 'warmup', 3);
    else run.nextSpawnAt = 0.22;
    spawnTarget(run); spawnTarget(run); spawnTarget(run);
  } else {
    spawnWave(run);
  }
  return { ok: true, run };
}

/** 沿用重开入口，但正式测试内已发生的实际受损不被重开抹除；非跨项目政策。 */
export function restartChallenge(run) {
  if (!run || run.done || run.fractured) return { ok: false, reason: '已结束的测试不能重开' };
  const created = createChallenge(run.blade, { seed: run.seed, daily: run.daily, mode: run.mode || 'quick',
    buffs: run.buffs || [], ghost: run.ghost ?? null, winStreak: run.winStreak ?? 1, matchId: run.matchId ?? null, seconds: run.total, encounter: run.encounter });
  if (created.ok && run.mode === 'formal') {
    Object.assign(created.run, { health: run.health, damage: run.damage,
      fractureChecks: run.fractureChecks, risk: copy(run.risk),
      log: [...copy(run.log), { type: 'restart', health: run.health, damage: run.damage }, ...created.run.log] });
  }
  return created;
}

function activeTypes(run) {
  const n = run.wave + 1;
  if (run.phase === 'finale') {
    if (run.finale?.id === 'rush') return n % 2 ? ['ice', 'metal', 'plastic'] : ['wood', 'metal', 'ice'];
    return n % 2 ? ['rope', 'foam', 'wood'] : ['foam', 'rope', 'plastic'];
  }
  if (run.phase === 'route' || run.phase === 'speed') {
    if (run.phase === 'speed') return n % 2 ? ['rope', 'foam', 'wood'] : ['foam', 'plastic', 'rope'];
    if (run.route?.id === 'soft') return n % 2 ? ['foam', 'rope', 'foam'] : ['rope', 'foam', 'rope'];
    if (run.route?.id === 'hard') return n % 2 ? ['wood', 'plastic', 'metal'] : ['plastic', 'ice', 'wood'];
    return n % 2 ? ['rope', 'plastic', 'rope'] : ['foam', 'wood', 'rope'];
  }
  return n % 2 ? ['rope', 'foam', 'rope'] : ['foam', 'rope', 'foam'];
}
function waveLayout(run) {
  if (run.phase === 'finale' && run.finale?.id === 'rush') return (run.wave + 1) % 2 ? 'high' : 'cascade';
  if (run.phase === 'route' && run.route?.id === 'hard') return (run.wave + 1) % 2 ? 'high' : 'cascade';
  if (run.phase === 'route' && run.route?.id === 'mixed') return (run.wave + 1) % 2 ? 'skip' : 'zigzag';
  if (run.phase === 'route' && run.route?.id === 'soft') return (run.wave + 1) % 2 ? 'zigzag' : 'flat';
  return (run.wave + 1) % 2 ? 'flat' : 'cascade';
}
const LAYOUT_Y = Object.freeze({ flat: [.52, .52, .52], cascade: [.42, .52, .62], zigzag: [.43, .60, .43], skip: [.52, .41, .60], high: [.41, .52, .41] });

function makeGuide(run) {
  const base = { done: false, reward: 0, title: '' };
  if (run.phase === 'warmup') return run.wave % 2 ? { ...base, title: '一划串联至少 2 个软靶', reward: 80, minGestureKills: 2 } : { ...base, title: '优先切开中路靶具', reward: 70, slots: [1] };
  if (run.phase === 'route') return { ...base, title: '优先突破中路材料', reward: run.route?.id === 'hard' ? 100 : 90, slots: [1] };
  if (run.phase === 'speed') return { ...base, title: '连续完成 2 斩，抢节奏', reward: 110, minCombo: 2 };
  if (run.phase === 'finale' && run.finale?.id === 'rush') return { ...base, title: '优先斩断冰块或金属', reward: 140, types: ['ice', 'metal'] };
  if (run.phase === 'finale') return { ...base, title: '完赛时模拟刀况保持 40% 以上', reward: 120, minHealth: 40 };
  return null;
}
function spawnWave(run) {
  if (!run || run.done || run.phase.endsWith('-choice')) return [];
  const carry = [...(run.carry || []), ...(run.targets || []).filter((t) => t.alive && t.progress > .025)];
  const types = activeTypes(run), oldBySlot = new Map(carry.map((t) => [t.slot, t]));
  const layout = waveLayout(run), ys = LAYOUT_Y[layout];
  run.carry = [];
  run.wave += 1;
  run.targets = types.map((type, slot) => {
    const old = oldBySlot.get(slot);
    if (old) { old.createdAt = run.elapsed; old.difficulty = 1; old.x = [.19,.5,.81][slot]; old.y = ys[slot]; old.layout = layout; return old; }
    return { id: `${run.wave}-${slot}`, type, slot, progress: 0, alive: true,
      x: [.19,.5,.81][slot], y: ys[slot], layout, cuts: [], lastAngle: null,
      createdAt: run.elapsed, difficulty: 1,
      /* ★ rework T07：破甲层初始值。软靶 armor=0 → 直接进入生命阶段；
         硬靶先要破甲，强度不足时硬靶会阻滞（这是强度专长刀的意义）。 */
      armorLeft: armorOf(type), layer: 0, variation: random(run) * .06 };
  });
  run.guide = makeGuide(run);
  run.nextWaveAt = run.elapsed + (run.phase === 'warmup' ? 4.2 : run.phase === 'finale' ? 6.2 : 5.5);
  run.hitIds = [];
  run.log.push({ type: 'wave', wave: run.wave, stage: run.phase, materials: run.targets.map((t) => t.type), carryCount: carry.length });
  return run.targets;
}
/* ── 连续投放（赛事模式）──────────────────────────────
 * 三靶一波会在清空后留下 4–6 秒空场（实测 81%），赛事改成逐件投放：
 *   密度随进度上升 → 提速段更密 → 压轴段最密；超时未切算「漏切」，断连击。
 */
const STREAM_ROWS = Object.freeze([0.34, 0.52, 0.70]);
const STREAM_COLS = Object.freeze([0.19, 0.50, 0.81]);
const STREAM_MAX_ALIVE = 6;
function enterSpawnStage(run,phase,prefill=0) {
  if (!run.encounter) return;
  run.spawnStage=phase; run.stageSpawned=0; run.stagePrefill=prefill;
  run.nextSpawnAt=run.elapsed+stageSpawnInterval(run.encounter,phase,prefill);
  run.log.push({type:'stage-plan',stage:phase,quota:phaseQuota(run.encounter,phase),
    maxAlive:run.encounter.maxAlive});
}

/** 投放间隔：0.70 → 0.50 渐密；提速段 0.48；压轴段 0.40（再乘 buff 的 intervalMult） */
function spawnInterval(run) {
  if (run.encounter) return stageSpawnInterval(run.encounter, run.spawnStage, run.stagePrefill);
  const t = run.elapsed;
  let base;
  if (run.phase === 'finale') base = 0.40;
  else if (run.phase === 'speed') base = 0.48;
  else if (t < 4) base = 0.70;
  else base = Math.max(0.50, 0.64 - (t - 4) * 0.006);
  return base * (run.params?.intervalMult || 1);
}

/** 投放一件：在 3×3 的挂架里随机挑一个空位 */
function spawnTarget(run) {
  if (!run || run.done) return null;
  if (run.encounter && run.stageSpawned >= phaseQuota(run.encounter,run.spawnStage)) return null;
  const alive = run.targets.filter((t) => t.alive);
  if (alive.length >= (run.encounter?.maxAlive ?? STREAM_MAX_ALIVE)) return null;
  const taken = new Set(alive.map((t) => `${t.row}:${t.slot}`));
  const free = [];
  for (let r = 0; r < STREAM_ROWS.length; r++) {
    for (let c = 0; c < STREAM_COLS.length; c++) if (!taken.has(`${r}:${c}`)) free.push([r, c]);
  }
  if (!free.length) return null;
  /* 按「从左到右、从上到下」填格：随机撒点会让台面像贴纸，排着填才像在装架 */
  const [row, slot] = free[0];
  const types = activeTypes(run);
  const type = run.encounter
    ? selectEncounterMaterial(run.encounter,run.spawnStage,run.route?.id,run.finale?.id,random(run))
    : types[Math.min(types.length - 1, Math.floor(random(run) * types.length))];
  if(run.encounter) {
    run.stageSpawned++;
    const history=run.encounterHistory?.[run.spawnStage];
    if(history) {history.spawned++;history.materials[type]=(history.materials[type]||0)+1;}
  }
  run.spawnCount = (run.spawnCount || 0) + 1;
  if (run.spawnCount % 5 === 0) run.wave += 1;   // 让 activeTypes 的奇偶轮换起来
  const target = {
    id: `${run.wave}-${slot}-${Math.round(run.elapsed * 100)}`, type, slot, row,
    progress: 0, alive: true, x: STREAM_COLS[slot], y: STREAM_ROWS[row], layout: 'stream',
    cuts: [], lastAngle: null, createdAt: run.elapsed,
    difficulty: 1, stage: run.encounter ? run.spawnStage : run.phase,
    armorLeft: armorOf(type), layer: 0, variation: random(run) * .06,
  };
  run.targets.push(target);
  if (run.targets.length > 24) run.targets = run.targets.filter((t) => t.alive).slice(-24);
  return target;
}

/** 超时未切 = 漏切：断连击、记一次 miss（靶具退回空架） */
function expireTargets(run) {
  if (run.spawnMode !== 'stream' || run.done) return;
  for (const t of run.targets) {
    if (!t.alive) continue;
    if (run.elapsed - t.createdAt < run.targetLife) continue;
    t.alive = false; t.missed = true;
    run.misses = (run.misses || 0) + 1;
    if ((run.streak || 0) >= 2) run.log.push({ type: 'combo-break', at: run.elapsed, streak: run.streak, reason: 'miss' });
    run.streak = 0; run.combo = 0;
  }
}

function completeGuide(run, hit) {
  const g = run.guide;
  if (!g || g.done) return false;
  if (!((g.slots?.includes(hit.target.slot)) || (g.types?.includes(hit.target.type)) || (g.minCombo && run.combo >= g.minCombo) || (g.minGestureKills && run.gestureKills >= g.minGestureKills))) return false;
  g.done = true; run.score += g.reward; run.log.push({ type: 'objective', title: g.title, reward: g.reward }); hit.objective = g.reward; return true;
}

/** 节奏断点：赛事 35 秒（4/19/26）与训练场 45 秒（8/23/30） */
const FORMAL_BEATS = Object.freeze({ route: 4, speed: 19, finale: 26 });
const QUICK_BEATS = Object.freeze({ route: 8, speed: 23, finale: 30 });

export function tick(run, seconds) {
  if (!run || run.done || run.paused || run.phase.endsWith('-choice')) return run;
  const dt = clamp(Number(seconds) || 0, 0, .25);
  const total = run.total || CHALLENGE_SECONDS;
  const beats = run.mode === 'formal' && total < CHALLENGE_SECONDS ? FORMAL_BEATS : QUICK_BEATS;
  const stream = run.spawnMode === 'stream';
  run.elapsed += dt; run.remaining = Math.max(0, total - run.elapsed);

  if (run.phase === 'warmup' && run.elapsed >= beats.route) {
    run.phase = 'route-choice';
    if (!stream) { run.carry = run.targets.filter((t) => t.alive && t.progress > .025); run.targets = []; }
    run.log.push({ type: 'phase', phase: 'route-choice', at: run.elapsed });
    return run;
  }
  if (run.phase === 'route' && run.elapsed >= beats.speed) {
    run.phase = 'speed';
    if (!stream) { run.carry = run.targets.filter((t) => t.alive && t.progress > .025); run.targets = []; spawnWave(run); }
    run.guide = makeGuide(run);
    if(run.encounter) { enterSpawnStage(run,'speed',1); spawnTarget(run); }
    run.log.push({ type: 'phase', phase: 'speed', at: run.elapsed });
  }
  if (run.phase === 'speed' && run.elapsed >= beats.finale) {
    run.phase = 'finale-choice';
    if (!stream) { run.carry = run.targets.filter((t) => t.alive && t.progress > .025); run.targets = []; }
    run.log.push({ type: 'phase', phase: 'finale-choice', at: run.elapsed });
    return run;
  }
  if (run.elapsed >= total) return finish(run);

  if (stream) {
    expireTargets(run);
    let guard = 0;
    while (run.elapsed >= run.nextSpawnAt && guard++ < 4) {
      const next=spawnTarget(run);
      if(run.encounter && !next && run.stageSpawned < phaseQuota(run.encounter,run.spawnStage)) {
        run.nextSpawnAt=run.elapsed+.18;
        break;
      }
      run.nextSpawnAt+=spawnInterval(run);
      if(run.encounter && run.stageSpawned>=phaseQuota(run.encounter,run.spawnStage)) {
        run.nextSpawnAt=Number.MAX_SAFE_INTEGER; break;
      }
    }
    return run;
  }

  if (run.elapsed >= run.nextWaveAt) {
    const carry = run.targets.filter((t) => t.alive && t.progress > .025);
    if (carry.length === 3) run.nextWaveAt += (run.phase === 'warmup' ? 4.2 : run.phase === 'finale' ? 6.2 : 5.5);
    else spawnWave(run);
  }
  return run;
}
export function chooseRoute(run, id) {
  if (!run || run.done || run.phase !== 'route-choice') return { ok: false, reason: '当前没有路线选择' };
  const choice = ROUTES.find((x) => x.id === id); if (!choice) return { ok: false, reason: '路线不存在' };
  run.route = { ...choice }; run.phase = 'route'; run.log.push({ type: 'route', id });
  if (run.spawnMode === 'stream') {
    run.guide=makeGuide(run);
    if(run.encounter)enterSpawnStage(run,'route',2);
    spawnTarget(run); spawnTarget(run);
  }
  else { run.targets = []; spawnWave(run); }
  return { ok: true, route: run.route };
}
export function chooseFinale(run, id) {
  if (!run || run.done || run.phase !== 'finale-choice') return { ok: false, reason: '当前没有压轴选择' };
  const choice = FINALES.find((x) => x.id === id); if (!choice) return { ok: false, reason: '压轴路线不存在' };
  run.finale = { ...choice }; run.phase = 'finale'; run.log.push({ type: 'finale', id });
  if (run.spawnMode === 'stream') {
    run.guide=makeGuide(run);
    if(run.encounter)enterSpawnStage(run,'finale',2);
    spawnTarget(run); spawnTarget(run);
  }
  else { run.targets = []; spawnWave(run); }
  return { ok: true, finale: run.finale };
}
export function beginSwipe(run) { if (!run || run.done || run.paused) return false; run.bestSwipe = Math.max(run.bestSwipe, run.gestureKills || 0); run.hitIds = []; run.gestureKills = 0; return true; }
function distanceToSegment(px, py, a, b) { const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((px-a.x)*dx+(py-a.y)*dy)/Math.max(1e-8,dx*dx+dy*dy),0,1); return Math.hypot(px-a.x-t*dx,py-a.y-t*dy); }
function addWear(run, target, quality, stats) {
  const P = run.params || {};
  const mat = MATERIALS[target.type];
  const hard = mat.hard;
  const maxHealth = run.maxHealth ?? 100;
  // 覆土烧刃：每局前 N 秒不扣刀况
  if (P.noWearUntil && run.elapsed < P.noWearUntil) return 0;
  const tough = P.tough ?? stats.toughness;
  const design = P.design ?? stats.design;
  const quick = { soft: .1, softK: .003, hard: .7, hardK: 1.72, shift: .54 };
  const formal = { soft: .1, softK: .003, hard: 1.2, hardK: 1.6, shift: .4 };
  const B = run.mode === 'formal' ? formal : quick;
  /* ★ rework T07：第三层「刀具临时反作用损伤」。
     mat.damage 是该材料的反作用强度系数（绳束 0.02 … 金属块 0.72），
     由韧性（承担）与设计（降低冲击峰值）共同降低。
     这层与「破甲」「生命」完全分开：它扣的是**刀况**，不是靶具状态。 */
  const react = Math.max(0, Number(mat.damage) || 0);
  const reactDrive = react * (1.15 - clamp(tough / 200, 0, 1) * 0.45) * (1.10 - clamp(design / 200, 0, 1) * 0.35);
  let loss;
  if (hard === 0) {
    loss = (B.soft + Math.max(0, 55 - tough) * B.softK + reactDrive * 0.6) * (P.wearHardMult ?? 1);
  } else {
    const risk = hard * (1.12 - tough / 210) * (1.07 - design / 500) * (target.difficulty || 1)
      /* 单靶反作用固定：压轴仅通过更难的材料组合/更密的出场增加风险。 */
      * 1;
    // 越残越脆：低刀况时同样的硬靶更伤
    const worsen = 1 + 0.6 * (1 - clamp(run.health / Math.max(1, maxHealth), 0, 1));
    const shift = quality === 'ANGLE' ? B.shift * (P.wearShiftMult ?? 1) : 0;
    loss = (B.hard + hard * B.hardK * risk + reactDrive) * worsen * (P.wearHardMult ?? 1) + shift;
  }
  run.health = clamp(run.health - loss, 0, maxHealth);
  run.damage += loss;
  // 回火：每局一次，刀况掉到 30% 以下时立刻回一口
  if (P.emergencyHeal && !run.emergencyUsed && run.health > 0 && run.health < maxHealth * .3) {
    run.emergencyUsed = true;
    run.health = Math.min(maxHealth, run.health + P.emergencyHeal);
    run.log.push({ type: 'emergency-heal', at: run.elapsed, amount: P.emergencyHeal });
  }
  return loss;
}
function recordContact(run, target, quality, loss, power) {
  if (run.mode !== 'formal') return;
  const hard = MATERIALS[target.type].hard;
  const contact = { targetId: target.id, material: target.type, hardness: hard,
    load: hard * targetDifficulty(target), quality, penetration: power, complete: target.progress >= 1,
    capacity: { ...run.blade.stats }, loss, damage: run.damage, health: run.health,
    acceptedHighLoad: run.route?.id === 'hard' || run.finale?.id === 'rush' };
  // 沿用现有单局刀况耗尽边界；不是由失分、评级或锻造 Risk 推导断裂。
  const collapse = hard > 0 && run.health <= 0;
  run.risk = { status: collapse ? 'failed' : hard > 0 ? 'warning' : 'ready', chance: null,
    message: collapse ? '硬靶负荷下累积受损耗尽承载余量，结构失效，停止参赛'
      : hard > 0 ? `${quality === 'ANGLE' ? '受力偏斜' : target.progress < 1 ? '硬靶阻滞' : '硬靶冲击'} · 累积受损 ${run.damage.toFixed(1)}；继续承载有断刀风险（概率待定）`
      : `本项累积受损 ${run.damage.toFixed(1)}；留意后续硬靶负荷`,
    failure: collapse ? 'structural-collapse' : null, lastContact: contact };
  run.log.push({ type: 'contact', at: run.elapsed, ...copy(run.risk) });
  if (collapse) { run.fractured = true; run.riskStop = true; }
}

/** 结果标志不是失效证据；桥接与持久化使用同一校验，拒绝缺失/不一致的接触履历。
 * 这是本地结果一致性校验，不是面向恶意改存档的防作弊或真实性签名。
 */
export function hasStructuralFailure(performance) {
  if (performance?.mode !== 'formal' || performance?.fractured !== true) return false;
  const risk = performance.risk, contact = risk?.lastContact;
  if (risk?.status !== 'failed' || risk.failure !== 'structural-collapse'
    || !contact || contact.health !== 0 || !(contact.damage > 0)
    || !(contact.loss > 0) || !(contact.load > 0)) return false;
  const material = MATERIALS[contact.material];
  if (!material || material.hard <= 0 || contact.hardness !== material.hard) return false;
  if (!['strength', 'toughness', 'sharpness', 'craft', 'design', 'spirit'].every(
    key => Number.isFinite(contact.capacity?.[key]) && contact.capacity[key] >= 0 && contact.capacity[key] <= 100)) return false;
  const contacts = Array.isArray(performance.log) ? performance.log.filter(entry => entry.type === 'contact') : [];
  const last = contacts.at(-1);
  return !!last && last.status === risk.status && last.failure === risk.failure
    && last.message === risk.message && JSON.stringify(last.lastContact) === JSON.stringify(contact);
}

export function swipe(run, a, b, { duration = .12, angle = null } = {}) {
  if (!run || run.done || run.paused || run.phase.endsWith('-choice')) return { ok: false, hits: [] };
  const dx=b.x-a.x,dy=b.y-a.y,dist=Math.hypot(dx,dy); if (dist < .008) return { ok: true, hits: [] };
  const P = run.params || {};
  const radius = P.radius ?? .095;
  const velocity=clamp(dist/Math.max(.018,Number(duration)||.12),.04,3.5), direction=angle == null ? Math.atan2(dy,dx) : angle, hits=[];
  const ordered = run.targets.filter((t) => t.alive && !run.hitIds.includes(t.id)).map((t) => ({ t, d: distanceToSegment(t.x,t.y,a,b) })).filter((x) => x.d < radius).sort((x,y) => x.d-y.d);
  const frenzy = run.elapsed < (run.frenzyUntil ?? -1);
  for (const {t,d} of ordered) {
    run.hitIds.push(t.id);
    /* 「一刀必破」标记：每次接触独立重置，不能跨目标/跨手势泄漏 */
    let guaranteedBreak = false;
    const mat=MATERIALS[t.type],stats=run.blade.stats,accuracy=clamp(1-d/.12,.25,1);
    const tol = P.tolerance ?? (.275+stats.design*.0028+stats.craft*.00075);
    const perfectTol = tol * (P.perfectMult ?? 1);
    let diff=angleDiff(direction,mat.angle),quality=diff<perfectTol?'PERFECT':diff<tol*2.1?'CLEAN':'ANGLE';
    const precision=quality==='PERFECT'?1.20:quality==='CLEAN'?1:.76;
    const speed=clamp(velocity*(P.speedBonus ?? 1.35),.55,1.35),center=.78+accuracy*.24;
    const prev=t.cuts.at(-1),cross=!!(t.type==='ice'&&prev&&angleDiff(direction,prev.angle)>.68&&angleDiff(direction,prev.angle)<1.4);
    if (cross) { diff=Math.min(diff,.10); quality=diff<perfectTol?'PERFECT':quality; }
    const mult=precision*(.82+speed*.22)*center;
    let power=mat.hard===0
      ? (P.softBase ?? (1.05+(stats.sharpness-50)*.0064+(stats.craft-50)*.0018))*mult
      : (P.hardBase ?? (.37+(stats.strength-50)*.0042+(stats.sharpness-50)*.0016+(stats.craft-50)*.0015))*(P.hardPowerMult ?? 1)*(1+.13*(1-mat.hard))*mult/targetDifficulty(t);
    if (P.frenzyHardBreak && frenzy && mat.hard > 0) { power = 2; guaranteedBreak = true; }   // 淬火余温
    if (t.type==='ice'&&cross) power*=1.35;
    if (t.type==='wood'&&prev) power*=angleDiff(direction,prev.angle)<.22&&Math.abs(b.y-(t.y+prev.y))<.046?1.27+(run.blade.effects.grooveFollow||0):.96;
    if (t.type==='plastic'&&prev&&angleDiff(direction,prev.angle)<.26&&Math.abs(b.y-(t.y+prev.y))<.045) power*=1.10+(run.blade.effects.grooveFollow||0);
    if (t.type==='plastic'&&t.progress>=.38) power*=1.08;
    if (t.type==='metal'&&t.layer) power*=1+(run.blade.effects.layerBreak||0);
    if (t.type==='metal'&&t.progress>=.45) power*=1.16;
    power=clamp(power,.11,mat.hard===0?1.65:.78);
    if (mat.hard===0&&quality==='ANGLE'&&stats.sharpness<55) power*=.86;
    if (mat.hard===0&&quality!=='ANGLE'&&velocity>.75) power=Math.max(power,1.025);
    power*=1+(run.blade.effects.softChain||0)*(run.gestureKills>0?1:.25);
    /* ★ rework T03：「狂热期间硬靶一刀必破」必须真的击破完整硬靶。
       上面的 clamp(…, .78) 是正常硬靶的进度上限；承诺性的必破在这个上限**之后**生效，
       否则 power 被压回 0.78、硬靶仍会存活（改造前实测只拿到 78% 进度）。
       它不绕过记分与刀损：下面照常走过 t.progress/kills/score/addWear 全链路。 */
    if (guaranteedBreak) power = Math.max(power, 1);
    /* ★★ rework T07：三层结算顺序（破甲 → 生命 → 反作用损伤）★★
       同一击只算一次，不重复计入。
       · 破甲阶段：**强度**主导。强度不足时破甲效率下降，硬靶会阻滞。
       · 生命阶段：**锋利**主导削减生命，**工艺**影响有效效率。
       · 反作用损伤：由 addWear 单独结算（韧性/设计承担）。
       在能力 = 100 时两个驱动系数都等于 1，总进度与改造前一致（不悄悄改手感）。 */
    const before = t.progress;
    let phase = 'health';
    let effective = power;
    let armorBroke = false;
    if ((t.armorLeft ?? 0) > 1e-6) {
      /* ① 破甲阶段：本击的力先全部用于**破甲**，不叠加生命进度。

         ★ 修的是什么：初版在这里既扣了 `armorLeft`，又把 `effective`
         **全额加进了 t.progress` —— 同一击被算了两次（既破甲又切肉），
         直接违反任务书「明确一次切割的结算顺序，避免不同层重复算同一击」。
         副作用是 `blocked` / `cut` 两类事件永远不会出现（实测只能看到 armor）。

         ★ 新口径：
           · 护甲未破 → 进度不增（这就是「强度不足，硬靶阻滞」）；
           · 本击恰好破甲 → 把**剩余没耗在护甲上的力**转成一次生命削减（溢出传递）。
         总手感不会跳变：破甲总量与之前相同，只是不再额外白送一刀。 */
      phase = 'armor';
      const strengthDrive = 0.55 + 0.45 * clamp(stats.strength / 100, 0, 1.6);
      const force = power * strengthDrive;
      const take = Math.min(t.armorLeft, force * 0.9);
      t.armorLeft = Math.max(0, t.armorLeft - take);
      if (t.armorLeft <= 1e-6) {
        armorBroke = true;
        run.log.push({ type: 'armor-broken', target: t.id, material: t.type });
        /* 破甲溢出 → 同一次生命阶段计算，**只算一次** */
        const overflow = Math.max(0, force - take / 0.9);
        const sharpDrive = 0.60 + 0.40 * clamp(stats.sharpness / 100, 0, 1.6);
        const craftEff = 0.88 + 0.12 * clamp(stats.craft / 100, 0, 1.6);
        effective = overflow * sharpDrive * craftEff;
      } else {
        effective = 0;
      }
    } else {
      /* ② 生命阶段 */
      const sharpDrive = 0.60 + 0.40 * clamp(stats.sharpness / 100, 0, 1.6);
      const craftEff = 0.88 + 0.12 * clamp(stats.craft / 100, 0, 1.6);
      effective = power * sharpDrive * craftEff;
    }
    t.progress = clamp(t.progress + effective, 0, 1);
    /* ★ rework T03 + T07 回归修复：「狂热硬靶一刀必破」必须真的把硬靶**击破**。

       坑：改造 T07 把一击拆成「先破甲 → 再扣生命」后，
       `power = max(power, 1)` 不再等于击破 —— 因为它还要先交一部力给破甲。
       实测 256 能力刀命中新鲜金属块后，进度只到 0.70，硬靶仍存活，
       开启淬火余温也打不断（A05 回归）。

       最终口径：承诺性必破直接落在**进度**上，但仍照常走完整链路 ——
       扣刀损、计分、kills、指南完成判定都不跳过。
       破甲标记同样视为已破，避免 UI 显示“护甲还在”与实际击破矛盾。 */
    if (guaranteedBreak) {
      t.progress = 1;
      if (Number.isFinite(t.armorLeft) && t.armorLeft > 1e-6) {
        t.armorLeft = 0;
        armorBroke = true;
        run.log.push({ type: 'armor-broken', target: t.id, material: t.type });
      }
    }
    t.cuts.push({ angle: direction, y: b.y - t.y, progress: t.progress, quality, phase });
    t.cuts = t.cuts.slice(-6);
    t.lastAngle = direction;
    const loss = addWear(run, t, quality, stats);
    recordContact(run, t, quality, loss, power);

    /* ★★ rework T07：接触结果分级（供 UI 在**命中位置**给不同反馈）★★
       任务书要求「空挥、未切断、弹刀、破甲、击破分别给出贴近接触点的表现」。
       改造前 core 只回 `complete` 布尔值，UI 无法区分“弹刀”与“打不动”。
       这里给出唯一的事件类型，判定仍全部在 core：
         kill    —— 本次击破
         armor   —— 刚打穿护甲（存在 armor 层的硬靶）
         blocked —— 还没破甲，进度基本不动（强度不足，硬靶阻滞）
         deflect —— 入刀角度偏（ANGLE 质量）且有反作用损伤
         cut     —— 正常削减生命但未击破
       同一击只给一个类型，避免一个事件被计数两次。 */
    const gained = t.progress - before;
    let contactEvent = 'cut';
    if (t.progress >= 1) contactEvent = 'kill';
    else if (armorBroke) contactEvent = 'armor';
    else if (phase === 'armor' && gained < 0.02) contactEvent = 'blocked';
    else if (quality === 'ANGLE' && loss > 0) contactEvent = 'deflect';

    if (t.type==='metal'&&before<.42&&t.progress>=.42) {
      t.layer=1; run.log.push({ type:'layer-break', target:t.id, progress:t.progress });
      if (P.layerHeal) run.health = Math.min(run.maxHealth, run.health + P.layerHeal);   // 夹钢
    }
    if (t.progress>=1) {
      t.alive=false;run.kills++;run.gestureKills++;
      // A fracture can finish the match from inside this loop, before the
      // post-loop peak update. Record the current swipe immediately so the
      // settled result never loses its final completed cut.
      run.bestSwipe=Math.max(run.bestSwipe,run.gestureKills);
      /* ★ 连击 = **本次手势内**斩断了几件（水果忍者的口径），不是"隔 1.65 秒内连续杀"。
         后者在连续投放下一路不断（实测 68 连），倍率被永久拉满，分数直接失真。 */
      run.combo = run.gestureKills;
      const window = P.comboWindow ?? 1.65;
      run.streak = run.elapsed - run.lastKillAt < window ? (run.streak || 0) + 1 : 1;
      run.lastKillAt = run.elapsed;
      run.maxCombo = Math.max(run.maxCombo, run.combo);
      run.maxStreak = Math.max(run.maxStreak || 0, run.streak);
      // 拾遗：只在残血时生效，避免"越切越健康"
      if (P.killHeal && run.health < run.maxHealth * .6) run.health = Math.min(run.maxHealth, run.health + P.killHeal);
      // 狂热：连击到阈值就开一段，落在窗口内的击杀额外乘分
      if (run.gestureKills >= (P.frenzyThreshold ?? 3) && run.frenzyUntil < run.elapsed) {
        run.frenzyUntil = run.elapsed + 1.5;
        run.frenzyCount = (run.frenzyCount || 0) + 1;
        run.log.push({ type: 'frenzy', at: run.elapsed, gesture: run.gestureKills });
      }
      const routeMult=run.phase==='finale'?(run.finale?.bonus||1):(run.phase==='route'||run.phase==='speed'?(run.route?.bonus||1):1);
      const comboMult=1+Math.min(P.comboCap ?? .7,(run.combo-1)*(P.comboStep ?? .09));
      // 折叠锻打：每完成一次三连，本局倍率永久 +0.06（上限 +0.36）
      if (P.tripleBonus && run.combo % 3 === 0) {
        run.tripleCount=(run.tripleCount||0)+1;
        run.foldBonus=Math.min(.36,(run.foldBonus||0)+P.tripleBonus);
      }
      const frenzyMult = run.elapsed < (run.frenzyUntil ?? -1) ? (P.frenzyMult ?? 1.5) : 1;
      const lowHealth = P.lowHealthScore ? clamp(1 + (1 - run.health / Math.max(1,run.maxHealth)), 1, 2) : 1;
      /* ★ rework T03：跨划连击（streak）必须真的影响得分。
         改造前 comboWindow 只增长 run.streak 这个“诊断字段”，得分与狂热只看单次手势
         内的 gestureKills，于是「血槽 连击窗口 +0.25 秒」在结果上完全无效：
         相隔 1.8 秒的两次绳束击破，有/无强化都是 158 分。
         现在 streak 有自己的倍率，并且与“单划多断”（combo）分开计量、分开文案。 */
      const streakStep = P.streakStep ?? .06;
      const streakCap = P.streakCap ?? .30;
      const streakMult = 1 + Math.min(streakCap, Math.max(0, (run.streak || 1) - 1) * streakStep);
      const points=Math.round(
        (mat.points*(P.spiritMult ?? (.9+stats.spirit*.0029))
          * comboMult * routeMult
          * (quality==='PERFECT'?1.12:quality==='ANGLE'?.76:1)
          * (mat.hard===0?(P.softScoreMult ?? 1)*(1+(P.softSharpWall ?? ((stats.sharpness-55)*.0018))):1)
          * (1+(run.blade.effects.scoreBoost||0))
          * (P.scoreMult ?? 1)
          * (1+(run.foldBonus||0))
          * (run.winStreak ?? 1)
          * streakMult
          * frenzyMult * lowHealth)
        + (P.flatPerKill||0));
      run.score+=points;run.typeCounts[t.type]=(run.typeCounts[t.type]||0)+1;
      const hit={ target:t, complete:true, points, precision, combo:run.combo, streak:run.streak, streakMult,
        quality, crossedIce:cross, frenzy: frenzyMult>1, guaranteedBreak,
        /* ★ T07：命中位置的分级反馈类型 + 破甲余量，供 UI 区分表现 */
        contactEvent: contactEvent === 'blocked' || contactEvent === 'deflect' ? 'kill' : contactEvent,
        armorLeft: Number.isFinite(t.armorLeft) ? t.armorLeft : null };
      completeGuide(run,hit);hits.push(hit);
      if(run.guide?.minGestureKills&&run.gestureKills>=run.guide.minGestureKills)completeGuide(run,hit);
    } else hits.push({ target:t, complete:false, points:0, precision, combo:run.combo, streak:run.streak, quality, crossedIce:cross,
      contactEvent,
      armorLeft: Number.isFinite(t.armorLeft) ? t.armorLeft : null });
    // 未切开的硬靶同样可能导致失效，不能只在成功斩断后检查。
    if (run.mode === 'formal' && run.fractured) {
      run.fractureChecks++; hits[hits.length-1].riskStop = true;
      return { ok: true, hits, done: finish(run, 'fracture') };
    }
  }
  run.bestSwipe=Math.max(run.bestSwipe,run.gestureKills);
  if(run.health<=0)return {ok:true,hits,done:finish(run,'wearout')};
  return {ok:true,hits};
}
function targetDifficulty(t) { return t.difficulty || 1; }
export function finish(run, reason='time') {
  if (!run) return null;
  // 缺少 mode 的旧快速局也安全；旧 reason/标志不能绕过这条边界。
  if (run.mode !== 'formal') {
    run.fractured = false; run.riskStop = false;
    if (run.result) { run.result.fractured = false; run.result.riskStop = false; }
  }
  if(run.done)return run.result||null;
  if(run.guide&&!run.guide.done&&run.guide.minHealth&&run.health>=run.guide.minHealth){run.guide.done=true;run.score+=run.guide.reward;run.log.push({type:'objective',title:run.guide.title,reward:run.guide.reward});}
  // 满贯：本局零漏切时整局乘分（在评级之前结算）
  const P = run.params || {};
  if (P.flawlessMult && (run.misses || 0) === 0) {
    run.score = Math.round(run.score * P.flawlessMult);
    run.log.push({ type: 'flawless', mult: P.flawlessMult });
  }
  run.done=true;run.phase='result';run.remaining=Math.max(0,run.remaining);
  run.fractured = run.mode === 'formal' && run.risk?.failure === 'structural-collapse';
  run.riskStop = run.fractured;
  /* 评级：赛事按「得分 / 幽灵分」的比值定级（自动随难度与 buff 缩放）；
     训练场没有幽灵分，沿用原来的绝对阈值。 */
  const ghost = Number(run.ghost) || 0;
  const ratio = ghost > 0 ? run.score / ghost : 0;
  const grade = ghost > 0
    ? (ratio >= 1.5 ? 'S' : ratio >= 1.15 ? 'A' : ratio >= 0.85 ? 'B' : 'C')
    : (run.score >= 1500 ? 'S' : run.score >= 990 ? 'A' : run.score >= 530 ? 'B' : 'C');
  const reward=reason==='manual'?0:Math.max(2,Math.min(30,Math.floor(run.score/100)+(grade==='S'?5:grade==='A'?3:grade==='B'?1:0)));
  run.result={grade,score:Math.floor(run.score),reward,kills:run.kills,maxCombo:run.maxCombo,maxStreak:run.maxStreak||0,bestSwipe:run.bestSwipe,
    health:Math.round(run.health),maxHealth:Math.round(run.maxHealth ?? 100),misses:run.misses||0,
    frenzy:run.frenzyCount||0,buffs:[...(run.buffs||[])],
    ghost: ghost || null, win: ghost > 0 ? run.score >= ghost : null,
    route:run.route?.name||'—',finale:run.finale?.name||'—',reason,riskStop:run.riskStop,fractured:!!run.fractured,
    mode:run.mode || 'quick',total:run.total,risk:copy(run.risk || {}),log:copy(run.log)};
  if (run.mode !== 'formal' && reason !== 'manual') emit(EVENTS.QUICK_CHALLENGE_FINISHED, run);
  return run.result;
}
export function setPaused(run, paused) { if(!run||run.done)return false;run.paused=!!paused;return true; }
export default { createChallenge, tick, swipe, beginSwipe, chooseRoute, chooseFinale, finish, setPaused, MATERIALS, ROUTES, FINALES };
