/*
 * Pressure Works — simulation engine.
 *
 * Pure game logic: no DOM access, so tools/simulate.js can run it headless.
 * State is a plain JSON-able object; derive() computes everything else.
 */
(function (root) {
  'use strict';

  const DATA = (root.PW && root.PW.DATA) || require('./data.js');
  const { PUMPS, ACTUATORS, TIERS, COOLERS, TECH, CONSTANTS: C } = DATA;
  const SAVE_VERSION = 1;

  const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const PUMP = byId(PUMPS), ACT = byId(ACTUATORS), COOL = byId(COOLERS), TECHS = byId(TECH);
  const zeroCounts = (list) => Object.fromEntries(list.map((x) => [x.id, 0]));

  function newState() {
    return {
      v: SAVE_VERSION,
      cash: C.startCash,
      runEarnings: 0,     // $ earned since the last Overhaul
      lifetime: 0,        // $ earned ever (drives Patents)
      kh: 0,
      patents: 0,
      overhauls: 0,
      pumps: { ...zeroCounts(PUMPS), gear: 1 },
      actuators: zeroCounts(ACTUATORS),
      coolers: zeroCounts(COOLERS),
      tech: {},
      tier: 0,
      accLevel: 0,
      accCharge: 0,
      temp: C.ambientF,
      surgeLeft: 0,
      time: 0,
      strokes: 0,
      lastSeen: Date.now(),
    };
  }

  // ---- Modifiers -----------------------------------------------------------

  function mods(s) {
    const m = {
      actMult: 1, pumpMult: 1, reliefHeat: 1, tempLimit: C.tempLimitF, costMult: 1,
      accMult: 1, surgeMult: C.surgeMult, clickPct: 0, autoSurge: false,
      offlineRate: C.offlineRate, offlineCapH: C.offlineCapH,
    };
    for (const t of TECH) {
      if (!s.tech[t.id]) continue;
      const e = t.effects;
      if (e.actMult) m.actMult *= e.actMult;
      if (e.pumpMult) m.pumpMult *= e.pumpMult;
      if (e.reliefHeat) m.reliefHeat *= e.reliefHeat;
      if (e.costMult) m.costMult *= e.costMult;
      if (e.accMult) m.accMult *= e.accMult;
      if (e.tempLimit) m.tempLimit += e.tempLimit;
      if (e.surgeMult) m.surgeMult = Math.max(m.surgeMult, e.surgeMult);
      if (e.clickPct) m.clickPct += e.clickPct;
      if (e.autoSurge) m.autoSurge = true;
      if (e.offlineRate) m.offlineRate = Math.max(m.offlineRate, e.offlineRate);
      if (e.offlineCapH) m.offlineCapH = Math.max(m.offlineCapH, e.offlineCapH);
    }
    m.patentMult = 1 + C.patentBonus * s.patents;
    return m;
  }

  /** ×2 for every milestone count reached (25, 50, 100, …). */
  function milestoneMult(n) {
    let k = 0;
    for (const t of C.milestones) if (n >= t) k++;
    return 2 ** k;
  }
  function nextMilestone(n) {
    return C.milestones.find((t) => t > n) || null;
  }

  function thermalMult(temp, limit) {
    if (temp <= limit) return 1;
    return Math.max(C.tempFloor, 1 - (temp - limit) / C.tempSpanF);
  }

  const accCapacity = (s, m = mods(s)) => C.accBaseGal * C.accGrowth ** s.accLevel * m.accMult;
  const psi = (s) => TIERS[s.tier].psi;

  // ---- Derived snapshot ----------------------------------------------------

  /**
   * Everything the UI and tick need, computed from state.
   * `opts.steady` uses the equilibrium temperature instead of the current one
   * (used by the simulator / offline progress).
   */
  function derive(s, opts = {}) {
    const m = mods(s);
    const P = psi(s);

    let supply = 0, pumpLossHP = 0;
    for (const p of PUMPS) {
      const n = s.pumps[p.id];
      if (!n) continue;
      const q = n * p.gpm * m.pumpMult * milestoneMult(n);
      supply += q;
      pumpLossHP += (P * q / C.hpConst) * (1 - p.eff);
    }

    let demand = 0, rawIncome = 0;
    const perActuator = {};
    for (const a of ACTUATORS) {
      const n = s.actuators[a.id];
      const runs = P >= a.psi;
      const inc = runs && n ? n * a.rate * Math.sqrt(P / a.psi) * milestoneMult(n) * m.actMult : 0;
      if (runs) demand += n * a.gpm;
      perActuator[a.id] = inc;
      rawIncome += inc;
    }

    const cap = accCapacity(s, m);
    // Flow balance: surplus charges the accumulator, then dumps over the relief
    // valve as heat. A deficit is covered by the accumulator while it lasts.
    let utilization = 1, toAcc = 0, overRelief = 0;
    if (supply >= demand) {
      const surplus = supply - demand;
      if (s.accCharge < cap) toAcc = surplus; else overRelief = surplus;
    } else if (s.accCharge > 0) {
      toAcc = supply - demand; // negative: draining
    } else {
      utilization = demand > 0 ? supply / demand : 1;
    }

    const reliefHP = (P * overRelief / C.hpConst) * m.reliefHeat;
    const heatHP = pumpLossHP + reliefHP;
    const k = C.baseK + COOLERS.reduce((acc, c) => acc + s.coolers[c.id] * c.k, 0);
    const tempEq = C.ambientF + heatHP / k;
    const temp = opts.steady ? tempEq : s.temp;
    const tMult = thermalMult(temp, m.tempLimit);
    const surging = s.surgeLeft > 0;
    const sMult = surging ? m.surgeMult : 1;

    const income = rawIncome * utilization * tMult * sMult * m.patentMult;
    const khRate = C.khPerSqrtIncome * Math.sqrt(income);

    return {
      m, psi: P, supply, demand, utilization, toAcc, overRelief, accCap: cap,
      pumpLossHP, reliefHP, heatHP, k, tempEq, tempLimit: m.tempLimit, thermalMult: tMult,
      surging, surgeMult: sMult, rawIncome, income, khRate, perActuator,
      hydraulicHP: P * Math.min(supply, demand) / C.hpConst,
    };
  }

  // ---- Time ----------------------------------------------------------------

  function tick(s, dt) {
    const d = derive(s);
    const earned = d.income * dt;
    s.cash += earned;
    s.runEarnings += earned;
    s.lifetime += earned;
    s.kh += d.khRate * dt;
    s.accCharge = Math.min(d.accCap, Math.max(0, s.accCharge + (d.toAcc / 60) * dt));
    s.temp += (d.tempEq - s.temp) * Math.min(1, dt / C.tempTauS);
    s.surgeLeft = Math.max(0, s.surgeLeft - dt);
    s.time += dt;
    if (d.m.autoSurge && canSurge(s)) surge(s);
    return d;
  }

  /** Apply time spent away. Uses steady-state income, no surges. */
  function applyOffline(s, seconds) {
    const m = mods(s);
    const capped = Math.min(seconds, m.offlineCapH * 3600);
    if (capped < 1) return null;
    s.surgeLeft = 0;
    const d = derive(s, { steady: true });
    const earned = d.income * capped * m.offlineRate;
    const kh = d.khRate * capped * m.offlineRate;
    s.cash += earned; s.runEarnings += earned; s.lifetime += earned; s.kh += kh;
    s.temp = d.tempEq;
    s.time += capped;
    return { seconds: capped, earned, kh, rate: m.offlineRate };
  }

  // ---- Purchases -----------------------------------------------------------

  const KINDS = { pump: ['pumps', PUMP], actuator: ['actuators', ACT], cooler: ['coolers', COOL] };

  /** Cost of buying `qty` more of an item when `owned` are already owned. */
  function bulkCost(item, owned, qty, costMult) {
    const r = item.growth;
    return item.cost * costMult * r ** owned * (r ** qty - 1) / (r - 1);
  }
  function maxAffordable(item, owned, cash, costMult) {
    const r = item.growth, base = item.cost * costMult * r ** owned;
    return Math.max(0, Math.floor(Math.log(cash * (r - 1) / base + 1) / Math.log(r)));
  }

  function isUnlocked(s, kind, id) {
    const item = KINDS[kind][1][id];
    if (item.requires && !s.tech[item.requires]) return false;
    if (kind === 'actuator' && psi(s) < item.psi) return false;
    return true;
  }

  /** qty may be a number or 'max'. Returns {qty, cost} that would be bought. */
  function quote(s, kind, id, qty) {
    const [bucket, table] = KINDS[kind];
    const item = table[id], owned = s[bucket][id], cm = mods(s).costMult;
    const n = qty === 'max' ? Math.max(1, maxAffordable(item, owned, s.cash, cm)) : qty;
    return { qty: n, cost: bulkCost(item, owned, n, cm) };
  }

  function buy(s, kind, id, qty = 1) {
    if (!isUnlocked(s, kind, id)) return false;
    const q = quote(s, kind, id, qty);
    if (q.cost > s.cash) return false;
    s.cash -= q.cost;
    s[KINDS[kind][0]][id] += q.qty;
    return true;
  }

  function nextTier(s) {
    return TIERS[s.tier + 1] || null;
  }
  function canUpgradeTier(s) {
    const t = nextTier(s);
    return !!t && (!t.requires || s.tech[t.requires]) && s.cash >= t.cost * mods(s).costMult;
  }
  function upgradeTier(s) {
    if (!canUpgradeTier(s)) return false;
    s.cash -= nextTier(s).cost * mods(s).costMult;
    s.tier++;
    return true;
  }

  const accUpgradeCost = (s) => C.accCostBase * C.accCostGrowth ** s.accLevel * mods(s).costMult;
  function upgradeAccumulator(s) {
    const c = accUpgradeCost(s);
    if (s.cash < c) return false;
    s.cash -= c;
    s.accLevel++;
    return true;
  }

  function techAvailable(s, id) {
    const t = TECHS[id];
    return !s.tech[id] && t.requires.every((r) => s.tech[r]);
  }
  function research(s, id) {
    if (!techAvailable(s, id) || s.kh < TECHS[id].cost) return false;
    s.kh -= TECHS[id].cost;
    s.tech[id] = true;
    return true;
  }

  // ---- Actions -------------------------------------------------------------

  /** One stroke of the hand pump. */
  function click(s) {
    const d = derive(s);
    const gain = C.clickBase + d.m.clickPct * d.income;
    s.cash += gain; s.runEarnings += gain; s.lifetime += gain;
    s.accCharge = Math.min(d.accCap, s.accCharge + C.clickGal);
    s.strokes++;
    return gain;
  }

  const canSurge = (s) => s.surgeLeft <= 0 && s.accCharge >= accCapacity(s) - 1e-9;
  function surge(s) {
    if (!canSurge(s)) return false;
    s.accCharge = 0;
    s.surgeLeft = C.surgeSeconds;
    return true;
  }

  // ---- Prestige: Overhaul --------------------------------------------------

  const patentsTotal = (lifetime) => Math.floor(Math.sqrt(lifetime / C.patentDivisor));
  const overhaulGain = (s) => Math.max(0, patentsTotal(s.lifetime) - s.patents);
  const canOverhaul = (s) => s.lifetime >= C.overhaulMin && overhaulGain(s) > 0;

  function overhaul(s) {
    if (!canOverhaul(s)) return false;
    const keep = {
      patents: s.patents + overhaulGain(s), lifetime: s.lifetime,
      overhauls: s.overhauls + 1, strokes: s.strokes, time: s.time,
    };
    Object.assign(s, newState(), keep);
    return true;
  }

  // ---- Departments (scaffold: read-only queries, no effect on income) -------

  /** A department is open when any of its `opens` conditions is met. */
  function departmentOpen(s, dept) {
    const o = dept.opens || {};
    if (!Object.keys(o).length) return true;
    return (o.lifetime != null && s.lifetime >= o.lifetime)
      || (o.tier != null && s.tier >= o.tier)
      || (o.overhauls != null && s.overhauls >= o.overhauls);
  }
  /** Current era index: the latest era any open department belongs to. */
  function currentEra(s) {
    return Math.max(0, ...DATA.DEPARTMENTS.filter((d) => departmentOpen(s, d)).map((d) => d.era));
  }

  // ---- Save / load ---------------------------------------------------------

  function serialize(s) {
    return JSON.stringify({ ...s, lastSeen: Date.now() });
  }
  function deserialize(str) {
    const raw = JSON.parse(str);
    const s = newState();
    // Merge so that new content added after a save still gets default counts.
    for (const key of Object.keys(s)) {
      if (!(key in raw)) continue;
      if (s[key] && typeof s[key] === 'object') Object.assign(s[key], raw[key]);
      else s[key] = raw[key];
    }
    s.tier = Math.min(s.tier, TIERS.length - 1);
    return s;
  }

  const ENGINE = {
    DATA, newState, derive, tick, applyOffline, mods, milestoneMult, nextMilestone,
    bulkCost, maxAffordable, isUnlocked, quote, buy,
    nextTier, canUpgradeTier, upgradeTier, accCapacity, accUpgradeCost, upgradeAccumulator,
    techAvailable, research, click, canSurge, surge,
    patentsTotal, overhaulGain, canOverhaul, overhaul, departmentOpen, currentEra,
    serialize, deserialize,
  };
  root.PW = root.PW || {};
  root.PW.engine = ENGINE;
  if (typeof module !== 'undefined') module.exports = ENGINE;
})(typeof window !== 'undefined' ? window : globalThis);
