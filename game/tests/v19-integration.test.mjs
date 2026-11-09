import assert from 'node:assert/strict';
import test from 'node:test';
import * as Progress from '../src/core/progress.js';
import * as Storage from '../src/platform/storage.js';
import { STAT_KEYS } from '../src/data/balance.js';
import { codexProgressView, itemsOf } from '../src/data/codexCatalog.js';
import {
  commitFurnace, commitTournament, finishAppraisal, forgeSession, hasLegacyCareer, openFurnace, tournamentView,
} from '../src/core/v19Progress.js';
import { advanceHeat, beginRefining, buyOre, finishForge, fitOptions, offers, SIGNATURES, strike } from '../src/v19/forge.js';
import { abandonEntry, APEX_GOAL, courseFor, createEntry, gate, settleRound } from '../src/v19/tournament.js';
import { appraisalQuality, appraisalRarity } from '../src/v19/workshop.js';

const blade = (id, value = 105) => ({
  id, bladeName: id, knifeType: 'knife_tangdao', knifeTypeId: 'tangdao',
  stats: Object.fromEntries(STAT_KEYS.map(key => [key, value])), score: 284, rarity: 'epic',
});

function install(legacy = {}) {
  const save = Progress.resetAll();
  Object.assign(save, Progress.normalizeSave({
    ...save, ...legacy,
    arena: { ...save.arena, ...legacy.arena },
  }));
  assert.equal(Progress.persist(), true);
  return save;
}

function withWriteFailure(action) {
  const write = Storage.driver.write;
  Storage.driver.write = () => false;
  try { return action(); }
  finally { Storage.driver.write = write; }
}

function startFurnace(seed) {
  assert.equal(openFurnace({ seed }).ok, true);
  const commit = change => commitFurnace(forgeSession().run, change);
  const offer = offers(forgeSession().run).findIndex(item => item.price === 14);
  assert.equal(commit(({ run }) => { run.selected = offer; return true; }).ok, true);
  assert.equal(commit(buyOre).ok, true);
  assert.equal(commit(({ run }) => beginRefining(run)).ok, true);
  return commit;
}

const clearRound = course => ({
  reason: 'clear', score: 2400, combo: 4, hits: 8, cut: 8, waves: course.waves.length,
  damage: course.waves.reduce((sum, wave) => sum + wave.targets.length, 0),
  durability: 99, remaining: 42, projects: [{ kind: 'cutting', name: '切割', score: 100 }],
});

test('V19 uses one wallet and archives the exact appearance with original rewards only after save succeeds', () => {
  const old = blade('legacy-blade');
  const save = install({ cr: 95, collection: [old], showcasePinned: true, showcaseId: old.id });
  const commit = startFurnace(12345);
  assert.equal(save.cr, 81);
  assert.equal(commit(({ run }) => {
    // Install a quality checkpoint at the seam between the real refining
    // simulation and the real forge rules. Browser QA drives the heating UI.
    Object.assign(run, { phase: 'forge', purity: 86, stability: 80, refinement: { quality: 86, result: 'excellent', bonus: 8 } });
    for (let i = 0; i < 6; i++) strike(run, 'belly');
    Object.assign(run.skin, { pattern: 'damascus', film: 'oxide' });
    Object.assign(run.skin.levels, { pattern: 3, film: 1 });
    assert.equal(finishForge(run), true);
    run.fit = fitOptions(run)[0].id;
    return true;
  }).ok, true);
  const before = save.cr;
  const result = withWriteFailure(() => commit(finishAppraisal));
  assert.equal(result.code, 'PERSIST_FAILED');
  assert.equal(save.collection.length, 1);
  assert.equal(save.v19.forge.phase, 'fit');
  assert.equal(save.cr, before);

  const { run } = commit(finishAppraisal);
  assert.equal(run.phase, 'appraise');
  assert.equal(save.collection.length, 2);
  assert.equal(save.showcaseId, old.id);
  assert.equal(save.workshopV41.xp, 10);
  const [newBlade, oldBlade] = save.collection;
  assert.deepEqual(newBlade.v19Visual.skin, run.skin);
  assert.deepEqual(newBlade.v19Visual.marks, run.marks);
  assert.deepEqual(oldBlade.stats, old.stats);
  assert.equal(newBlade.id, run.resultId);
  assert.equal(run.record.score, newBlade.score);
  assert.equal(run.record.quality, appraisalQuality(newBlade.statMean));
  assert.equal(newBlade.rarity, appraisalRarity(newBlade.score).id);
  assert.ok(save.codex.fitting[run.fit]);
  assert.ok(save.codex.combo[SIGNATURES[0].name]);
  assert.ok(save.achievements.AC_skin_iii);
  assert.ok(save.daily.tasks.find(task => task.id === 'craft').done);
  assert.equal(createEntry(tournamentView(), { mode: 'quick' }, [newBlade.id], 'signature-test').run.roster[0].signature, SIGNATURES[0].name);
  assert.equal(run.record.credit, save.cr - before);
  assert.equal(commit(finishAppraisal).ok, false);
  assert.equal(save.collection.length, 2);
  assert.deepEqual(Progress.normalizeSave(Storage.load()).collection[0].v19Visual, newBlade.v19Visual);
});

test('V19 quality and rarity cover every tier and codex counts only obtainable items', () => {
  assert.deepEqual([60, 68, 76, 86, 95].map(appraisalQuality), ['D', 'C', 'B', 'A', 'S']);
  assert.deepEqual([139, 140, 200, 265, 350, 430].map(score => appraisalRarity(score).id),
    ['common', 'fine', 'rare', 'epic', 'legend', 'mythic']);
  const save = install({ codex: { card: { MAT01: 1 }, finish: { 'v19:metal:raw': 1 }, fracture: { blade: 1 } } });
  assert.equal(Progress.codexCount(), 0);
  const groups = codexProgressView(save.codex).groups.filter(group => !group.eventOnly);
  for (const { id } of groups) for (const item of itemsOf(id)) Progress.unlockCodex(save, id, item.id);
  assert.equal(Progress.codexCount(), 105);
  assert.equal(Progress.codexProgress(), 1);
  assert.equal(codexProgressView(save.codex).percent, 100);
  assert.ok(Progress.checkAchievements(save).some(achievement => achievement.id === 'AC_combo_all'));
});

test('refining failure creates a single fracture record and a new forge remains affordable', () => {
  const save = install({ cr: 14 });
  const commit = startFurnace(12346);
  assert.equal(save.cr, 0);
  assert.equal(commit(({ run }) => {
    for (let i = 0; i < 540 && run.phase === 'refine'; i++) advanceHeat(run, 1 / 60, false);
    return true;
  }).ok, true);
  assert.equal(save.v19.forge.phase, 'broken');
  assert.equal(save.fractured[0].fractureInfo.stageName, '精炼');
  assert.equal(save.collection.length, 0);
  assert.equal(save.workshopV41.xp, 0);
  assert.equal(save.achievements.AC_first_forge, undefined);
  assert.equal(commit(() => true).ok, true);
  assert.equal(save.fractured.length, 1);
  assert.equal(openFurnace({ restart: true, seed: 12346 }).ok, true);
  assert.equal(save.v19.forge.phase, 'ore');
  assert.ok(save.cr >= 14);
});

test('legacy schools, crowns, history and blade identity feed V19 eligibility and career gates', () => {
  const save = install({
    cr: 89, collection: [blade('old-1'), blade('old-2'), blade('old-3')],
    arena: { school: { press: { cleared: [0, 1] }, precise: { cleared: [0] }, quench: { cleared: [0, 1, 2] } },
      national: { wins: 1, best: 630 }, history: [{ id: 'legacy-result', tier: 'national', champion: true }] },
  });
  const view = tournamentView();
  assert.equal(view.tournament.schools.press, 2);
  assert.equal(view.tournament.schools.precise, 1);
  assert.equal(view.tournament.schools.quench, 3);
  assert.equal(gate(view, { mode: 'national' }), '');
  assert.equal(gate(view, { mode: 'apex' }), '');
  assert.equal(hasLegacyCareer(), false);
  save.arenaCareerV41.national.active = { id: 'ongoing', kind: 'national', rounds: [] };
  assert.equal(hasLegacyCareer(), true);
  assert.match(gate(tournamentView(), { mode: 'national' }), /旧赛程/);
  assert.deepEqual(view.collection[0].stats, [105, 105, 105, 105, 105, 105]);
  assert.equal(save.arena.history[0].id, 'legacy-result');
  assert.equal(save.cr, 89);
});

test('national and three-blade series settle rounds once, preserve resume state and award native career growth', () => {
  const save = install({
    collection: [blade('a'), blade('b'), blade('c')],
    arena: { school: { edge: { cleared: [0, 1] } } },
  });
  const register = (mode, id, ids) => commitTournament(view => createEntry(view, { mode }, ids, id));
  const submit = (id, round) => {
    const course = courseFor(tournamentView().tournament.active);
    return commitTournament(view => settleRound(view, id, round, clearRound(course)));
  };
  assert.ok(register('national', 'national-1', ['a']).run);
  const before = save.cr;
  assert.equal(withWriteFailure(() => submit('national-1', 0)).code, 'PERSIST_FAILED');
  assert.equal(save.cr, before);
  assert.equal(save.v19.arena.active.reports.length, 0);
  assert.ok(submit('national-1', 0).record.cr > 0);
  const next = Progress.normalizeSave(Storage.load());
  assert.equal(next.v19.arena.active.reports.length, 1);
  assert.ok(submit('national-1', 0).error);
  for (let i = 1; i < 5; i++) assert.ok(submit('national-1', i).record);
  assert.equal(save.v19.arena.active, null);
  assert.equal(save.arena.national.wins, 1);
  assert.equal(save.v19.arena.mastery.a.matches, 1);
  assert.ok(save.achievements.AC_national_win);
  assert.ok(register('apex', 'apex-1', ['a', 'a', 'c']).error);
  assert.ok(register('apex', 'apex-1', ['a', 'b', 'c']).run);
  for (let i = 0; i < 3; i++) assert.ok(submit('apex-1', i).record);
  assert.equal(save.arena.apex.wins, 1);
  for (const record of save.collection) assert.ok(record.arenaHistory.some(entry => entry.champion && entry.tier === 'apex'));
  assert.ok(save.workshopV41.xp > 0);
  assert.ok(save.collection.every(record => !record.fractured));
});

test('an apex series above the score goal still needs the opening combo', () => {
  const save = install({ collection: ['a', 'b', 'c'].map(id => blade(id)),
    arena: { history: [{ tier: 'national', champion: true }] } });
  assert.ok(commitTournament(view => createEntry(view, { mode: 'apex' }, ['a', 'b', 'c'], 'apex-no-combo')).run);
  let record;
  for (let round = 0; round < 3; round++) {
    ({ record } = commitTournament(view => settleRound(view, 'apex-no-combo', round, {
      ...clearRound(courseFor(view.tournament.active)), combo: round === 0 ? 1 : 3,
    })));
  }
  assert.ok(record.total >= APEX_GOAL && record.rounds.every(item => item.complete));
  assert.equal(record.champion, false);
  assert.equal(save.arena.apex.wins, 0);
  assert.equal(save.achievements.AC_apex_win, undefined);
  assert.equal(save.workshopV41.receipts['first:apex:champion'], undefined);
});

test('daily reward is paid once and stale tabs cannot overwrite a newer main save', () => {
  const save = install({ collection: [blade('daily-blade')] });
  const date = '2026-11-09';
  const run = id => commitTournament(view => createEntry(view, { mode: 'daily' }, ['daily-blade'], id, date)).run;
  const submit = (id, score) => commitTournament(view => settleRound(view, id, 0, {
    ...clearRound(courseFor(view.tournament.active)), reason: 'time', score,
  })).record;
  assert.ok(run('daily-1'));
  assert.ok(submit('daily-1', 650).cr > 0);
  const balance = save.cr;
  assert.ok(run('daily-2'));
  assert.equal(submit('daily-2', 1000).cr, 0);
  assert.equal(save.cr, balance);
  assert.equal(save.v19.arena.daily[date].best, 1000);
  assert.equal(save.v19.arena.mastery['daily-blade'].matches, 1);
  assert.ok(run('daily-3'));
  assert.ok(commitTournament(view => ({ ok: abandonEntry(view, 'daily-3') })).ok);

  const current = Storage.driver.read();
  try {
    Storage.driver.write(JSON.stringify({ ...save, cr: 901 }));
    assert.match(openFurnace().error, /另一标签页/);
    assert.equal(JSON.parse(Storage.exportJson()).cr, 901);
    assert.equal(Progress.updateSettings({ sound: false }).sound, true);
    assert.equal(Progress.renameBlade('daily-blade', 'stale'), false);
    assert.equal(Storage.load().cr, 901);
  } finally {
    Storage.driver.write(current);
  }
});
