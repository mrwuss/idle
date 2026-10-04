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
- Look: IFP brand (orange-red `#f04b25`, charcoal, Nunito Sans, the official iFP logo in `assets/brand/`, via `src/brand.js`).
  Colors are CSS variables only: light by default, `[data-theme="dark"]` for the shop floor; the
  machine canvas always uses the dark set. Use `var(--accent)` for UI highlights; `--oil` is hydraulic fluid.
- Third-party assets: CC0 only (the IFP logo in `assets/brand/` is IFP's own, used with permission), commit just the files used, and record each one in
  `CREDITS.md` (see `docs/ASSETS.md`). Sounds live in `assets/audio/`, mapped in `src/audio.js`.
- Order Line staffing is live: `orderLine()` in engine.js makes the least-covered
  department a bottleneck on income, and `hire()`/`hirePerson()`/`staffLine()` fix it. Hires are people
  (`depts[id].team`, applicants in `.pool`) generated from the seeded `s.seed`, so
  quotes match results; `effectiveness()` weighs each department's two stats. Managers (`depts[id].mgr`,
  promoted with `promote()`) boost strength, auto-hire in `managersTick()` and swap out weak staff in `managersReview()` (shared `upgradeWeakest()`); Engineering,
  IT, Safety and Management are in `HIREABLE` (not the Order Line): `engKhMult()`, `itMult()`,
  `safetyTick()`/`incidentRate()` (own seed in `s.safety`) and `mgmtMult()`.
  machine.js pauses off-screen and drops to a low-quality mode on slow devices. Phones (≤760px) use the
  one-handed layout at the end of style.css, keyed on `body[data-view]` (set by `setTab()`), with a
  phone-only Works tab and a full-screen machine (`body.works-full`, rotated in portrait; `hit()` handles it). The simulator
  bot calls `keepLineStaffed()` before buying anything. Support departments (IT, Safety incidents,
  Management, Purchasing discount) are live; achievements (`s.ach`) and first-time tips (`s.tips`)
  persist through Overhaul. Engineering people have a team (`p.g`: design/controls/project; `teamStrength()`), Controls
  discounts `techCost()`, and Project runs the Pak line (`s.pak`, `pakTick()`, target via `setPakTarget()`; an active Pak contract in `s.contracts` overrides `pakTarget()`, see `contractsTick()`/`acceptContract()`).
  The Company tab cards open a focus sheet (`openDept()`) and faces open an ID badge (`data-person`).
  Executives (`s.execs`, `execTick()` every `execEvery` s, `execMult()` per division), the President
  (`s.president`, `presidentMult()`, C-suite reviews in `presidentReview()`) and the Board (`s.board`, `boardEff(key)`, bought with Patents tracked in
  `s.patentsSpent`, kept through Overhaul; the Chair's swap offer is `boardProposal()`/`replaceDirector()`) are in engine.js. SCADA (`s.scada`, `buyScada()`, `scadaTick()` automation, `scadaMult()` tuning; switches in `s.scadaPrefs`,
  kept through Overhaul) has a full-screen cockpit in ui.js (`openScada()`, digital gauges `DGAUGES` with `spark()`, history sampled in `sample()`); operator-panel upgrades are `DATA.SCADA_PANEL` (`buyPanel()`, `panelEff()`). The Patent Office (`officeOpen()`, `filePatents()`, `s.patentsFiled`; `overhaulGain()` ignores filed
  patents) spends Know-how once every tech is done. The Standards Committee (`DATA.STANDARDS`, `adoptStandard()`, `stdEff()`, `s.standards` kept forever) is the second prestige layer; Era VI techs carry `era: 6` and aren't required by `officeOpen()`. machine.js shows the 8 most advanced actuator bays (`shownActs()`). The Time Machine (`startWarp()`/`warpStep()`, `s.warp`; main.js steps it in ~40 ms slices) spends Know-how to jump 1/8/24 h ahead through the real `tick()`; time away uses the same path for free (`startCatchUp()` in main.js on load). machine.js adds "+$" popups and a Surge shake; audio.js synthesizes an ambient pump hum and relief hiss (`ambient()`, Web Audio, starts on first tap). A shake-up (`s.shake`, `startShake()`, `shakeTick()`, phases in `SHAKE_STEP`)
  goal-seeks every seat (`goalSeek()` over slots, judged by `shakeScore()`/`shakeGain()`) Board → execs → managers → staff and raises `incidentRate()` while it runs. The org chart and exec sheet (`exec:<id>`) are in ui.js.
  Department signatures live in engine.js (`signaturesTick()`: Accounting `interestRate()`, Quality `qualityPakMult()`, Warehouse `rushShip()`/`warehouseTimeMult()`, Inside Sales `offerSlots()`, Management `setFocus()`/`focusMult()`); ui.js `signature()` shows them. Remaining department twists are still a design scaffold. Location unlocks
  (`state.locations`, `checkLocations()`) are real and persist through Overhaul. The plans are in `docs/DEPARTMENTS.md` and `docs/TERRITORY.md`.
