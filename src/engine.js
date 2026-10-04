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
      execs: { cro: null, coo: null, cfo: null, cto: null }, // executives (people), by seat
      execPool: { cro: [], coo: [], cfo: [], cto: [] },       // outside candidates per seat
      president: null, execClock: 0, execLog: [],
      board: [], boardPool: [], patentsSpent: 0,               // directors survive Overhaul
      patentsFiled: 0,                                         // patents bought with Know-how (kept)
      scada: { owned: false, clock: 0, log: [] },              // installed this run
      scadaPrefs: { cool: false, pumps: false, lines: false, budget: 1 }, // automation switches (kept)
      shake: { phase: null, left: 0, cooldown: 0, moves: [], before: 0, report: null, done: 0 },
      pak: { target: 'valve', building: 'valve', work: 0, stock: { valve: 0, base: 0 }, built: { valve: 0, base: 0, sys: 0 }, earned: 0 },
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
    m.costMult *= purchasingDiscount(s) * boardEff(s, 'costMult');
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
    const production = rawIncome * utilization * tMult * m.patentMult * safetyStreakMult(s) * achievementMult(s)
      * presidentMult(s) * boardEff(s, 'incomeMult') * scadaMult(s);
    const order = orderLine(s, production);
    const income = production * sMult * order.factor * order.bonus;
    const khRate = C.khPerSqrtIncome * Math.sqrt(income) * engKhMult(s) * boardEff(s, 'khMult');

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
    pakTick(s, d, dt);
    shakeTick(s, dt);
    s.scada.clock += dt;
    if (s.scada.clock >= C.scadaEvery) { s.scada.clock = 0; scadaTick(s, d); }
    s.execClock += dt;
    if (s.execClock >= C.execEvery) { s.execClock = 0; execTick(s, d); }
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
    const pakBefore = s.pak.earned;
    pakTick(s, d, capped * m.offlineRate);
    const paks = s.pak.earned - pakBefore;
    s.temp = d.tempEq;
    if (s.safety) s.safety.streak += capped;
    s.time += capped;
    return { seconds: capped, earned: earned + paks, kh, rate: m.offlineRate };
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
  /** Know-how price; Controls engineers make the Controls branch cheaper. */
  function techCost(s, id) {
    const t = TECHS[id];
    if (!t.controls) return t.cost;
    return t.cost * Math.max(C.controlsTechFloor, 1 - C.controlsTechPer * teamStrength(s, 'controls'));
  }
  function research(s, id) {
    const cost = techCost(s, id);
    if (!techAvailable(s, id) || s.kh < cost) return false;
    s.kh -= cost;
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
  // Patents held = earned by Overhauls + filed with Know-how − spent on the Board; only the earned share counts against the next Overhaul.
  const overhaulGain = (s) => Math.max(0, patentsTotal(s.lifetime) - (s.patents - (s.patentsFiled || 0) + (s.patentsSpent || 0)));
  const canOverhaul = (s) => s.lifetime >= C.overhaulMin && overhaulGain(s) > 0;

  function overhaul(s) {
    if (!canOverhaul(s)) return false;
    const keep = {
      patents: s.patents + overhaulGain(s), lifetime: s.lifetime,
      overhauls: s.overhauls + 1, strokes: s.strokes, time: s.time, locations: s.locations, seed: s.seed,
      ach: s.ach, tips: s.tips, shakeDone: s.shake && s.shake.done, board: s.board, boardPool: s.boardPool, patentsSpent: s.patentsSpent, patentsFiled: s.patentsFiled, scadaPrefs: s.scadaPrefs,
    };
    Object.assign(s, newState(), keep);
    s.shake.done = keep.shakeDone || 0;
    delete s.shakeDone;
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
    return st && st.p0 && departmentOpen(s, DEPT[id]) ? strength(st, id) * execMult(s, id) : 0;
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
    const shaking = s.shake && s.shake.phase ? C.shakeIncidentMult : 1;
    return (C.incidentPerMin / 60) * (d.psi / 3000) * heat * shaking * boardEff(s, 'incidentMult') / (1 + C.safetyPer * openStrength(s, 'safety'));
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
  /** Leadership (people saved before the stat existed, including early Board
   * directors who had no stats at all, get one from their look). */
  const leadership = (p) => (p.s && p.s[LEAD]) ?? 1 + ((p.a || 0) % 10);
  const mgrBonus = (st) => (st.mgr ? 1 + C.mgrTeamPerPoint * leadership(st.mgr) : 1);
  const poolSize = (st, s) => C.poolSize + (st.mgr ? Math.floor(leadership(st.mgr) / C.mgrPoolPer) : 0) + (s ? mgmtPool(s) + boardEff(s, 'poolPlus', true) : 0);

  const headcount = (st) => st.staff + st.team.length;
  /** Team strength: everyone's effectiveness (the manager still works too), lifted by the manager. */
  const strength = (st, id) => (st.staff + st.team.reduce((a, p) => a + effectiveness(p, id), 0)
    + (st.mgr ? effectiveness(st.mgr, id) : 0)) * mgrBonus(st);

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

  /**
   * Engineering has three teams. Each engineer (and the manager) works on one:
   * Design (Know-how), Controls (cheaper Controls research, needed for Sys-Paks)
   * or Project (builds Paks). People hired before teams existed are on Design.
   */
  const ENG_TEAMS = ['design', 'controls', 'project'];
  const engTeamOf = (p) => (p && ENG_TEAMS.includes(p.g) ? p.g : 'design');
  function teamStrength(s, team) {
    const st = s.depts.engineering;
    if (!st || !st.p0) return 0;
    let sum = team === 'design' ? st.staff : 0;
    for (const p of st.team) if (engTeamOf(p) === team) sum += effectiveness(p, 'engineering');
    if (st.mgr && engTeamOf(st.mgr) === team) sum += effectiveness(st.mgr, 'engineering');
    return sum * mgrBonus(st) * mgmtMult(s) * execMult(s, 'engineering');
  }
  /** New engineers join the smallest team (ties: Design, Project, Controls). */
  function leastEngTeam(st) {
    const n = { design: st.staff, project: 0, controls: 0 };
    for (const p of [...st.team, st.mgr].filter(Boolean)) n[engTeamOf(p)]++;
    return ['design', 'project', 'controls'].reduce((a, b) => (n[b] < n[a] ? b : a));
  }
  /** Move an engineer ('mgr' or a team index) to another team. */
  function setEngTeam(s, who, team) {
    const st = s.depts.engineering;
    const p = who === 'mgr' ? st.mgr : st.team[who];
    if (!p || !ENG_TEAMS.includes(team)) return false;
    p.g = team;
    return true;
  }

  function engKhMult(s) {
    let m = 1 + C.engKhPerStrength * teamStrength(s, 'design');
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
    const out = { depts: {}, factor: 1, bottleneck: null, bonus: 1 };
    const reach = Math.sqrt(customerBase(s) / Math.max(1, customerBase(null, 'hq'))) * boardEff(s, 'reachMult');
    const it = itMult(s), mg = mgmtMult(s);
    const disrupt = s.shake && s.shake.phase ? C.shakeDisruption : 1;
    for (const dept of STAFFED) {
      const st = s.depts[dept.id];
      const open = departmentOpen(s, dept);
      if (!open || !st.p0) { out.depts[dept.id] = { open, required: 1, effective: 1, coverage: 1, load: 1, bonus: 0, reach: 1 }; continue; }
      const growth = Math.max(0, Math.log10(Math.max(production, 1) / st.p0));
      const required = (1 + C.deptPerDecade * growth) * boardEff(s, 'needMult');
      const r = dept.id === 'outside_sales' ? reach : 1;
      const effective = (1 + strength(st, dept.id) * it * mg * execMult(s, dept.id)) * r * disrupt;
      const load = effective / required, coverage = Math.min(1, load);
      // Staffing past 100% isn't wasted: surplus pays an efficiency bonus that keeps
      // growing with diminishing returns (+5% at 150%, +7.5% at 200%, toward +15%).
      const bonus = load > 1 ? C.surplusBonus * (1 - 1 / load) : 0;
      out.bonus += bonus;
      out.depts[dept.id] = { open, required, effective, coverage, load, bonus, reach: r };
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
    const p = st.pool[index];
    if (id === 'engineering') p.g = leastEngTeam(st);
    st.team.push(p);
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
      case 'execs': return execCount(s);
      case 'president': return s.president ? 1 : 0;
      case 'board': return (s.board || []).length;
      case 'scada': return s.scada && s.scada.owned ? 1 : 0;
      case 'filed': return s.patentsFiled || 0;
      case 'shakes': return (s.shake && s.shake.done) || 0;
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


  // ---- Pak lines (Project engineering) -------------------------------------------
  // Project engineers add engineering hours. The line builds toward the chosen
  // target, making its inputs first (a Base-Pak needs a Valve-Pak, a Sys-Pak four
  // Base-Paks), and sells each finished target through the Order Line.

  const PAK = byId(DATA.PAKS);
  const pakOpen = (s) => departmentOpen(s, DEPT.engineering);
  const sysReady = (s) => !!s.tech.plc && teamStrength(s, 'controls') >= 1;
  /** What the line is really aiming for (Sys-Pak falls back to Base-Pak until it's possible). */
  const pakTarget = (s) => (s.pak.target === 'sys' && !sysReady(s) ? 'base' : s.pak.target);
  function pakNext(s) {
    const t = pakTarget(s), st = s.pak.stock;
    if (t === 'valve') return 'valve';
    if (t === 'base') return st.valve >= PAK.base.needs.valve ? 'base' : 'valve';
    return st.base >= PAK.sys.needs.base ? 'sys' : st.valve >= PAK.base.needs.valve ? 'base' : 'valve';
  }
  const pakHoursRate = (s) => (pakOpen(s) ? C.pakHoursPerStrength * Math.sqrt(teamStrength(s, 'project')) : 0);
  /** Price grade: Forged Manifolds for Valve-Paks; your best pump type for Base- and Sys-Paks. */
  function pakGrade(s, id) {
    if (id === 'valve') return s.tech.forged_manifold ? 1.5 : 1;
    let best = 0;
    PUMPS.forEach((p, i) => { if (s.pumps[p.id] > 0) best = i; });
    return 1 + C.pakGradePer * best;
  }
  const pakPrice = (s, d, id) => PAK[id].value * pakGrade(s, id) * C.pakSeconds * d.production * d.order.factor * boardEff(s, 'pakMult');
  /** Hours to build one target from scratch (inputs included). */
  const pakChainHours = (id) => PAK[id].hours + Object.entries(PAK[id].needs).reduce((a, [k, n]) => a + n * pakChainHours(k), 0);
  /** Average Pak income per second at the current target and staffing. */
  function pakIncome(s, d) {
    const t = pakTarget(s), rate = pakHoursRate(s);
    return rate > 0 ? pakPrice(s, d, t) * rate / pakChainHours(t) : 0;
  }
  function setPakTarget(s, id) {
    if (!PAK[id]) return false;
    s.pak.target = id;
    s.pak.building = pakNext(s);
    return true;
  }
  /** Advance the line by dt seconds; returns the Paks sold. */
  function pakTick(s, d, dt) {
    let hours = pakHoursRate(s) * dt;
    if (hours <= 0) return [];
    const sold = [], P = s.pak;
    for (let guard = 0; hours > 0 && guard < 10000; guard++) {
      const id = pakNext(s);
      if (P.building !== id) { P.building = id; P.work = 0; }
      const need = PAK[id].hours - P.work;
      if (hours < need) { P.work += hours; break; }
      hours -= need;
      P.work = 0;
      for (const [k, n] of Object.entries(PAK[id].needs)) P.stock[k] -= n;
      P.built[id]++;
      if (id === pakTarget(s)) {
        const price = pakPrice(s, d, id);
        s.cash += price; s.runEarnings += price; s.lifetime += price; P.earned += price;
        sold.push(id);
      } else P.stock[id]++;
    }
    P.building = pakNext(s);
    return sold;
  }


  // ---- Executive track: executives, President, Board -------------------------------

  const EXEC = byId(DATA.EXECS);
  const STAT_OF = (p, id) => (id === 'leadership' ? leadership(p) : p.s[STAT_INDEX[id]]);
  const execOpen = (s) => departmentOpen(s, DEPT.management);
  const execOf = (deptId) => DATA.EXECS.find((x) => x.depts.includes(deptId));
  const presidentSkill = (s) => (s.president ? Math.round((2 * leadership(s.president) + STAT_OF(s.president, DATA.PRESIDENT.stat)) / 3) : 0);
  /** Skill 1–10ish: (2 × Leadership + the seat's key stat) / 3, plus the President's and a coach's lift. */
  function execSkill(s, id, p = s.execs[id]) {
    if (!p) return 0;
    const base = Math.round((2 * leadership(p) + STAT_OF(p, EXEC[id].stat)) / 3);
    return base + Math.floor(presidentSkill(s) / C.presidentSkillDiv) + boardEff(s, 'execPlus', true);
  }
  /** Strength multiplier an executive (or the President, for Management) gives a department. */
  function execMult(s, deptId) {
    if (!s.execs) return 1;
    if (DATA.PRESIDENT.depts.includes(deptId)) return 1 + C.execBonusPer * presidentSkill(s);
    const x = execOf(deptId);
    return x && s.execs[x.id] ? 1 + C.execBonusPer * execSkill(s, x.id) : 1;
  }
  const presidentMult = (s) => 1 + C.presidentIncomePer * presidentSkill(s);
  const execCount = (s) => (s.execs ? DATA.EXECS.filter((x) => s.execs[x.id]).length : 0);

  /** Board perks multiply (or, with `add`, sum) across directors. */
  /** A director's perk strength, from their Leadership (×1.0 at 5, ×1.4 at 10). */
  const directorQuality = (m) => C.directorQBase + C.directorQPer * leadership(m);
  function boardEff(s, key, add = false) {
    let v = add ? 0 : 1;
    for (const m of s.board || []) {
      const e = PERK[m.perk] && PERK[m.perk].eff[key];
      if (e == null) continue;
      v = add ? v + e : v * (1 + (e - 1) * directorQuality(m));
    }
    return v;
  }
  const PERK = byId(DATA.BOARD_PERKS);

  function logExec(s, who, msg) {
    s.execLog.unshift({ t: Math.round(s.time), x: who, m: msg });
    if (s.execLog.length > 40) s.execLog.length = 40;
  }

  /** People inside a seat's division who could step up, best projected skill first. */
  function execCandidates(s, id) {
    const out = [];
    for (const deptId of EXEC[id].depts) {
      const st = s.depts[deptId];
      if (!st || !st.p0) continue;
      if (st.mgr) out.push({ dept: deptId, kind: 'mgr', idx: 0, p: st.mgr });
      st.team.forEach((p, idx) => out.push({ dept: deptId, kind: 'team', idx, p }));
    }
    for (const c of out) c.skill = execSkill(s, id, c.p);
    return out.sort((a, b) => b.skill - a.skill).slice(0, 6);
  }
  function fillExecPool(s, id) {
    const pool = s.execPool[id];
    while (pool.length < 3) {
      const p = newPerson(s);
      for (const k of ['leadership', EXEC[id].stat]) p.s[STAT_INDEX[k]] = Math.min(10, p.s[STAT_INDEX[k]] + C.execPoolBoost);
      pool.push(p);
    }
  }
  const execHireCost = (s, d = derive(s)) => C.execHireS * Math.max(1, d.production) * mods(s).costMult;

  /** Seat an executive: from inside ({dept, kind, idx}) for free, or an outside candidate ({pool}) for cash. */
  function appointExec(s, id, src) {
    if (!execOpen(s) || !EXEC[id]) return false;
    let p;
    if (src.pool != null) {
      fillExecPool(s, id);
      const cost = execHireCost(s);
      if (!s.execPool[id][src.pool] || cost > s.cash) return false;
      s.cash -= cost;
      p = s.execPool[id].splice(src.pool, 1)[0];
      fillExecPool(s, id);
    } else {
      const st = s.depts[src.dept];
      if (!st || !EXEC[id].depts.includes(src.dept)) return false;
      if (src.kind === 'mgr') { p = st.mgr; st.mgr = null; } else { p = st.team.splice(src.idx, 1)[0]; }
      if (!p) return false;
    }
    s.execs[id] = p;
    logExec(s, id, `${p.n} takes the ${EXEC[id].short} seat`);
    return true;
  }
  function dismissExec(s, id) {
    if (!s.execs[id]) return false;
    logExec(s, id, `${s.execs[id].n} steps down`);
    s.execs[id] = null;
    return true;
  }
  const canAppointPresident = (s) => execOpen(s) && execCount(s) >= 3;
  /** Promote a seated executive to President (their seat opens up). */
  function appointPresident(s, id) {
    if (!canAppointPresident(s) || !s.execs[id]) return false;
    s.president = s.execs[id];
    s.execs[id] = null;
    logExec(s, 'pres', `${s.president.n} is named President`);
    return true;
  }

  /** One round for every seated executive. */
  function execTick(s, d) {
    const done = [];
    for (const x of DATA.EXECS) {
      const ex = s.execs[x.id];
      if (!ex) continue;
      const skill = execSkill(s, x.id);
      let actions = 1 + Math.floor(skill / 3);
      const budget = () => s.cash * (C.execBudgetBase + C.execBudgetPer * skill);
      const depts = x.depts.filter((id) => s.depts[id] && s.depts[id].p0 && departmentOpen(s, DEPT[id]));
      const act = (id, msg) => { actions--; logExec(s, x.id, msg); done.push({ x: x.id, dept: id, msg }); };
      const bestLea = (st) => st.team.reduce((b, p, i, a) => (leadership(p) > leadership(a[b]) ? i : b), 0);
      // 1. Every team has the best leader available as manager.
      for (const id of depts) {
        if (actions <= 0) break;
        const st = s.depts[id];
        if (!st.team.length) continue;
        const i = bestLea(st), cand = st.team[i];
        if (!st.mgr || leadership(cand) >= leadership(st.mgr) + 2) {
          const was = st.mgr;
          promote(s, id, i);
          act(id, was ? `${DEPT[id].name}: ${cand.n} replaces ${was.n} as manager` : `${DEPT[id].name}: promoted ${cand.n} to manager`);
        }
      }
      // 2. Staff Order Line teams to a cushion above 100%; top up support teams while cheap.
      const byLoad = depts.slice().sort((a, b) => ((d.order.depts[a] || {}).load || 9) - ((d.order.depts[b] || {}).load || 9));
      for (const id of byLoad) {
        if (actions <= 0) break;
        const o = d.order.depts[id], cost = hireQuote(s, id, 1).cost;
        const want = o ? o.load < 1 + C.execTargetPer * skill : true;
        if (want && cost <= (o ? budget() : budget() * 0.5) && hire(s, id, 1)) act(id, `${DEPT[id].name}: hired ${s.depts[id].team[s.depts[id].team.length - 1].n}`);
      }
      // 3. Replace the weakest person when a clearly better applicant is waiting.
      const gap = Math.max(0.1, C.execReplaceGap - C.execReplaceGapPer * skill);
      for (const id of depts) {
        if (actions <= 0) break;
        const st = s.depts[id];
        if (!st.team.length || !st.pool.length) continue;
        const wi = st.team.reduce((b, p, i, a) => (effectiveness(p, id) < effectiveness(a[b], id) ? i : b), 0);
        const bi = st.pool.reduce((b, p, i, a) => (effectiveness(p, id) > effectiveness(a[b], id) ? i : b), 0);
        const weak = st.team[wi], best = st.pool[bi];
        if (effectiveness(best, id) < effectiveness(weak, id) + gap) continue;
        const cost = 0.5 * hireQuote(s, id, 1).cost;
        if (cost > budget()) continue;
        s.cash -= cost;
        if (weak.g) best.g = weak.g;
        st.team[wi] = best;
        st.pool[bi] = newPerson(s);
        act(id, `${DEPT[id].name}: replaced ${weak.n} (×${effectiveness(weak, id).toFixed(2)}) with ${best.n} (×${effectiveness(best, id).toFixed(2)})`);
      }
      // 4. Refresh an applicant pool that has nobody worth hiring.
      for (const id of depts) {
        if (actions <= 0) break;
        const st = s.depts[id];
        if (!st.team.length || !st.pool.length) continue;
        const avg = st.team.reduce((a, p) => a + effectiveness(p, id), 0) / st.team.length;
        const top = Math.max(...st.pool.map((p) => effectiveness(p, id)));
        if (top < avg && rerollCost(s) <= budget() * 0.5 && rerollPool(s, id)) act(id, `${DEPT[id].name}: new applicants`);
      }
    }
    return done;
  }

  // Board of Directors: seats bought with Patents; directors stay through Overhaul.
  const boardOpen = (s) => s.overhauls >= 2 || s.lifetime >= 1e12;
  const boardSeatCost = (s) => DATA.BOARD_COSTS[s.board.length];
  function fillBoardPool(s) {
    if (s.boardPool.length || s.board.length >= DATA.BOARD_COSTS.length) return;
    const taken = new Set(s.board.map((m) => m.perk));
    const perks = DATA.BOARD_PERKS.filter((k) => !taken.has(k.id));
    while (s.boardPool.length < Math.min(3, perks.length)) {
      const k = perks.splice(Math.floor(rand(s) * perks.length), 1)[0];
      const p = newPerson(s);
      s.boardPool.push({ ...p, perk: k.id });
    }
  }
  function electDirector(s, i) {
    fillBoardPool(s);
    const cost = boardSeatCost(s), c = s.boardPool[i];
    if (!boardOpen(s) || cost == null || !c || s.patents < cost) return false;
    s.patents -= cost;
    s.patentsSpent = (s.patentsSpent || 0) + cost;
    s.board.push(c);
    s.boardPool = [];
    fillBoardPool(s);
    return true;
  }




  // ---- SCADA: supervisory control (Controls engineering) --------------------------
  // Installed with Know-how once Telematics is researched and the Controls team is
  // strong enough. Loop tuning lifts income; optional automation keeps the plant
  // cool, balanced and growing on its own, within a cash budget per action.

  const scadaReady = (s) => !!s.tech.telematics && teamStrength(s, 'controls') >= C.scadaControls;
  const canBuyScada = (s) => !s.scada.owned && scadaReady(s) && s.kh >= C.scadaKH;
  function buyScada(s) {
    if (!canBuyScada(s)) return false;
    s.kh -= C.scadaKH;
    s.scada.owned = true;
    return true;
  }
  const scadaMult = (s) => (s.scada && s.scada.owned ? 1 + Math.min(C.scadaTuneMax, C.scadaTunePer * teamStrength(s, 'controls')) : 1);
  const scadaScan = (s) => 1 + Math.floor(teamStrength(s, 'controls') / 3);
  function scadaLog(s, msg) {
    s.scada.log.unshift({ t: Math.round(s.time), m: msg });
    if (s.scada.log.length > 30) s.scada.log.length = 30;
  }
  /** Cheapest-per-benefit purchase among `items` of `kind`, within the budget. */
  function bestBuy(s, kind, items, value, budget) {
    let best = null;
    for (const it of items) {
      if (!isUnlocked(s, kind, it.id)) continue;
      const q = quote(s, kind, it.id, 1);
      if (q.cost > budget) continue;
      const v = value(it) / q.cost;
      if (!best || v > best.v) best = { it, v, cost: q.cost };
    }
    return best;
  }
  function scadaTick(s, d) {
    if (!s.scada.owned) return [];
    const P = s.scadaPrefs, done = [];
    const budget = () => s.cash * C.scadaBudgets[P.budget ?? 1];
    let actions = scadaScan(s);
    const act = (kind, it, why) => { buy(s, kind, it.id, 1); actions--; const m = `${why}: bought a ${it.name}`; scadaLog(s, m); done.push(m); };
    // 1. Cooling: keep the equilibrium temperature under the limit.
    while (P.cool && actions > 0 && derive(s).tempEq > d.tempLimit - 5) {
      const b = bestBuy(s, 'cooler', COOLERS, (c) => c.k, budget());
      if (!b) break;
      act('cooler', b.it, 'Oil running hot');
    }
    // 2. Pumps: no starved actuators (5% margin).
    while (P.pumps && actions > 0) {
      const dd = derive(s);
      if (dd.supply >= dd.demand * 1.05 || dd.demand === 0) break;
      const b = bestBuy(s, 'pump', PUMPS, (p) => p.gpm * milestoneMult(s.pumps[p.id] + 1), budget());
      if (!b) break;
      act('pump', b.it, 'Flow short');
    }
    // 3. Lines: put spare flow to work on the best-paying actuator that fits.
    while (P.lines && actions > 0) {
      const dd = derive(s), spare = dd.supply - dd.demand;
      const b = bestBuy(s, 'actuator', ACTUATORS.filter((a) => a.gpm <= spare), (a) => a.rate * Math.sqrt(dd.psi / a.psi), budget());
      if (!b) break;
      act('actuator', b.it, 'Spare flow');
    }
    return done;
  }

  // ---- Patent Office: Know-how → Patents once the tree is done --------------------
  const officeOpen = (s) => TECH.every((t) => s.tech[t.id]);
  const fileCost = (s, n = 0) => C.patentFileKH * C.patentFileGrowth ** ((s.patentsFiled || 0) + n);
  /** How many filings `kh` Know-how buys right now, and what they cost in total. */
  function fileQuote(s, max = Infinity) {
    let n = 0, cost = 0;
    while (n < max && cost + fileCost(s, n) <= s.kh) { cost += fileCost(s, n); n++; }
    return { n, cost };
  }
  function filePatents(s, max = 1) {
    if (!officeOpen(s)) return 0;
    const q = fileQuote(s, max);
    if (!q.n) return 0;
    s.kh -= q.cost;
    s.patents += q.n;
    s.patentsFiled = (s.patentsFiled || 0) + q.n;
    return q.n;
  }

  // ---- Shake-up: a timed, top-down reorganization ------------------------------
  // Board → executives → managers → employees. Each phase takes time and applies
  // when it ends; while it runs, incidents are likelier and the Order Line slows.

  const SHAKE_PHASES = ['board', 'cxo', 'mgr', 'staff'];
  const shakeOpen = (s) => execOpen(s);
  const shakeCost = (s, d = derive(s)) => C.shakeCostS * Math.max(1, d.production) * mods(s).costMult;
  const canShake = (s) => shakeOpen(s) && !s.shake.phase && s.shake.cooldown <= 0 && s.cash >= shakeCost(s);
  /** Everyone on a team (and managers) in the hireable departments, with where they sit. */
  function insiders(s, withMgr = true) {
    const out = [];
    for (const dept of HIREABLE) {
      const st = s.depts[dept.id];
      if (!st || !st.p0) continue;
      if (withMgr && st.mgr) out.push({ dept: dept.id, kind: 'mgr', p: st.mgr });
      st.team.forEach((p) => out.push({ dept: dept.id, kind: 'team', p }));
    }
    return out;
  }
  function takeOut(s, ref) {
    const st = s.depts[ref.dept];
    if (ref.kind === 'mgr') st.mgr = null;
    else st.team.splice(st.team.indexOf(ref.p), 1);
  }
  /** Total team strength across the company (for the before/after report). */
  const companyStrength = (s) => HIREABLE.reduce((a, d) => a + (s.depts[d.id].p0 ? strength(s.depts[d.id], d.id) * execMult(s, d.id) : 0), 0);

  function startShake(s) {
    if (!canShake(s)) return false;
    s.cash -= shakeCost(s);
    Object.assign(s.shake, { phase: 'board', left: C.shakePhaseS.board, moves: [], before: companyStrength(s), report: null });
    return true;
  }
  const move = (s, msg) => { s.shake.moves.push(msg); logExec(s, 'shake', msg); };

  const SHAKE_STEP = {
    // Board: the company's strongest leaders replace weaker directors (the seat keeps its perk).
    board(s) {
      const pool = insiders(s).sort((a, b) => leadership(b.p) - leadership(a.p));
      const seats = s.board.map((m, i) => i).sort((a, b) => leadership(s.board[a]) - leadership(s.board[b]));
      for (const i of seats) {
        const c = pool[0], m = s.board[i];
        if (!c || leadership(c.p) <= leadership(m)) break;
        pool.shift();
        takeOut(s, c);
        s.board[i] = { ...c.p, perk: m.perk };
        move(s, `Board: ${c.p.n} (LEA ${leadership(c.p)}) replaces ${m.n} (LEA ${leadership(m)})`);
      }
    },
    // Executives: the best person anywhere takes each seat; then the best President.
    cxo(s) {
      for (const x of DATA.EXECS) {
        const cur = s.execs[x.id];
        const best = insiders(s).map((c) => ({ ...c, skill: execSkill(s, x.id, c.p) })).sort((a, b) => b.skill - a.skill)[0];
        if (!best || best.skill < (cur ? execSkill(s, x.id) + 1 : 4)) continue;
        takeOut(s, best);
        s.execs[x.id] = best.p;
        if (cur) s.depts[x.depts[0]].team.push(cur);
        move(s, `${x.short}: ${best.p.n} (skill ${best.skill})${cur ? ` replaces ${cur.n}, who returns to ${DEPT[x.depts[0]].name}` : ' takes the empty seat'}`);
      }
      const pskill = (p) => Math.round((2 * leadership(p) + STAT_OF(p, DATA.PRESIDENT.stat)) / 3);
      const top = DATA.EXECS.filter((x) => s.execs[x.id]).sort((a, b) => pskill(s.execs[b.id]) - pskill(s.execs[a.id]))[0];
      if (top && canAppointPresident(s) && (!s.president || pskill(s.execs[top.id]) > pskill(s.president))) {
        const old = s.president;
        s.president = s.execs[top.id];
        s.execs[top.id] = old;
        move(s, `President: ${s.president.n}${old ? ` replaces ${old.n}, who takes the ${EXEC[top.id].short} seat` : ' is named President'}`);
      }
    },
    // Managers: every team is led by its best leader.
    mgr(s) {
      for (const dept of HIREABLE) {
        const st = s.depts[dept.id];
        if (!st.p0 || !st.team.length) continue;
        const i = st.team.reduce((b, p, k, a) => (leadership(p) > leadership(a[b]) ? k : b), 0);
        if (st.mgr && leadership(st.team[i]) <= leadership(st.mgr)) continue;
        const was = st.mgr;
        promote(s, dept.id, i);
        move(s, `${dept.name}: ${st.mgr.n} (LEA ${leadership(st.mgr)}) ${was ? `takes over from ${was.n}` : 'becomes manager'}`);
      }
    },
    // Employees: everyone moves to where they fit best; each department keeps its head count.
    staff(s) {
      const depts = HIREABLE.filter((d) => s.depts[d.id].p0);
      const slots = Object.fromEntries(depts.map((d) => [d.id, s.depts[d.id].team.length]));
      const people = depts.flatMap((d) => s.depts[d.id].team.map((p) => ({ p, from: d.id })));
      const pairs = [];
      for (const x of people) for (const d of depts) pairs.push({ x, d: d.id, e: effectiveness(x.p, d.id) });
      pairs.sort((a, b) => b.e - a.e);
      const placed = new Map();
      for (const pr of pairs) {
        if (placed.has(pr.x) || slots[pr.d] <= 0) continue;
        placed.set(pr.x, pr.d);
        slots[pr.d]--;
      }
      for (const d of depts) s.depts[d.id].team = [];
      let moved = 0;
      for (const [x, to] of placed) {
        if (to !== x.from) { moved++; if (to === 'engineering' || x.from === 'engineering') delete x.p.g; }
        if (to === 'engineering' && !x.p.g) x.p.g = leastEngTeam(s.depts.engineering);
        s.depts[to].team.push(x.p);
      }
      if (moved) move(s, `Employees: ${moved} people moved to jobs that suit them better`);
    },
  };

  function shakeTick(s, dt) {
    const sh = s.shake;
    if (sh.cooldown > 0) sh.cooldown = Math.max(0, sh.cooldown - dt);
    if (!sh.phase) return null;
    sh.left -= dt;
    if (sh.left > 0) return null;
    SHAKE_STEP[sh.phase](s);
    const next = SHAKE_PHASES[SHAKE_PHASES.indexOf(sh.phase) + 1];
    if (next) { sh.phase = next; sh.left = C.shakePhaseS[next]; return null; }
    const after = companyStrength(s);
    sh.report = { moves: sh.moves.length, change: sh.before > 0 ? after / sh.before - 1 : 0, at: Math.round(s.time) };
    sh.phase = null;
    sh.cooldown = C.shakeCooldownS;
    sh.done = (sh.done || 0) + 1;
    return sh.report;
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
    const ns = newState();
    s.execs = { ...ns.execs, ...(raw.execs || {}) };
    s.execPool = { ...ns.execPool, ...(raw.execPool || {}) };
    s.shake = { ...ns.shake, ...(raw.shake || {}) };
    s.scada = { ...ns.scada, ...(raw.scada || {}) };
    s.scadaPrefs = { ...ns.scadaPrefs, ...(raw.scadaPrefs || {}) };
    const fresh = ns.pak, rp = raw.pak || {};
    s.pak = { ...fresh, ...rp, stock: { ...fresh.stock, ...(rp.stock || {}) }, built: { ...fresh.built, ...(rp.built || {}) } };
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
    ENG_TEAMS, engTeamOf, teamStrength, setEngTeam, techCost,
    EXEC, execOpen, execOf, execSkill, presidentSkill, execMult, presidentMult, execCount, boardEff, execCandidates, fillExecPool,
    execHireCost, appointExec, dismissExec, canAppointPresident, appointPresident, execTick,
    boardOpen, boardSeatCost, fillBoardPool, electDirector, directorQuality,
    scadaReady, canBuyScada, buyScada, scadaMult, scadaScan, scadaTick,
    officeOpen, fileCost, fileQuote, filePatents,
    SHAKE_PHASES, shakeOpen, shakeCost, canShake, startShake, shakeTick, companyStrength,
    pakOpen, sysReady, pakTarget, pakNext, pakHoursRate, pakGrade, pakPrice, pakChainHours, pakIncome, setPakTarget, pakTick,
    serialize, deserialize,
  };
  root.PW = root.PW || {};
  root.PW.engine = ENGINE;
  if (typeof module !== 'undefined') module.exports = ENGINE;
})(typeof window !== 'undefined' ? window : globalThis);
