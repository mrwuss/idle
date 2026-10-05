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

  // Time away is played out for real (managers, executives, SCADA, Paks) at the offline
  // rate, in the background like a Time Machine jump; the report comes when it's done.
  const away = (Date.now() - (state.lastSeen || Date.now())) / 1000;
  if (away > 60 && !state.warp) {
    const sim = E.startCatchUp(state, away);
    if (sim) UI.toast(`Welcome back. Catching up on ${fmtTime(away)} away…`, 3000); // the report replaces it when done
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
    const b = ev.target.closest('[data-scada-buy], [data-rush], [data-focus], [data-contract], [data-contract-drop], [data-standard], [data-warp], [data-scada-panel], [data-scada-auto], [data-scada-budget], [data-file], [data-shake], [data-shake-free], [data-hire], [data-hire-best], [data-reroll], [data-promote], [data-auto], [data-eng], [data-engteam], [data-pak-target], [data-exec-appoint], [data-exec-hire], [data-exec-dismiss], [data-exec-pres], [data-board-elect], [data-board-replace]');
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
    if (b.dataset.rush) {
      const v = E.rushShip(state);
      SFX.play(v ? 'location' : 'cant');
      if (v) UI.toast(`<b>Rush Ship!</b> The warehouse cleared its buffer: +$${fmt(v)}.`, 3500);
      return render();
    }
    if (b.dataset.focus) {
      const ok = E.setFocus(state, b.dataset.focus);
      SFX.play(ok ? 'upgrade' : 'cant');
      if (ok) UI.toast(`<b>Management focus:</b> ${E.DATA.DEPARTMENTS.find((x) => x.id === b.dataset.focus).name} works ×2 for ${Math.round(E.DATA.CONSTANTS.focusS / 60)} minutes.`, 3500);
      return render();
    }
    if (b.dataset.contract) {
      const ok = E.acceptContract(state, Number(b.dataset.contract));
      SFX.play(ok ? 'upgrade' : 'cant');
      return render();
    }
    if (b.dataset.contractDrop) { E.abandonContract(state); SFX.play('tab', 0.6); return render(); }
    if (b.dataset.standard) {
      const sd = E.DATA.STANDARDS.find((x) => x.id === b.dataset.standard);
      const ok = E.adoptStandard(state, sd.id);
      SFX.play(ok ? 'location' : 'cant');
      if (ok) UI.toast(`<b>${sd.code} adopted.</b> ${sd.desc}`, 5000);
      return render();
    }
    if (b.dataset.warp) {
      const ok = E.startWarp(state, Number(b.dataset.warp));
      SFX.play(ok ? 'location' : 'cant');
      return render();
    }
    if (b.dataset.shakeFree) {
      const r = E.freeShake(state);
      SFX.play(r ? 'location' : 'cant');
      if (r) UI.toast(`<b>Reorg complete:</b> ${r.moves} move${r.moves === 1 ? '' : 's'}, income ${r.change >= 0 ? '+' : ''}${(r.change * 100).toFixed(1)}%. That was your free one.`, 6000);
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
    if (b.dataset.scadaPanel) {
      const u = E.nextPanel(state), ok = E.buyPanel(state, b.dataset.scadaPanel);
      SFX.play(ok ? 'research' : 'cant');
      if (ok) UI.toast(`<b>${u.name}</b> is online in the control room.`, 3500);
      else if (u) UI.toast(`<b>${u.name}</b> needs ${fmt(u.kh)} Know-how (you have ${fmt(state.kh)}).`, 3000);
      return render();
    }
    if (b.dataset.boardReplace != null) {
      const pr = E.boardProposal(state);
      const ok = pr && E.replaceDirector(state);
      SFX.play(ok ? 'research' : 'cant');
      if (ok) UI.toast(`<b>${pr.cand.p.n}</b> takes ${pr.out.n}'s Board seat.`, 3500);
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

  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('[data-hr-toggle]')) return;
    state.hrAuto = state.hrAuto === false;
    UI.toast(state.hrAuto ? 'HR Director is running staffing.' : 'HR Director is off: staffing is up to you.');
    render();
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
  // ---- Moving a save between browsers (and between the artifact and GitHub Pages) ----
  // Codes are "PW2:" + base64url(gzip(json)) where CompressionStream exists (about 4×
  // smaller, short enough to ride in a link), else the old plain base64 of the JSON.
  // Import accepts both.
  const PAGES_URL = 'https://mrwuss.github.io/idle/';
  const b64url = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64url = (str) => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function encodeSave() {
    const json = E.serialize(state);
    if (root.CompressionStream) {
      try { return 'PW2:' + b64url(await pipe(new TextEncoder().encode(json), new CompressionStream('gzip'))); } catch (err) { /* fall through */ }
    }
    return btoa(unescape(encodeURIComponent(json)));
  }
  async function decodeSave(code) {
    code = String(code || '').trim().replace(/^.*#save=/, '');
    if (code.startsWith('PW2:')) {
      if (!root.DecompressionStream) throw new Error('This browser cannot read compressed saves.');
      return new TextDecoder().decode(await pipe(unb64url(code.slice(4)), new DecompressionStream('gzip')));
    }
    return decodeURIComponent(escape(atob(code)));
  }
  /** Load a save code, then play out the time since it was made (like coming back from away). */
  async function importCode(code, where = 'Save') {
    try {
      const next = E.deserialize(await decodeSave(code));
      state = next;
      const away = (Date.now() - (state.lastSeen || Date.now())) / 1000;
      save();
      UI.toast(`${where} imported.${away > 60 && E.startCatchUp(state, away) ? ` Catching up on ${fmtTime(away)} since it was saved…` : ''}`, 4000);
      render();
      return true;
    } catch (err) {
      UI.toast('That does not look like a Pressure Works save.');
      return false;
    }
  }
  const onPages = /github\.io$/.test(location.hostname);
  if (onPages) $('btn-open-pages').hidden = true;
  $('save-move-note').textContent = onPages
    ? 'You are on the web version. To bring a save from the Claude artifact, open the artifact\'s Logbook and tap "Open in GitHub Pages".'
    : 'Open in GitHub Pages carries this save in the link; the web version asks before importing it. If that tab is blocked, copy the code (or download the file) and import it there.';
  // Keep the link's save fresh so a plain tap carries the current game.
  async function refreshPagesLink() {
    if (onPages) return;
    try { $('btn-open-pages').href = `${PAGES_URL}#save=${await encodeSave()}`; } catch (err) { /* leave the plain link */ }
  }
  $('btn-open-pages').addEventListener('pointerdown', () => { save(); refreshPagesLink(); });
  $('btn-open-pages').addEventListener('focus', refreshPagesLink);
  setInterval(() => { if (document.querySelector('[data-body="settings"]:not([hidden])')) refreshPagesLink(); }, 5000);
  refreshPagesLink();

  $('btn-export').addEventListener('click', async () => {
    $('save-text').value = await encodeSave();
    $('save-text').select();
  });
  $('btn-copy-save').addEventListener('click', async () => {
    const code = await encodeSave();
    $('save-text').value = code;
    try { await navigator.clipboard.writeText(code); UI.toast('Save code copied. Paste it into Import on the other copy.'); }
    catch (err) { $('save-text').select(); UI.toast('Copying is blocked here: the code is selected in the box below, copy it from there.'); }
  });
  $('btn-download-save').addEventListener('click', async () => {
    const code = await encodeSave();
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
      a.download = `pressure-works-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (err) { $('save-text').value = code; UI.toast('Downloads are blocked here: copy the code from the box below instead.'); }
  });
  $('btn-import').addEventListener('click', () => importCode($('save-text').value));
  $('btn-paste').addEventListener('click', async () => {
    try { const code = await navigator.clipboard.readText(); $('save-text').value = code; importCode(code); }
    catch (err) { UI.toast('Pasting is blocked here: paste into the box, then press Import.'); $('save-text').focus(); }
  });
  $('file-save').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (f) importCode(await f.text(), 'Save file');
    ev.target.value = '';
  });
  // A save sent in the link (#save=…): ask before replacing this browser's game.
  if (/^#save=/.test(location.hash)) {
    const code = location.hash.slice(6), box = $('import-offer');
    try { history.replaceState(null, '', location.pathname + location.search); } catch (err) { /* ignore */ }
    box.hidden = false;
    box.innerHTML = `<h3>Import this save?</h3><p>The link you opened carries a Pressure Works save. Importing replaces the game saved in this browser${state.lifetime > 0 ? ` (lifetime $${fmt(state.lifetime)})` : ''}.</p>
      <div class="row-btns"><button class="btn primary" id="btn-offer-yes">Import it</button><button class="btn" id="btn-offer-no">Keep this browser's game</button></div>`;
    UI.setTab && UI.setTab('settings');
    $('btn-offer-yes').addEventListener('click', async () => { if (await importCode(code, 'Linked save')) box.hidden = true; });
    $('btn-offer-no').addEventListener('click', () => { box.hidden = true; });
  }
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
  function render() {
    derived = UI.render(state);
    if (derived && SFX.ambient) SFX.ambient({ gpm: derived.supply, util: derived.utilization, relief: derived.supply > 0 ? derived.overRelief / derived.supply : 0, surging: derived.surging });
  }

  setInterval(() => {
    const now = performance.now();
    let dt = (now - lastTick) / 1000;
    lastTick = now;
    // A Time Machine jump runs in slices of ~40 ms so the screen keeps updating.
    if (state.warp) {
      let r = null;
      while (!r && state.warp && performance.now() - now < 40) r = E.warpStep(state, 20);
      lastTick = performance.now();
      if (r) {
        save();
        UI.toast(r.offline
          ? `While you were away (${fmtTime(r.away)}) the shop earned <b>$${fmt(r.earned)}</b> and <b>${fmt(r.kh)} KH</b> at ${Math.round(r.rate * 100)}% efficiency${r.lines > 0 ? `; SCADA added ${fmt(r.lines, 0)} lines` : ''}.`
          : `<b>Jumped ahead ${r.hours} h.</b> Earned $${fmt(r.earned)} and ${fmt(r.kh)} Know-how${r.lines > 0 ? `; ${fmt(r.lines, 0)} new lines` : ''}.`, 7000);
      }
      return;
    }
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
    setTimeout(() => UI.toast(`<b>Shake-up complete:</b> ${r.moves} move${r.moves === 1 ? '' : 's'}, income ${r.change >= 0 ? '+' : ''}${(r.change * 100).toFixed(1)}%.`, 6000), 1500);
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

  // Phones: the dock grows with the system font size, so measure it and let the
  // page (and the bars stacked above the tab bar) make room for what's really there.
  const phone = root.matchMedia ? root.matchMedia('(max-width: 760px)') : null;
  function syncDock() {
    const css = document.documentElement.style;
    if (!phone || !phone.matches) { ['--tabs-h', '--act-full', '--qty-full'].forEach((v) => css.removeProperty(v)); return; }
    const h = (id) => { const el = document.querySelector(id); return el && !el.hidden && getComputedStyle(el).display !== 'none' ? el.offsetHeight : 0; }; // fixed elements have no offsetParent
    css.setProperty('--tabs-h', `${h('.tabs')}px`);
    css.setProperty('--act-full', `${h('.actions')}px`);
    css.setProperty('--qty-full', `${h('#buyqty')}px`);
  }
  if (root.ResizeObserver) {
    const ro = new ResizeObserver(syncDock);
    ['.tabs', '.actions', '#buyqty'].forEach((q) => { const el = document.querySelector(q); if (el) ro.observe(el); });
  }
  root.addEventListener('resize', syncDock);
  if (phone && phone.addEventListener) phone.addEventListener('change', syncDock);
  syncDock();

  root.PW.debug = { get state() { return state; }, save };
})(window);
