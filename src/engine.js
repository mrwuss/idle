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
      scada: { owned: false, clock: 0, log: [], panel: {} },   // installed this run (panel upgrades too)
      scadaPrefs: { cool: false, pumps: false, lines: false, tier: false, budget: 1 }, // automation switches (kept)
      shake: { phase: null, left: 0, cooldown: 0, moves: [], before: 0, report: null, done: 0, freeUsed: false },
      pak: { target: 'valve', building: 'valve', work: 0, stock: { valve: 0, base: 0 }, built: { valve: 0, base: 0, sys: 0 }, earned: 0 },
      mgrClock: 0, mgrReviewClock: 0, presClock: 0,
      hrAuto: true, hrClock: 0, hrLog: [], // HR Director autopilot (after the first Overhaul); the switch is kept
      warp: null, warpJumps: 0, warpsDone: 0, lastWarp: null, // Time Machine (warpsDone kept)
      standards: {},           // Standards Committee: adopted standards (kept forever)
      contracts: { offers: [], active: null, clock: 0, log: [], n: 0 }, contractsDone: 0, // Pak contracts (done count kept)
      rush: 0, focus: { id: null, left: 0, cooldown: 0 }, interestEarned: 0, // department signatures
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
    for (const sd of DATA.STANDARDS) {
      if (!(s.standards && s.standards[sd.id])) continue;
      const e = sd.eff;
      if (e.actMult) m.actMult *= e.actMult;
      if (e.pumpMult) m.pumpMult *= e.pumpMult;
      if (e.costMult) m.costMult *= e.costMult;
      if (e.tempLimit) m.tempLimit += e.tempLimit;
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
    pumpLossHP *= TIERS[s.tier].lossMult || 1; // high-pressure tiers use intensifier circuits

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
    const khRate = C.khPerSqrtIncome * Math.sqrt(income) * engKhMult(s) * boardEff(s, 'khMult') * stdEff(s, 'khMult');

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
    experienceTick(s, dt);
    s.mgrClock += dt;
    if (s.mgrClock >= C.mgrEvery) { s.mgrClock = 0; managersTick(s, d); }
    s.mgrReviewClock += dt;
    if (s.mgrReviewClock >= C.mgrReviewEvery) { s.mgrReviewClock = 0; managersReview(s); }
    s.hrClock += dt;
    if (s.hrClock >= C.hrEvery) { s.hrClock = 0; hrTick(s, d); }
    pakTick(s, d, dt);
    contractsTick(s, d, dt);
    signaturesTick(s, d, dt);
    shakeTick(s, dt);
    s.scada.clock += dt;
    if (s.scada.clock >= C.scadaEvery) { s.scada.clock = 0; scadaTick(s, d); }
    s.execClock += dt;
    if (s.execClock >= C.execEvery) { s.execClock = 0; execTick(s, d); }
    s.presClock += dt;
    if (s.presClock >= C.presReviewEvery) { s.presClock = 0; presidentReview(s); }
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

  /** Era VI research is the late game: it waits for the first adopted industry Standard. */
  const eraOpen = (s, t) => !t.era || Object.keys(s.standards || {}).length > 0;
  function techAvailable(s, id) {
    const t = TECHS[id];
    return !s.tech[id] && eraOpen(s, t) && t.requires.every((r) => s.tech[r]);
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
  const canOverhaul = (s) => !s.warp && s.lifetime >= C.overhaulMin && overhaulGain(s) > 0;

  function overhaul(s) {
    if (!canOverhaul(s)) return false;
    const keep = {
      patents: s.patents + overhaulGain(s), lifetime: s.lifetime,
      overhauls: s.overhauls + 1, strokes: s.strokes, time: s.time, locations: s.locations, seed: s.seed,
      ach: s.ach, tips: s.tips, standards: s.standards || {}, contractsDone: s.contractsDone || 0, warpsDone: s.warpsDone || 0, shakeDone: s.shake && s.shake.done, freeUsed: !!(s.shake && s.shake.freeUsed), board: s.board, boardPool: s.boardPool, patentsSpent: s.patentsSpent, patentsFiled: s.patentsFiled, scadaPrefs: s.scadaPrefs,
      hrAuto: s.hrAuto !== false,
      // Leadership carries over: executives, the President, and each department's core team.
      execs: s.execs, president: s.president, execLog: s.execLog, depts: coreTeams(s),
    };
    const scada = s.scada;
    Object.assign(s, newState(), keep);
    // Standards that change how a run starts.
    if (hasStandard(s, 'opc') && scada && scada.owned) s.scada = { ...newState().scada, owned: true, panel: { ...(scada.panel || {}) } };
    if (hasStandard(s, 'layout')) { s.tier = Math.max(s.tier, 1); s.actuators.jack = 25; s.pumps.gear = 25; }
    s.shake.done = keep.shakeDone || 0;
    s.shake.freeUsed = keep.freeUsed;
    delete s.shakeDone; delete s.freeUsed;
    return true;
  }

  /**
   * What each department keeps through an Overhaul: its manager and its best
   * `keepPerDept` people (Engineering keeps its best per team). Applicants and the
   * production baseline start fresh, so hiring costs restart from the new run.
   */
  function coreTeams(s) {
    const out = freshDepts();
    for (const dept of HIREABLE) {
      const st = s.depts[dept.id];
      if (!st) continue;
      const byEff = [...st.team].sort((a, b) => effectiveness(b, dept.id) - effectiveness(a, dept.id));
      let team;
      if (dept.id === 'engineering') {
        team = [];
        for (const g of ENG_TEAMS) team.push(...byEff.filter((p) => engTeamOf(p) === g).slice(0, C.keepPerDept));
      } else team = byEff.slice(0, C.keepPerDept);
      out[dept.id] = { ...freshDept(), mgr: st.mgr, team, auto: st.auto };
    }
    return out;
  }

  /**
   * The HR Director (from the second run on) runs staffing on autopilot, so a reset
   * doesn't mean rebuilding every team by hand. Each check, in every open department:
   * the best leader runs the team, the Order Line is hired to 100% (+ a cushion) while
   * hires are cheap, support teams grow while very cheap, and the weakest person is
   * swapped for a clearly better applicant. Returns the number of actions taken.
   */
  const hrOpen = (s) => s.overhauls >= 1;
  function hrLog(s, msg) {
    s.hrLog = [{ t: s.time, m: msg }, ...(s.hrLog || [])].slice(0, 20);
  }
  function hrTick(s, d) {
    if (!hrOpen(s) || s.hrAuto === false) return 0;
    let n = 0;
    const lineIds = new Set(STAFFED.map((x) => x.id));
    for (const dept of HIREABLE) {
      const st = s.depts[dept.id];
      if (!st || !st.p0 || !departmentOpen(s, dept)) continue;
      const name = dept.name;
      // 1. Leadership: the best leader on the team manages it.
      if (st.team.length) {
        const bi = st.team.reduce((b, p, i, a) => (leadership(p) > leadership(a[b]) ? i : b), 0);
        if (!st.mgr || leadership(st.team[bi]) >= leadership(st.mgr) + C.hrLeadGap) {
          const who = st.team[bi].n;
          promote(s, dept.id, bi);
          hrLog(s, `${name}: ${who} now manages the team`);
          n++;
        }
      }
      // 2. Headcount.
      if (lineIds.has(dept.id)) {
        const o = d.order.depts[dept.id];
        for (let k = 0; k < C.hrPerCheck && o && o.coverage < 1 + C.hrCushion; k++) {
          if (hireQuote(s, dept.id, 1).cost > s.cash * C.hrBudget || !hire(s, dept.id, 1)) break;
          n++;
          if (orderLine(s, d.production).depts[dept.id].coverage >= 1 + C.hrCushion) break;
        }
      } else if (hireQuote(s, dept.id, 1).cost <= s.cash * C.hrSupportBudget && hire(s, dept.id, 1)) n++;
      // 3. Quality: swap the weakest for a clearly better applicant.
      const r = upgradeWeakest(s, dept.id, C.hrSwapGap, s.cash * C.hrSwapBudget);
      if (r) { hrLog(s, `${name}: ${r.best.n} (×${effectiveness(r.best, dept.id).toFixed(2)}) replaced ${r.weak.n} (×${effectiveness(r.weak, dept.id).toFixed(2)})`); n++; }
    }
    return n;
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
    return st && st.p0 && departmentOpen(s, DEPT[id]) ? strength(st, id) * execMult(s, id) * focusMult(s, id) : 0;
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
    return (C.incidentPerMin / 60) * (d.psi / 3000) * heat * shaking * boardEff(s, 'incidentMult') * panelEff(s, 'incidentMult') * stdEff(s, 'incidentMult')
      / (1 + C.safetyPer * openStrength(s, 'safety'));
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
    return Math.round((C.effBase + C.effPerPoint * score + bonus) * expMult(person, deptId) * 100) / 100;
  }
  /**
   * Experience: people get better the longer they work in the same department
   * (`p.x` seconds in department `p.xd`), up to +expMax. Moving to another
   * department starts it over; it travels with them through Overhaul.
   */
  const expCurve = (x) => 1 + C.expMax * (1 - Math.exp(-x / C.expTau));
  const expMult = (p, deptId) => (p && p.xd === deptId && p.x > 0 ? (p.xm || (p.xm = expCurve(p.x))) : 1);
  function experienceTick(s, dt) {
    for (const dept of HIREABLE) {
      const st = s.depts[dept.id];
      if (!st || !st.p0) continue;
      for (const p of st.mgr ? [st.mgr, ...st.team] : st.team) {
        if (p.xd !== dept.id) { p.xd = dept.id; p.x = 0; }
        p.x += dt;
        p.xm = expCurve(p.x); // cached for effectiveness()
      }
    }
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

  /**
   * Swap a department's weakest person for its best applicant when the applicant is
   * at least `gap` more effective and the fee (half a hire) is within `maxCost`.
   * The weaker person is let go. Returns { weak, best } or null.
   */
  function upgradeWeakest(s, id, gap, maxCost) {
    const st = s.depts[id];
    if (!st || !st.team.length || !st.pool.length) return null;
    const wi = st.team.reduce((b, p, i, a) => (effectiveness(p, id) < effectiveness(a[b], id) ? i : b), 0);
    const bi = st.pool.reduce((b, p, i, a) => (effectiveness(p, id) > effectiveness(a[b], id) ? i : b), 0);
    const weak = st.team[wi], best = st.pool[bi];
    if (effectiveness(best, id) < effectiveness(weak, id) + gap) return null;
    const cost = 0.5 * hireQuote(s, id, 1).cost;
    if (cost > maxCost || cost > s.cash) return null;
    s.cash -= cost;
    if (weak.g) best.g = weak.g;
    st.team[wi] = best;
    st.pool[bi] = newPerson(s);
    return { weak, best };
  }
  /** Gap a manager needs before replacing someone: smaller with more Leadership. */
  const mgrReplaceGap = (lea) => Math.max(C.mgrReplaceGapMin, C.mgrReplaceGap - C.mgrReplaceGapPer * lea);

  /** Managers (with auto-staff on) replace their weakest person when a clearly better applicant is waiting. */
  function managersReview(s) {
    const done = [];
    for (const dept of HIREABLE) {
      const st = s.depts[dept.id];
      if (!st || !st.p0 || !st.mgr || !st.auto || !departmentOpen(s, dept)) continue;
      const r = upgradeWeakest(s, dept.id, mgrReplaceGap(leadership(st.mgr)), s.cash * C.mgrReviewBudget);
      if (!r) continue;
      const msg = `${st.mgr.n} replaced ${r.weak.n} (×${effectiveness(r.weak, dept.id).toFixed(2)}) with ${r.best.n} (×${effectiveness(r.best, dept.id).toFixed(2)})`;
      logExec(s, 'mgr:' + dept.id, msg);
      done.push({ dept: dept.id, msg });
    }
    return done;
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
      const effective = (1 + strength(st, dept.id) * it * mg * execMult(s, dept.id) * focusMult(s, dept.id)) * r * disrupt;
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
      case 'warps': return s.warpsDone || 0;
      case 'contracts': return s.contractsDone || 0;
      case 'standards': return Object.keys(s.standards || {}).length;
      case 'isostatic': return psi(s) >= 15000 ? 1 : 0;
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
  /** What the line finishes and sells: an active contract's Pak, else your chosen target. */
  function pakTarget(s) {
    const c = s.contracts && s.contracts.active, t = c ? c.pak : s.pak.target;
    return t === 'sys' && !sysReady(s) ? 'base' : t;
  }
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
  const pakPrice = (s, d, id) => PAK[id].value * pakGrade(s, id) * C.pakSeconds * d.production * d.order.factor * boardEff(s, 'pakMult') * qualityPakMult(s);
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
        const c = s.contracts && s.contracts.active;
        if (c && c.pak === id && ++c.delivered >= c.qty) completeContract(s, d);
      } else P.stock[id]++;
    }
    P.building = pakNext(s);
    return sold;
  }


  // ---- Department signatures ------------------------------------------------------
  // Accounting earns interest, Quality certifies Paks, Warehouse fills a Rush Ship
  // buffer and buys contract time, Inside Sales brings more contract offers, and
  // Management can Focus one department.

  const deptS = (s, id) => openStrength(s, id);
  const qualityPakMult = (s) => 1 + Math.min(C.qualityPakMax, C.qualityPakPer * deptS(s, 'quality'));
  const warehouseTimeMult = (s) => 1 + Math.min(C.warehouseTimeMax, C.warehouseTimePer * deptS(s, 'warehouse'));
  const insideSpeed = (s) => 1 + C.insideSpeedPer * deptS(s, 'inside_sales');
  const offerSlots = (s) => Math.min(6, C.contractOffers + Math.floor(deptS(s, 'inside_sales') / C.insideOfferPer));
  /** Accounting: interest per second on cash, capped at a share of income. */
  const interestRate = (s, d) => Math.min(s.cash * C.interestPer * deptS(s, 'accounting'), d.income * C.interestCapIncome);
  const rushFillS = (s) => C.rushFillS / (1 + C.rushFillPer * deptS(s, 'warehouse'));
  const rushOpen = (s) => departmentOpen(s, DEPT.warehouse) && !!s.depts.warehouse.p0;
  const rushValue = (s, d = derive(s)) => C.rushSeconds * d.production * d.order.factor;
  const canRush = (s) => rushOpen(s) && s.rush >= 1;
  function rushShip(s) {
    if (!canRush(s)) return 0;
    const v = rushValue(s);
    s.cash += v; s.runEarnings += v; s.lifetime += v;
    s.rush = 0;
    return v;
  }
  const focusOpen = (s) => deptS(s, 'management') >= C.focusMinMgmt;
  const focusMult = (s, id) => (s.focus && s.focus.id === id && s.focus.left > 0 ? 2 : 1);
  const canFocus = (s, id) => focusOpen(s) && !!DEPT[id] && departmentOpen(s, DEPT[id]) && !(s.focus.left > 0) && !(s.focus.cooldown > 0);
  function setFocus(s, id) {
    if (!canFocus(s, id)) return false;
    s.focus = { id, left: C.focusS, cooldown: 0 };
    return true;
  }
  function signaturesTick(s, d, dt) {
    const i = interestRate(s, d) * dt;
    if (i > 0) { s.cash += i; s.runEarnings += i; s.lifetime += i; s.interestEarned = (s.interestEarned || 0) + i; }
    if (rushOpen(s)) s.rush = Math.min(1, (s.rush || 0) + dt / rushFillS(s));
    const f = s.focus;
    if (f.left > 0) { f.left -= dt; if (f.left <= 0) { f.left = 0; f.cooldown = C.focusCooldownS; } }
    else if (f.cooldown > 0) { f.cooldown = Math.max(0, f.cooldown - dt); if (!f.cooldown) f.id = null; }
  }

  // ---- Sys-Pak contracts --------------------------------------------------------
  // Clients in your open locations offer timed Pak orders. Accept one: the line
  // builds that Pak, each one still sells as usual, and delivering the lot on time
  // pays a bonus that grows with the region's customer base. Miss the deadline and
  // the bonus is lost (the Paks already sold stay sold).

  const contractLog = (s, m) => { s.contracts.log.unshift({ t: Math.round(s.time), m }); if (s.contracts.log.length > 12) s.contracts.log.length = 12; };
  function newOffer(s) {
    const rate = pakHoursRate(s);
    if (rate <= 0) return null;
    const regions = DATA.REGIONS.filter((r) => s.locations[r.id]);
    const r = regions[Math.floor(rand(s) * regions.length)];
    const market = r.markets[Math.floor(rand(s) * r.markets.length)];
    const names = DATA.CLIENTS[market] || ['A regional OEM'];
    const paks = sysReady(s) ? ['valve', 'base', 'sys', 'sys'] : ['valve', 'base', 'base'];
    const pak = paks[Math.floor(rand(s) * paks.length)];
    const [t0, t1] = C.contractTimeS;
    const time = Math.round((t0 + rand(s) * (t1 - t0)) * warehouseTimeMult(s) / 60) * 60;
    const unitS = pakChainHours(pak) / rate;
    const qty = Math.max(1, Math.min(999, Math.round((time * C.contractLoad) / unitS)));
    if (qty * unitS > time * 0.9) return null; // can't be done in time even with one
    return { id: ++s.contracts.n, client: names[Math.floor(rand(s) * names.length)], market, region: r.id, pak, qty, time,
      bonusMult: C.contractBonus * (1 + customerBase(s, r.id) / C.contractRegionPer) };
  }
  /** What delivering a contract on time pays on top of selling the Paks (at today's prices). */
  const contractBonus = (s, d, c) => c.bonusMult * c.qty * pakPrice(s, d, c.pak);
  function contractsTick(s, d, dt) {
    const K = s.contracts;
    if (!pakOpen(s)) return;
    K.clock += dt;
    if (K.clock >= C.contractEvery / insideSpeed(s) || (!K.offers.length && pakHoursRate(s) > 0)) {
      K.clock = 0;
      const o = newOffer(s);
      if (o) { K.offers.push(o); while (K.offers.length > offerSlots(s)) K.offers.shift(); }
    }
    const c = K.active;
    if (c) {
      c.left -= dt;
      if (c.left <= 0) {
        contractLog(s, `Missed: ${c.client} (${c.delivered}/${c.qty} ${PAK[c.pak].name}s). The bonus is lost.`);
        K.active = null;
      }
    }
  }
  function acceptContract(s, id) {
    const K = s.contracts, i = K.offers.findIndex((o) => o.id === id);
    if (K.active || i < 0) return false;
    const o = K.offers.splice(i, 1)[0];
    K.active = { ...o, left: o.time, delivered: 0 };
    contractLog(s, `Accepted: ${o.qty} ${PAK[o.pak].name}${o.qty > 1 ? 's' : ''} for ${o.client}`);
    return true;
  }
  function abandonContract(s) {
    const c = s.contracts.active;
    if (!c) return false;
    contractLog(s, `Walked away from ${c.client} (${c.delivered}/${c.qty} delivered).`);
    s.contracts.active = null;
    return true;
  }
  function completeContract(s, d) {
    const c = s.contracts.active, bonus = contractBonus(s, d, c);
    s.cash += bonus; s.runEarnings += bonus; s.lifetime += bonus; s.pak.earned += bonus;
    s.contractsDone = (s.contractsDone || 0) + 1;
    contractLog(s, `Delivered: ${c.qty} ${PAK[c.pak].name}${c.qty > 1 ? 's' : ''} to ${c.client}, bonus $${fmtNum(bonus)}`);
    s.contracts.last = { client: c.client, bonus, at: Math.round(s.time) };
    s.contracts.active = null;
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
        const r = upgradeWeakest(s, id, gap, budget());
        if (r) act(id, `${DEPT[id].name}: replaced ${r.weak.n} (×${effectiveness(r.weak, id).toFixed(2)}) with ${r.best.n} (×${effectiveness(r.best, id).toFixed(2)})`);
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




  /**
   * The President reviews the C-suite: a vacant seat goes to the best person in its
   * division (skill presFillSkill+), and a seated executive is replaced when someone
   * in the division would be clearly better. The outgoing executive takes the
   * newcomer's old job. One change per review; a better President needs less of a gap.
   */
  const presReplaceGap = (s) => Math.max(1, C.presReplaceGap - Math.floor(presidentSkill(s) / 4));
  function presidentReview(s) {
    if (!s.president || !execOpen(s)) return null;
    const gap = presReplaceGap(s);
    for (const x of DATA.EXECS) {
      const c = execCandidates(s, x.id)[0], cur = s.execs[x.id];
      if (!c) continue;
      let msg;
      if (!cur) {
        if (c.skill < C.presFillSkill) continue;
        appointExec(s, x.id, c);
        msg = `named ${c.p.n} (skill ${c.skill}) ${x.short}`;
      } else {
        const now = execSkill(s, x.id);
        if (c.skill < now + gap) continue;
        const st = s.depts[c.dept];
        if (c.kind === 'mgr') st.mgr = cur; else st.team[c.idx] = cur;
        if (c.dept === 'engineering' && !ENG_TEAMS.includes(cur.g)) cur.g = c.p.g || leastEngTeam(st);
        s.execs[x.id] = c.p;
        msg = `${c.p.n} (skill ${c.skill}) replaces ${cur.n} (skill ${now}) as ${x.short}; ${firstName(cur.n)} returns to ${DEPT[c.dept].name}${c.kind === 'mgr' ? ' as manager' : ''}`;
        logExec(s, x.id, `${c.p.n} takes the ${x.short} seat from ${cur.n}`);
      }
      logExec(s, 'pres', msg);
      return msg;
    }
    return null;
  }
  const firstName = (n) => String(n).split(' ')[0];

  /**
   * The Chair (the strongest director) keeps an eye out: when someone in the company
   * leads clearly better than the weakest other director, they propose a swap at a
   * fraction of that seat's price. The seat keeps its perk; the old director retires.
   */
  function boardProposal(s) {
    if (!boardOpen(s) || (s.board || []).length < 2) return null;
    const idx = s.board.map((m, i) => i);
    const chair = idx.reduce((a, b) => (leadership(s.board[b]) > leadership(s.board[a]) ? b : a));
    const seat = idx.filter((i) => i !== chair).reduce((a, b) => (leadership(s.board[b]) < leadership(s.board[a]) ? b : a));
    const c = insiders(s).sort((a, b) => leadership(b.p) - leadership(a.p))[0];
    const m = s.board[seat];
    if (!c || leadership(c.p) < leadership(m) + C.boardReplaceGap) return null;
    const cost = Math.max(1, Math.ceil(DATA.BOARD_COSTS[seat] * C.boardReplaceCost));
    return { chair: s.board[chair], seat, out: m, cand: c, cost };
  }
  function replaceDirector(s) {
    const pr = boardProposal(s);
    if (!pr || s.patents < pr.cost) return false;
    s.patents -= pr.cost;
    s.patentsSpent = (s.patentsSpent || 0) + pr.cost;
    takeOut(s, pr.cand);
    delete pr.cand.p.g;
    s.board[pr.seat] = { ...pr.cand.p, perk: pr.out.perk };
    logExec(s, 'board', `${pr.cand.p.n} (LEA ${leadership(pr.cand.p)}) replaces ${pr.out.n} (LEA ${leadership(pr.out)}) on the Board`);
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
  /** Operator-panel effects: multiplied (or, with `add`, summed) across the upgrades bought. */
  function panelEff(s, key, add = false) {
    let v = add ? 0 : 1;
    if (!s.scada || !s.scada.owned) return v;
    for (const u of DATA.SCADA_PANEL) {
      const e = s.scada.panel && s.scada.panel[u.id] ? u.eff[key] : null;
      if (e != null) v = add ? v + e : v * e;
    }
    return v;
  }
  const hasPanel = (s, id) => !!(s.scada && s.scada.owned && s.scada.panel && s.scada.panel[id]);
  /** The next operator-panel upgrade on offer (they're bought in order), or null. */
  const nextPanel = (s) => (s.scada && s.scada.owned ? DATA.SCADA_PANEL.find((u) => !hasPanel(s, u.id)) || null : null);
  const canBuyPanel = (s, id) => { const u = nextPanel(s); return !!u && u.id === id && s.kh >= u.kh; };
  function buyPanel(s, id) {
    if (!canBuyPanel(s, id)) return false;
    const u = nextPanel(s);
    s.kh -= u.kh;
    s.scada.panel = { ...(s.scada.panel || {}), [id]: true };
    scadaLog(s, `Operator panel: ${u.name} commissioned`);
    return true;
  }
  const scadaMult = (s) => {
    if (!s.scada || !s.scada.owned) return 1;
    const m = panelEff(s, 'tuneMult');
    return 1 + panelEff(s, 'tunePlus', true) + Math.min(C.scadaTuneMax * m, C.scadaTunePer * m * teamStrength(s, 'controls'));
  };
  const scadaScan = (s) => 1 + Math.floor(teamStrength(s, 'controls') / 3) + panelEff(s, 'scanPlus', true);
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
  /** A duration in seconds as words: 45s, 12 min, 3.5 h, 9 days, 1.9 years. */
  function fmtDur(sec) {
    if (!Number.isFinite(sec)) return 'forever';
    if (sec < 60) return `${Math.round(sec)}s`;
    if (sec < 3600) return `${Math.round(sec / 60)} min`;
    if (sec < 86400) return `${(sec / 3600).toFixed(1)} h`;
    if (sec < 365 * 86400) return `${Math.round(sec / 86400)} days`;
    return `${fmtNum(sec / (365 * 86400))} years`;
  }
  /** Short numbers for log lines (the engine has no access to the UI's fmt()). */
  function fmtNum(v) {
    const a = Math.abs(v);
    if (a < 1000) return a < 10 ? v.toFixed(1) : String(Math.round(v));
    if (a >= 1e15) return v.toExponential(2).replace('e+', 'e');
    const k = Math.floor(Math.log10(a) / 3);
    return (v / 1000 ** k).toFixed(2) + ['', 'K', 'M', 'B', 'T'][k];
  }
  /**
   * The purchase with the best production gain per $ among what the SCADA switches
   * allow, within `budget`: lines (bundled with the pumps to feed them), pumps for a
   * starved plant, coolers, and the next pressure tier. Gains are measured with
   * derive() on the sustained plant (accumulator empty, oil at its equilibrium
   * temperature), so milestones, starvation, heat and relief all count, and a
   * charged accumulator can't hide a flow shortage. Null if nothing pays.
   */
  function sustained(s) {
    const c = s.accCharge;
    s.accCharge = 0;
    const p = derive(s, { steady: true }).production;
    s.accCharge = c;
    return p;
  }
  const art = (n) => (/^[AEIOU]/i.test(n) ? 'an ' : 'a ') + n;
  function bestGrowth(s, P, budget) {
    const base = derive(s), bp = sustained(s), cash = Math.min(budget, s.cash);
    let best = null;
    const consider = (label, items, tier) => {
      let cost = tier ? nextTier(s).cost * mods(s).costMult : 0;
      for (const [kind, id, n] of items) cost += quote(s, kind, id, n).cost;
      if (!(cost > 0) || cost > cash) return;
      for (const [kind, id, n] of items) s[KINDS[kind][0]][id] += n;
      if (tier) s.tier++;
      const gain = sustained(s) - bp;
      for (const [kind, id, n] of items) s[KINDS[kind][0]][id] -= n;
      if (tier) s.tier--;
      if (gain > 0 && (!best || gain / cost > best.gain / best.cost)) best = { label, items, tier, gain, cost };
    };
    const pumpsOk = PUMPS.filter((p) => isUnlocked(s, 'pump', p.id));
    const pumpGpm = (p) => p.gpm * base.m.pumpMult * milestoneMult(s.pumps[p.id] + 1);
    const perDollar = (p) => pumpGpm(p) / quote(s, 'pump', p.id, 1).cost;
    const feeder = pumpsOk.reduce((b, p) => (!b || perDollar(p) > perDollar(b) ? p : b), null);
    if (P.lines) {
      for (const a of ACTUATORS) {
        if (!isUnlocked(s, 'actuator', a.id)) continue;
        const short = base.demand + a.gpm - base.supply;
        if (short <= 0) consider(`bought ${art(a.name)}`, [['actuator', a.id, 1]]);
        else if (P.pumps && feeder) {
          const k = Math.ceil(short / pumpGpm(feeder));
          consider(`bought ${art(a.name)} + ${k} ${feeder.name}${k > 1 ? 's' : ''} to feed it`, [['actuator', a.id, 1], ['pump', feeder.id, k]]);
        }
      }
    }
    if (P.pumps && base.supply < base.demand) for (const p of pumpsOk) consider(`bought ${art(p.name)} (flow short)`, [['pump', p.id, 1]]);
    if (P.cool) for (const c of COOLERS) if (isUnlocked(s, 'cooler', c.id)) consider(`bought ${art(c.name)} (heat was costing output)`, [['cooler', c.id, 1]]);
    if (P.tier) { const t = nextTier(s); if (t && (!t.requires || s.tech[t.requires])) consider(`raised pressure to ${t.name}`, [], true); }
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
    // While the Order Line caps income, more machines earn nothing: hold growth and say why.
    const o = d.order, held = o.factor < 0.999 && o.bottleneck;
    const hold = held ? `Holding growth: Order Line at ${Math.round(o.factor * 100)}%, ${DEPT[o.bottleneck].name} is short-staffed` : '';
    if ((P.pumps || P.lines || P.tier) && hold !== (s.scada.hold || '')) { if (hold || s.scada.hold) scadaLog(s, hold || 'Order Line clear: growth resumes'); s.scada.hold = hold; }
    // 2. Growth: price every option the switches allow, measure what each adds to
    //    production, and buy the best gain per $ that fits the budget; repeat while
    //    actions remain. A new line that would outrun the flow comes bundled with the
    //    pumps to feed it (when Auto-pumps is on).
    let grew = false;
    while (!held && actions > 0 && (P.pumps || P.lines || P.tier || P.cool)) {
      const best = bestGrowth(s, P, budget());
      if (!best) break;
      // Even the best buy can be a bad one late in a run (the 500th press costs a fortune
      // and adds a sliver): hold the cash rather than buy something that won't pay back.
      const payback = best.cost / best.gain;
      if (payback > C.scadaMaxPaybackS) {
        const idle = `Holding cash: the best buy (${best.label.replace(/^bought /, '')}) would take ${fmtDur(payback)} to pay back (limit ${fmtDur(C.scadaMaxPaybackS)})`;
        if (!s.scada.idle) scadaLog(s, idle);
        s.scada.idle = idle;
        break;
      }
      s.scada.idle = '';
      for (const [kind, id, n] of best.items) buy(s, kind, id, n);
      if (best.tier) upgradeTier(s);
      actions--; grew = true;
      const m = `Best return: ${best.label} · +$${fmtNum(best.gain)}/s for $${fmtNum(best.cost)} (pays back in ${fmtDur(payback)})`;
      scadaLog(s, m); done.push(m);
    }
    // 3. Accumulator: no steady revenue of its own, so only when no revenue buy fits.
    if (P.tier && !grew && actions > 0 && accUpgradeCost(s) <= budget() && upgradeAccumulator(s)) {
      actions--; const m = `Accumulator: upgraded to level ${s.accLevel}`; scadaLog(s, m); done.push(m);
    }
    return done;
  }

  // ---- Patent Office: Know-how → Patents once the tree is done --------------------
  const officeOpen = (s) => TECH.filter((t) => !t.era).every((t) => s.tech[t.id]); // Era VI research isn't required
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

  // ---- Standards Committee: the second prestige layer -----------------------------
  // Spend Patents (gone for good, like Board seats) on standards that change the
  // rules forever. They survive every Overhaul.
  const STD = byId(DATA.STANDARDS);
  const hasStandard = (s, id) => !!(s.standards && s.standards[id]);
  /** Standards' perks multiply across what's adopted (or, for flags, are simply on). */
  function stdEff(s, key) {
    let v = 1;
    for (const sd of DATA.STANDARDS) if (hasStandard(s, sd.id) && sd.eff[key] != null) v *= sd.eff[key];
    return v;
  }
  const standardsOpen = (s) => boardOpen(s);
  const standardCost = (s) => Math.round(C.standardBase * C.standardGrowth ** Object.keys(s.standards || {}).length);
  const canAdopt = (s, id) => standardsOpen(s) && !!STD[id] && !hasStandard(s, id) && s.patents >= standardCost(s);
  function adoptStandard(s, id) {
    if (!canAdopt(s, id)) return false;
    const cost = standardCost(s);
    s.patents -= cost;
    s.patentsSpent = (s.patentsSpent || 0) + cost;
    s.standards = { ...(s.standards || {}), [id]: true };
    return true;
  }

  // ---- Time Machine: jump ahead and play the time out ---------------------------
  // Paid in Know-how. The skipped time runs through the real game loop (in steps of
  // up to 15 s so a whole day finishes in a few seconds), so managers hire, executives
  // act, SCADA buys, Paks are built and incidents happen just as if you'd waited.

  const warpOpen = (s) => s.overhauls >= 1 || s.lifetime >= 1e9;
  function warpCost(s, hours, d = derive(s)) {
    const perHour = Math.max(C.warpKhPerHourMin, d.khRate * C.warpKhRateS);
    return hours * perHour * C.warpGrowth ** (s.warpJumps || 0);
  }
  const canWarp = (s, hours) => warpOpen(s) && !s.warp && C.warpHours.includes(hours) && s.kh >= warpCost(s, hours);
  function startWarp(s, hours) {
    if (!canWarp(s, hours)) return false;
    s.kh -= warpCost(s, hours);
    s.warpJumps = (s.warpJumps || 0) + 1;
    const total = hours * 3600;
    s.warp = { hours, total, left: total, dt: Math.max(1, total / C.warpMaxTicks),
      from: { lifetime: s.lifetime, kh: s.kh, cash: s.cash, actuators: Object.values(s.actuators).reduce((a, b) => a + b, 0) } };
    return true;
  }
  /**
   * Catch up on time away by playing it out like a Time Machine jump (free): the
   * away time × the offline rate (50%, or 100% with Telematics), capped by the
   * offline hours. Managers, executives, SCADA and the Pak line all run. Returns the
   * seconds it will simulate, or 0 if there's nothing to do.
   */
  function startCatchUp(s, seconds) {
    if (s.warp || !(seconds > 60)) return 0;
    const m = mods(s);
    const sim = Math.min(seconds, m.offlineCapH * 3600) * m.offlineRate;
    if (sim < 30) return 0;
    s.surgeLeft = 0;
    s.warp = { hours: sim / 3600, total: sim, left: sim, dt: Math.max(1, sim / C.warpMaxTicks), offline: true, away: seconds, rate: m.offlineRate,
      from: { lifetime: s.lifetime, kh: s.kh, cash: s.cash, actuators: Object.values(s.actuators).reduce((a, b) => a + b, 0) } };
    return sim;
  }
  /** Advance a jump by up to `maxSteps` steps. Returns the report when it finishes. */
  function warpStep(s, maxSteps = 200) {
    const w = s.warp;
    if (!w) return null;
    for (let i = 0; i < maxSteps && w.left > 0; i++) {
      const dt = Math.min(w.dt, w.left);
      tick(s, dt);
      w.left -= dt;
    }
    if (w.left > 0) return null;
    s.warp = null;
    const report = { hours: w.hours, earned: s.lifetime - w.from.lifetime, kh: s.kh - w.from.kh, cash: s.cash - w.from.cash,
      lines: Object.values(s.actuators).reduce((a, b) => a + b, 0) - w.from.actuators, at: Math.round(s.time),
      offline: !!w.offline, away: w.away, rate: w.rate };
    if (w.offline) return report;
    s.warpsDone = (s.warpsDone || 0) + 1;
    s.lastWarp = report;
    return report;
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
    Object.assign(s.shake, { phase: 'board', left: C.shakePhaseS.board, moves: [], before: shakeScore(s).inc, report: null });
    return true;
  }
  const move = (s, msg) => { s.shake.moves.push(msg); logExec(s, 'shake', msg); };

  // ---- Goal seek: every seat in the company, valued by what it does for output ----
  // A "slot" is a place a person can sit: a Board seat, an executive seat, the
  // President's chair, a department's manager seat or a team position. The search
  // swaps people between slots (or fills an empty seat) and keeps a move only if the
  // company is no worse on any measure and better on at least one, ranked by income.

  /** What a reorganization is judged on. Income (steady, no surge) plus Pak sales is primary. */
  function shakeScore(s) {
    const surge = s.surgeLeft; s.surgeLeft = 0;
    const d = derive(s, { steady: true });
    const v = { inc: d.income + pakIncome(s, d), kh: d.khRate, risk: incidentRate(s, d),
      ctl: teamStrength(s, 'controls'), cost: mods(s).costMult };
    s.surgeLeft = surge;
    return v;
  }
  const rel = (a, b) => (b ? (a - b) / Math.abs(b) : a > 0 ? 1 : 0);
  /** Weighted gain of `v` over `base`, or -Infinity if anything got worse. */
  function shakeGain(v, base) {
    const g = { inc: rel(v.inc, base.inc), kh: rel(v.kh, base.kh), ctl: rel(v.ctl, base.ctl),
      risk: -rel(v.risk, base.risk), cost: -rel(v.cost, base.cost) };
    if (Object.values(g).some((x) => x < -1e-9)) return -Infinity;
    const w = g.inc + 0.5 * g.kh + 0.25 * g.ctl + 0.5 * g.risk + 0.5 * g.cost;
    return w > 1e-9 ? w : -Infinity;
  }
  /** True if `v` is no worse than `base` on every measure. */
  const noWorse = (v, base) => v.inc >= base.inc * (1 - 1e-9) && v.kh >= base.kh * (1 - 1e-9) && v.ctl >= base.ctl - 1e-9
    && v.risk <= base.risk * (1 + 1e-9) + 1e-12 && v.cost <= base.cost * (1 + 1e-9);

  const slotKey = (sl) => `${sl.k}:${sl.d ?? sl.id ?? ''}:${sl.i ?? ''}`;
  function allSlots(s) {
    const out = [];
    (s.board || []).forEach((m, i) => out.push({ k: 'board', i }));
    if (execOpen(s)) {
      for (const x of DATA.EXECS) out.push({ k: 'exec', id: x.id });
      out.push({ k: 'pres' });
    }
    for (const dept of HIREABLE) {
      const st = s.depts[dept.id];
      if (!st || !st.p0) continue;
      out.push({ k: 'mgr', d: dept.id });
      st.team.forEach((p, i) => out.push({ k: 'team', d: dept.id, i }));
    }
    return out;
  }
  function slotGet(s, sl) {
    if (sl.k === 'board') return s.board[sl.i];
    if (sl.k === 'exec') return s.execs[sl.id];
    if (sl.k === 'pres') return s.president;
    if (sl.k === 'mgr') return s.depts[sl.d].mgr;
    return s.depts[sl.d].team[sl.i];
  }
  function slotSet(s, sl, p) {
    if (sl.k === 'board') s.board[sl.i] = p;
    else if (sl.k === 'exec') s.execs[sl.id] = p;
    else if (sl.k === 'pres') s.president = p;
    else if (sl.k === 'mgr') s.depts[sl.d].mgr = p;
    else s.depts[sl.d].team[sl.i] = p;
  }
  /** `p` as they would sit in `sl`: a Board seat keeps its perk; Engineering keeps its sub-team. */
  function seatAs(p, sl, prev) {
    const { perk, ...q } = p;
    if (sl.k === 'board') q.perk = prev.perk;
    if (sl.d === 'engineering') q.g = prev && ENG_TEAMS.includes(prev.g) ? prev.g : (ENG_TEAMS.includes(q.g) ? q.g : 'design');
    return q;
  }
  /** Try moving b's person into a (and a's, if any, into b). Returns an undo, or null if not allowed. */
  function trySwap(s, a, b) {
    const pa = slotGet(s, a), pb = slotGet(s, b);
    if (!pb || pa === pb) return null;
    // People saved before stats existed (early directors) can't hold a working job.
    if (!Array.isArray(pb.s) && a.k !== 'board') return null;
    if (pa && !Array.isArray(pa.s) && b.k !== 'board') return null;
    if (a.k === 'pres' && !pa && !canAppointPresident(s)) return null;
    if (b.k === 'board' && !pa) return null;          // a Board seat can't be left empty
    if (b.k === 'team' && !pa) {                        // filling an empty seat from a team
      const st = s.depts[b.d];
      slotSet(s, a, seatAs(pb, a, null));
      st.team.splice(b.i, 1);
      return () => { st.team.splice(b.i, 0, pb); slotSet(s, a, null); };
    }
    slotSet(s, a, seatAs(pb, a, pa));
    slotSet(s, b, pa ? seatAs(pa, b, pb) : null);
    return () => { slotSet(s, a, pa); slotSet(s, b, pb); };
  }
  const who = (s, sl) => {
    if (sl.k === 'board') return `Board (${PERK[slotGet(s, sl).perk].name})`;
    if (sl.k === 'exec') return EXEC[sl.id].short;
    if (sl.k === 'pres') return 'President';
    if (sl.k === 'mgr') return `${DEPT[sl.d].name} manager`;
    return DEPT[sl.d].name;
  };
  /**
   * Hill-climb: for each target slot of this phase, try the most promising people from
   * anywhere in the company (ranked by `rank`), keep the best improving move, repeat
   * until nothing helps. Returns the moves made, described.
   */
  function goalSeek(s, targets, rank, { k = 10, rounds = 6 } = {}) {
    const made = [];
    for (let r = 0; r < rounds; r++) {
      let improved = false;
      for (const tgtKey of targets(s).map(slotKey)) {
        const slots = allSlots(s), a = slots.find((sl) => slotKey(sl) === tgtKey);
        if (!a) continue;
        const base = shakeScore(s), cur = slotGet(s, a);
        const cands = slots.filter((b) => slotKey(b) !== tgtKey && slotGet(s, b) && Array.isArray(slotGet(s, b).s) && (b.k !== 'board' || cur))
          .map((b) => ({ b, r: rank(s, a, slotGet(s, b)) })).sort((x, y) => y.r - x.r).slice(0, k);
        let best = null;
        for (const { b } of cands) {
          const undo = trySwap(s, a, b);
          if (!undo) continue;
          const g = shakeGain(shakeScore(s), base);
          undo();
          if (g > (best ? best.g : 0)) best = { b, g };
        }
        if (!best) continue;
        const pb = slotGet(s, best.b), from = who(s, best.b), to = who(s, a);
        trySwap(s, a, best.b);
        improved = true;
        made.push(`${pb.n}: ${from} → ${to}${cur ? `; ${cur.n} → ${best.b.k === 'team' || best.b.k === 'mgr' ? from : from}` : ''} (+${(best.g * 100).toFixed(1)}%)`);
      }
      if (!improved) break;
    }
    return made;
  }
  // How promising a person looks for a slot (cheap; the real test is shakeScore).
  const pskill = (p) => Math.round((2 * leadership(p) + STAT_OF(p, DATA.PRESIDENT.stat)) / 3);
  const RANK = {
    board: (s, a, p) => leadership(p),
    exec: (s, a, p) => (a.k === 'pres' ? pskill(p) : execSkill(s, a.id, p)),
    mgr: (s, a, p) => 2 * leadership(p) + effectiveness(p, a.d),
  };

  const SHAKE_STEP = {
    // Board: anyone in the company may take a seat (the seat keeps its perk).
    board(s) {
      goalSeek(s, (x) => allSlots(x).filter((sl) => sl.k === 'board'), RANK.board).forEach((m) => move(s, `Board: ${m}`));
    },
    // Executives and the President: the person anywhere who does the most for output.
    cxo(s) {
      goalSeek(s, (x) => allSlots(x).filter((sl) => sl.k === 'exec' || sl.k === 'pres'), RANK.exec).forEach((m) => move(s, `C-suite: ${m}`));
    },
    // Managers: any leader in the company may take any team.
    mgr(s) {
      goalSeek(s, (x) => allSlots(x).filter((sl) => sl.k === 'mgr'), RANK.mgr, { k: 12, rounds: 4 }).forEach((m) => move(s, `Managers: ${m}`));
      // A manager also hires and reviews the team, which output can't show: fill any
      // seat still empty with the team's best leader, as long as nothing gets worse.
      for (const dept of HIREABLE) {
        const st = s.depts[dept.id];
        if (!st.p0 || st.mgr || !st.team.length) continue;
        const base = shakeScore(s);
        const i = st.team.reduce((b, p, k, a) => (leadership(p) > leadership(a[b]) ? k : b), 0), p = st.team[i];
        const undo = trySwap(s, { k: 'mgr', d: dept.id }, { k: 'team', d: dept.id, i });
        if (noWorse(shakeScore(s), base)) { st.auto = true; move(s, `Managers: ${p.n} leads ${dept.name}`); } else undo();
      }
    },
    // Employees: pairwise swaps between departments, the most promising first, until
    // no swap helps (head counts stay the same).
    staff(s) {
      let moved = 0, gain = 0;
      for (let iter = 0; iter < 400; iter++) {
        const team = allSlots(s).filter((sl) => sl.k === 'team');
        const fit = new Map(team.map((sl) => [sl, effectiveness(slotGet(s, sl), sl.d)]));
        const pairs = [];
        for (let i = 0; i < team.length; i++) for (let j = i + 1; j < team.length; j++) {
          const a = team[i], b = team[j];
          if (a.d === b.d) continue;
          const pa = slotGet(s, a), pb = slotGet(s, b);
          const h = effectiveness(pb, a.d) + effectiveness(pa, b.d) - fit.get(a) - fit.get(b);
          if (h > 1e-9) pairs.push({ a, b, h });
        }
        pairs.sort((x, y) => y.h - x.h);
        const base = shakeScore(s);
        let best = null;
        for (const pr of pairs.slice(0, 60)) {
          const undo = trySwap(s, pr.a, pr.b);
          const g = shakeGain(shakeScore(s), base);
          undo();
          if (g > (best ? best.g : 0)) best = { ...pr, g };
        }
        if (!best) break;
        trySwap(s, best.a, best.b);
        moved++; gain += best.g;
      }
      if (moved) move(s, `Employees: ${moved} swap${moved === 1 ? '' : 's'} between departments (+${(gain * 100).toFixed(1)}%)`);
    },
  };

  /** The one-time gift: the whole goal-seek at once, free, with no disruption and no cooldown. */
  const canFreeShake = (s) => shakeOpen(s) && !s.shake.phase && !s.shake.freeUsed;
  function freeShake(s) {
    if (!canFreeShake(s)) return null;
    const sh = s.shake;
    Object.assign(sh, { moves: [], before: shakeScore(s).inc, report: null });
    for (const ph of SHAKE_PHASES) SHAKE_STEP[ph](s);
    const after = shakeScore(s).inc;
    sh.report = { moves: sh.moves.length, change: sh.before > 0 ? after / sh.before - 1 : 0, at: Math.round(s.time), free: true };
    sh.freeUsed = true;
    sh.done = (sh.done || 0) + 1;
    return sh.report;
  }

  function shakeTick(s, dt) {
    const sh = s.shake;
    if (sh.cooldown > 0) sh.cooldown = Math.max(0, sh.cooldown - dt);
    if (!sh.phase) return null;
    sh.left -= dt;
    if (sh.left > 0) return null;
    SHAKE_STEP[sh.phase](s);
    const next = SHAKE_PHASES[SHAKE_PHASES.indexOf(sh.phase) + 1];
    if (next) { sh.phase = next; sh.left = C.shakePhaseS[next]; return null; }
    const after = shakeScore(s).inc;
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
    techAvailable, research, click, canSurge, surge, hrOpen, hrTick, coreTeams, expMult,
    patentsTotal, overhaulGain, canOverhaul, overhaul, opensMet, departmentOpen, regionOpen, checkLocations, customerBase, currentEra,
    orderLine, snapshotDepts, hireQuote, hire, hirePerson, rerollPool, rerollCost, staffLineQuote, staffLine,
    effectiveness, headcount, strength, strokeGal, STAFFED, HIREABLE,
    leadership, mgrBonus, poolSize, promote, setAuto, managersTick, managersReview, upgradeWeakest, mgrReplaceGap, engKhMult, canBuyEng, buyEng,
    itMult, mgmtMult, mgmtPool, purchasingDiscount, incidentRate, safeDays, safetyStreakMult, achievementMult,
    achStat, checkAchievements,
    ENG_TEAMS, engTeamOf, teamStrength, setEngTeam, techCost,
    EXEC, execOpen, execOf, execSkill, presidentSkill, execMult, presidentMult, execCount, boardEff, execCandidates, fillExecPool,
    execHireCost, appointExec, dismissExec, canAppointPresident, appointPresident, execTick,
    boardOpen, boardSeatCost, fillBoardPool, electDirector, directorQuality, boardProposal, replaceDirector, presidentReview, presReplaceGap,
    scadaReady, canBuyScada, buyScada, scadaMult, scadaScan, scadaTick, bestGrowth, sustained, fmtDur, panelEff, hasPanel, nextPanel, canBuyPanel, buyPanel,
    officeOpen, fileCost, fileQuote, filePatents,
    warpOpen, warpCost, canWarp, startWarp, warpStep, startCatchUp,
    qualityPakMult, warehouseTimeMult, insideSpeed, offerSlots, interestRate, rushFillS, rushOpen, rushValue, canRush, rushShip,
    focusOpen, focusMult, canFocus, setFocus,
    acceptContract, abandonContract, contractBonus, contractsTick, newOffer,
    standardsOpen, standardCost, canAdopt, adoptStandard, hasStandard, stdEff,
    SHAKE_PHASES, shakeOpen, shakeCost, canShake, startShake, shakeTick, canFreeShake, freeShake, companyStrength, shakeScore,
    pakOpen, sysReady, pakTarget, pakNext, pakHoursRate, pakGrade, pakPrice, pakChainHours, pakIncome, setPakTarget, pakTick,
    serialize, deserialize,
  };
  root.PW = root.PW || {};
  root.PW.engine = ENGINE;
  if (typeof module !== 'undefined') module.exports = ENGINE;
})(typeof window !== 'undefined' ? window : globalThis);
