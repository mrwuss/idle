# Economy & Balance

All numbers live in [`src/data.js`](../src/data.js). This page explains them.
When you change a number, re-run the simulator (see the end of this page) and
update the tables here.

## Core formulas

| What | Formula |
|---|---|
| Cost of the *n*-th unit | `base × growth^owned × costMult` (pumps & actuators: growth 1.15, coolers 1.22) |
| Bulk cost of *q* units | `base × growth^owned × (growth^q − 1) / (growth − 1)` |
| Milestone multiplier | `2^(number of thresholds reached)`; thresholds 25, 50, 100, 200, 300, 400, 500 |
| Pump supply (GPM) | `Σ count × gpm × milestone × pumpMult` |
| Actuator demand (GPM) | `Σ count × gpm` (only lines whose psi requirement is met) |
| Actuator income ($/s) | `count × rate × √(systemPsi / requiredPsi) × milestone × actMult` |
| Utilization | 1 if supply ≥ demand (or accumulator > 0), else `supply / demand` |
| Pump heat (HP) | `Σ systemPsi × gpm_line / 1714 × (1 − η)` |
| Relief heat (HP) | `systemPsi × surplus / 1714 × reliefFactor` (only when accumulator is full) |
| Equilibrium temp (°F) | `80 + heat / (0.25 + Σ cooler k)` |
| Thermal multiplier | 1 below the limit; `1 − (T − limit)/100` above, floored at 0.2 |
| Production ($/s) | `Σ actuator income × utilization × thermal × (1 + 0.1 × patents)` |
| Department staff needed | `1 + 4 × log10(production ÷ production when it opened)` |
| Person's effectiveness | `0.45 + 0.11 × (2 × primary stat + secondary stat) / 3 + quirk` (≈0.55–1.9) |
| Department output | `(1 + strength × IT × Management) × reach`; Outside Sales reach `√(customer base ÷ 100)` |
| Department coverage | `min(1, output ÷ needed)` |
| Surplus staff bonus | income × `(1 + Σ 0.15 × (1 − needed ÷ output))` over Order Line departments past 100% (+7.5% each at 200%; max +90%) |
| Order Line factor | lowest coverage of any open department (the bottleneck), floored at 0.1 |
| Hire cost (nth hire) | `10 s × production-at-opening × 1.778^n`, which is about 10 s of *current* production (n = head count) |
| New applicants | `3 s × current production` |
| Manager bonus | team strength (manager included) × `(1 + 0.05 × Leadership)`; reviews `3 + ⌊LEA/3⌋` applicants |
| Know-how per second | `0.04 × √(income) × (1 + 0.05 × Design strength) × Engineering projects` |
| Controls research | Know-how cost × `max(0.5, 1 − 0.05 × Controls strength)` |
| Pak line | `√(Project strength)` hours/s; Pak price `value × grade × 10 s × production × Order Line factor` (Valve 1 / 300 h, Base 6 / 1,500 h + Valve, Sys 60 / 6,000 h + 4 Base) |
| Hand-pump charge | `max(0.25 gal, 2% of accumulator capacity)` per stroke |
| Total income | `production × surge × Order Line factor × surplus bonus` |
| Patents (total) | `floor(2 × ∛(lifetime $ / 1,000,000))` (was √; the cube root stops the late-run snowball) |
| Executives | skill `(2 × LEA + key stat) ÷ 3`; division strength × `(1 + 0.03 × skill)`; President income × `(1 + 0.02 × skill)` |
| Board seats | 3 / 8 / 20 / 50 / 120 Patents (spent, not refunded); perk strength `0.6 + 0.08 × LEA` |
| SCADA | 2M Know-how (needs Telematics + Controls strength 2); income × `(1 + min(0.2, 0.005 × Controls strength))`; automation scans every 2 s. Operator panel (Know-how, in order): historian 5M (+5% income), alarms 20M (incidents ×0.8), predictive 80M (+1 action/scan), APC 300M (tuning ×2, cap 40%). Simulator: historian ≈ 2h 47m, alarms ≈ 4h 54m |
| Standards Committee | opens with the Board; standard *n* costs `25 × 2^n` Patents (spent, kept forever): actuators ×1.5, pumps ×1.5, costs −20%, temp limit +40°F, incidents −50%, Know-how ×2, SCADA kept through Overhaul, quick-start layout |
| Era VI research | Isostatic Pressing 2M KH, Cryogenic Cooling 1.5M KH (+20°F limit), Subsea Power Units 3M KH (pumps ×1.25); not needed for the Patent Office |
| Patent Office | after all 17 original techs: filing *n* costs `1M × 1.6^n` Know-how (n counts every filing ever); filed patents don't reduce Overhaul gain |
| Shake-up | costs 120 s of production, 5 min long, 30 min cooldown; incidents ×3 and Order Line ×0.9 while it runs |
| Achievements | +1% income each (23 in all, kept through Overhaul) |
| Safety streak | +1% income per 10 min without an incident, max +25% |
| IT / Management | Order Line strength × (1 + 4% × IT strength, max ×2) × (1 + 2% × Management strength, max ×1.5) |
| Purchasing | equipment cost × `max(0.7, 1 / (1 + 1% × Purchasing strength))` |

## Content tables

### Pumps

| Pump | GPM | η | Base cost | $/GPM | Unlock |
|---|---:|---:|---:|---:|---|
| Gear | 2 | 80% | $15 | 7.5 | start (1 free) |
| Vane | 9 | 85% | $220 | 24 | — |
| Axial piston | 45 | 90% | $3.2K | 71 | — |
| Radial piston | 220 | 92% | $48K | 218 | — |
| Load-sensing | 1,100 | 94% | $750K | 682 | R&D: Load Sensing |
| Digital displacement | 6,000 | 97% | $14M | 2,333 | R&D: Digital Displacement |
| Subsea power unit (Era VI) | 32,000 | 98% | $400B | 12.5M | R&D: Subsea Power Units |

Higher pumps cost more per GPM at base price. You buy them because the
growth curve makes the 80th gear pump far pricier than the first vane pump,
and because their efficiency keeps heat down.

### Actuators

| Actuator | GPM | Min psi | Base $/s | Base cost | $/s per GPM |
|---|---:|---:|---:|---:|---:|
| Bottle Jack Bay | 1 | 500 | 0.6 | $10 | 0.6 |
| Log Splitter | 4 | 1,200 | 5 | $150 | 1.25 |
| Shop Press | 12 | 1,500 | 28 | $2.4K | 2.3 |
| Excavator Arm | 55 | 2,800 | 190 | $40K | 3.5 |
| Injection Molding Press | 240 | 3,000 | 1.3K | $700K | 5.4 |
| Open-Die Forging Press | 1,100 | 4,500 | 9.5K | $13M | 8.6 |
| Ship Lift | 5,500 | 5,500 | 75K | $250M | 13.6 |
| Tectonic Press | 30,000 | 9,000 | 700K | $5B | 23.3 |
| Dam Spillway Gate (Era VI) | 150,000 | 12,000 | 6M | $120B | 40 |
| Launch Hold-Down Arms (Era VI) | 800,000 | 15,000 | 50M | $3T | 62.5 |

Each actuator earns more per GPM than the one before it, so upgrading the
actuator mix is also a flow-efficiency upgrade, not just raw income.

### Pressure tiers

| Tier | psi | Cost | Requires |
|---|---:|---:|---|
| Rubber Hose | 750 | — | start |
| 1-Wire Braid | 1,500 | $300 | — |
| 2-Wire Braid | 3,000 | $9K | Pascal's Principle |
| 4-Spiral Hose | 5,000 | $450K | Seal Chemistry |
| 6-Spiral Hose | 6,000 | $25M | Forged Manifolds |
| Ultra-High Pressure | 10,000 | $3B | Pressure Intensifiers |
| Isostatic Line (Era VI) | 15,000 | $800B | Isostatic Pressing |

### Coolers

| Cooler | k (HP/°F) | Base cost | Growth |
|---|---:|---:|---:|
| Fan-Cooled Radiator | 0.5 | $400 | 1.22 |
| Shell & Tube | 6 | $40K | 1.22 |
| Brazed Plate | 80 | $3M | 1.22 |
| Industrial Chiller | 1,200 | $250M | 1.22 |
| Cryogenic Loop (Era VI) | 18,000 | $30B | 1.22 |

### Accumulator

Capacity `5 gal × 2.5^level × (3 with Nitrogen Precharge)`; upgrade cost
`$500 × 4^level`. Surge: ×3 income for 15 s (×4 with Nitrogen Precharge).

## Pacing targets vs simulation

The simulator plays a greedy bot that always buys whatever gives the best
"time to afford + payback time", researches anything it can afford, and surges
on cooldown. A human will be slower early (reading, learning) and faster in
places the bot is naïve about, so treat these as relative pacing.

| Milestone | Target | Bot (first run: departments, achievements, surplus, Paks, executives) |
|---|---|---|
| First splitter | < 3 min | 2m 45s |
| 2-Wire Braid (3,000 psi) | ~10 min | 9m 30s |
| First excavator | ~10 min | 13m |
| $1M lifetime (Overhaul unlocks) | 20–40 min | 19m |
| First forging press | ~45 min | 39m |
| $1B lifetime | 1–2 h | 1h 06m (executives arrive) |
| First ship lift | 1–2 h | 1h 07m |
| All 17 techs | 3–5 h | ~1h 33m |
| Run 1 plateau | 2–4 h | ~160M/s by 6 h (heat wall at 200°F) |

The bot hires into the bottleneck before buying anything else, promotes
managers and keeps IT, Safety, Management and Purchasing staffed. Achievements
(about 14 in run 1) add ~15%; surplus staff (managers, IT and Management push
every department to ~150–170% coverage) add ~40% by the end of run 1. The bot
also staffs Engineering and runs the Pak line toward Sys-Paks: Paks earn ~11%
of run-1 lifetime ($128B of $1.12T). At 15 s per Pak value the extra cash tipped
the bot past the heat wall (4× end income), so the price is kept at 10 s.
Executives open with Management at ~$1B; the bot seats all four (skill 9–10 by
the end) and a President, which lifts end-of-run income from ~66M/s to ~160M/s
(surplus +57%, President +14%) and lifetime from $1.1T to $2.1T. With
`--overhaul` the bot fills all five Board seats and does 11 Overhauls in 6h44m
(999 patents earned, 271 spent on the Board). The bot also runs a shake-up
whenever one is off cooldown and costs under 5% of cash (5 in run 1, from ~3 h);
lifetime stays about the same (~$1.9T) and the Overhaul rhythm is unchanged. Runs vary
by a minute or two because applicants come from a random seed.

**Research is too fast:** the bot finishes the tree at ~1h40m against a 3–5 h
target. Raise tech costs in the next balance pass.

**Known balance notes:**

- Patents used to snowball (8,240 in ~6.5 h of prestige-whenever-they-double).
  With the cube-root formula the bot reaches 512 patents in 5h30m over 9
  Overhauls, and the gap between runs grows (~1 h, then ~2 h).

- The bot never buys Ultra-High Pressure in run 1. At 10,000 psi every pump's
  losses jump by about 67%, and the cooling bill outweighs the gain. That's
  intentional: UHP and the Tectonic Press belong to run 2 and later, where
  Patents carry the cost.
- $1M arrives a little fast for a first Overhaul. Raise `overhaulMin`, or let it
  be: a 1-patent Overhaul is a weak move and players can tell.
- Lean Manufacturing (50K KH) costs more than Synthetic Fluid (40K) but sits
  earlier in the tree's left-to-right reading. Consider swapping their places.
- The heat wall around 200°F (limit after both fluid techs) is where run 1
  stalls. Good: that's the cue to Overhaul. Watch that it doesn't feel like a bug.
  The alert copy says what to do.

## Levers, from coarse to fine

1. `growth` on pumps/actuators: the overall run length.
2. Actuator `cost` ratios between tiers: how long each era lasts.
3. `milestones`: the rhythm within an era.
4. Tech `cost`s and `khPerSqrtIncome`: when the multipliers land.
5. Cooler `k` and `cost`: where the heat walls sit.
6. `patentDivisor` and `patentBonus`: prestige cadence.

## Running the simulator

```bash
node tools/simulate.js            # 6 simulated hours, progress every 30 min
node tools/simulate.js 12 --quiet # only first-time events
node tools/simulate.js 8 --overhaul # bot overhauls whenever it would double its patents
npm test                          # engine unit tests (node:test, no dependencies)
```
