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

  // Warm the cache so the first click isn't silent while the file loads.
  for (const f of Object.values(SOUNDS).flat()) element(f);

  root.PW = root.PW || {};
  root.PW.audio = { play, setMuted, get muted() { return muted; } };
})(window);
