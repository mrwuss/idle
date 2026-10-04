/*
 * Pressure Works — sound effects.
 *
 * Short CC0 clips from Kenney (see CREDITS.md), converted to MP3 and
 * volume-matched. Plain <audio> elements are used so the game still works
 * from file:// (Web Audio would need fetch, which file:// blocks).
 */
(function (root) {
  'use strict';

  // Event → file(s) in assets/audio. An array picks a random variant.
  const SOUNDS = {
    stroke: ['stroke-1', 'stroke-2', 'stroke-3'],
    buy: 'buy',
    cant: 'cant',
    tab: 'tab',
    upgrade: 'upgrade',
    research: 'research',
    surge: 'surge',
    overheat: 'overheat',
    location: 'location',
    overhaul: 'overhaul',
  };
  const MASTER = 0.5;
  const MIN_GAP_MS = 60; // keyboard auto-repeat shouldn't machine-gun a sound
  const MUTE_KEY = 'pressure-works-muted';

  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (err) { /* storage blocked */ }

  const base = {}, lastPlayed = {};
  function element(file) {
    if (!base[file]) {
      base[file] = new Audio(`assets/audio/${file}.mp3`);
      base[file].preload = 'auto';
    }
    return base[file];
  }

  function play(id, volume = 1) {
    if (muted || !SOUNDS[id]) return;
    const now = performance.now();
    if (now - (lastPlayed[id] || 0) < MIN_GAP_MS) return;
    lastPlayed[id] = now;
    const files = [].concat(SOUNDS[id]);
    const a = element(files[Math.floor(Math.random() * files.length)]).cloneNode();
    a.volume = Math.min(1, MASTER * volume);
    a.play().catch(() => { /* autoplay blocked until the first interaction */ });
  }

  function setMuted(value) {
    muted = !!value;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (err) { /* storage blocked */ }
  }

  // ---- Ambient: a pump hum that follows flow, and a hiss when the relief valve dumps.
  // Synthesized with Web Audio (no files to fetch, so it works from file:// too).
  // Starts on the first tap (browsers require a gesture) and stays quiet under the effects.
  let ac = null, humGain, hum, hum2, hissGain;
  function startAmbient() {
    if (ac || !(root.AudioContext || root.webkitAudioContext)) return;
    try {
      ac = new (root.AudioContext || root.webkitAudioContext)();
      const out = ac.createGain(); out.gain.value = MASTER; out.connect(ac.destination);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      humGain = ac.createGain(); humGain.gain.value = 0;
      hum = ac.createOscillator(); hum.type = 'sawtooth'; hum.frequency.value = 90;
      hum2 = ac.createOscillator(); hum2.type = 'triangle'; hum2.frequency.value = 180;
      hum.connect(lp); hum2.connect(lp); lp.connect(humGain); humGain.connect(out);
      const len = ac.sampleRate, buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      const noise = ac.createBufferSource(); noise.buffer = buf; noise.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 6;
      hissGain = ac.createGain(); hissGain.gain.value = 0;
      noise.connect(bp); bp.connect(hissGain); hissGain.connect(out);
      hum.start(); hum2.start(); noise.start();
    } catch (err) { ac = null; }
  }
  if (typeof document !== 'undefined') {
    const go = () => { startAmbient(); if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); };
    document.addEventListener('pointerdown', go, { passive: true });
    document.addEventListener('keydown', go);
    document.addEventListener('visibilitychange', () => {
      if (!ac) return;
      if (document.hidden) ac.suspend().catch(() => {}); else ac.resume().catch(() => {});
    });
  }
  /** Called a few times a second: gpm supplied, share of demand met, share of flow dumped, surging. */
  function ambient({ gpm = 0, util = 0, relief = 0, surging = false } = {}) {
    if (!ac) return;
    const now = ac.currentTime, on = !muted && gpm > 0;
    const f = 70 + 22 * Math.log10(1 + gpm) + (surging ? 25 : 0);
    hum.frequency.setTargetAtTime(f, now, 0.4);
    hum2.frequency.setTargetAtTime(f * 2.01, now, 0.4);
    humGain.gain.setTargetAtTime(on ? 0.05 * (0.5 + 0.5 * Math.min(1, util)) : 0, now, 0.3);
    hissGain.gain.setTargetAtTime(on && relief > 0 ? 0.03 * Math.min(1, 0.3 + relief) : 0, now, 0.2);
  }

  // Warm the cache so the first click isn't silent while the file loads.
  for (const f of Object.values(SOUNDS).flat()) element(f);

  root.PW = root.PW || {};
  root.PW.audio = { play, setMuted, ambient, get muted() { return muted; } };
})(window);
