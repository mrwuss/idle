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
- [x] Company named IFP MSI; locations unlock in order as you grow (Iowa → North → West → South), announced, kept through Overhaul

## v0.2 — Departments (the business layer)

Design: [DEPARTMENTS.md](DEPARTMENTS.md)

- [ ] Order Line engine: 7 core departments, bottleneck formula, unlock by era
- [ ] Support departments: Engineering (Design / Controls / Project), IT, Safety, Management
- [ ] Move R&D under Engineering → Design; move PLC/Servo/Proportional/LS/DD/Telematics to Controls
- [ ] Department signature mechanics: markets, conversion, supplier discount, inventory + Rush Ship, yield + certifications, DSO + interest, incident streak, span of control
- [ ] Project Engineering Pak lines: Valve-Pak → Base-Pak → Sys-Pak
- [ ] Turn the Company tab placeholder into the Order Line valve diagram with hiring
- [ ] Extend the simulator bot to hire for the bottleneck; re-run the pacing table

## v0.2.5 — Territory

Design: [TERRITORY.md](TERRITORY.md)

- [ ] Demand ceiling = customer base of open locations × market penetration
- [ ] Outside Sales drives penetration; "customers maxed out" alert
- [ ] Location-tagged Sys-Pak projects and per-state industry markets

## v0.3 — Make it feel good

- [ ] First-time-user guidance: highlight the gear pump and jack, explain the flow bar on first starvation, explain heat on first overheat
- [ ] Sound: pump whine tied to flow, relief squeal, Surge thunk (with a mute toggle)
- [ ] Number popups on actuators, a screen shake on Surge
- [ ] "Buy until next milestone" quantity option
- [ ] Achievements (first 1,000 psi, deadheading for 60 s, 100 jacks…)
- [ ] Unit tests for engine.js (cost curves, flow balance edge cases, save migration)
- [ ] GitHub Pages deploy

## v0.4 — Depth

- [ ] Sys-Pak projects (named, timed contracts)
- [ ] Contamination and filtration (owned by Quality)
- [ ] Wear and incidents (owned by Safety)
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
