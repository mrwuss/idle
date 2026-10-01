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

  $('btn-stroke').addEventListener('click', (ev) => {
    const gain = E.click(state);
    SFX.play('stroke', 0.8);
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
  let wasSurging = state.surgeLeft > 0, hotArmed = true;
  function soundCues() {
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
