import assert from 'node:assert/strict';
import test from 'node:test';
import * as Progress from '../src/core/progress.js';
import * as Storage from '../src/platform/storage.js';
import { STAT_KEYS } from '../src/data/balance.js';
import {
  commitFurnace, commitTournament, finishAppraisal, forgeSession, hasLegacyCareer, openFurnace, tournamentView,
} from '../src/core/v19Progress.js';
import { advanceHeat, beginRefining, buyOre, finishForge, fitOptions, offers, strike } from '../src/v19/forge.js';
import { abandonEntry, courseFor, createEntry, gate, settleRound } from '../src/v19/tournament.js';

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
  assert.equal(run.record.credit, save.cr - before);
  assert.equal(commit(finishAppraisal).ok, false);
  assert.equal(save.collection.length, 2);
  assert.deepEqual(Progress.normalizeSave(Storage.load()).collection[0].v19Visual, newBlade.v19Visual);
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
    assert.equal(Storage.load().cr, 901);
  } finally {
    Storage.driver.write(current);
  }
});
