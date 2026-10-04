/*
 * Pressure Works — static game data.
 *
 * Everything tunable lives here so the design docs (docs/ECONOMY.md) and the
 * balance simulator (tools/simulate.js) read from one source of truth.
 * Loaded as a classic script in the browser and via require() in Node.
 */
(function (root) {
  'use strict';

  // Pumps create flow (GPM). Efficiency decides how much of their shaft power
  // turns into heat instead of useful work.
  const PUMPS = [
    { id: 'gear',   name: 'Gear Pump',             gpm: 2,     eff: 0.80, cost: 15,      growth: 1.15,
      flavor: 'Two meshing gears and a lot of noise. Cheap, tough, leaky.' },
    { id: 'vane',   name: 'Vane Pump',             gpm: 9,     eff: 0.85, cost: 220,     growth: 1.15,
      flavor: 'Sliding vanes ride a cam ring. Quieter, and it shows.' },
    { id: 'axial',  name: 'Axial Piston Pump',     gpm: 45,    eff: 0.90, cost: 3200,    growth: 1.15,
      flavor: 'Nine pistons dancing on a swashplate.' },
    { id: 'radial', name: 'Radial Piston Pump',    gpm: 220,   eff: 0.92, cost: 48000,   growth: 1.15,
      flavor: 'Pistons arranged like a star. Built for brutal pressure.' },
    { id: 'ls',     name: 'Load-Sensing Pump',     gpm: 1100,  eff: 0.94, cost: 750000,  growth: 1.15,
      requires: 'load_sensing',
      flavor: 'Variable displacement: it only makes the flow you ask for.' },
    { id: 'dd',     name: 'Digital Displacement',  gpm: 6000,  eff: 0.97, cost: 1.4e7,   growth: 1.15,
      requires: 'digital_displacement',
      flavor: 'Every piston has its own solenoid valve and an opinion.' },
  ];

  // Actuators turn flow + pressure into paid work. Each needs a minimum system
  // pressure; running above it pays proportionally more (force = P × A).
  const ACTUATORS = [
    { id: 'jack',      name: 'Bottle Jack Bay',        gpm: 1,     psi: 500,  rate: 0.6,    cost: 10,     growth: 1.15,
      flavor: 'The first service bay in Cedar Rapids. Pump, pump, pump — up goes the truck.' },
    { id: 'splitter',  name: 'Log Splitter',           gpm: 4,     psi: 1200, rate: 5,      cost: 150,    growth: 1.15,
      flavor: 'Firewood by the cord. The neighbours are impressed.' },
    { id: 'press',     name: 'Shop Press',             gpm: 12,    psi: 1500, rate: 28,     cost: 2400,   growth: 1.15,
      flavor: 'Bearings out, bushings in. Twenty tons, one lever.' },
    { id: 'excavator', name: 'Excavator Arm',          gpm: 55,    psi: 2800, rate: 190,    cost: 40000,  growth: 1.15,
      flavor: 'Boom, stick, bucket. Three cylinders moving mountains of dirt.' },
    { id: 'molding',   name: 'Injection Molding Press',gpm: 240,   psi: 3000, rate: 1300,   cost: 7e5, growth: 1.15,
      flavor: 'Clamp, inject, hold, eject. A bucket of plastic parts per minute.' },
    { id: 'forge',     name: 'Open-Die Forging Press', gpm: 1100,  psi: 4500, rate: 9500,   cost: 1.3e7,  growth: 1.15,
      flavor: 'Squeezes white-hot steel like modelling clay.' },
    { id: 'shiplift',  name: 'Ship Lift',              gpm: 5500,  psi: 5500, rate: 75000,  cost: 2.5e8,  growth: 1.15,
      flavor: 'Raises a cargo ship and its canal water 30 metres. Every hour.' },
    { id: 'tectonic',  name: 'Tectonic Press',         gpm: 30000, psi: 9000, rate: 700000, cost: 5e9,  growth: 1.15,
      flavor: 'Nobody is entirely sure this is legal.' },
  ];

  // System pressure rating (hoses, fittings, seals, relief valve setting).
  // This is the "pressure" in P × Q and gates which actuators can run.
  const TIERS = [
    { name: 'Rubber Hose',          psi: 750,   cost: 0 },
    { name: '1-Wire Braid',         psi: 1500,  cost: 300 },
    { name: '2-Wire Braid',         psi: 3000,  cost: 9000,   requires: 'pascal' },
    { name: '4-Spiral Hose',        psi: 5000,  cost: 4.5e5,  requires: 'seal_chem' },
    { name: '6-Spiral Hose',        psi: 6000,  cost: 2.5e7,  requires: 'forged_manifold' },
    { name: 'Ultra-High Pressure',  psi: 10000, cost: 3e9,    requires: 'intensifier' },
  ];

  // Coolers raise k, the heat-rejection coefficient (HP per °F above ambient).
  const COOLERS = [
    { id: 'fan',     name: 'Fan-Cooled Radiator',    k: 0.5,   cost: 400,   growth: 1.22,
      flavor: 'A radiator and a box fan zip-tied to the reservoir.' },
    { id: 'shell',   name: 'Shell & Tube Exchanger', k: 6,     cost: 40000, growth: 1.22,
      flavor: 'Plant water on one side, hot oil on the other.' },
    { id: 'plate',   name: 'Brazed Plate Exchanger', k: 80,    cost: 3e6,   growth: 1.22,
      flavor: 'Fifty stainless plates, a fraction of the footprint.' },
    { id: 'chiller', name: 'Industrial Chiller',     k: 1200,  cost: 2.5e8, growth: 1.22,
      flavor: 'Refrigeration-grade cold for refinery-grade heat.' },
  ];

  // Research, paid in Know-how (KH). `effects` are read by engine.js.
  const TECH = [
    { id: 'pascal', name: "Pascal's Principle", cost: 5, requires: [],
      desc: 'Actuators +25% income. Unlocks 2-Wire Braid hose.',
      effects: { actMult: 1.25 } },
    { id: 'lever', name: 'Mechanical Advantage', cost: 12, requires: ['pascal'],
      desc: 'Each hand-pump stroke also earns 3% of your income per second.',
      effects: { clickPct: 0.03 } },
    { id: 'precharge', name: 'Nitrogen Precharge', cost: 30, requires: ['pascal'],
      desc: 'Accumulator capacity ×3. Surge pays ×4 instead of ×3.',
      effects: { accMult: 3, surgeMult: 4 } },
    { id: 'bernoulli', name: "Bernoulli's Equation", cost: 25, requires: ['pascal'],
      desc: 'Smoother lines: all pumps +25% flow.',
      effects: { pumpMult: 1.25 } },
    { id: 'unloading', name: 'Unloading Valve', cost: 80, requires: ['bernoulli'],
      desc: 'Excess flow returns to tank at low pressure: relief-valve heat ×0.35.',
      effects: { reliefHeat: 0.35 } },
    { id: 'hvi_oil', name: 'High-VI Oil', cost: 120, requires: ['bernoulli'],
      desc: 'Viscosity holds up when hot: overheating starts 20°F later.',
      effects: { tempLimit: 20 } },
    { id: 'seal_chem', name: 'Seal Chemistry', cost: 250, requires: ['hvi_oil'],
      desc: 'PTFE and Viton seals. Unlocks 4-Spiral hose (5,000 psi).',
      effects: {} },
    { id: 'prop_valves', controls: true, name: 'Proportional Valves', cost: 600, requires: ['unloading'],
      desc: 'Smooth, metered motion: actuators ×1.5 income.',
      effects: { actMult: 1.5 } },
    { id: 'load_sensing', controls: true, name: 'Load Sensing', cost: 2000, requires: ['prop_valves'],
      desc: 'Pumps match the load: relief heat ×0.3 again. Unlocks the Load-Sensing Pump.',
      effects: { reliefHeat: 0.3 } },
    { id: 'plc', controls: true, name: 'PLC Automation', cost: 3000, requires: ['prop_valves'],
      desc: 'A ladder-logic program fires Surge automatically when the accumulator is full.',
      effects: { autoSurge: true } },
    { id: 'forged_manifold', name: 'Forged Manifolds', cost: 8000, requires: ['seal_chem'],
      desc: 'Fewer hoses, fewer leaks. Unlocks 6-Spiral hose (6,000 psi).',
      effects: {} },
    { id: 'servo', controls: true, name: 'Servo Valves', cost: 20000, requires: ['load_sensing'],
      desc: 'Closed-loop control to the micron: actuators ×2 income.',
      effects: { actMult: 2 } },
    { id: 'lean', name: 'Lean Manufacturing', cost: 50000, requires: ['servo'],
      desc: 'Kaizen your supply chain: all equipment costs ×0.85.',
      effects: { costMult: 0.85 } },
    { id: 'synthetic', name: 'Synthetic Fluid', cost: 40000, requires: ['hvi_oil', 'servo'],
      desc: 'Ester-based fluid shrugs off heat: overheating starts another 40°F later.',
      effects: { tempLimit: 40 } },
    { id: 'telematics', controls: true, name: 'Telematics', cost: 60000, requires: ['plc'],
      desc: 'Remote monitoring: offline progress at 100% (was 50%), up to 24 h.',
      effects: { offlineRate: 1, offlineCapH: 24 } },
    { id: 'intensifier', name: 'Pressure Intensifiers', cost: 250000, requires: ['forged_manifold', 'servo'],
      desc: 'Big piston pushes small piston. Unlocks Ultra-High Pressure (10,000 psi).',
      effects: {} },
    { id: 'digital_displacement', controls: true, name: 'Digital Displacement', cost: 500000, requires: ['load_sensing', 'telematics'],
      desc: 'Unlocks the Digital Displacement pump. All pumps ×1.5 flow.',
      effects: { pumpMult: 1.5 } },
  ];

  // ---- Departments (design scaffold — not simulated yet) --------------------
  // See docs/DEPARTMENTS.md. The engine does not read these yet; the Company
  // tab shows them so players can see what's coming and when.
  // `opens` is met when ANY listed condition is true:
  //   lifetime ($ earned ever), tier (pressure tier index), overhauls (count).
  const ERAS = ['The First Shop', 'The Job Shop', 'The Factory', 'Heavy Civil', 'Megaprojects', 'Beyond'];

  const DEPARTMENTS = [
    // Order Line, in the order an order travels through it.
    { id: 'outside_sales', name: 'Outside Sales', group: 'order', era: 3, opens: { lifetime: 1e7 },
      role: 'Finds leads at job sites, OEMs, farms and ports.',
      twist: 'Markets: open customer segments that raise average order value.',
      metric: 'Leads / min' },
    { id: 'inside_sales', name: 'Inside Sales', group: 'order', era: 1, opens: { lifetime: 1e3 },
      role: 'Quotes, cross-references and turns leads into orders.',
      twist: 'Conversion rate: faster quotes win more orders.',
      metric: 'Conversion %' },
    { id: 'purchasing', name: 'Purchasing', group: 'order', era: 2, opens: { tier: 2, lifetime: 1e5 },
      role: 'Sources components and raw stock for every order.',
      twist: 'Supplier deals: lowers the price of everything you buy.',
      metric: 'Cost reduction %' },
    { id: 'warehouse', name: 'Warehouse', group: 'order', era: 2, opens: { tier: 2, lifetime: 1e5 },
      role: 'Receives, stocks, picks, packs and ships.',
      twist: 'Inventory buffer, the accumulator of the Order Line. Full stock enables Rush Ship.',
      metric: 'Stock %' },
    { id: 'production', name: 'Production', group: 'order', era: 0, opens: {},
      role: 'The shop floor: everything on the other tabs.',
      twist: 'Pumps, actuators, pressure and heat set how much work the company can do.',
      metric: '$ / s of work' },
    { id: 'quality', name: 'Quality', group: 'order', era: 2, opens: { tier: 2, lifetime: 1e5 },
      role: 'Inspects, tests and certifies every order.',
      twist: 'Yield and certifications (ISO 9001 → AS9100) unlock top-tier markets.',
      metric: 'Yield %' },
    { id: 'accounting', name: 'Accounting', group: 'order', era: 1, opens: { lifetime: 1e3 },
      role: 'Invoices, collects and pays the bills.',
      twist: 'Cash timing: shortens collection delay (DSO), later earns interest.',
      metric: 'DSO days' },
    // Support
    { id: 'engineering', name: 'Engineering', group: 'support', era: 3, opens: { lifetime: 1e7 },
      role: 'Designs systems, programs controls and delivers packaged projects.',
      twist: 'Three teams: Design, Controls and Project.',
      metric: 'Engineers',
      teams: [
        { id: 'design',   name: 'Design',   role: 'Generates Know-how and runs the R&D tree.' },
        { id: 'controls', name: 'Controls', role: 'Owns automation and electronics research; needed for Sys-Paks.' },
        { id: 'project',  name: 'Project',  role: 'Builds Valve-Paks, Base-Paks and Sys-Paks.' },
      ] },
    { id: 'it', name: 'IT', group: 'support', era: 3, opens: { lifetime: 1e7 },
      role: 'Keeps systems running and automates the business.',
      twist: 'ERP adds capacity to every Order Line department; hosts PLC and Telematics.',
      metric: 'ERP level' },
    { id: 'safety', name: 'Safety', group: 'support', era: 2, opens: { tier: 2, lifetime: 1e5 },
      role: 'Protects people and equipment.',
      twist: '"Days without a lost-time incident" builds a bonus that resets on an incident.',
      metric: 'Days without incident' },
    { id: 'management', name: 'Management', group: 'support', era: 4, opens: { lifetime: 1e9, overhauls: 1 },
      role: 'Coordinates people and sets direction.',
      twist: 'Span of control: too many staff per manager slows every department.',
      metric: 'Span of control' },
  ];

  // Project Engineering product lines: each tier is built from the one below.
  const PAKS = [
    // hours: engineering hours to build one (Project engineers add hours/s);
    // needs: Paks consumed from stock; value: sale price in units of pakSeconds of production.
    { id: 'valve', name: 'Valve-Pak', value: 1, hours: 300, needs: {},
      desc: 'Manifold and valves only: a drop-in hydraulic control block.',
      recipe: 'Manifold block + 2–6 valves (Forged Manifolds: worth ×1.5)' },
    { id: 'base', name: 'Base-Pak', value: 6, hours: 1500, needs: { valve: 1 },
      desc: 'Simple power unit: reservoir, pump, motor, a valve or two, sometimes a cooler.',
      recipe: '1 Valve-Pak + your best pump type + reservoir/motor kit' },
    { id: 'sys', name: 'Sys-Pak', value: 60, hours: 6000, needs: { base: 4 },
      desc: 'Complex multi-function system built from several Base-Paks plus controls.',
      recipe: '4 Base-Paks + control panel (needs PLC Automation and a Controls engineer)' },
  ];


  // ---- Executives, President and the Board -------------------------------------
  // See docs/DEPARTMENTS.md (Executive track). Executives open with Management.
  // Each runs a division: every few seconds they promote managers, hire toward a
  // coverage target, replace weak staff with better applicants and refresh weak
  // applicant pools, spending a small share of cash. Skill = (2×Leadership + key)/3.
  const EXECS = [
    { id: 'cro', short: 'CRO', name: 'Chief Revenue Officer',   stat: 'rapport',      depts: ['outside_sales', 'inside_sales'],
      desc: 'Runs Sales: keeps both sales teams staffed, led and sharp.' },
    { id: 'coo', short: 'COO', name: 'Chief Operating Officer', stat: 'organization', depts: ['warehouse', 'quality', 'safety'],
      desc: 'Runs Operations: the warehouse, the quality lab and safety.' },
    { id: 'cfo', short: 'CFO', name: 'Chief Financial Officer', stat: 'numbers',      depts: ['accounting', 'purchasing'],
      desc: 'Runs Finance: accounting and purchasing.' },
    { id: 'cto', short: 'CTO', name: 'Chief Technology Officer', stat: 'mechanical',  depts: ['engineering', 'it'],
      desc: 'Runs Technology: engineering and IT.' },
  ];
  // Operator-panel upgrades for the SCADA cockpit, bought in order with Know-how.
  // Each adds instruments to the screen and makes the control room better at its job.
  const SCADA_PANEL = [
    { id: 'historian',  name: 'Trend historian',          kh: 5e6,
      desc: '5-minute sparklines with low/high on every gauge, plus the trend charts. Better data: loop tuning +5% income.', eff: { tunePlus: 0.05 } },
    { id: 'alarms',     name: 'Alarm management',         kh: 2e7,
      desc: 'Flow, accumulator and heat-load gauges with alarm limits. Operators catch faults early: incidents −20%.', eff: { incidentMult: 0.8 } },
    { id: 'predictive', name: 'Predictive analytics',     kh: 8e7,
      desc: 'Forecasts the next minute on every sparkline and shows rates of change. Automation takes +1 action per scan.', eff: { scanPlus: 1 } },
    { id: 'apc',        name: 'Advanced process control', kh: 3e8,
      desc: 'Model-based loop tuning: +1% income per Controls strength, up to +40% (double).', eff: { tuneMult: 2 } },
  ];
  // The President is appointed from the executives (3+ seated) and also runs Management.
  const PRESIDENT = { stat: 'organization', depts: ['management'] };
  // Board seats cost Patents and survive Overhaul. Each director brings one perk.
  const BOARD_COSTS = [3, 8, 20, 50, 120];
  const BOARD_PERKS = [
    { id: 'founder',  name: 'Founding family member',   desc: 'All income +10%',                eff: { incomeMult: 1.10 } },
    { id: 'banker',   name: 'Retired banker',           desc: 'Pak prices +25%',                eff: { pakMult: 1.25 } },
    { id: 'oem',      name: 'Former OEM executive',     desc: 'Outside Sales reach ×1.25',      eff: { reachMult: 1.25 } },
    { id: 'supply',   name: 'Supply-chain veteran',     desc: 'Equipment costs −8%',            eff: { costMult: 0.92 } },
    { id: 'prof',     name: 'Fluid-power professor',    desc: 'Know-how +25%',                  eff: { khMult: 1.25 } },
    { id: 'insurer',  name: 'Insurance underwriter',    desc: 'Incidents −35%',                 eff: { incidentMult: 0.65 } },
    { id: 'lean',     name: 'Lean consultant',          desc: 'Order Line needs 10% fewer staff', eff: { needMult: 0.90 } },
    { id: 'recruit',  name: 'Executive recruiter',      desc: '+1 applicant in every department', eff: { poolPlus: 1 } },
    { id: 'coach',    name: 'Executive coach',          desc: 'Every executive +1 skill',       eff: { execPlus: 1 } },
  ];

  // ---- Territory ------------------------------------------------------------
  // See docs/TERRITORY.md. Every location is an extension of HQ: same
  // departments, same processes. What a new location adds is customer base.
  // Locations unlock in this order as the company grows (Iowa → North → West →
  // South); each needs the one before it. Customer base doesn't affect income
  // yet. `customers` is relative customer-base potential (13 states + the Gulf
  // = 1,000). `x, y` place each state on the Company tab's tile map (a
  // cartogram, not to scale).
  const REGIONS = [
    { id: 'hq',    name: 'Headquarters', branch: 'Cedar Rapids, IA',         opens: {},                era: 0,
      markets: ['Ag equipment OEMs', 'Industrial manufacturing'] },
    { id: 'north', name: 'North',        branch: 'Minneapolis, MN',          opens: { lifetime: 1e7 }, era: 3,
      markets: ['Mining', 'Forestry & paper', 'Food processing'] },
    { id: 'west',  name: 'West',         branch: 'Kansas City (Olathe, KS)', opens: { lifetime: 1e8 }, era: 3,
      markets: ['Aerospace', 'Agriculture', 'Oil & gas', 'Rail & trucking'] },
    { id: 'south', name: 'South',        branch: 'Houston, TX',              opens: { lifetime: 1e9 }, era: 4,
      markets: ['Oil & gas', 'Petrochemical', 'Offshore', 'Ports & marine'] },
  ];

  const STATES = [
    { id: 'ND',   name: 'North Dakota',  region: 'north', customers: 25,  x: 1, y: 0 },
    { id: 'MN',   name: 'Minnesota',     region: 'north', customers: 60,  x: 2, y: 0, branch: true },
    { id: 'WI',   name: 'Wisconsin',     region: 'north', customers: 50,  x: 3, y: 0 },
    { id: 'SD',   name: 'South Dakota',  region: 'north', customers: 15,  x: 1, y: 1 },
    { id: 'IA',   name: 'Iowa',          region: 'hq',    customers: 40,  x: 2, y: 1, branch: true },
    { id: 'IL',   name: 'Illinois',      region: 'hq',    customers: 60,  x: 3, y: 1 },
    { id: 'NE',   name: 'Nebraska',      region: 'west',  customers: 40,  x: 1, y: 2 },
    { id: 'MO',   name: 'Missouri',      region: 'west',  customers: 60,  x: 2, y: 2 },
    { id: 'KS',   name: 'Kansas',        region: 'west',  customers: 50,  x: 1, y: 3, branch: true },
    { id: 'AR',   name: 'Arkansas',      region: 'west',  customers: 40,  x: 2, y: 3 },
    { id: 'OK',   name: 'Oklahoma',      region: 'west',  customers: 60,  x: 1, y: 4 },
    { id: 'LA',   name: 'Louisiana',     region: 'south', customers: 100, x: 2, y: 4 },
    { id: 'TX',   name: 'Texas',         region: 'south', customers: 300, x: 1, y: 5, branch: true },
    { id: 'GULF', name: 'Gulf offshore', region: 'south', customers: 100, x: 2, y: 5, offshore: true },
  ];

  // ---- People (hiring) ---------------------------------------------------------
  // Applicants are random people. Seven stats (1–10) and an optional trait;
  // each department weighs two stats, so the same person is a star in one
  // job and average in another. See docs/DEPARTMENTS.md "Hiring people".
  const STATS = [
    { id: 'hustle',       name: 'Hustle',       short: 'HUS', desc: 'Energy and drive: chasing leads, getting things moving.' },
    { id: 'rapport',      name: 'Rapport',      short: 'RAP', desc: 'Getting along with customers and coworkers.' },
    { id: 'negotiation',  name: 'Negotiation',  short: 'NEG', desc: 'Driving a hard bargain with suppliers.' },
    { id: 'organization', name: 'Organization', short: 'ORG', desc: 'Keeping stock, schedules and paperwork in order.' },
    { id: 'precision',    name: 'Precision',    short: 'PRE', desc: 'Careful, exact work: inspection, tolerances, safety.' },
    { id: 'numbers',      name: 'Numbers',      short: 'NUM', desc: 'Comfort with math, money and data.' },
    { id: 'mechanical',   name: 'Mechanical',   short: 'MEC', desc: 'Hands-on hydraulic know-how.' },
    { id: 'leadership',   name: 'Leadership',   short: 'LEA', desc: 'Running a team: what makes a good manager.' },   // what makes a good manager
  ];
  // Primary stat counts double, secondary once.
  const DEPT_STATS = {
    outside_sales: ['hustle', 'rapport'],
    inside_sales:  ['rapport', 'mechanical'],
    purchasing:    ['negotiation', 'numbers'],
    warehouse:     ['organization', 'hustle'],
    quality:       ['precision', 'mechanical'],
    accounting:    ['numbers', 'precision'],
    engineering:   ['mechanical', 'numbers'],
    it:            ['numbers', 'organization'],
    safety:        ['precision', 'organization'],
    management:    ['leadership', 'organization'],
  };
  // Quirks: a bonus to effectiveness in one department ('any' = everywhere).
  const TRAITS = [
    { id: 'golf',      name: 'Single-digit golf handicap',  dept: 'outside_sales', bonus: 0.25 },
    { id: 'oems',      name: 'Knows every OEM in Iowa',      dept: 'outside_sales', bonus: 0.30 },
    { id: 'farm',      name: 'Grew up on a farm',            dept: 'outside_sales', bonus: 0.15 },
    { id: 'xref',      name: 'Cross-references from memory', dept: 'inside_sales',  bonus: 0.30 },
    { id: 'bilingual', name: 'Bilingual',                    dept: 'inside_sales',  bonus: 0.15 },
    { id: 'mechanic',  name: 'Former diesel mechanic',       dept: 'inside_sales',  bonus: 0.20 },
    { id: 'haggler',   name: 'Never pays list price',        dept: 'purchasing',    bonus: 0.30 },
    { id: 'excel',     name: 'Spreadsheet wizard',           dept: 'purchasing',    bonus: 0.15 },
    { id: 'forklift',  name: 'Forklift certified',           dept: 'warehouse',     bonus: 0.25 },
    { id: 'tetris',    name: 'Packs a truck like Tetris',    dept: 'warehouse',     bonus: 0.30 },
    { id: 'night',     name: 'Night-shift legend',           dept: 'warehouse',     bonus: 0.15 },
    { id: 'navy',      name: 'Ex-Navy hydraulics tech',      dept: 'quality',       bonus: 0.30 },
    { id: 'sigma',     name: 'Six Sigma Green Belt',         dept: 'quality',       bonus: 0.25 },
    { id: 'cpa',       name: 'CPA',                          dept: 'accounting',    bonus: 0.30 },
    { id: 'collector', name: 'Collects invoices relentlessly', dept: 'accounting',  bonus: 0.20 },
    { id: 'pe',        name: 'Licensed P.E.',                dept: 'engineering',   bonus: 0.30 },
    { id: 'tinkerer',  name: 'Builds test rigs in the garage', dept: 'engineering', bonus: 0.20 },
    { id: 'erp',       name: 'Survived three ERP migrations', dept: 'it',           bonus: 0.30 },
    { id: 'printer',   name: 'Fixes printers with a look',   dept: 'it',            bonus: 0.15 },
    { id: 'osha',      name: 'OSHA 30 certified',            dept: 'safety',        bonus: 0.30 },
    { id: 'emt',       name: 'Former EMT',                   dept: 'safety',        bonus: 0.20 },
    { id: 'mba',       name: 'An MBA that actually helps',   dept: 'management',    bonus: 0.25 },
    { id: 'birthdays', name: "Remembers everyone's birthday", dept: 'management',   bonus: 0.20 },
    { id: 'coffee',    name: 'Makes the good coffee',        dept: 'any',           bonus: 0.08 },
    { id: 'mentor',    name: 'Natural mentor',               dept: 'any',           bonus: 0.12 },
    { id: 'veteran',   name: '30 years in fluid power',      dept: 'any',           bonus: 0.18 },
  ];
  const TRAIT_CHANCE = 0.35;

  // Engineering projects: bought with cash once you have enough engineers;
  // each multiplies Know-how generation. Reset by Overhaul.
  const ENG_UPGRADES = [
    { id: 'cad',     name: 'CAD Workstations',        engineers: 1,  cost: 2e6,  kh: 1.25,
      desc: '3D models instead of napkin sketches.' },
    { id: 'lab',     name: 'Hydraulic Test Lab',      engineers: 3,  cost: 3e7,  kh: 1.5,
      desc: 'A test stand that runs pumps to failure so customers don\'t.' },
    { id: 'fea',     name: 'Simulation (FEA / CFD)',  engineers: 6,  cost: 5e8,  kh: 1.5,
      desc: 'Find the weak weld and the hot spot before cutting steel.' },
    { id: 'appeng',  name: 'Application Engineers',   engineers: 10, cost: 8e9,  kh: 1.75,
      desc: 'Engineers in the field who come back with problems worth solving.' },
    { id: 'rnd',     name: 'R&D Center',              engineers: 16, cost: 1.5e11, kh: 2,
      desc: 'A whole building for asking "what if?"' },
  ];
  // Fictional names, mixed and combined at random.
  const FIRST_NAMES = ['Ava', 'Ben', 'Carmen', 'Dale', 'Esther', 'Frank', 'Gloria', 'Hank', 'Imani', 'Jorge',
    'Kayla', 'Luis', 'Marisol', 'Ned', 'Olga', 'Priya', 'Quinn', 'Rosa', 'Sven', 'Tamika', 'Ulrich', 'Vera',
    'Walt', 'Xiomara', 'Yusuf', 'Zoe', 'Arjun', 'Bev', 'Cody', 'Dana', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ike',
    'Jada', 'Karl', 'Linh', 'Moe', 'Nadia', 'Otis', 'Paige', 'Raj', 'Shirley', 'Trent', 'Uma', 'Vince',
    'Wanda', 'Yolanda', 'Zack', 'Abdi', 'Brooke', 'Chuck', 'Deb', 'Emeka', 'Fern', 'Garrett', 'Hope', 'Jin', 'Lars'];
  const LAST_NAMES = ['Anderson', 'Bauer', 'Castillo', 'Dvorak', 'Eriksen', 'Fischer', 'Garcia', 'Hansen',
    'Ibrahim', 'Jensen', 'Kowalski', 'Larsen', 'Martinez', 'Nguyen', 'Olson', 'Petersen', 'Quintero', 'Ramirez',
    'Schmidt', 'Thompson', 'Underwood', 'Vang', 'Wagner', 'Xiong', 'Yoder', 'Zimmerman', 'Adeyemi', 'Brandt',
    'Chen', 'Dietrich', 'Engstrom', 'Flores', 'Gustafson', 'Hoffman', 'Iverson', 'Johansson', 'Kim', 'Lindqvist',
    'Mueller', 'Novak', 'Okafor', 'Patel', 'Rasmussen', 'Svoboda', 'Tran', 'Ulrich', 'Vogel', 'Weber', 'Yang',
    'Ziegler', 'Becker', 'Cruz', 'Duffy', 'Hernandez', 'Kaur', 'Lopez', 'Moreno', 'Nelson', 'Reyes', 'Sorensen'];

  // ---- Achievements: +1% income each, kept forever --------------------------------
  // `stat` is computed by engine.achStat(); `goal` is the threshold.
  const ACHIEVEMENTS = [
    { id: 'open',      name: 'Open for Business',     stat: 'lifetime',  goal: 100,   desc: 'Earn your first $100.' },
    { id: 'strokes1',  name: 'Pump It Up',            stat: 'strokes',   goal: 100,   desc: 'Stroke the hand pump 100 times.' },
    { id: 'strokes2',  name: 'Forearms of Steel',     stat: 'strokes',   goal: 1000,  desc: 'Stroke the hand pump 1,000 times.' },
    { id: 'psi3k',     name: 'Three Grand',           stat: 'psi',       goal: 3000,  desc: 'Run the system at 3,000 psi.' },
    { id: 'psi5k',     name: 'Spiral Staircase',      stat: 'psi',       goal: 5000,  desc: 'Run the system at 5,000 psi.' },
    { id: 'psi10k',    name: 'Ultra',                 stat: 'psi',       goal: 10000, desc: 'Run the system at 10,000 psi.' },
    { id: 'acts100',   name: 'Hundred Cylinders',     stat: 'actuators', goal: 100,   desc: 'Own 100 actuators.' },
    { id: 'acts500',   name: 'Cylinder Forest',       stat: 'actuators', goal: 500,   desc: 'Own 500 actuators.' },
    { id: 'pumps100',  name: 'Pump Room',             stat: 'pumps',     goal: 100,   desc: 'Own 100 pumps.' },
    { id: 'm1',        name: 'Millionaire Shop',      stat: 'lifetime',  goal: 1e6,   desc: 'Earn $1M in total.' },
    { id: 'b1',        name: 'Billion-Dollar Bottle Jack', stat: 'lifetime', goal: 1e9, desc: 'Earn $1B in total.' },
    { id: 't1',        name: 'Tera-Pascal Energy',    stat: 'lifetime',  goal: 1e12,  desc: 'Earn $1T in total.' },
    { id: 'tech5',     name: 'Learning Curve',        stat: 'techs',     goal: 5,     desc: 'Research 5 technologies.' },
    { id: 'techAll',   name: 'Fluid Power Scholar',   stat: 'techs',     goal: 17,    desc: 'Research every technology in one run.' },
    { id: 'staff25',   name: 'Payroll',               stat: 'staff',     goal: 25,    desc: 'Employ 25 people.' },
    { id: 'staff100',  name: 'Company Picnic',        stat: 'staff',     goal: 100,   desc: 'Employ 100 people.' },
    { id: 'manager',   name: 'Corner Office',         stat: 'managers',  goal: 1,     desc: 'Promote your first manager.' },
    { id: 'managers6', name: 'Leadership Team',       stat: 'managers',  goal: 6,     desc: 'Have 6 managers at once.' },
    { id: 'safe10',    name: 'Ten Days Safe',         stat: 'safeDays',  goal: 10,    desc: 'Go 10 shop days without an incident.' },
    { id: 'north',     name: 'Heading North',         stat: 'locations', goal: 2,     desc: 'Open your second location.' },
    { id: 'allLoc',    name: 'Iowa to the Gulf',      stat: 'locations', goal: 4,     desc: 'Open all four locations.' },
    { id: 'exec1',     name: 'C-Suite',               stat: 'execs',     goal: 1,     desc: 'Appoint your first executive.' },
    { id: 'execAll',   name: 'Full Leadership Team',  stat: 'execs',     goal: 4,     desc: 'Seat all four executives.' },
    { id: 'president', name: 'Mr. or Madam President', stat: 'president', goal: 1,    desc: 'Appoint a President.' },
    { id: 'shake',     name: 'Shake It Up',           stat: 'shakes',    goal: 1,     desc: 'Finish a company shake-up.' },
    { id: 'scada',     name: 'Control Room',          stat: 'scada',     goal: 1,     desc: 'Install a SCADA system.' },
    { id: 'file1',     name: 'Patent Pending',        stat: 'filed',     goal: 1,     desc: 'File a patent with Know-how.' },
    { id: 'file10',    name: 'Prolific Inventor',     stat: 'filed',     goal: 10,    desc: 'File 10 patents with Know-how.' },
    { id: 'board',     name: 'Boardroom',             stat: 'board',     goal: 1,     desc: 'Seat your first director.' },
    { id: 'overhaul1', name: 'Tear It Down',          stat: 'overhauls', goal: 1,     desc: 'Overhaul the shop once.' },
    { id: 'overhaul5', name: 'Serial Rebuilder',      stat: 'overhauls', goal: 5,     desc: 'Overhaul the shop five times.' },
  ];

  const CONSTANTS = {
    ambientF: 80,           // reservoir sits at shop temperature
    baseK: 0.25,            // natural heat rejection of a bare reservoir (HP/°F)
    tempLimitF: 140,        // above this, oil thins and leaks: income falls
    tempSpanF: 100,         // °F above the limit at which income hits the floor
    tempFloor: 0.2,         // worst-case thermal multiplier
    tempTauS: 15,           // seconds for temperature to close ~63% of the gap
    hpConst: 1714,          // HP = psi × GPM / 1714
    accBaseGal: 5,          // accumulator starting capacity
    accGrowth: 2.5,         // capacity multiplier per bladder upgrade
    accCostBase: 500,
    accCostGrowth: 4,
    surgeSeconds: 15,
    surgeMult: 3,
    clickBase: 1,           // $ per hand-pump stroke
    clickGal: 0.25,         // minimum accumulator charge per stroke
    khPerSqrtIncome: 0.04,  // Know-how/s = 0.04 × √($/s)
    milestones: [25, 50, 100, 200, 300, 400, 500],
    offlineRate: 0.5,
    offlineCapH: 8,
    // Departments (Order Line staffing). Each department needs 1 more person
    // per `deptPerDecade`-th of a decade production has grown since it opened;
    // the nth hire costs `hireBaseS` seconds of opening-time production × growth^n,
    // which works out to roughly that many seconds of *current* production.
    deptPerDecade: 4,
    hireGrowth: 1.778,
    hireBaseS: 10,
    deptFloor: 0.1,         // a neglected department never stops the line entirely
    surplusBonus: 0.15,     // surplus staff: income +15% × (1 − 1/coverage) per department (+7.5% at 200%)
    poolSize: 3,            // applicants waiting per department
    rerollS: 3,             // a fresh batch of applicants costs this many seconds of production
    effBase: 0.45,          // effectiveness = effBase + effPerPoint × (2×primary + secondary)/3 + trait
    effPerPoint: 0.11,      // …so an average applicant counts as ~1.05 staff, a star ~1.6
    strokeShare: 0.02,
    engKhPerStrength: 0.05, // each staff-equivalent in Engineering adds 5% Know-how
    mgrTeamPerPoint: 0.05,  // manager: team strength +5% per Leadership point
    // Engineering teams and Pak lines
    pakSeconds: 10,         // a Pak of value 1 sells for 10 s of production (through the Order Line)
    pakHoursPerStrength: 1, // engineering hours/s = this × √(Project strength): big teams coordinate less well
    pakGradePer: 0.1,       // Base-/Sys-Pak price +10% per pump type above gear you own
    controlsTechPer: 0.05,  // Controls research −5% Know-how per Controls staff-equivalent…
    controlsTechFloor: 0.5, // …down to half price
    // Executive track
    execEvery: 5,           // seconds between an executive's rounds
    execBonusPer: 0.03,     // division teams +3% strength per executive skill point
    execTargetPer: 0.02,    // executives staff Order Line teams to 100% + 2% per skill point
    execBudgetBase: 0.002,  // each action may spend 0.2% of cash…
    execBudgetPer: 0.001,   // …+0.1% per skill point
    execReplaceGap: 0.45,   // replace someone when an applicant is this much better…
    execReplaceGapPer: 0.03,// …minus 0.03 per skill point (better executives act on smaller gains)
    presReviewEvery: 30,    // seconds between the President's reviews of the C-suite
    presReplaceGap: 3,      // replace an executive when someone would be this much more skilled (−1 per 4 President skill, min 1)
    presFillSkill: 4,       // the President fills a vacant seat with anyone this skilled
    boardReplaceGap: 2,     // the Chair proposes a swap when an insider leads this much better than a director
    boardReplaceCost: 0.25, // …for a quarter of that seat's Patent price (min 1)
    execHireS: 600,         // an outside executive hire costs 10 min of production
    execPoolBoost: 2,       // outside candidates: Leadership and key stat +2
    // SCADA: Controls' high-level supervisory system (bought with Know-how)
    scadaKH: 2e6,           // install cost in Know-how
    scadaControls: 2,       // needs Telematics and Controls team strength 2+
    scadaEvery: 2,          // seconds between automation scans
    scadaTunePer: 0.005,    // loop tuning: income +0.5% per Controls strength…
    scadaTuneMax: 0.2,      // …up to +20%
    scadaBudgets: [0.01, 0.05, 0.2], // share of cash one automated action may spend
    scadaMaxPaybackS: 1800, // automation skips any buy that wouldn't pay for itself within 30 min
    // Patent Office: once every technology is researched, Know-how files patents
    patentFileKH: 1e6,      // the first filing costs 1M Know-how…
    patentFileGrowth: 1.6,  // …and each one after costs 1.6× more (counted across Overhauls)
    // Shake-up: a top-down reorganization (Board → executives → managers → employees)
    shakePhaseS: { board: 45, cxo: 60, mgr: 60, staff: 120 },
    shakeCostS: 120,        // costs 2 min of production
    shakeCooldownS: 1800,   // and can't be repeated for 30 min
    shakeIncidentMult: 3,   // incidents ×3 while it runs
    shakeDisruption: 0.9,   // Order Line teams work at 90% while it runs
    directorQBase: 0.6,     // a director's perk strength: 0.6 + 0.08 × Leadership (×1.0 at LEA 5)
    directorQPer: 0.08,
    presidentIncomePer: 0.02, // President: all income +2% per skill point
    presidentSkillDiv: 3,   // …and every executive +1 skill per 3 President skill
    mgrPoolPer: 3,          // …and reviews 1 more applicant per 3 Leadership points
    mgrEvery: 2,            // seconds between a manager's staffing checks
    mgrReviewEvery: 15,     // seconds between a manager's team reviews
    mgrReplaceGap: 0.6,     // a manager replaces someone when an applicant is this much better…
    mgrReplaceGapPer: 0.04, // …minus 0.04 per Leadership point…
    mgrReplaceGapMin: 0.2,  // …but never less than this
    mgrReviewBudget: 0.005, // and the fee (half a hire) is at most 0.5% of cash
    // Support departments
    itPerStrength: 0.04,    // IT: every Order Line department's strength +4% per IT staff-equivalent…
    itMax: 1,               // …up to +100%
    mgmtPerStrength: 0.02,  // Management: every team +2% per staff-equivalent…
    mgmtMax: 0.5,           // …up to +50%, and +1 applicant everywhere per 6 strength
    mgmtPoolPer: 6,
    purchasingPer: 0.01,    // Purchasing: equipment costs ÷ (1 + 1% × strength), floored at ×0.7
    purchasingFloor: 0.7,
    incidentPerMin: 0.3,    // Safety: incidents/min at 3,000 psi and the heat limit, with no safety staff
    incidentMinPsi: 3000,   // no incidents below 2-Wire Braid (when Safety opens)
    incidentSeconds: 30,    // an incident shuts one actuator line for this long
    safetyPer: 0.25,        // incident rate ÷ (1 + 0.25 × Safety strength)
    safeDayS: 600,          // a "shop day" without incident, for the streak bonus…
    safeDayBonus: 0.01,     // …+1% income each…
    safeDayMax: 0.25,       // …up to +25%      // a hand-pump stroke adds this share of accumulator capacity
    overhaulMin: 1e6,       // lifetime $ before the first Overhaul is offered
    patentDivisor: 1e6,     // patents = floor(patentScale × ∛(lifetime $ / 1e6))
    patentScale: 2,
    achievementBonus: 0.01, // +1% income per achievement
    patentBonus: 0.10,      // +10% income per patent (additive)
    startCash: 10,
  };

  const DATA = { PUMPS, ACTUATORS, TIERS, COOLERS, TECH, ERAS, DEPARTMENTS, PAKS, REGIONS, STATES,
    STATS, DEPT_STATS, TRAITS, TRAIT_CHANCE, FIRST_NAMES, LAST_NAMES, ENG_UPGRADES, ACHIEVEMENTS,
    EXECS, PRESIDENT, SCADA_PANEL, BOARD_COSTS, BOARD_PERKS, CONSTANTS };
  root.PW = root.PW || {};
  root.PW.DATA = DATA;
  if (typeof module !== 'undefined') module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
