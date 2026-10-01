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
      flavor: "Grandpa's tire shop. Pump, pump, pump — up goes the truck." },
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
    { id: 'prop_valves', name: 'Proportional Valves', cost: 600, requires: ['unloading'],
      desc: 'Smooth, metered motion: actuators ×1.5 income.',
      effects: { actMult: 1.5 } },
    { id: 'load_sensing', name: 'Load Sensing', cost: 2000, requires: ['prop_valves'],
      desc: 'Pumps match the load: relief heat ×0.3 again. Unlocks the Load-Sensing Pump.',
      effects: { reliefHeat: 0.3 } },
    { id: 'plc', name: 'PLC Automation', cost: 3000, requires: ['prop_valves'],
      desc: 'A ladder-logic program fires Surge automatically when the accumulator is full.',
      effects: { autoSurge: true } },
    { id: 'forged_manifold', name: 'Forged Manifolds', cost: 8000, requires: ['seal_chem'],
      desc: 'Fewer hoses, fewer leaks. Unlocks 6-Spiral hose (6,000 psi).',
      effects: {} },
    { id: 'servo', name: 'Servo Valves', cost: 20000, requires: ['load_sensing'],
      desc: 'Closed-loop control to the micron: actuators ×2 income.',
      effects: { actMult: 2 } },
    { id: 'lean', name: 'Lean Manufacturing', cost: 50000, requires: ['servo'],
      desc: 'Kaizen your supply chain: all equipment costs ×0.85.',
      effects: { costMult: 0.85 } },
    { id: 'synthetic', name: 'Synthetic Fluid', cost: 40000, requires: ['hvi_oil', 'servo'],
      desc: 'Ester-based fluid shrugs off heat: overheating starts another 40°F later.',
      effects: { tempLimit: 40 } },
    { id: 'telematics', name: 'Telematics', cost: 60000, requires: ['plc'],
      desc: 'Remote monitoring: offline progress at 100% (was 50%), up to 24 h.',
      effects: { offlineRate: 1, offlineCapH: 24 } },
    { id: 'intensifier', name: 'Pressure Intensifiers', cost: 250000, requires: ['forged_manifold', 'servo'],
      desc: 'Big piston pushes small piston. Unlocks Ultra-High Pressure (10,000 psi).',
      effects: {} },
    { id: 'digital_displacement', name: 'Digital Displacement', cost: 500000, requires: ['load_sensing', 'telematics'],
      desc: 'Unlocks the Digital Displacement pump. All pumps ×1.5 flow.',
      effects: { pumpMult: 1.5 } },
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
    clickGal: 0.25,         // accumulator charge per stroke
    khPerSqrtIncome: 0.04,  // Know-how/s = 0.04 × √($/s)
    milestones: [25, 50, 100, 200, 300, 400, 500],
    offlineRate: 0.5,
    offlineCapH: 8,
    overhaulMin: 1e6,       // lifetime $ before the first Overhaul is offered
    patentDivisor: 1e6,     // patents = floor(√(lifetime $ / 1e6))
    patentBonus: 0.10,      // +10% income per patent (additive)
    startCash: 10,
  };

  const DATA = { PUMPS, ACTUATORS, TIERS, COOLERS, TECH, CONSTANTS };
  root.PW = root.PW || {};
  root.PW.DATA = DATA;
  if (typeof module !== 'undefined') module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
