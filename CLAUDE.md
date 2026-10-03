# Pressure Works — notes for contributors

- Vanilla HTML/CSS/JS with no build step and no dependencies. Scripts are classic
  `<script>` files that attach to `window.PW` (and `module.exports` in Node), so
  `index.html` works from `file://`.
- `src/engine.js` must stay DOM-free: `tools/simulate.js` and `tests/` run it in Node.
  Run `npm test` (node:test, no dependencies) after engine changes.
- All tunable numbers live in `src/data.js`. After changing balance, run
  `node tools/simulate.js` and update the tables in `docs/ECONOMY.md`.
- Adding content to `data.js` is save-compatible: `deserialize()` merges saved
  counts over fresh defaults.
- Design intent lives in `docs/`; keep it in sync when mechanics change.
- Third-party assets: CC0 only, commit just the files used, and record each one in
  `CREDITS.md` (see `docs/ASSETS.md`). Sounds live in `assets/audio/`, mapped in `src/audio.js`.
- Order Line staffing is live: `orderLine()` in engine.js makes the least-covered
  department a bottleneck on income, and `hire()`/`hirePerson()`/`staffLine()` fix it. Hires are people
  (`depts[id].team`, applicants in `.pool`) generated from the seeded `s.seed`, so
  quotes match results; `effectiveness()` weighs each department's two stats. Managers (`depts[id].mgr`,
  promoted with `promote()`) boost strength and auto-hire in `managersTick()`; Engineering,
  IT, Safety and Management are in `HIREABLE` (not the Order Line): `engKhMult()`, `itMult()`,
  `safetyTick()`/`incidentRate()` (own seed in `s.safety`) and `mgmtMult()`.
  machine.js pauses off-screen and drops to a low-quality mode on slow devices. Phones (≤760px) use the
  one-handed layout at the end of style.css, keyed on `body[data-view]` (set by `setTab()`), with a
  phone-only Works tab and a full-screen machine (`body.works-full`, rotated in portrait; `hit()` handles it). The simulator
  bot calls `keepLineStaffed()` before buying anything. Support departments (IT, Safety incidents,
  Management, Purchasing discount) are live; achievements (`s.ach`) and first-time tips (`s.tips`)
  persist through Overhaul. Engineering people have a team (`p.g`: design/controls/project; `teamStrength()`), Controls
  discounts `techCost()`, and Project runs the Pak line (`s.pak`, `pakTick()`, target via `setPakTarget()`).
  The Company tab cards open a focus sheet (`openDept()`) and faces open an ID badge (`data-person`).
  Executives (`s.execs`, `execTick()` every `execEvery` s, `execMult()` per division), the President
  (`s.president`, `presidentMult()`) and the Board (`s.board`, `boardEff(key)`, bought with Patents tracked in
  `s.patentsSpent`, kept through Overhaul) are in engine.js; the org chart and exec sheet (`exec:<id>`) are in ui.js.
  The remaining department twists are still a design scaffold. Location unlocks
  (`state.locations`, `checkLocations()`) are real and persist through Overhaul. The plans are in `docs/DEPARTMENTS.md` and `docs/TERRITORY.md`.
