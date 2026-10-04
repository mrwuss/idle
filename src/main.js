/*
 * Pressure Works — bootstrap: load/save, the game loop, and input wiring.
 */
(function (root) {
  'use strict';

  const E = root.PW.engine, UI = root.PW.ui, SFX = root.PW.audio;
  const { fmt, fmtTime } = root.PW.format;
  const SAVE_KEY = 'pressure-works-save';
  const $ = (id) => document.getElementById(id);

  // ---- Load ---------------------------------------------------------------

  let state;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    state = raw ? E.deserialize(raw) : E.newState();
  } catch (err) {
    console.warn('Could not load save, starting fresh.', err);
    state = E.newState();
  }

  const away = (Date.now() - (state.lastSeen || Date.now())) / 1000;
  if (away > 60) {
    const r = E.applyOffline(state, away);
    if (r && r.earned > 0) {
      setTimeout(() => UI.toast(`While you were away (${fmtTime(r.seconds)}) the shop earned
        <b>$${fmt(r.earned)}</b> and <b>${fmt(r.kh)} KH</b> at ${Math.round(r.rate * 100)}% efficiency.`, 7000), 300);
    }
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, E.serialize(state)); } catch (err) { /* storage full or blocked */ }
  }

  // ---- Wiring ---------------------------------------------------------------

  UI.init({
    strokeFromMachine() { $('btn-stroke').click(); },
    openFromMachine(tab, id, dept) {
      UI.setTab(tab);
      SFX.play('tab', 0.6);
      render();
      if (id) UI.focusItem('actuator', id);
      if (dept) UI.focusDept(dept);
    },
    hire(id) {
      if (E.hire(state, id, UI.qty)) { SFX.play('buy'); render(); } else SFX.play('cant');
    },
    buy(kind, id) {
      if (E.buy(state, kind, id, UI.qty)) { SFX.play('buy'); render(); } else SFX.play('cant');
    },
    research(id) {
      if (E.research(state, id)) {
        SFX.play('research');
        UI.toast(`Researched <b>${E.DATA.TECH.find((t) => t.id === id).name}</b>.`);
        render();
      }
    },
  });

  // Hiring buttons inside re-rendered department cards.
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-scada-buy], [data-scada-auto], [data-scada-budget], [data-file], [data-shake], [data-hire], [data-hire-best], [data-reroll], [data-promote], [data-auto], [data-eng], [data-engteam], [data-pak-target], [data-exec-appoint], [data-exec-hire], [data-exec-dismiss], [data-exec-pres], [data-board-elect]');
    if (!b || b.disabled) return;
    if (b.dataset.scadaBuy) {
      const ok = E.buyScada(state);
      SFX.play(ok ? 'location' : 'cant');
      if (ok) UI.toast('<b>SCADA online.</b> Loop tuning is live; switch on autonomous control when you want it.', 5000);
      return render();
    }
    if (b.dataset.scadaAuto) { state.scadaPrefs[b.dataset.scadaAuto] = !state.scadaPrefs[b.dataset.scadaAuto]; SFX.play('tab', 0.6); return render(); }
    if (b.dataset.scadaBudget) { state.scadaPrefs.budget = Number(b.dataset.scadaBudget); SFX.play('tab', 0.6); return render(); }
    if (b.dataset.file) {
      const n = E.filePatents(state, b.dataset.file === 'max' ? Infinity : 1);
      SFX.play(n ? 'research' : 'cant');
      if (n) UI.toast(`Filed <b>${n}</b> patent${n === 1 ? '' : 's'}. You now hold <b>${state.patents}</b> (+${state.patents * 10}% income).`, 3500);
      return render();
    }
    if (b.dataset.shake) {
      const ok = E.startShake(state);
      SFX.play(ok ? 'upgrade' : 'cant');
      if (ok) UI.toast('<b>Shake-up started.</b> Board first, then executives, managers and employees. Expect a rough few minutes.', 5000);
      return render();
    }
    const X = E.DATA.EXECS.find((x) => x.id === (b.dataset.execAppoint || b.dataset.execHire || b.dataset.execDismiss || b.dataset.execPres));
    if (b.dataset.execAppoint || b.dataset.execHire) {
      const src = b.dataset.execHire ? { pool: Number(b.dataset.idx) } : { dept: b.dataset.dept, kind: b.dataset.kind, idx: Number(b.dataset.idx) };
      const ok = E.appointExec(state, X.id, src);
      SFX.play(ok ? 'upgrade' : 'cant');
      if (ok) UI.toast(`<b>${state.execs[X.id].n}</b> is your new ${X.short}. They'll start running ${X.depts.length} departments right away.`, 4500);
      return render();
    }
    if (b.dataset.execDismiss) { E.dismissExec(state, X.id); SFX.play('tab', 0.6); return render(); }
    if (b.dataset.execPres) {
      if (E.appointPresident(state, X.id)) { SFX.play('location'); UI.toast(`<b>${state.president.n}</b> is the President of IFP MSI.`, 4500); UI.openDept('exec:pres'); }
      return render();
    }
    if (b.dataset.boardElect != null) {
      const c = state.boardPool[Number(b.dataset.boardElect)];
      const ok = E.electDirector(state, Number(b.dataset.boardElect));
      SFX.play(ok ? 'research' : 'cant');
      if (ok) UI.toast(`<b>${c.n}</b> joins the Board.`, 3500);
      return render();
    }
    if (b.dataset.engteam) {
      const who = b.dataset.who === 'mgr' ? 'mgr' : Number(b.dataset.who);
      if (E.setEngTeam(state, who, b.dataset.engteam)) SFX.play('tab', 0.6);
      return render();
    }
    if (b.dataset.pakTarget) {
      if (E.setPakTarget(state, b.dataset.pakTarget)) SFX.play('upgrade');
      return render();
    }
    if (b.dataset.promote) {
      const p = state.depts[b.dataset.promote].team[Number(b.dataset.idx)];
      if (E.promote(state, b.dataset.promote, Number(b.dataset.idx))) {
        SFX.play('upgrade');
        UI.toast(`<b>${p.n}</b> is now the ${E.DATA.DEPARTMENTS.find((x) => x.id === b.dataset.promote).name} manager.`, 3500);
      }
      return render();
    }
    if (b.dataset.auto) { E.setAuto(state, b.dataset.auto, !state.depts[b.dataset.auto].auto); SFX.play('tab', 0.6); return render(); }
    if (b.dataset.eng) {
      const ok = E.buyEng(state, b.dataset.eng);
      SFX.play(ok ? 'research' : 'cant');
      if (ok) UI.toast(`Built <b>${E.DATA.ENG_UPGRADES.find((u) => u.id === b.dataset.eng).name}</b>.`);
      return render();
    }
    let ok = false, who = null;
    if (b.dataset.hire) {
      const st = state.depts[b.dataset.hire], p = st.pool[Number(b.dataset.idx)];
      ok = E.hirePerson(state, b.dataset.hire, Number(b.dataset.idx));
      if (ok) who = p.n;
    } else if (b.dataset.hireBest) ok = E.hire(state, b.dataset.hireBest, UI.qty);
    else if (b.dataset.reroll) ok = E.rerollPool(state, b.dataset.reroll);
    SFX.play(ok ? (b.dataset.reroll ? 'tab' : 'buy') : 'cant');
    if (who) UI.toast(`Welcome aboard, <b>${who}</b>.`, 2500);
    render();
  });

  // Upgrade buttons inside re-rendered cards.
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    if (b.dataset.act === 'tier' && E.upgradeTier(state)) {
      SFX.play('upgrade');
      UI.toast(`System re-rated to <b>${E.DATA.TIERS[state.tier].name}</b>: ${fmt(E.DATA.TIERS[state.tier].psi)} psi.`);
    }
    if (b.dataset.act === 'acc' && E.upgradeAccumulator(state)) SFX.play('upgrade');
    render();
  });

  $('btn-staff-line').addEventListener('click', () => {
    if (E.staffLine(state)) { SFX.play('upgrade'); UI.toast('Order Line fully staffed.'); render(); } else SFX.play('cant');
  });

  $('btn-stroke').addEventListener('click', (ev) => {
    const gain = E.click(state);
    SFX.play('stroke', 0.8);
    root.PW.machine.stroke();
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX || rect.left + rect.width / 2, y = ev.clientY || rect.top;
    UI.floater(x - 10 + Math.random() * 20, y - 20, `+$${fmt(gain)}`);
    render();
  });
  $('btn-surge').addEventListener('click', () => { if (E.surge(state)) render(); });
  document.addEventListener('keydown', (ev) => {
    if (ev.target.tagName === 'TEXTAREA') return;
    if (ev.code === 'Space') { ev.preventDefault(); $('btn-stroke').click(); }
    if (ev.key === 's' || ev.key === 'S') $('btn-surge').click();
    if (ev.key === 'm' || ev.key === 'M') $('btn-mute').click();
  });
  document.addEventListener('click', (ev) => { if (ev.target.closest('.tabs [data-tab]')) SFX.play('tab', 0.6); });

  function showMute() {
    $('btn-mute').setAttribute('aria-pressed', SFX.muted);
    $('btn-mute').title = SFX.muted ? 'Sound off (M to toggle)' : 'Sound on (M to toggle)';
  }
  $('btn-mute').addEventListener('click', () => { SFX.setMuted(!SFX.muted); showMute(); SFX.play('tab', 0.6); });
  showMute();

  // Destructive buttons ask for a second click instead of confirm(), which
  // some embedded viewers block (it silently returns false there).
  function armed(btn, prompt) {
    if (btn.dataset.armed === '1') { clearTimeout(btn._disarm); btn.dataset.armed = ''; btn.textContent = btn._label; return true; }
    btn._label = btn.textContent;
    btn.dataset.armed = '1';
    btn.textContent = prompt;
    btn._disarm = setTimeout(() => { btn.dataset.armed = ''; btn.textContent = btn._label; }, 4000);
    return false;
  }

  $('btn-overhaul').addEventListener('click', (ev) => {
    const gain = E.overhaulGain(state);
    if (!armed(ev.currentTarget, `Click again: overhaul for ${gain} patent${gain === 1 ? '' : 's'}`)) return;
    if (E.overhaul(state)) {
      SFX.play('overhaul');
      save();
      UI.toast(`Shop overhauled. You now hold <b>${state.patents}</b> patents (+${state.patents * 10}% income).`);
      UI.setTab('actuators');
      render();
    }
  });

  $('btn-save').addEventListener('click', () => { save(); UI.toast('Saved.'); });
  $('btn-export').addEventListener('click', () => {
    $('save-text').value = btoa(unescape(encodeURIComponent(E.serialize(state))));
    $('save-text').select();
  });
  $('btn-import').addEventListener('click', () => {
    try {
      state = E.deserialize(decodeURIComponent(escape(atob($('save-text').value.trim()))));
      save();
      UI.toast('Save imported.');
      render();
    } catch (err) {
      UI.toast('That does not look like an IFP MSI save.');
    }
  });
  $('btn-reset').addEventListener('click', (ev) => {
    if (!armed(ev.currentTarget, 'Click again to erase everything')) return;
    state = E.newState();
    save();
    render();
  });
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  // ---- Loop -----------------------------------------------------------------
  // Simulation ticks at 10 Hz on wall-clock time, so background-tab throttling
  // just means bigger steps. Lists re-render at 5 Hz; gauges animate per frame.

  let derived = null, lastTick = performance.now(), lastFrame = performance.now();
  function render() { derived = UI.render(state); }

  setInterval(() => {
    const now = performance.now();
    let dt = (now - lastTick) / 1000;
    lastTick = now;
    // Long gaps (sleeping laptop) are handled in chunks to keep temperature stable.
    while (dt > 0) { const step = Math.min(dt, 1); E.tick(state, step); dt -= step; }
    soundCues();
  }, 100);

  // Sounds for things that happen on their own: any Surge starting (manual or
  // PLC), and the oil crossing its temperature limit (re-armed 5°F below).
  let wasSurging = state.surgeLeft > 0, hotArmed = true, lastIncident = null;
  function soundCues() {
    const inc = state.safety && state.safety.incident;
    if (inc && inc !== lastIncident) SFX.play('overheat');
    lastIncident = inc;
    const surging = state.surgeLeft > 0;
    if (surging && !wasSurging) SFX.play('surge');
    wasSurging = surging;
    const limit = E.mods(state).tempLimit;
    if (hotArmed && state.temp > limit) { SFX.play('overheat'); hotArmed = false; }
    if (state.temp < limit - 5) hotArmed = true;
  }
  // New locations are announced once, the moment the company grows into them.
  function announceLocations() {
    for (const r of E.checkLocations(state)) {
      const states = E.DATA.STATES.filter((st) => st.region === r.id).map((st) => st.offshore ? 'the Gulf' : st.id);
      SFX.play('location');
      UI.toast(`<b>New location!</b> IFP MSI ${r.name} opens in <b>${r.branch}</b>, covering ${states.join(', ')}.`, 8000);
    }
  }
  // Departments open on their own as the company grows; announce each once.
  const announcedDepts = new Set(E.STAFFED.filter((d) => state.depts[d.id].p0).map((d) => d.id));
  function announceDepts() {
    for (const d of E.STAFFED) {
      if (!state.depts[d.id].p0 || announcedDepts.has(d.id)) continue;
      announcedDepts.add(d.id);
      SFX.play('research');
      UI.toast(`<b>${d.name}</b> is open. You're covering it yourself for now; hire on the Company tab as production grows.`, 6000);
    }
  }
  setInterval(announceDepts, 1000);

  // Shake-up finished: report it once.
  let shakesSeen = state.shake ? state.shake.done : 0;
  setInterval(() => {
    if (!state.shake || state.shake.done === shakesSeen) return;
    shakesSeen = state.shake.done;
    const r = state.shake.report;
    SFX.play('location');
    // Achievements announce on the same tick; show the report just after them.
    setTimeout(() => UI.toast(`<b>Shake-up complete:</b> ${r.moves} move${r.moves === 1 ? '' : 's'}, team strength ${r.change >= 0 ? '+' : ''}${(r.change * 100).toFixed(1)}%.`, 6000), 1500);
  }, 1000);

  // Achievements: checked once a second, each announced once (+1% income).
  E.checkAchievements(state); // award silently after load or offline progress
  setInterval(() => {
    const got = E.checkAchievements(state);
    if (!got.length) return;
    SFX.play('research');
    UI.toast(`<b>Achievement:</b> ${got.map((a) => a.name).join(', ')} <span class="muted">(+${got.length}% income)</span>`, 5000);
  }, 1000);

  // First-time tips: each explains a mechanic the first time it bites. Shown
  // one at a time, and only while no other toast is up.
  const TIPS = [
    { id: 'starve', when: (s, d) => d.demand > 0 && d.utilization < 0.98 && s.accCharge <= 0,
      msg: '<b>Flow-starved.</b> Your actuators want more GPM than the pumps give, so they slow down. Buy pumps until the flow bar balances.' },
    { id: 'relief', when: (s, d) => d.overRelief > 0,
      msg: '<b>Relief valve dumping.</b> Spare flow with a full accumulator goes over relief as pure heat. Add actuators to use it, or a bigger accumulator.' },
    { id: 'hot', when: (s, d) => s.temp > d.tempLimit,
      msg: '<b>Oil too hot.</b> Above its limit the oil thins and income drops. Buy coolers on the System tab.' },
    { id: 'surge', when: (s) => E.canSurge(s) && !E.mods(s).autoSurge,
      msg: '<b>Accumulator full.</b> Press <b>Surge</b> (or S) to dump it for a burst of extra income.' },
    { id: 'tech', when: (s) => E.DATA.TECH.some((t) => E.techAvailable(s, t.id) && s.kh >= E.techCost(s, t.id)),
      msg: '<b>Research ready.</b> You have enough Know-how for a technology. Open the R&D tab.' },
    { id: 'tier', when: (s) => E.canUpgradeTier(s),
      msg: '<b>Pressure upgrade affordable.</b> Higher psi unlocks new actuators and makes every line pay more. See the System tab.' },
    { id: 'scada', when: (s) => E.scadaReady(s),
      msg: '<b>SCADA available.</b> Your Controls team can install a supervisory system: trends, alarms, loop tuning and autonomous control. Tap SCADA on the control panel.' },
    { id: 'office', when: (s) => E.officeOpen(s),
      msg: '<b>Research complete!</b> The Patent Office on the R&D tab now turns Know-how into Patents: +10% income each, forever.' },
    { id: 'engineering', when: (s) => E.pakOpen(s),
      msg: '<b>Engineering is open.</b> Engineers join a team: Design (Know-how), Controls (cheaper Controls research) or Project (builds Paks you sell). Tap a face on the Company tab to see their ID and move them.' },
    { id: 'execs', when: (s) => E.execOpen(s),
      msg: '<b>Executives are available.</b> A CFO, COO, CRO or CTO runs a whole division on their own: managers, hiring, replacing weak staff. See Leadership on the Company tab.' },
    { id: 'promote', when: (s) => E.HIREABLE.some((x) => !s.depts[x.id].mgr && E.headcount(s.depts[x.id]) >= 4),
      msg: '<b>Time for a manager.</b> Promote someone with high Leadership on the Company tab; managers boost their team and keep it staffed.' },
  ];
  setInterval(() => {
    if (!derived || !$('toast').hidden) return;
    const tip = TIPS.find((t) => !state.tips[t.id] && t.when(state, derived));
    if (!tip) return;
    state.tips[tip.id] = true;
    UI.toast(tip.msg, 8000);
  }, 1000);
  E.checkLocations(state); // catch up silently after load or offline progress
  setInterval(announceLocations, 1000);
  setInterval(render, 200);
  setInterval(save, 10000);

  function frame(now) {
    UI.animate(state, derived, Math.min(0.1, (now - lastFrame) / 1000));
    lastFrame = now;
    requestAnimationFrame(frame);
  }
  render();
  requestAnimationFrame(frame);

  root.PW.debug = { get state() { return state; }, save };
})(window);
