#!/usr/bin/env node
/*
 * Headless balance simulator.
 *
 *   node tools/simulate.js [hours=6] [--overhaul] [--quiet]
 *
 * A greedy bot plays the real engine: every simulated second it buys whatever
 * gets it the most income soonest ("time to afford + payback time"),
 * researches any affordable tech, and fires Surge when the accumulator is full.
 * It prints a timeline of first-time events so pacing can be eyeballed.
 */
'use strict';
require('../src/data.js');
const E = require('../src/engine.js');
const { PUMPS, ACTUATORS, COOLERS, TECH, TIERS } = E.DATA;
const { fmt, fmtTime } = require('../src/format.js');

const args = process.argv.slice(2);
const hours = Number(args.find((a) => /^\d+(\.\d+)?$/.test(a)) || 6);
const doOverhaul = args.includes('--overhaul');
const quiet = args.includes('--quiet');

const BIG = 1e300;
const clone = (s) => JSON.parse(JSON.stringify(s));
// Score purchases by what the shop floor produces; staffing is handled
// separately (keepLineStaffed), the way a player would buy, then hire.
const steadyIncome = (s) => { const d = E.derive(s, { steady: true }); return d.production * d.surgeMult; };

/** Hire into the bottleneck until the Order Line is fully covered (or cash runs out). */
function keepLineStaffed(s) {
  for (let i = 0; i < 200; i++) {
    const o = E.derive(s).order;
    if (!o.bottleneck || o.factor >= 0.999) return;
    if (!E.hire(s, o.bottleneck, 1)) return;
  }
}

// Each action returns what it spent, or false if it couldn't be done.
function buyC(t, kind, id, qty = 1) {
  const c = E.quote(t, kind, id, qty).cost;
  return E.buy(t, kind, id, qty) ? c : false;
}
function tierC(t) {
  const next = E.nextTier(t);
  const c = next && next.cost * E.mods(t).costMult;
  return E.upgradeTier(t) ? c : false;
}
function accC(t) {
  const c = E.accUpgradeCost(t);
  return E.upgradeAccumulator(t) ? c : false;
}

function candidates(s) {
  const out = [];
  const add = (label, apply) => {
    const t = clone(s);
    t.cash = BIG;
    const cost = apply(t);
    if (cost === false) return;
    out.push({ label, apply, cost, after: t });
  };
  const pumps = PUMPS.filter((p) => E.isUnlocked(s, 'pump', p.id));
  for (const p of pumps) {
    add(`pump:${p.id}`, (t) => buyC(t, 'pump', p.id));
    // At the heat wall a pump only pays off together with cooling.
    for (const c of COOLERS) {
      add(`pump:${p.id}+${c.id}`, (t) => {
        let spent = buyC(t, 'pump', p.id);
        for (let i = 0; i < 30; i++) {
          if (E.derive(t, { steady: true }).thermalMult >= 1) return spent;
          spent += buyC(t, 'cooler', c.id);
        }
        return false;
      });
    }
  }
  for (const c of COOLERS) add(`cooler:${c.id}`, (t) => buyC(t, 'cooler', c.id));
  add('tier', tierC);
  add('accumulator', accC);
  // Actuators alone are worthless without flow, so also try "actuator + the
  // pumps it needs" bundles with the two best pumps available.
  for (const a of ACTUATORS) {
    if (!E.isUnlocked(s, 'actuator', a.id)) continue;
    add(`act:${a.id}`, (t) => buyC(t, 'actuator', a.id));
    for (const p of pumps.slice(-2)) {
      add(`act:${a.id}+${p.id}`, (t) => {
        let spent = buyC(t, 'actuator', a.id);
        if (spent === false) return false;
        for (let i = 0; i < 30; i++) {
          const d = E.derive(t);
          if (d.supply >= d.demand) return spent;
          spent += buyC(t, 'pump', p.id);
        }
        return false;
      });
    }
  }
  return out;
}

function bestMove(s) {
  const base = steadyIncome(s);
  let best = null;
  for (const c of candidates(s)) {
    const gain = steadyIncome(c.after) - base;
    if (gain <= 1e-9) continue;
    const wait = Math.max(0, c.cost - s.cash) / Math.max(base, 1e-9);
    const score = wait + c.cost / gain;
    if (!best || score < best.score) best = { ...c, score };
  }
  return best;
}

const s = E.newState();
const seen = new Set();
const log = (msg) => console.log(`${fmtTime(s.time).padStart(9)}  ${msg}`);
const once = (key, msg) => { if (!seen.has(key)) { seen.add(key); log(msg); } };

const end = hours * 3600;
let nextReport = 0;
const reportEvery = Number((args.find((a) => a.startsWith('--every=')) || '').slice(8)) || 1800;
while (s.time < end) {
  for (let i = 0; i < 50 && s.time % 5 === 0; i++) {
    keepLineStaffed(s);
    const mv = bestMove(s);
    if (!mv || mv.cost > s.cash) break;
    mv.apply(s);
    const [kind, rest] = mv.label.split(':');
    if (kind === 'tier') once(`tier${s.tier}`, `TIER  → ${TIERS[s.tier].name} (${fmt(TIERS[s.tier].psi)} psi)`);
    if (kind === 'act') once(rest.split('+')[0], `BUY   first ${rest.split('+')[0]}`);
    if (kind === 'pump') once(rest, `BUY   first ${rest} pump`);
    if (kind === 'cooler') once(rest, `BUY   first ${rest} cooler`);
  }
  for (const t of TECH) if (E.research(s, t.id)) log(`TECH  ${t.name}`);
  if (E.canSurge(s)) E.surge(s);
  for (const x of [1e3, 1e6, 1e9, 1e12]) if (s.lifetime >= x) once(`life${x}`, `$$$   lifetime ${fmt(x)}`);
  if (doOverhaul && E.overhaulGain(s) >= Math.max(1, s.patents)) {
    const g = E.overhaulGain(s);
    E.overhaul(s);
    for (const k of [...seen]) if (!k.startsWith('life')) seen.delete(k);
    log(`OVERHAUL #${s.overhauls}: +${g} patents (total ${s.patents})`);
  }
  if (!quiet && s.time >= nextReport) {
    const d = E.derive(s);
    log(`      $${fmt(s.cash)}  ${fmt(d.income)}/s  KH ${fmt(s.kh)}  flow ${fmt(d.supply)}/${fmt(d.demand)} GPM  ` +
        `${Math.round(s.temp)}°F (eq ${Math.round(d.tempEq)})  ×${d.thermalMult.toFixed(2)}  line ×${d.order.factor.toFixed(2)}` +
        (d.order.bottleneck ? ` (${d.order.bottleneck})` : ''));
    nextReport += reportEvery;
  }
  E.tick(s, 1);
}

const d = E.derive(s);
console.log('\nFinal:', {
  orderLine: d.order.factor.toFixed(2), staff: Object.fromEntries(Object.entries(s.depts).map(([k, v]) => [k, v.staff])),
  income: fmt(d.income) + '/s', lifetime: fmt(s.lifetime), patentsAvailable: E.overhaulGain(s),
  tier: TIERS[s.tier].name, tech: Object.keys(s.tech).length + '/' + TECH.length,
  pumps: s.pumps, actuators: s.actuators, coolers: s.coolers,
});
