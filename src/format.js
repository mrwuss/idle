/* Number and time formatting shared by the UI and tools. */
(function (root) {
  'use strict';

  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  function fmt(n, digits = 2) {
    if (!isFinite(n)) return '∞';
    if (n < 0) return '-' + fmt(-n, digits);
    if (n < 1000) return n < 10 && n % 1 ? n.toFixed(digits) : n < 100 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
    const tier = Math.floor(Math.log10(n) / 3);
    if (tier >= SUFFIXES.length) return n.toExponential(2).replace('+', '');
    const v = n / 1000 ** tier;
    return v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0) + SUFFIXES[tier];
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
    return `${s}s`;
  }

  const FORMAT = { fmt, fmtTime };
  root.PW = root.PW || {};
  root.PW.format = FORMAT;
  if (typeof module !== 'undefined') module.exports = FORMAT;
})(typeof window !== 'undefined' ? window : globalThis);
