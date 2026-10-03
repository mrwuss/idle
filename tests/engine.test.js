// Engine unit tests. Run with: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const { PUMPS, ACTUATORS, CONSTANTS: C } = E.DATA;

const close = (a, b, rel = 1e-9) => assert.ok(Math.abs(a - b) <= rel * Math.max(1, Math.abs(b)), `${a} ≉ ${b}`);

/** A mid-game shop: plenty of flow, some lines, departments open. */
function midGame() {
  const s = E.newState();
  s.seed = 12345;
  s.cash = 1e9; s.lifetime = 1e9; s.runEarnings = 1e9; s.tier = 2;
  s.pumps.gear = 40; s.pumps.vane = 30; s.pumps.axial = 10;
  s.actuators.jack = 50; s.actuators.splitter = 30; s.actuators.press = 20;
  s.coolers.fan = 10; s.coolers.shell = 5;
  for (let i = 0; i < 50; i++) E.tick(s, 1);
  return s;
}

test('bulk cost matches the sum of single purchases', () => {
  const item = PUMPS.find((p) => p.id === 'vane');
  let sum = 0;
  for (let i = 0; i < 25; i++) sum += E.bulkCost(item, 7 + i, 1, 1);
  close(E.bulkCost(item, 7, 25, 1), sum);
  close(E.bulkCost(item, 0, 1, 1), item.cost);
});

test('maxAffordable never overspends', () => {
  const item = ACTUATORS.find((a) => a.id === 'jack');
  for (const cash of [5, 10, 999, 1e6, 1e12]) {
    const n = E.maxAffordable(item, 3, cash, 1);
    assert.ok(E.bulkCost(item, 3, n, 1) <= cash * (1 + 1e-9));
    assert.ok(E.bulkCost(item, 3, n + 1, 1) > cash);
  }
});

test("quote 'next' buys up to the next milestone", () => {
  const s = E.newState();
  s.actuators.jack = 18;
  assert.equal(E.quote(s, 'actuator', 'jack', 'next').qty, 7);
  s.actuators.jack = 25;
  assert.equal(E.quote(s, 'actuator', 'jack', 'next').qty, 25);
  assert.equal(E.quote(s, 'cooler', 'fan', 'next').qty, 1);
  s.actuators.jack = 10000;
  assert.equal(E.quote(s, 'actuator', 'jack', 'next').qty, 1);
});

test('milestones double output', () => {
  assert.equal(E.milestoneMult(24), 1);
  assert.equal(E.milestoneMult(25), 2);
  assert.equal(E.milestoneMult(100), 8);
});

test('flow balance: no demand means full utilization, starvation scales income', () => {
  const s = E.newState();
  assert.equal(E.derive(s).utilization, 1);
  s.actuators.jack = 8; // 8 GPM demand vs 2 GPM supply
  const d = E.derive(s);
  assert.equal(d.demand, 8);
  close(d.utilization, d.supply / d.demand);
  s.accCharge = 1; // stored oil covers the gap
  assert.equal(E.derive(s).utilization, 1);
});

test('a line below its psi rating earns nothing and draws no flow', () => {
  const s = E.newState();
  s.actuators.splitter = 5; // needs 1,200 psi; we run 750
  const d = E.derive(s);
  assert.equal(d.demand, 0);
  assert.equal(d.production, 0);
});

test('surplus charges the accumulator up to capacity, then relieves as heat', () => {
  const s = E.newState();
  s.pumps.gear = 10;
  const cap = E.accCapacity(s);
  for (let i = 0; i < 600; i++) E.tick(s, 1);
  close(s.accCharge, cap);
  const d = E.derive(s);
  assert.ok(d.overRelief > 0);
  assert.ok(d.reliefHP > 0);
});

test('surge needs a full accumulator and multiplies income', () => {
  const s = E.newState();
  s.actuators.jack = 1;
  assert.equal(E.canSurge(s), false);
  s.accCharge = E.accCapacity(s);
  const before = E.derive(s).income;
  assert.ok(E.surge(s));
  assert.ok(E.derive(s).income > before * 2);
});

test('temperature approaches equilibrium and coolers lower it', () => {
  const s = E.newState();
  s.pumps.gear = 30; s.actuators.jack = 50; s.tier = 1;
  const hot = E.derive(s).tempEq;
  s.coolers.fan = 5;
  const cool = E.derive(s).tempEq;
  assert.ok(cool < hot);
  for (let i = 0; i < 3000; i++) E.tick(s, 1);
  const eq = E.derive(s).tempEq; // relief heat joins once the accumulator fills
  assert.ok(Math.abs(s.temp - eq) < 1, `${s.temp} vs ${eq}`);
});

test('hire quotes match what hiring costs', () => {
  const s = midGame();
  const id = E.STAFFED.find((d) => s.depts[d.id].p0).id;
  const q = E.hireQuote(s, id, 3);
  const cash = s.cash, before = E.headcount(s.depts[id]);
  assert.ok(E.hire(s, id, 3));
  close(cash - s.cash, q.cost, 1e-6);
  assert.equal(E.headcount(s.depts[id]), before + 3);
});

test('applicants are deterministic for a given seed', () => {
  const a = midGame(), b = midGame();
  const id = E.STAFFED.find((d) => a.depts[d.id].p0).id;
  E.hire(a, id, 2); E.hire(b, id, 2);
  assert.deepEqual(a.depts[id].team, b.depts[id].team);
  assert.deepEqual(a.depts[id].pool, b.depts[id].pool);
});

test('staffLine brings every open department to full coverage', () => {
  const s = midGame();
  s.cash = 1e15;
  if (E.staffLineQuote(s).hires) assert.ok(E.staffLine(s));
  close(E.orderLine(s).factor, 1, 1e-9);
});

test('promote makes a team member the manager and boosts strength', () => {
  const s = midGame();
  const id = E.STAFFED.find((d) => s.depts[d.id].p0).id;
  E.hire(s, id, 4);
  const st = s.depts[id];
  const best = st.team.reduce((bi, p, i, t) => (E.leadership(p) > E.leadership(t[bi]) ? i : bi), 0);
  const person = st.team[best];
  const teamBefore = st.team.length;
  assert.ok(E.promote(s, id, best));
  assert.equal(st.mgr, person);
  assert.equal(st.team.length, teamBefore - 1);
  assert.ok(E.mgrBonus(st) > 1);
});

test('save round-trip and migration from an old save', () => {
  const s = midGame();
  const back = E.deserialize(E.serialize(s));
  assert.equal(back.cash, s.cash);
  assert.deepEqual(back.depts, s.depts);
  // An old save: departments were { staff, p0 } only, and newer fields are missing.
  const old = JSON.parse(E.serialize(s));
  for (const id of Object.keys(old.depts)) old.depts[id] = { staff: 2, p0: 100 };
  delete old.safety; delete old.ach; delete old.tips; delete old.engUp;
  delete old.pumps.dd;
  const m = E.deserialize(JSON.stringify(old));
  assert.equal(m.pumps.dd, 0);
  assert.deepEqual(m.ach, {});
  for (const id of Object.keys(m.depts)) assert.ok(Array.isArray(m.depts[id].team), id);
  assert.ok(m.safety && typeof m.safety.streak === 'number');
  assert.ok(Number.isFinite(E.derive(m).income));
});

test('offline progress pays income at the offline rate, capped', () => {
  const s = midGame();
  const d = E.derive(s, { steady: true });
  const cash = s.cash;
  const r = E.applyOffline(s, 600);
  close(s.cash - cash, d.income * 600 * r.rate, 1e-6);
  const r2 = E.applyOffline(E.newState(), 1e9);
  assert.equal(r2.seconds, E.mods(E.newState()).offlineCapH * 3600);
});

test('overhaul keeps patents, locations, achievements and tips', () => {
  const s = midGame();
  E.checkLocations(s);
  E.checkAchievements(s);
  s.tips.starve = true;
  assert.ok(E.canOverhaul(s));
  const gain = E.overhaulGain(s), locs = { ...s.locations }, ach = { ...s.ach };
  assert.ok(E.overhaul(s));
  assert.equal(s.patents, gain);
  assert.deepEqual(s.locations, locs);
  assert.deepEqual(s.ach, ach);
  assert.equal(s.tips.starve, true);
  assert.equal(s.cash, E.newState().cash);
  assert.equal(s.overhauls, 1);
});

test('patents follow the cube-root formula', () => {
  assert.equal(E.patentsTotal(1e6 - 1), 1);
  assert.equal(E.patentsTotal(8e6), Math.floor(C.patentScale * 2));
  assert.equal(E.patentsTotal(1e9), Math.floor(C.patentScale * 10));
});

test('achievements add 1% each and are awarded once', () => {
  const s = E.newState();
  s.lifetime = 150;
  const got = E.checkAchievements(s);
  assert.deepEqual(got.map((a) => a.id), ['open']);
  assert.equal(E.checkAchievements(s).length, 0);
  close(E.achievementMult(s), 1 + C.achievementBonus);
});

test('Purchasing discount never goes below the floor', () => {
  const s = midGame();
  s.depts.purchasing.staff = 100000;
  assert.ok(E.purchasingDiscount(s) >= C.purchasingFloor - 1e-12);
});
