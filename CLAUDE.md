# Pressure Works — notes for contributors

- Vanilla HTML/CSS/JS with no build step and no dependencies. Scripts are classic
  `<script>` files that attach to `window.PW` (and `module.exports` in Node), so
  `index.html` works from `file://`.
- `src/engine.js` must stay DOM-free: `tools/simulate.js` runs it in Node.
- All tunable numbers live in `src/data.js`. After changing balance, run
  `node tools/simulate.js` and update the tables in `docs/ECONOMY.md`.
- Adding content to `data.js` is save-compatible: `deserialize()` merges saved
  counts over fresh defaults.
- Design intent lives in `docs/`; keep it in sync when mechanics change.
