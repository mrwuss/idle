# Roadmap

## v0.1 — Prototype ✅ (this commit)

- [x] Core loop: pumps ↔ actuators flow balance, pressure tiers, cash
- [x] Heat model with coolers and a soft income penalty
- [x] Accumulator buffer and Surge
- [x] Hand-pump clicker
- [x] 17-node R&D tree with Know-how
- [x] Overhaul prestige with Patents
- [x] Live animated schematic, pressure and temperature gauges, alerts
- [x] Save/load, export/import, offline progress
- [x] Headless balance simulator (`tools/simulate.js`)
- [x] Design docs and sketches
- [x] Company tab placeholder: all eleven departments, their unlock conditions and the Pak chain (no mechanics yet)
- [x] Territory map: 4 regions, 13 states + Gulf offshore
- [x] **The Works:** full-width animated machine (pump bank, header, accumulator, relief, cooler, one station per actuator, sequence-rail ball run, conveyor to Shipping)
- [x] Company named IFP MSI; locations unlock in order as you grow (Iowa → North → West → South), announced, kept through Overhaul

## v0.2 — Departments (the business layer)

Design: [DEPARTMENTS.md](DEPARTMENTS.md)

- [x] Order Line engine: staffing, coverage and the bottleneck (6 staffed departments + Production)
- [x] Support departments: IT (Order Line boost), Safety (incidents + streak), Management (team boost + applicants)
- [x] Purchasing twist: supplier discounts
- [x] Patent formula tamed (cube root)
- [ ] Move R&D under Engineering → Design; move PLC/Servo/Proportional/LS/DD/Telematics to Controls
- [ ] Department signature mechanics: markets, conversion, supplier discount, inventory + Rush Ship, yield + certifications, DSO + interest, incident streak, span of control
- [x] Engineering teams (Design / Controls / Project) and the Pak lines: Valve-Pak → Base-Pak → Sys-Pak
- [x] People UI: compact department cards, department focus sheet, ID badges with explained stats
- [ ] Named Sys-Pak contracts with deadlines
- [x] SCADA: Controls' cockpit (live tiles, trends, rates of change, alarms), loop tuning and autonomous control
- [x] SCADA operator panel: digital gauges with sparklines, and four Know-how upgrades (historian, alarms, predictive, APC)
- [ ] IT auto-balance (folded into SCADA automation; departments still hire via managers/executives)
- [x] Patent Office: after the full R&D tree, Know-how files patents (escalating cost)
- [x] Shake-up: timed top-down reorganization (Board → executives → managers → employees) with higher incident risk while it runs
- [x] Executive track: CRO / COO / CFO / CTO run their divisions, a President, a Board of Directors bought with Patents
- [x] Company tab hiring: coverage bars, hire buttons, bottleneck highlight, "Staff the line to 100%"
- [x] Hiring people: random applicants with stats, quirks and looks; effectiveness by department; team rosters
- [x] The Works as a facility: office mezzanine with your staff, warehouse (racks, AMR robots, pickers, packing), shipping dock with trailers
- [x] Hand-pump stroke scales with accumulator capacity
- [x] Managers: promote anyone; Leadership drives team bonus, applicant screening and auto-hiring
- [x] Engineering department: engineers boost Know-how; Engineering projects (CAD → R&D Center)
- [x] Mobile performance: machine pauses off-screen, resolution capped on phones, automatic low-quality mode
- [x] One-handed phone layout: bottom tab bar, thumb dock (Stroke right, Surge left, buy quantity), top status line, Works tab with full-screen machine, no sideways scrolling
- [ ] Order Line drawn as a valve diagram
- [x] Simulator bot hires for the bottleneck; pacing table re-run

## v0.2.5 — Territory

Design: [TERRITORY.md](TERRITORY.md)

- [x] Locations widen Outside Sales reach (√ customer base)
- [ ] Markets (Outside Sales purchases) and a "customers maxed out" alert
- [ ] Location-tagged Sys-Pak projects and per-state industry markets

## v0.3 — Make it feel good

- [x] First-time tips: flow starvation, relief dumping, overheating, a full accumulator, research ready, pressure upgrade, first manager
- [ ] Highlight the gear pump and jack for brand-new players
- [x] Sound effects (Kenney CC0) with a mute toggle: stroke, buy, upgrade, research, Surge, overheat, new location, Overhaul
- [ ] Ambient sound: pump whine tied to flow, relief squeal while dumping
- [ ] Number popups on actuators, a screen shake on Surge
- [x] "Next" buy quantity: up to the next ×2 milestone
- [x] Achievements: 23 goals in the Logbook, +1% income each, kept through Overhaul
- [x] Unit tests for engine.js (`npm test`: cost curves, flow balance, heat, hiring, save migration, offline, Overhaul)
- [x] GitHub Pages deploy (`.github/workflows/pages.yml`)

## v0.4 — Depth

- [ ] Sys-Pak projects (named, timed contracts)
- [ ] Contamination and filtration (owned by Quality)
- [x] Incidents (owned by Safety)
- [ ] Wear
- [ ] IT auto-balance (auto-hire for the bottleneck)

## v0.5 — Circuits

- [ ] Circuit builder mini-puzzle per actuator line (sequence, counterbalance, regenerative, flow divider)
- [ ] Fluids selection (mineral, HV, synthetic, water-glycol)

## v0.6 — Long game

- [ ] Era VI content
- [ ] Second prestige layer: Standards Committee (spend Patents on rule-changing standards)
- [ ] Balance pass with real playtest data

## Open questions

- Should Overhaul keep some research (for example, the first stage), so run 2
  doesn't start by re-buying Pascal's Principle? It currently resets. That's
  fast to redo, but it's a little tedious.
- Is the heat wall readable enough on its own, or does it need a dedicated
  "why is my income dropping?" tooltip on the temperature gauge?
- Mobile: is the schematic worth the vertical space, or should it collapse into
  a compact strip once the player has seen it?
- Is the hydraulics-professional audience big enough to lean harder into real
  part names (brands are off-limits, but SAE/ISO terms are fair game)?
