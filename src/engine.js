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
  // Order Line departments you staff (Production is the shop floor itself).
  const STAFFED = DATA.DEPARTMENTS.filter((d) => d.group === 'order' && d.id !== 'production');
  // Departments you hire people into: the Order Line plus Engineering.
  const HIREABLE = [...STAFFED, ...['engineering', 'it', 'safety', 'management'].map((id) => DATA.DEPARTMENTS.find((d) => d.id === id))];
  const DEPT = byId(DATA.DEPARTMENTS);
  // staff: legacy generic hires (saves from before named people); team: hired people;
  // pool: applicants waiting; p0: production when the department opened.
  // mgr: the promoted manager (or null); auto: whether they keep the department staffed.
  const freshDept = () => ({ staff: 0, p0: 0, team: [], pool: [], mgr: null, auto: true });
  const freshDepts = () => Object.fromEntries(HIREABLE.map((d) => [d.id, freshDept()]));

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
      locations: { hq: true }, // unlocked branches; kept through Overhaul
      depts: freshDepts(),     // people hired, applicants, and production when each opened (p0)
      seed: (Math.random() * 2 ** 32) >>> 0, // drives applicant generation (deterministic quotes)
      engUp: {},               // Engineering projects bought this run
      mgrClock: 0,
      safety: { streak: 0, incident: null, seed: (Math.random() * 2 ** 32) >>> 0 },
      ach: {},                 // achievements earned (kept forever)
      tips: {},                // first-time tips already shown (kept forever)
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
    m.costMult *= purchasingDiscount(s);
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
      const down = s.safety && s.safety.incident && s.safety.incident.id === a.id;
      const inc = runs && n && !down ? n * a.rate * Math.sqrt(P / a.psi) * milestoneMult(n) * m.actMult : 0;
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

    // What the shop floor can do, then what the Order Line lets through.
    const production = rawIncome * utilization * tMult * m.patentMult * safetyStreakMult(s) * achievementMult(s);
    const order = orderLine(s, production);
    const income = production * sMult * order.factor;
    const khRate = C.khPerSqrtIncome * Math.sqrt(income) * engKhMult(s);

    return {
      m, psi: P, supply, demand, utilization, toAcc, overRelief, accCap: cap, production, order,
      pumpLossHP, reliefHP, heatHP, k, tempEq, tempLimit: m.tempLimit, thermalMult: tMult,
      surging, surgeMult: sMult, rawIncome, income, khRate, perActuator,
      hydraulicHP: P * Math.min(supply, demand) / C.hpConst,
    };
  }

  // ---- Time ----------------------------------------------------------------

  function tick(s, dt) {
    const d = derive(s);
    snapshotDepts(s, d.production);
    safetyTick(s, d, dt);
    s.mgrClock += dt;
    if (s.mgrClock >= C.mgrEvery) { s.mgrClock = 0; managersTick(s, d); }
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
    if (s.safety) s.safety.streak += capped;
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
    const n = qty === 'max' ? Math.max(1, maxAffordable(item, owned, s.cash, cm))
      : qty === 'next' ? (kind === 'cooler' || !nextMilestone(owned) ? 1 : nextMilestone(owned) - owned)
      : qty;
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

  /** Accumulator charge from one hand-pump stroke: a share of capacity, so it scales with the bladder. */
  const strokeGal = (cap) => Math.max(C.clickGal, cap * C.strokeShare);

  /** One stroke of the hand pump. */
  function click(s) {
    const d = derive(s);
    const gain = C.clickBase + d.m.clickPct * d.income;
    s.cash += gain; s.runEarnings += gain; s.lifetime += gain;
    s.accCharge = Math.min(d.accCap, s.accCharge + strokeGal(d.accCap));
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

  const patentsTotal = (lifetime) => Math.floor(C.patentScale * Math.cbrt(lifetime / C.patentDivisor));
  const overhaulGain = (s) => Math.max(0, patentsTotal(s.lifetime) - s.patents);
  const canOverhaul = (s) => s.lifetime >= C.overhaulMin && overhaulGain(s) > 0;

  function overhaul(s) {
    if (!canOverhaul(s)) return false;
    const keep = {
      patents: s.patents + overhaulGain(s), lifetime: s.lifetime,
      overhauls: s.overhauls + 1, strokes: s.strokes, time: s.time, locations: s.locations, seed: s.seed,
      ach: s.ach, tips: s.tips,
    };
    Object.assign(s, newState(), keep);
    return true;
  }

  // ---- Departments (scaffold: read-only queries, no effect on income) -------

  /** An `opens` spec is met when any of its conditions is true ({} = always). */
  function opensMet(s, o = {}) {
    if (!Object.keys(o).length) return true;
    return (o.lifetime != null && s.lifetime >= o.lifetime)
      || (o.tier != null && s.tier >= o.tier)
      || (o.overhauls != null && s.overhauls >= o.overhauls);
  }
  const departmentOpen = (s, dept) => opensMet(s, dept.opens);
  /** Locations unlock in REGIONS order: each needs the previous one first. */
  function regionOpen(s, region) {
    if (s.locations[region.id]) return true;
    const i = DATA.REGIONS.indexOf(region);
    return (i === 0 || !!s.locations[DATA.REGIONS[i - 1].id]) && opensMet(s, region.opens);
  }
  /** Customer-base potential of a region, or of every open location if omitted. */
  function customerBase(s, regionId) {
    return DATA.STATES
      .filter((st) => (regionId ? st.region === regionId : s.locations[st.region]))
      .reduce((sum, st) => sum + st.customers, 0);
  }
  /** Records newly reached locations and returns them (for announcements). */
  function checkLocations(s) {
    const opened = [];
    for (const r of DATA.REGIONS) {
      if (s.locations[r.id] || !regionOpen(s, r)) continue;
      s.locations[r.id] = true;
      opened.push(r);
    }
    return opened;
  }
  /** Current era index: the latest era any open department belongs to. */
  function currentEra(s) {
    return Math.max(0, ...DATA.DEPARTMENTS.filter((d) => departmentOpen(s, d)).map((d) => d.era));
  }

  // ---- Support departments ------------------------------------------------------

  const openStrength = (s, id) => {
    const st = s.depts && s.depts[id];
    return st && st.p0 && departmentOpen(s, DEPT[id]) ? strength(st, id) : 0;
  };
  /** IT: every Order Line department works harder (ERP, networks, the help desk). */
  const itMult = (s) => 1 + Math.min(C.itMax, C.itPerStrength * openStrength(s, 'it'));
  /** Management: every team works better, and every manager sees more applicants. */
  const mgmtMult = (s) => 1 + Math.min(C.mgmtMax, C.mgmtPerStrength * openStrength(s, 'management'));
  const mgmtPool = (s) => Math.floor(openStrength(s, 'management') / C.mgmtPoolPer);
  /** Purchasing: supplier deals lower every equipment price. */
  const purchasingDiscount = (s) => Math.max(C.purchasingFloor, 1 / (1 + C.purchasingPer * openStrength(s, 'purchasing')));

  /** Safety: incidents/second, rising with pressure and heat, falling with Safety staff. */
  function incidentRate(s, d) {
    if (d.psi < C.incidentMinPsi || d.demand === 0) return 0;
    const heat = Math.max(0.5, s.temp / d.tempLimit);
    return (C.incidentPerMin / 60) * (d.psi / 3000) * heat / (1 + C.safetyPer * openStrength(s, 'safety'));
  }
  function safetyRand(s) {
    let t = (s.safety.seed = (s.safety.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function safetyTick(s, d, dt) {
    const sf = s.safety;
    if (sf.incident) {
      sf.incident.left -= dt;
      if (sf.incident.left <= 0) sf.incident = null;
      return;
    }
    if (safetyRand(s) < incidentRate(s, d) * dt) {
      const lines = ACTUATORS.filter((a) => s.actuators[a.id] > 0 && d.psi >= a.psi);
      if (lines.length) {
        const a = lines[Math.floor(safetyRand(s) * lines.length)];
        sf.incident = { id: a.id, left: C.incidentSeconds, kind: Math.floor(safetyRand(s) * 3) };
        sf.streak = 0;
        return;
      }
    }
    sf.streak += dt;
  }
  const safeDays = (s) => Math.floor((s.safety ? s.safety.streak : 0) / C.safeDayS);
  const safetyStreakMult = (s) => 1 + Math.min(C.safeDayMax, C.safeDayBonus * safeDays(s));
  const achievementMult = (s) => 1 + (DATA.CONSTANTS.achievementBonus || 0) * Object.keys(s.ach || {}).length;

  // ---- Departments: the Order Line -------------------------------------------

  // ---- People -------------------------------------------------------------------

  /** Seeded random (mulberry32) so a quote for "hire N" matches what you get. */
  function rand(s) {
    let t = (s.seed = (s.seed + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const pick = (s, list) => list[Math.floor(rand(s) * list.length)];

  /** A random applicant: name, 7 stats (1–10, bell-ish), maybe a trait, and a look. */
  function newPerson(s) {
    const stats = DATA.STATS.map(() => 1 + Math.floor((rand(s) + rand(s)) * 5));
    return {
      n: `${pick(s, DATA.FIRST_NAMES)} ${pick(s, DATA.LAST_NAMES)}`,
      s: stats.map((v) => Math.min(10, v)),
      t: rand(s) < DATA.TRAIT_CHANCE ? pick(s, DATA.TRAITS).id : null,
      a: Math.floor(rand(s) * 10000),
    };
  }
  const STAT_INDEX = Object.fromEntries(DATA.STATS.map((x, i) => [x.id, i]));
  const TRAIT = byId(DATA.TRAITS);

  /** How many staff this person counts as in a department (≈0.55–1.9). */
  function effectiveness(person, deptId) {
    const [p1, p2] = DATA.DEPT_STATS[deptId];
    const score = (2 * person.s[STAT_INDEX[p1]] + person.s[STAT_INDEX[p2]]) / 3;
    const tr = person.t && TRAIT[person.t];
    const bonus = tr && (tr.dept === deptId || tr.dept === 'any') ? tr.bonus : 0;
    return Math.round((C.effBase + C.effPerPoint * score + bonus) * 100) / 100;
  }

  const LEAD = STAT_INDEX.leadership;
  /** Leadership (people hired before the stat existed get one from their look). */
  const leadership = (p) => p.s[LEAD] ?? 1 + (p.a % 10);
  const mgrBonus = (st) => (st.mgr ? 1 + C.mgrTeamPerPoint * leadership(st.mgr) : 1);
  const poolSize = (st, s) => C.poolSize + (st.mgr ? Math.floor(leadership(st.mgr) / C.mgrPoolPer) : 0) + (s ? mgmtPool(s) : 0);

  const headcount = (st) => st.staff + st.team.length;
  /** Team strength: everyone's effectiveness, lifted by the manager. */
  const strength = (st, id) => (st.staff + st.team.reduce((a, p) => a + effectiveness(p, id), 0)) * mgrBonus(st);

  function fillPool(s, id) {
    const st = s.depts[id];
    while (st.pool.length < poolSize(st, s)) st.pool.push(newPerson(s));
  }

  // ---- Managers ---------------------------------------------------------------

  /** Promote a team member to manager; the previous manager goes back on the team. */
  function promote(s, id, index) {
    const st = s.depts[id];
    if (!st || !st.team[index]) return false;
    const person = st.team.splice(index, 1)[0];
    if (st.mgr) st.team.push(st.mgr);
    st.mgr = person;
    st.auto = true;
    fillPool(s, id);
    return true;
  }
  function setAuto(s, id, on) { if (s.depts[id]) s.depts[id].auto = !!on; }

  /** Managers hire the best applicant whenever their department falls short. */
  function managersTick(s, d) {
    const hires = [];
    for (const dept of STAFFED) {
      const st = s.depts[dept.id];
      if (!st.mgr || !st.auto) continue;
      const o = d.order.depts[dept.id];
      if (!o.open || o.coverage >= 1) continue;
      // better managers can fill more seats per check
      const n = 1 + Math.floor(leadership(st.mgr) / 4);
      for (let k = 0; k < n; k++) {
        const before = st.team.length;
        if (!hire(s, dept.id, 1)) break;
        hires.push({ dept: dept.id, who: st.team[before].n });
        if (orderLine(s, d.production).depts[dept.id].coverage >= 1) break;
      }
    }
    return hires;
  }

  // ---- Engineering --------------------------------------------------------------

  function engKhMult(s) {
    const st = s.depts.engineering;
    let m = 1 + C.engKhPerStrength * (st ? strength(st, 'engineering') * mgmtMult(s) : 0);
    for (const u of DATA.ENG_UPGRADES) if (s.engUp[u.id]) m *= u.kh;
    return m;
  }
  const ENG = byId(DATA.ENG_UPGRADES);
  function canBuyEng(s, id) {
    const u = ENG[id], st = s.depts.engineering;
    return !!u && !s.engUp[id] && departmentOpen(s, DEPT.engineering) && headcount(st) >= u.engineers
      && s.cash >= u.cost * mods(s).costMult;
  }
  function buyEng(s, id) {
    if (!canBuyEng(s, id)) return false;
    s.cash -= ENG[id].cost * mods(s).costMult;
    s.engUp[id] = true;
    return true;
  }

  // ---- Departments: the Order Line -------------------------------------------

  /**
   * Each open department needs more people as production grows: 1 to start,
   * plus `deptPerDecade` per 10× growth since it opened. Its coverage is
   * (you + team strength) ÷ required; Outside Sales reach grows with customer
   * base. The line runs at its weakest department's coverage: the bottleneck.
   */
  function orderLine(s, production) {
    const out = { depts: {}, factor: 1, bottleneck: null };
    const reach = Math.sqrt(customerBase(s) / Math.max(1, customerBase(null, 'hq')));
    const it = itMult(s), mg = mgmtMult(s);
    for (const dept of STAFFED) {
      const st = s.depts[dept.id];
      const open = departmentOpen(s, dept);
      if (!open || !st.p0) { out.depts[dept.id] = { open, required: 1, effective: 1, coverage: 1, reach: 1 }; continue; }
      const growth = Math.max(0, Math.log10(Math.max(production, 1) / st.p0));
      const required = 1 + C.deptPerDecade * growth;
      const r = dept.id === 'outside_sales' ? reach : 1;
      const effective = (1 + strength(st, dept.id) * it * mg) * r;
      const coverage = Math.min(1, effective / required);
      out.depts[dept.id] = { open, required, effective, coverage, reach: r };
      if (coverage < out.factor) { out.factor = coverage; out.bottleneck = dept.id; }
    }
    out.factor = Math.max(C.deptFloor, out.factor);
    return out;
  }

  /** Remember production at the moment each department opens, and post its first applicants. */
  function snapshotDepts(s, production) {
    const opened = [];
    for (const dept of HIREABLE) {
      const st = s.depts[dept.id];
      if (!st.p0 && departmentOpen(s, dept)) { st.p0 = Math.max(1, production); opened.push(dept); }
      if (st.p0 && st.pool.length < poolSize(st, s)) fillPool(s, dept.id);
    }
    return opened;
  }

  /** Cost of the next `qty` hires (cost depends on headcount, not on who). */
  function hireQuote(s, id, qty) {
    if (qty === 'next') qty = 1;
    const st = s.depts[id], g = C.hireGrowth;
    const base = C.hireBaseS * Math.max(1, st.p0 || derive(s).production) * mods(s).costMult;
    const first = base * g ** headcount(st);
    const n = qty === 'max'
      ? Math.max(1, Math.floor(Math.log(s.cash * (g - 1) / first + 1) / Math.log(g)))
      : qty;
    return { qty: n, cost: first * (g ** n - 1) / (g - 1) };
  }

  /** Hire one specific applicant from the pool; a new applicant takes their place. */
  function hirePerson(s, id, index) {
    const st = s.depts[id];
    if (!st || !departmentOpen(s, DEPT[id]) || !st.pool[index]) return false;
    const cost = hireQuote(s, id, 1).cost;
    if (cost > s.cash) return false;
    s.cash -= cost;
    st.team.push(st.pool[index]);
    st.pool[index] = newPerson(s);
    return true;
  }
  const bestIndex = (st, id) => st.pool.reduce((bi, p, i, arr) => (effectiveness(p, id) > effectiveness(arr[bi], id) ? i : bi), 0);

  /** Hire `qty` people, always taking the best applicant available. */
  function hire(s, id, qty = 1) {
    const st = s.depts[id];
    if (!st || !departmentOpen(s, DEPT[id])) return false;
    fillPool(s, id);
    const q = hireQuote(s, id, qty);
    if (q.cost > s.cash) return false;
    for (let i = 0; i < q.qty; i++) hirePerson(s, id, bestIndex(st, id));
    return true;
  }

  /** Throw out the current applicants and post the job again. */
  const rerollCost = (s) => C.rerollS * Math.max(1, derive(s).production) * mods(s).costMult;
  function rerollPool(s, id) {
    const st = s.depts[id], c = rerollCost(s);
    if (!st || !st.p0 || c > s.cash) return false;
    s.cash -= c;
    st.pool = [];
    fillPool(s, id);
    return true;
  }

  /**
   * What it takes to bring the whole line to 100% by hiring the best
   * applicant each time. Simulated on a copy, so it matches what staffLine does.
   */
  function staffLineQuote(s) {
    const d = derive(s), plan = {};
    const t = JSON.parse(JSON.stringify({ depts: s.depts, seed: s.seed }));
    let cost = 0, hires = 0;
    for (const dept of STAFFED) {
      const o = d.order.depts[dept.id];
      if (!o.open || o.coverage >= 1) continue;
      const st = t.depts[dept.id];
      fillPool(t, dept.id);
      let n = 0;
      const boost = itMult(s) * mgmtMult(s);
      while ((1 + strength(st, dept.id) * boost) * o.reach < o.required - 1e-9 && n < 1000) {
        cost += hireQuote({ ...s, depts: t.depts }, dept.id, 1).cost;
        const i = bestIndex(st, dept.id);
        st.team.push(st.pool[i]);
        st.pool[i] = newPerson(t);
        n++;
      }
      if (n) { plan[dept.id] = n; hires += n; }
    }
    return { plan, cost, hires };
  }
  function staffLine(s) {
    const q = staffLineQuote(s);
    if (!q.hires || q.cost > s.cash) return false;
    for (const dept of STAFFED) if (q.plan[dept.id]) hire(s, dept.id, q.plan[dept.id]);
    return true;
  }

  // ---- Achievements ------------------------------------------------------------

  function achStat(s, key) {
    switch (key) {
      case 'lifetime': return s.lifetime;
      case 'strokes': return s.strokes;
      case 'psi': return psi(s);
      case 'actuators': return Object.values(s.actuators).reduce((a, b) => a + b, 0);
      case 'pumps': return Object.values(s.pumps).reduce((a, b) => a + b, 0);
      case 'techs': return Object.keys(s.tech).length;
      case 'staff': return HIREABLE.reduce((a, d) => a + headcount(s.depts[d.id]) + (s.depts[d.id].mgr ? 1 : 0), 0);
      case 'managers': return HIREABLE.filter((d) => s.depts[d.id].mgr).length;
      case 'safeDays': return safeDays(s);
      case 'locations': return Object.keys(s.locations).length;
      case 'overhauls': return s.overhauls;
      default: return 0;
    }
  }
  /** Award any newly reached achievements; returns them (for announcements). */
  function checkAchievements(s) {
    const got = [];
    for (const a of DATA.ACHIEVEMENTS) {
      if (a.id in s.ach || achStat(s, a.stat) < a.goal) continue;
      s.ach[a.id] = Math.round(s.time);
      got.push(a);
    }
    return got;
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
    // Older saves: departments were { staff, p0 } only, and had no Engineering roster.
    for (const dept of HIREABLE) s.depts[dept.id] = { ...freshDept(), ...(s.depts[dept.id] || {}) };
    if (!Number.isFinite(s.seed)) s.seed = (Math.random() * 2 ** 32) >>> 0;
    s.safety = { ...newState().safety, ...(raw.safety || {}) };
    return s;
  }

  const ENGINE = {
    DATA, newState, derive, tick, applyOffline, mods, milestoneMult, nextMilestone,
    bulkCost, maxAffordable, isUnlocked, quote, buy,
    nextTier, canUpgradeTier, upgradeTier, accCapacity, accUpgradeCost, upgradeAccumulator,
    techAvailable, research, click, canSurge, surge,
    patentsTotal, overhaulGain, canOverhaul, overhaul, opensMet, departmentOpen, regionOpen, checkLocations, customerBase, currentEra,
    orderLine, snapshotDepts, hireQuote, hire, hirePerson, rerollPool, rerollCost, staffLineQuote, staffLine,
    effectiveness, headcount, strength, strokeGal, STAFFED, HIREABLE,
    leadership, mgrBonus, poolSize, promote, setAuto, managersTick, engKhMult, canBuyEng, buyEng,
    itMult, mgmtMult, mgmtPool, purchasingDiscount, incidentRate, safeDays, safetyStreakMult, achievementMult,
    achStat, checkAchievements,
    serialize, deserialize,
  };
  root.PW = root.PW || {};
  root.PW.engine = ENGINE;
  if (typeof module !== 'undefined') module.exports = ENGINE;
})(typeof window !== 'undefined' ? window : globalThis);
