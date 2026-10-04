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
  s.seed = 12345; s.safety.seed = 777; // deterministic applicants and incidents
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

test('staffing past 100% pays an income bonus with diminishing returns', () => {
  const s = midGame();
  s.cash = 1e15;
  if (E.staffLineQuote(s).hires) E.staffLine(s);
  const id = E.STAFFED.find((d) => s.depts[d.id].p0).id;
  const base = E.derive(s).income;
  E.hire(s, id, 3);
  const o = E.orderLine(s, E.derive(s).production);
  assert.ok(o.depts[id].load > 1);
  close(o.depts[id].bonus, C.surplusBonus * (1 - 1 / o.depts[id].load));
  assert.ok(E.derive(s).income > base);
  s.depts[id].staff = 1e6; // absurdly overstaffed: approaches, never passes, the maximum
  const b = E.orderLine(s, E.derive(s).production).depts[id].bonus;
  assert.ok(b < C.surplusBonus && b > C.surplusBonus * 0.99);
});

test('a manager raises income once the team is past full coverage', () => {
  const s = midGame();
  s.cash = 1e15;
  // a department that needs real staff, staffed to just past 100%
  const id = E.STAFFED.find((d) => s.depts[d.id].p0).id;
  s.depts[id].p0 = 1;
  const need = () => E.orderLine(s, E.derive(s).production).depts[id];
  while (need().load < 1) E.hire(s, id, 1);
  assert.ok(need().load < 2, 'test needs a team between 100% and 200%');
  const before = E.derive(s).income, loadBefore = need().load;
  const st = s.depts[id];
  const best = st.team.reduce((bi, p, i, t) => (E.leadership(p) > E.leadership(t[bi]) ? i : bi), 0);
  E.promote(s, id, best);
  assert.ok(need().load > loadBefore, 'the manager lifts team output');
  assert.ok(E.derive(s).income > before, 'and it shows up in income');
});

/** A shop where Engineering is open, with `n` engineers hired. */
function withEngineers(n) {
  const s = midGame();
  s.lifetime = 1e8; s.cash = 1e15;
  E.tick(s, 1); // opens Engineering (snapshot)
  E.hire(s, 'engineering', n);
  return s;
}

test('new engineers spread across Design, Project and Controls', () => {
  const s = withEngineers(6);
  const counts = { design: 0, controls: 0, project: 0 };
  for (const p of s.depts.engineering.team) counts[E.engTeamOf(p)]++;
  // "You" (staff 1) already sit on Design, so the six hires fill the other teams first.
  assert.ok(counts.project >= 2 && counts.controls >= 2, JSON.stringify(counts));
  const kh = E.engKhMult(s);
  const idx = s.depts.engineering.team.findIndex((p) => E.engTeamOf(p) === 'project');
  assert.ok(E.setEngTeam(s, idx, 'design'));
  assert.ok(E.engKhMult(s) > kh, 'moving someone to Design raises Know-how');
});

test('Controls engineers discount Controls research, down to the floor', () => {
  const s = withEngineers(3);
  const full = E.DATA.TECH.find((t) => t.id === 'plc').cost;
  for (const i of s.depts.engineering.team.keys()) E.setEngTeam(s, i, 'controls');
  assert.ok(E.techCost(s, 'plc') < full);
  assert.equal(E.techCost(s, 'pascal'), E.DATA.TECH.find((t) => t.id === 'pascal').cost);
  s.depts.engineering.team.push(...Array.from({ length: 200 }, () => ({ ...s.depts.engineering.team[0] })));
  close(E.techCost(s, 'plc'), full * C.controlsTechFloor);
});

test('the Pak line builds inputs first, consumes them, and sells the target', () => {
  const s = withEngineers(4);
  for (const i of s.depts.engineering.team.keys()) E.setEngTeam(s, i, 'project');
  E.setPakTarget(s, 'base');
  const d = E.derive(s), rate = E.pakHoursRate(s);
  assert.ok(rate > 0);
  const cash = s.cash;
  assert.equal(E.pakNext(s), 'valve');
  const sold = E.pakTick(s, d, (300 + 1500) / rate + 1e-6);
  assert.deepEqual(sold, ['base']);
  assert.equal(s.pak.built.valve, 1);
  assert.equal(s.pak.stock.valve, 0);
  close(s.pak.earned, E.pakPrice(s, d, 'base'), 1e-9); // (cash is ~1e15 here, too coarse to diff)
  assert.ok(s.cash > cash);
  // Sys-Paks need PLC Automation and a Controls engineer; until then the line makes Base-Paks.
  E.setPakTarget(s, 'sys');
  assert.equal(E.pakTarget(s), 'base');
});

test('older saves gain an empty Pak line', () => {
  const s = withEngineers(1);
  const raw = JSON.parse(E.serialize(s));
  delete raw.pak;
  const m = E.deserialize(JSON.stringify(raw));
  assert.equal(m.pak.target, 'valve');
  assert.deepEqual(m.pak.stock, { valve: 0, base: 0 });
});

/** A late shop: Management open (so executives are), every department staffed. */
function lateGame() {
  const s = midGame();
  s.lifetime = 2e9; s.cash = 1e15;
  E.tick(s, 1);
  for (const d of E.HIREABLE) if (s.depts[d.id].p0) E.hire(s, d.id, 4);
  return s;
}

test('executives open with Management and boost their division', () => {
  const s = lateGame();
  assert.ok(E.execOpen(s));
  const before = E.orderLine(s, E.derive(s).production).depts.outside_sales.effective;
  const c = E.execCandidates(s, 'cro')[0];
  assert.ok(E.appointExec(s, 'cro', c));
  assert.equal(E.execCount(s), 1);
  assert.ok(E.execMult(s, 'inside_sales') > 1);
  assert.equal(E.execMult(s, 'accounting'), 1);
  assert.ok(E.orderLine(s, E.derive(s).production).depts.outside_sales.effective > before);
});

test('an executive promotes managers, staffs up and upgrades people', () => {
  const s = lateGame();
  for (const id of ['outside_sales', 'inside_sales']) s.depts[id].mgr = null;
  E.appointExec(s, 'cro', { pool: 0 });
  for (let i = 0; i < 6; i++) E.execTick(s, E.derive(s));
  assert.ok(s.depts.outside_sales.mgr && s.depts.inside_sales.mgr, 'both sales teams get managers');
  assert.ok(s.execLog.length > 0);
  assert.ok(s.execLog.every((l) => l.x === 'cro'));
});

test('a President needs three executives and lifts everyone', () => {
  const s = lateGame();
  for (const x of ['cro', 'coo']) E.appointExec(s, x, { pool: 0 });
  assert.equal(E.canAppointPresident(s), false);
  E.appointExec(s, 'cfo', { pool: 0 });
  const skill = E.execSkill(s, 'cro');
  const inc = E.derive(s).income;
  assert.ok(E.appointPresident(s, 'cfo'));
  assert.equal(s.execs.cfo, null);
  assert.ok(E.presidentMult(s) > 1);
  assert.ok(E.execSkill(s, 'cro') >= skill);
  assert.ok(E.derive(s).income > inc * 0.99);
});

test('board seats cost Patents, survive Overhaul and are not refunded', () => {
  const s = lateGame();
  s.overhauls = 2; s.patents = 10;
  assert.ok(E.boardOpen(s));
  E.fillBoardPool(s);
  assert.equal(s.boardPool.length, 3);
  const gain = E.overhaulGain(s);
  assert.ok(E.electDirector(s, 0));
  assert.equal(s.patents, 10 - E.DATA.BOARD_COSTS[0]);
  assert.equal(E.overhaulGain(s), gain, 'spent patents do not come back as Overhaul gain');
  const perk = s.board[0].perk;
  s.lifetime = 1e13;
  E.overhaul(s);
  assert.equal(s.board[0].perk, perk);
});

test('a shake-up runs Board → executives → managers → employees, then cools down', () => {
  const s = lateGame();
  s.overhauls = 2; s.patents = 50;
  E.fillBoardPool(s); E.electDirector(s, 0);
  for (const d of E.HIREABLE) s.depts[d.id].mgr = null;
  assert.ok(E.canShake(s));
  const d = E.derive(s);
  assert.ok(E.startShake(s));
  assert.equal(s.shake.phase, 'board');
  // Disruption while it runs: incidents likelier, the Order Line slower.
  assert.ok(E.derive(s).order.depts.outside_sales.effective < d.order.depts.outside_sales.effective);
  const phases = [];
  for (let t = 0; t < 400 && s.shake.phase; t++) { if (phases.at(-1) !== s.shake.phase) phases.push(s.shake.phase); E.shakeTick(s, 1); }
  assert.deepEqual(phases, ['board', 'cxo', 'mgr', 'staff']);
  assert.ok(s.shake.report && s.shake.report.moves > 0);
  assert.ok(E.HIREABLE.filter((x) => s.depts[x.id].team.length).every((x) => s.depts[x.id].mgr), 'every staffed team has a manager');
  assert.ok(E.execCount(s) >= 1, 'executive seats filled from inside');
  assert.equal(E.canShake(s), false, 'cooling down');
  E.shakeTick(s, E.DATA.CONSTANTS.shakeCooldownS);
  assert.ok(E.canShake(s));
});

test('the employee phase never lowers total fit and keeps head counts', () => {
  const s = lateGame();
  const heads = Object.fromEntries(E.HIREABLE.map((d) => [d.id, s.depts[d.id].team.length]));
  const fit = () => E.HIREABLE.reduce((a, d) => a + s.depts[d.id].team.reduce((b, p) => b + E.effectiveness(p, d.id), 0), 0);
  const before = fit();
  E.startShake(s);
  s.shake.phase = 'staff'; s.shake.left = 0;
  E.shakeTick(s, 1);
  for (const d of E.HIREABLE) assert.equal(s.depts[d.id].team.length, heads[d.id], d.id);
  assert.ok(fit() >= before - 1e-9);
});

test('directors with more Leadership make stronger perks', () => {
  const s = lateGame();
  s.board = [{ n: 'A', a: 1, s: [5, 5, 5, 5, 5, 5, 5, 2], perk: 'founder' }];
  const weak = E.boardEff(s, 'incomeMult');
  s.board[0].s[7] = 10;
  assert.ok(E.boardEff(s, 'incomeMult') > weak);
});

test('directors saved before they had stats still load and count', () => {
  const s = lateGame();
  s.board = [{ n: 'Old Director', a: 7, perk: 'founder' }]; // the v0.2.6 shape: no stats
  const m = E.deserialize(E.serialize(s));
  assert.ok(Number.isFinite(E.derive(m).income));
  assert.ok(E.boardEff(m, 'incomeMult') > 1);
  E.startShake(m); for (let i = 0; i < 400; i++) E.shakeTick(m, 1);
  assert.ok(m.shake.report);
});

test('the Patent Office opens after the whole tree and turns Know-how into patents', () => {
  const s = lateGame();
  s.kh = 1e9;
  assert.equal(E.filePatents(s), 0, 'closed until every technology is researched');
  for (const t of E.DATA.TECH) s.tech[t.id] = true;
  const p0 = s.patents, gain0 = E.overhaulGain(s);
  const first = E.fileCost(s);
  assert.equal(E.filePatents(s), 1);
  assert.equal(s.patents, p0 + 1);
  close(s.kh, 1e9 - first);
  assert.ok(E.fileCost(s) > first, 'each filing costs more');
  assert.equal(E.overhaulGain(s), gain0, 'filed patents do not eat into the next Overhaul');
  const q = E.fileQuote(s);
  assert.equal(E.filePatents(s, Infinity), q.n);
  assert.ok(s.kh < E.fileCost(s));
  // Filed patents and the price climb survive Overhaul.
  const filed = s.patentsFiled, held = s.patents;
  s.lifetime = 1e13;
  E.overhaul(s);
  assert.equal(s.patentsFiled, filed);
  assert.ok(s.patents >= held);
});

test('SCADA installs with Know-how once Controls is ready, tunes income and automates', () => {
  const s = withEngineers(6);
  s.kh = 1e7; s.cash = 1e15;
  assert.equal(E.buyScada(s), false, 'needs Telematics and Controls strength');
  s.tech.telematics = true;
  for (const i of s.depts.engineering.team.keys()) E.setEngTeam(s, i, 'controls');
  const prod = E.derive(s).production;
  assert.ok(E.buyScada(s));
  assert.ok(E.derive(s).production > prod, 'loop tuning lifts production');
  // Automation: a starved, overheating plant gets pumps and coolers on its own.
  s.actuators.press += 400; s.coolers.fan = 0; s.coolers.shell = 0;
  assert.ok(E.derive(s).supply < E.derive(s).demand, 'test setup: starved');
  s.scadaPrefs.cool = true; s.scadaPrefs.pumps = true;
  for (let i = 0; i < 40; i++) { E.staffLine(s); E.scadaTick(s, E.derive(s)); }
  const d = E.derive(s);
  assert.ok(d.supply >= d.demand, 'flow balanced');
  assert.ok(d.tempEq <= d.tempLimit, 'cooled below the limit');
  assert.ok(s.scada.log.some((l) => /pump/i.test(l.m)) && s.scada.log.some((l) => /Oil/.test(l.m)));
  // Overhaul removes the system but remembers the switches.
  s.lifetime = 1e13; E.overhaul(s);
  assert.equal(s.scada.owned, false);
  assert.equal(s.scadaPrefs.pumps, true);
});

const dud = (n) => ({ n, a: 1, s: [1, 1, 1, 1, 1, 1, 1, 1] });
const star = (n, lea = 10) => ({ n, a: 2, s: [10, 10, 10, 10, 10, 10, 10, lea] });

test('managers let their weakest person go for a clearly better applicant', () => {
  const s = lateGame();
  const st = s.depts.warehouse;
  E.promote(s, 'warehouse', 0);
  st.team[0] = dud('Weak Link');
  st.pool[0] = star('Ace Hire');
  const heads = st.team.length;
  st.auto = false;
  assert.equal(E.managersReview(s).length, 0, 'not while auto-staff is off');
  st.auto = true;
  const done = E.managersReview(s);
  assert.ok(done.some((x) => x.dept === 'warehouse'));
  assert.ok(st.team.some((p) => p.n === 'Ace Hire'));
  assert.ok(!st.team.some((p) => p.n === 'Weak Link'));
  assert.equal(st.team.length, heads, 'head count stays the same');
  assert.ok(s.execLog.some((l) => l.x === 'mgr:warehouse'));
  // A better manager acts on smaller gaps.
  assert.ok(E.mgrReplaceGap(10) < E.mgrReplaceGap(2));
});

test('the President fills vacant seats and replaces weaker executives', () => {
  const s = lateGame();
  for (const x of ['cro', 'coo', 'cfo']) E.appointExec(s, x, { pool: 0 });
  E.appointPresident(s, 'cfo');
  s.execs.cro = dud('Tired Exec');
  s.depts.outside_sales.team[0] = star('Rising Star');
  const msg = E.presidentReview(s);
  assert.ok(msg && msg.includes('Rising Star'), msg);
  assert.equal(s.execs.cro.n, 'Rising Star');
  assert.ok(s.depts.outside_sales.team.some((p) => p.n === 'Tired Exec'), 'the old exec returns to the division');
  // The emptied CFO seat is filled on a later review.
  for (let i = 0; i < 4; i++) E.presidentReview(s);
  assert.ok(s.execs.cfo, 'CFO seat filled');
  assert.ok(s.execLog.some((l) => l.x === 'pres'));
});

test('the Chair proposes replacing a weak director for fewer Patents', () => {
  const s = lateGame();
  s.lifetime = 1e13;
  s.board = [{ ...star('Chair Person'), perk: 'founder' }, { ...dud('Sleepy Director'), perk: 'banker' }];
  s.depts.warehouse.team[0] = star('Floor Leader', 9);
  const pr = E.boardProposal(s);
  assert.ok(pr);
  assert.equal(pr.out.n, 'Sleepy Director');
  assert.equal(pr.chair.n, 'Chair Person');
  assert.ok(pr.cost < E.DATA.BOARD_COSTS[1]);
  s.patents = 0;
  assert.equal(E.replaceDirector(s), false);
  s.patents = pr.cost;
  assert.ok(E.replaceDirector(s));
  assert.equal(s.board[1].perk, 'banker', 'the seat keeps its perk');
  assert.ok(!s.depts.warehouse.team.some((p) => p.n === s.board[1].n), 'the new director leaves their job');
  assert.equal(s.patents, 0);
  s.board = [s.board[0]];
  assert.equal(E.boardProposal(s), null, 'needs a Chair and another director');
});

test('operator-panel upgrades are bought in order with Know-how and pay off', () => {
  const s = withEngineers(6);
  s.kh = 1e10; s.cash = 1e15; s.tech.telematics = true;
  for (const i of s.depts.engineering.team.keys()) E.setEngTeam(s, i, 'controls');
  assert.equal(E.nextPanel(s), null, 'needs SCADA first');
  E.buyScada(s);
  assert.equal(E.buyPanel(s, 'alarms'), false, 'in order');
  const tune = E.scadaMult(s), scan = E.scadaScan(s), d = E.derive(s);
  const inc = E.incidentRate(s, d);
  const kh = s.kh;
  assert.ok(E.buyPanel(s, 'historian'));
  assert.equal(s.kh, kh - E.DATA.SCADA_PANEL[0].kh);
  assert.ok(E.scadaMult(s) > tune);
  assert.ok(E.buyPanel(s, 'alarms'));
  assert.ok(E.incidentRate(s, d) < inc || inc === 0);
  assert.ok(E.buyPanel(s, 'predictive'));
  assert.equal(E.scadaScan(s), scan + 1);
  const t3 = E.scadaMult(s);
  assert.ok(E.buyPanel(s, 'apc'));
  assert.ok(E.scadaMult(s) > t3);
  assert.equal(E.nextPanel(s), null);
  const m = E.deserialize(E.serialize(s));
  assert.ok(E.hasPanel(m, 'apc'), 'saved');
  s.lifetime = 1e13; E.overhaul(s);
  assert.equal(E.hasPanel(s, 'historian'), false, 'goes with the SCADA install');
});

test('SCADA holds growth while the Order Line caps income, and picks the best return per $', () => {
  const s = lateGame();
  s.kh = 1e9; s.tech.telematics = true;
  E.hire(s, 'engineering', 6);
  for (const i of s.depts.engineering.team.keys()) E.setEngTeam(s, i, 'controls');
  E.buyScada(s);
  s.scadaPrefs.pumps = true; s.scadaPrefs.lines = true; s.scadaPrefs.budget = 2;
  // Short-staff the Order Line: no machines get bought, and the log says why.
  for (const d of E.STAFFED) { s.depts[d.id].team = []; s.depts[d.id].staff = 0; s.depts[d.id].mgr = null; }
  s.safety.incident = null; // a line down for an incident would hide the shortage
  const o = E.derive(s).order;
  assert.ok(o.factor < 0.999, 'test setup: line capped');
  const acts = JSON.stringify([s.pumps, s.actuators]);
  E.scadaTick(s, E.derive(s));
  assert.equal(JSON.stringify([s.pumps, s.actuators]), acts);
  assert.ok(s.scada.log.some((l) => /Holding growth/.test(l.m)));
  // Staffed again: growth resumes.
  for (let i = 0; i < 5; i++) E.staffLine(s);
  E.scadaTick(s, E.derive(s));
  assert.ok(s.scada.log.some((l) => /growth resumes/.test(l.m)));
  // Auto-tier: buys the next tier when it pays back fast, and the accumulator.
  for (const t of E.DATA.TECH) s.tech[t.id] = true;
  s.scadaPrefs.tier = true; s.scadaPrefs.pumps = false; s.scadaPrefs.lines = false;
  const tier = s.tier, acc = s.accLevel;
  for (let i = 0; i < 40; i++) { E.staffLine(s); E.scadaTick(s, E.derive(s)); }
  assert.ok(s.tier > tier, 'tier upgraded');
  assert.ok(s.accLevel > acc, 'accumulator upgraded once no revenue buy fits');
  assert.ok(s.scada.log.some((l) => /Best return: raised pressure/.test(l.m)));
});

test('SCADA growth buys the best production gain per dollar', () => {
  const s = lateGame();
  s.kh = 1e9; s.tech.telematics = true;
  E.hire(s, 'engineering', 6);
  for (const i of s.depts.engineering.team.keys()) E.setEngTeam(s, i, 'controls');
  E.buyScada(s);
  const P = { pumps: true, lines: true, tier: true, cool: true };
  const best = E.bestGrowth(s, P, s.cash * 0.05);
  assert.ok(best && best.gain > 0);
  // No single option the switches allow beats it per dollar.
  for (const a of E.DATA.ACTUATORS) {
    if (!E.isUnlocked(s, 'actuator', a.id)) continue;
    const d = E.derive(s);
    if (d.demand + a.gpm > d.supply) continue;
    const before = E.sustained(s); s.actuators[a.id]++; const g = E.sustained(s) - before; s.actuators[a.id]--;
    const c = E.quote(s, 'actuator', a.id, 1).cost;
    if (c <= s.cash * 0.05) assert.ok(g / c <= best.gain / best.cost + 1e-12, a.id);
  }
});

test('a shake-up goal-seeks company output and never makes any measure worse', () => {
  const s = lateGame();
  for (const d of E.HIREABLE) s.depts[d.id].mgr = null;
  const before = E.shakeScore(s);
  E.startShake(s);
  for (let i = 0; i < 400 && s.shake.phase; i++) E.shakeTick(s, 1);
  const after = E.shakeScore(s);
  assert.ok(after.inc > before.inc, 'income up');
  assert.ok(s.shake.report.change > 0);
  assert.ok(after.kh >= before.kh * (1 - 1e-9) && after.ctl >= before.ctl - 1e-9 && after.cost <= before.cost * (1 + 1e-9), 'nothing else worse');
  // People are free to cross divisions.
  assert.ok(s.shake.moves.some((m) => /: (\w[\w ]*) → (?!\1)/.test(m)));
});

test('the one-time free reorg runs instantly, costs nothing and stays used through Overhaul', () => {
  const s = lateGame();
  for (const d of E.HIREABLE) s.depts[d.id].mgr = null;
  const cash = s.cash, before = E.shakeScore(s).inc;
  assert.ok(E.canFreeShake(s));
  const r = E.freeShake(s);
  assert.ok(r && r.free && r.change > 0);
  assert.ok(E.shakeScore(s).inc > before);
  assert.equal(s.cash, cash, 'free');
  assert.equal(s.shake.phase, null, 'instant');
  assert.equal(s.shake.cooldown, 0, 'no cooldown');
  assert.ok(E.canShake(s), 'a paid shake-up is still available');
  assert.equal(E.freeShake(s), null, 'only once');
  const m = E.deserialize(E.serialize(s));
  assert.equal(E.canFreeShake(m), false, 'saved');
  s.lifetime = 1e13; E.overhaul(s);
  assert.equal(s.shake.freeUsed, true, 'kept through Overhaul');
});
