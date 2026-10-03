/*
 * Pressure Works — "The Works": the live machine at the top of the page.
 *
 * A canvas drawing of the whole shop, built from the player's actual
 * equipment: a pump bank on the tank (one motor per pump type owned), the
 * pressure header with accumulator, gauge and relief valve, the return line
 * through filter and cooler, and one station per actuator type.
 *
 * It runs like a Rube Goldberg machine: a steel ball rolls along the signal
 * rail and trips each station's valve in turn (a real sequence circuit),
 * every finished part drops onto the conveyor and rides to Shipping, and a
 * little hydraulic elevator lifts the ball back to the start. Speed follows
 * delivered flow, Surge, heat and starvation.
 *
 * Drawing only: reads state + derive(), never changes them.
 */
(function (root) {
  'use strict';

  const E = root.PW.engine;
  const { fmt, look } = root.PW.format;
  const { PUMPS, ACTUATORS, TIERS, COOLERS } = E.DATA;

  // Logical canvas size; scaled to the element with devicePixelRatio.
  // The office runs along the top; production, warehouse and shipping share
  // the floor below it (drawn in "floor" coordinates, offset by OFFICE_H).
  const OFFICE_H = 236, FLOOR_H = 560;
  const W = 2300, H = OFFICE_H + FLOOR_H;
  const FLOOR = 500, TRENCH = 532, HEADER = 120, BELT = 472;
  const TANK = { x: 44, y: 340, w: 276, h: 160 };
  const STATION_X0 = 560, STATION_W = 125;
  const RAIL = { x0: 530, x1: 1586, y0: 92, y1: 104 }; // lower rail, slopes down to the right
  const UPPER = { y0: 58, y1: 46 };                     // return rail, slopes down to the left
  const LIFT_X = 1612, BIN_X = 1716;   // the conveyor now ends at the warehouse inbound
  const CYCLE_S = 4.2;          // one full ball lap at full speed
  const RAIL_SHARE = 0.72;      // share of the lap the ball spends on the lower rail

  const reduceMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let canvas, ctx, bg, colors, handlers = {};
  let dpr = 1;
  const t = {
    g: 0, belt: 0, flow: 0, ret: 0, relief: 0, spin: 0, fan: 0, beacon: 0,
    lever: 0, clock: 0, prevPhase: {}, shipped: 0,
  };
  const products = [], particles = [];

  // ---- Setup -----------------------------------------------------------------

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, f) => (cs.getPropertyValue(n).trim() || f);
    return {
      bg: v('--bg', '#111418'), panel: v('--panel', '#1a2027'), panel2: v('--panel-2', '#222a33'),
      edge: v('--edge', '#2e3843'), text: v('--text', '#dde3ea'), muted: v('--muted', '#8a96a3'),
      oil: v('--oil', '#f2a900'), oilDim: v('--oil-dim', '#8a6400'), pressure: v('--pressure', '#e5484d'),
      cool: v('--cool', '#3aa0ff'), ok: v('--ok', '#46c37b'), steel: v('--steel', '#9aa7b4'),
      mono: v('--font-mono', 'monospace'), head: v('--font-head', 'sans-serif'),
    };
  }

  function init(el, h = {}) {
    canvas = el;
    ctx = canvas.getContext('2d');
    handlers = h;
    colors = readColors();
    canvas.style.aspectRatio = `${W} / ${H}`;
    resize();
    root.addEventListener('resize', resize);
    // Don't draw while the machine is scrolled out of view.
    if ('IntersectionObserver' in root) {
      new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }).observe(canvas);
    }
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMove);
  }

  // Quality: 1 = full, 0 = low (lower resolution, 30 fps). Drops automatically
  // when frames run long, so phones stay smooth.
  let quality = 1, slowFrames = 0, fastFrames = 0, skip = false, visible = true;
  function resize() {
    const r0 = canvas.getBoundingClientRect();
    // The canvas has ~2300 logical px; more backing pixels than ~1.5× its CSS size is wasted on phones.
    const cap = quality ? (r0.width < 1300 ? 1.5 : 2) : 1;
    dpr = Math.min(cap, root.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    const cssW = Math.max(1, r.width);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssW * (H / W) * dpr);
    bg = null; // rebuild the static backdrop at the new size
  }

  const scale = () => canvas.width / W;

  // ---- Hit testing (click a part of the machine to jump to its shop tab) ------

  function hit(ev) {
    const r = canvas.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * W, ya = ((ev.clientY - r.top) / r.height) * H;
    if (ya < OFFICE_H) {
      const room = ROOMS[Math.floor(x / ROOM_W)];
      return room ? { tab: 'company', dept: room.id } : null;
    }
    const y = ya - OFFICE_H;
    if (x > WH_X) return { tab: 'company', dept: 'warehouse' };
    if (x > TANK.x - 34 && x < TANK.x + 4 && y > TANK.y - 40 && y < TANK.y + 110) return { stroke: true };
    if (x >= STATION_X0 && x < STATION_X0 + STATION_W * 8 && y > 130 && y < FLOOR) {
      return { tab: 'actuators', id: ACTUATORS[Math.floor((x - STATION_X0) / STATION_W)].id };
    }
    if (x > TANK.x - 30 && x < TANK.x + TANK.w && y > 230 && y < FLOOR) return { tab: 'pumps' };
    if (x > 330 && x < 540 && y > 10) return { tab: 'system' };
    return null;
  }
  function onClick(ev) {
    const h = hit(ev);
    if (h && h.stroke && handlers.stroke) handlers.stroke(ev);
    else if (h && handlers.open) handlers.open(h.tab, h.id, h.dept);
  }
  function onMove(ev) { canvas.style.cursor = hit(ev) ? 'pointer' : 'default'; }

  // ---- Small drawing helpers --------------------------------------------------

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const frac = (v) => v - Math.floor(v);
  const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));

  function rect(x, y, w, h, fill, stroke, lw = 1.5) {
    if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h); }
  }
  function rrect(x, y, w, h, r, fill, stroke, lw = 1.5) {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function circle(x, y, r, fill, stroke, lw = 1.5) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  function line(pts, stroke, lw = 1.5) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke();
  }
  function text(s, x, y, { size = 11, color = colors.muted, align = 'left', font = colors.mono, weight = '' } = {}) {
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.fillText(s, x, y);
  }

  /** A pipe: dark casing, steel highlight, and (optionally) moving oil dashes. */
  function pipe(pts, w = 10) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    line(pts, '#0b0e11', w + 3);
    line(pts, '#3a4652', w);
    ctx.globalAlpha = 0.35; line(pts.map(([x, y]) => [x - 1, y - 1]), colors.steel, 1.5); ctx.globalAlpha = 1;
  }
  function oil(pts, offset, color, w = 4, dash = [7, 9]) {
    ctx.save();
    ctx.setLineDash(dash); ctx.lineDashOffset = -offset;
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    line(pts, color, w);
    ctx.restore();
  }

  // ---- Static backdrop (wall, floor, trench, rails, header), cached -----------

  function buildBackdrop() {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const b = c.getContext('2d');
    const saved = ctx; ctx = b;
    ctx.setTransform(scale(), 0, 0, scale(), 0, 0);

    rect(0, 0, W, H, colors.bg);
    drawOfficeBackdrop();
    ctx.translate(0, OFFICE_H);
    // Wall with blueprint grid and a painted stripe.
    ctx.globalAlpha = 0.5;
    for (let x = 0; x < W; x += 24) line([[x, 0], [x, FLOOR]], 'rgba(255,255,255,0.03)', 1);
    for (let y = 0; y < FLOOR; y += 24) line([[0, y], [W, y]], 'rgba(255,255,255,0.03)', 1);
    ctx.globalAlpha = 1;
    rect(0, 300, W, 10, 'rgba(242,169,0,0.06)');

    // Floor slab with hazard edge, and the cut-away trench below it.
    rect(0, FLOOR, W, FLOOR_H - FLOOR, '#0c0f12');
    for (let x = 0; x < W; x += 28) {
      ctx.fillStyle = 'rgba(242,169,0,0.55)';
      ctx.beginPath(); ctx.moveTo(x, FLOOR); ctx.lineTo(x + 14, FLOOR); ctx.lineTo(x + 8, FLOOR + 6); ctx.lineTo(x - 6, FLOOR + 6); ctx.fill();
    }
    line([[0, FLOOR], [W, FLOOR]], colors.edge, 2);
    rect(330, TRENCH - 16, W - 330, 30, 'rgba(0,0,0,0.35)', colors.edge, 1);
    text('RETURN TRENCH', 1450, H - 6, { size: 9 });

    // Signal rails for the ball run.
    line([[RAIL.x0, RAIL.y0], [RAIL.x1, RAIL.y1]], colors.steel, 2);
    line([[RAIL.x0, RAIL.y0 + 5], [RAIL.x1, RAIL.y1 + 5]], colors.edge, 1.5);
    line([[LIFT_X - 14, UPPER.y0], [RAIL.x0 + 8, UPPER.y1]], colors.steel, 2);
    line([[LIFT_X - 14, UPPER.y0 + 5], [RAIL.x0 + 8, UPPER.y1 + 5]], colors.edge, 1.5);
    // drop chute from the return rail onto the lower rail
    line([[RAIL.x0 + 4, UPPER.y1 + 5], [RAIL.x0 - 8, RAIL.y0 - 10], [RAIL.x0, RAIL.y0 - 2]], colors.steel, 1.5);
    for (let x = RAIL.x0 + 40; x < RAIL.x1; x += 90) line([[x, RAIL.y0 + 6], [x, HEADER - 8]], colors.edge, 1.5);
    text('SEQUENCE RAIL', RAIL.x0 + 4, 40, { size: 9 });

    // Conveyor frame and legs (the belt itself animates).
    rect(STATION_X0 - 20, BELT + 12, BIN_X - STATION_X0 + 20, 6, '#222a33', colors.edge, 1);
    for (let x = STATION_X0; x < BIN_X; x += 62) line([[x, BELT + 18], [x - 4, FLOOR], ], colors.edge, 2), line([[x, BELT + 18], [x + 4, FLOOR]], colors.edge, 2);

    drawWarehouseBackdrop();

    ctx = saved;
    return c;
  }

  // ---- The frame --------------------------------------------------------------

  function frame(s, d, dt) {
    if (!ctx || !d || !visible) return;
    if (!quality) { skip = !skip; if (skip) { pending += dt; return; } dt += pending; pending = 0; }
    const t0 = performance.now();
    draw(s, d, dt);
    adapt(performance.now() - t0, dt);
  }
  let pending = 0;
  function adapt(cost, dt) {
    // Long draws or a low frame rate for ~2 s in a row → low quality.
    if (quality && (cost > 8 || dt > 0.025)) { if (++slowFrames > 90) { quality = 0; resize(); } }
    else slowFrames = Math.max(0, slowFrames - 1);
    if (!quality && cost < 3 && dt < 0.04) { if (++fastFrames > 600) { quality = 1; fastFrames = 0; resize(); } }
    else fastFrames = 0;
  }

  function draw(s, d, dt) {
    if (!bg) bg = buildBackdrop();
    dt = Math.min(dt, 0.1) * (reduceMotion ? 0.25 : 1);
    t.clock += dt;

    // How hard the machine is running.
    const running = d.demand > 0;
    const speed = running ? clamp(d.utilization, 0.05, 1) * (d.surging ? 1.8 : 1) * (0.55 + 0.45 * d.thermalMult) : 0;
    const flowRate = (q) => (q > 0 ? 20 + 18 * Math.log10(1 + q) : 0);
    t.g = frac(t.g + (dt / CYCLE_S) * (running ? speed : 0.15));
    t.flow += flowRate(d.supply) * dt * (d.surging ? 1.6 : 1);
    t.ret += flowRate(Math.min(d.supply, d.demand)) * dt;
    t.relief += flowRate(d.overRelief) * dt * 1.5;
    t.spin += dt * (d.supply > 0 ? 6 + 3 * Math.log10(1 + d.supply) : 0);
    t.fan += dt * (4 + clamp((s.temp - 80) / 20, 0, 12));
    t.belt += dt * beltSpeed(running, speed);
    t.beacon += dt * 5;
    t.lever = Math.max(0, t.lever - dt * 2.5);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(scale(), 0, 0, scale(), 0, 0);

    drawOffice(s, d);
    ctx.save();
    ctx.translate(0, OFFICE_H);
    drawReturnLines(s, d);
    drawTank(s, d);
    drawPumps(s, d);
    drawCooler(s, d);
    drawHeader(s, d);
    drawAccumulator(s, d);
    drawGauge(s, d);
    drawRelief(s, d);
    drawStations(s, d, speed);
    drawConveyor(dt, speed);
    drawBall(running);
    drawWarehouse(s, d, dt, speed);
    drawShipping(dt);
    drawParticles(dt);
    drawOverlay(s, d);
    ctx.restore();
  }

  // ---- Return side ------------------------------------------------------------

  function returnPath() {
    return [[STATION_X0 + STATION_W * 8 - 20, TRENCH], [490, TRENCH], [490, 452], [474, 452]];
  }
  function drawReturnLines(s, d) {
    // Each owned station's return drops into the trench.
    ACTUATORS.forEach((a, i) => {
      if (!s.actuators[a.id]) return;
      const cx = STATION_X0 + STATION_W * (i + 0.5);
      pipe([[cx + 22, 168], [cx + 22, 180], [cx + 57, 180], [cx + 57, TRENCH]], 5);
    });
    const p = returnPath();
    pipe(p, 10);
    if (d.demand > 0 && d.supply > 0) oil(p, t.ret, colors.oilDim, 4);
    // Cooler outlet → filter → tank.
    const out = [[360, 452], [346, 452], [346, 420], [TANK.x + TANK.w, 420]];
    pipe(out, 10);
    if (d.supply > 0) oil(out, t.ret, colors.oilDim, 4);
    // Filter canister on the tank return.
    rrect(334, 392, 24, 26, 4, '#2b333c', colors.steel, 1.5);
    line([[338, 400], [354, 400]], colors.muted, 1);
    line([[338, 406], [354, 406]], colors.muted, 1);
    text('FILTER', 346, 386, { size: 8, align: 'center' });
  }

  // ---- Tank, hand pump, pump bank ---------------------------------------------

  function oilColor(s, d) {
    const heat = clamp((s.temp - 80) / (d.tempLimit + 40 - 80), 0, 1);
    return `hsl(${42 - 38 * heat} 90% ${50 - 14 * heat}%)`;
  }

  function drawTank(s, d) {
    const { x, y, w, h } = TANK;
    // body
    rrect(x, y, w, h, 4, '#26303a', colors.steel, 2);
    for (let i = 1; i < 4; i++) line([[x + 6, y + (h / 4) * i], [x + w - 6, y + (h / 4) * i]], 'rgba(0,0,0,0.25)', 1);
    // stenciled company name
    text('IFP MSI', x + w / 2, y + 62, { size: 22, align: 'center', color: 'rgba(221,227,234,0.18)', font: colors.head, weight: '600' });
    text('HYDRAULIC POWER UNIT', x + w / 2, y + 78, { size: 9, align: 'center', color: 'rgba(221,227,234,0.22)' });
    // sight glass with oil level (drops a little while the accumulator charges)
    const level = 0.72 - 0.18 * clamp(s.accCharge / d.accCap, 0, 1);
    rrect(x + w - 34, y + 20, 16, h - 40, 3, '#0d1013', colors.steel, 1.5);
    const gh = (h - 44) * level;
    rect(x + w - 32, y + h - 22 - gh, 12, gh, oilColor(s, d));
    // thermometer
    const tf = clamp((s.temp - 60) / (d.tempLimit + 60 - 60), 0, 1);
    rrect(x + 14, y + 22, 8, h - 48, 4, '#0d1013', colors.steel, 1);
    rect(x + 16, y + h - 28 - (h - 54) * tf, 4, (h - 54) * tf, s.temp > d.tempLimit ? colors.pressure : colors.oil);
    text(`${Math.round(s.temp)}°F`, x + 18, y + h - 8, { size: 9, align: 'center', color: s.temp > d.tempLimit ? colors.pressure : colors.muted });
    // breather cap; steam when overheating
    rect(x + 60, y - 14, 18, 14, '#3a4652', colors.steel, 1);
    if (s.temp > d.tempLimit && Math.random() < 0.25) puff(x + 69, y - 16, 'steam');
    // heat shimmer above a hot tank
    if (s.temp > d.tempLimit - 15) {
      ctx.globalAlpha = clamp((s.temp - d.tempLimit + 15) / 40, 0, 0.5);
      for (let i = 0; i < 5; i++) {
        const sx = x + 30 + i * 50;
        ctx.beginPath(); ctx.moveTo(sx, y - 4);
        for (let k = 1; k < 6; k++) ctx.lineTo(sx + Math.sin(t.clock * 3 + k + i) * 4, y - 4 - k * 9);
        ctx.strokeStyle = colors.pressure; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // hand pump on the left side: lever swings on each stroke
    const px = x - 6, py = y + 34;
    rect(px - 14, py, 16, 52, '#3a4652', colors.steel, 1.5);
    const ang = -0.9 + 0.8 * Math.sin(t.lever * Math.PI);
    ctx.save(); ctx.translate(px - 6, py + 2); ctx.rotate(ang);
    line([[0, 0], [0, -56]], colors.steel, 4);
    circle(0, -58, 5, colors.pressure);
    ctx.restore();
    circle(px - 6, py + 2, 3, colors.steel);
    text('HAND PUMP', px - 6, py + 68, { size: 8, align: 'center' });
    if (t.lever > 0.6 && Math.random() < 0.5) spark(px - 6, py - 30, colors.oil, 1);
  }

  function pumpSlots(s) {
    return PUMPS.filter((p) => s.pumps[p.id] > 0);
  }

  function drawPumps(s, d) {
    const owned = pumpSlots(s);
    const collectorY = 252;
    const slotW = 43;
    const xs = owned.map((_, i) => TANK.x + 18 + i * slotW);
    // collector pipe from the pumps to the riser
    const right = 338;
    if (owned.length) {
      const coll = [[xs[0] + 30, collectorY], [right, collectorY], [right, HEADER]];
      pipe(coll, 12);
      if (d.supply > 0) oil(coll, t.flow, colors.oil, 5);
    } else {
      text('No pumps yet', TANK.x + 60, 300, { size: 10 });
    }
    owned.forEach((p, i) => {
      const x = xs[i], n = s.pumps[p.id];
      // discharge riser
      const riser = [[x + 30, TANK.y - 4], [x + 30, collectorY]];
      pipe(riser, 6);
      if (d.supply > 0) oil(riser, t.flow, colors.oil, 3, [5, 7]);
      // motor (finned) + coupling + pump bell
      rrect(x, TANK.y - 84, 26, 56, 4, '#2f3a45', colors.steel, 1.5);
      for (let k = 0; k < 6; k++) line([[x + 3, TANK.y - 78 + k * 8], [x + 23, TANK.y - 78 + k * 8]], '#1b2229', 1);
      rrect(x + 2, TANK.y - 94, 22, 10, 3, '#3a4652', colors.steel, 1);   // fan cowl
      // rotating coupling: spokes spin with flow
      const cx = x + 13, cy = TANK.y - 20;
      circle(cx, cy, 8, '#1b2229', colors.steel, 1);
      for (let k = 0; k < 3; k++) {
        const a = t.spin * (1 + i * 0.07) + (k * Math.PI * 2) / 3;
        line([[cx, cy], [cx + Math.cos(a) * 7, cy + Math.sin(a) * 7]], colors.oil, 1.5);
      }
      rrect(x + 3, TANK.y - 12, 20, 12, 2, '#3a4652', colors.steel, 1);
      text(p.name.split(' ')[0].replace('Load-Sensing', 'LS').replace('Digital', 'DD').slice(0, 6).toUpperCase(),
        x + 13, TANK.y - 100, { size: 8, align: 'center', color: colors.text });
      text(`×${n}`, x + 13, TANK.y - 110, { size: 9, align: 'center', color: colors.oil, weight: '600' });
    });
    if (owned.length) text(`${fmt(d.supply)} GPM`, right + 10, collectorY + 14, { size: 10, color: colors.oil });
  }

  function drawCooler(s, d) {
    const x = 362, y = 392, w = 112, h = 92;
    const units = COOLERS.reduce((a, c) => a + s.coolers[c.id], 0);
    rrect(x, y, w, h, 4, '#1f2830', colors.steel, 1.5);
    // fins
    for (let k = 0; k < 13; k++) line([[x + 6 + k * 8, y + 6], [x + 6 + k * 8, y + h - 6]], units ? '#3e5566' : '#2a333c', 2);
    // fans: one per cooler type owned, spinning faster when hot
    const types = COOLERS.filter((c) => s.coolers[c.id] > 0);
    const n = Math.max(1, types.length);
    for (let i = 0; i < Math.min(n, 4); i++) {
      const fx = x + (w / (Math.min(n, 4) + 1)) * (i + 1), fy = y + h / 2, r = Math.min(20, w / (Math.min(n, 4) * 2.4));
      circle(fx, fy, r + 2, '#0d1013', colors.steel, 1);
      if (!types.length) continue;
      for (let k = 0; k < 4; k++) {
        const a = t.fan * (1 + i * 0.13) + (k * Math.PI) / 2;
        ctx.beginPath(); ctx.moveTo(fx, fy);
        ctx.arc(fx, fy, r, a, a + 0.7); ctx.closePath();
        ctx.fillStyle = colors.cool; ctx.globalAlpha = 0.8; ctx.fill(); ctx.globalAlpha = 1;
      }
      circle(fx, fy, 3, colors.steel);
    }
    text(units ? `COOLER ×${units} · k ${fmt(d.k)}` : 'COOLER (none)', x + w / 2, y + h + 12, { size: 8, align: 'center' });
  }

  // ---- Header, accumulator, gauge, relief --------------------------------------

  function headerPath() { return [[338, HEADER], [STATION_X0 + STATION_W * 8 - 10, HEADER]]; }

  function drawHeader(s, d) {
    const p = headerPath();
    if (d.surging) {
      ctx.globalAlpha = 0.35; line(p, colors.cool, 26); ctx.globalAlpha = 1; pipe(p, 16);
    } else pipe(p, 16);
    if (d.supply > 0) oil(p, t.flow, d.surging ? '#cfe9ff' : colors.oil, 6, [10, 10]);
    text(`HEADER · ${fmt(d.psi)} PSI`, 348, HEADER + 24, { size: 9, color: colors.text });
    // starvation beacon
    if (d.utilization < 1 && d.demand > 0) {
      const on = Math.sin(t.beacon) > 0;
      circle(560, HEADER - 22, 7, on ? colors.oil : '#5a4400', colors.steel, 1);
      if (on) { ctx.globalAlpha = 0.25; circle(560, HEADER - 22, 16, colors.oil); ctx.globalAlpha = 1; }
      text('LOW FLOW', 574, HEADER - 18, { size: 9, color: colors.oil, weight: '600' });
    }
  }

  function drawAccumulator(s, d) {
    const x = 392, top = 14, w = 36, h = 82;
    pipe([[x + w / 2, top + h], [x + w / 2, HEADER]], 6);
    rrect(x, top, w, h, 17, '#26303a', colors.steel, 2);
    const f = clamp(s.accCharge / d.accCap, 0, 1);
    // oil below, nitrogen bladder above
    const oilH = (h - 10) * f;
    ctx.save();
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x + 3, top + 3, w - 6, h - 6, 14) : ctx.rect(x + 3, top + 3, w - 6, h - 6); ctx.clip();
    rect(x, top + h - 4 - oilH, w, oilH + 4, d.surging ? '#cfe9ff' : colors.oil);
    rect(x, top, w, h - 4 - oilH, 'rgba(58,160,255,0.25)');
    ctx.restore();
    text('N₂', x + w / 2, top + 16, { size: 9, align: 'center', color: colors.cool });
    text('ACCUM', x + w / 2, top + h + 12, { size: 8, align: 'center' });
    if (f >= 0.999 && !d.surging) {
      const pulse = 0.5 + 0.5 * Math.sin(t.clock * 6);
      ctx.globalAlpha = 0.3 + 0.4 * pulse; rrect(x - 3, top - 3, w + 6, h + 6, 19, null, colors.cool, 2); ctx.globalAlpha = 1;
      text('READY', x + w / 2, top - 4, { size: 8, align: 'center', color: colors.cool, weight: '600' });
    }
  }

  function drawGauge(s, d) {
    const x = 470, y = 64, r = 26;
    pipe([[x, y + r], [x, HEADER]], 5);
    circle(x, y, r + 3, '#0d1013', colors.steel, 2);
    const max = niceMax(d.psi * 1.25);
    for (let i = 0; i <= 10; i++) {
      const a = (-225 + 27 * i) * Math.PI / 180;
      line([[x + Math.cos(a) * (r - (i % 5 ? 4 : 7)), y + Math.sin(a) * (r - (i % 5 ? 4 : 7))], [x + Math.cos(a) * r, y + Math.sin(a) * r]], colors.muted, 1);
    }
    const za = (-225 + 270 * (d.psi / max)) * Math.PI / 180;
    ctx.beginPath(); ctx.arc(x, y, r - 2, za, 45 * Math.PI / 180); ctx.strokeStyle = colors.pressure; ctx.lineWidth = 3; ctx.stroke();
    const wob = d.demand > 0 ? 0.9 + 0.08 * Math.sin(t.g * Math.PI * 16) : 0.6;
    const shown = d.supply > 0 ? d.psi * wob * Math.min(1, 0.3 + d.utilization) : 0;
    const a = (-225 + 270 * clamp(shown / max, 0, 1.02)) * Math.PI / 180;
    line([[x, y], [x + Math.cos(a) * (r - 5), y + Math.sin(a) * (r - 5)]], colors.pressure, 2);
    circle(x, y, 3, colors.steel);
    text('PSI', x, y + 14, { size: 7, align: 'center' });
  }

  function drawRelief(s, d) {
    const x = 520, y = 140;
    pipe([[x, HEADER], [x, y]], 6);
    rrect(x - 13, y, 26, 44, 2, '#2b333c', colors.steel, 1.5);
    // spring
    ctx.beginPath(); ctx.moveTo(x + 13, y + 10);
    for (let k = 0; k < 6; k++) ctx.lineTo(x + 19 + (k % 2) * 6, y + 12 + k * 5);
    ctx.strokeStyle = colors.steel; ctx.lineWidth = 1.2; ctx.stroke();
    const dump = [[x, y + 44], [x, TRENCH - 8], [x - 30, TRENCH - 8]];
    pipe(dump, 6);
    text('RELIEF', x, y + 58, { size: 8, align: 'center' });
    if (d.overRelief > 0) {
      oil(dump, t.relief, colors.pressure, 3, [6, 6]);
      if (Math.random() < 0.6) puff(x + 24, y + 8, 'spray');
      text(`DUMPING ${fmt(d.overRelief)} GPM`, x - 18, y + 30, { size: 9, align: 'right', color: colors.pressure, weight: '600' });
    }
  }

  function niceMax(v) {
    const p = 10 ** Math.floor(Math.log10(Math.max(v, 1))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  // ---- Stations ----------------------------------------------------------------

  function stationPhase(i) {
    const cx = STATION_X0 + STATION_W * (i + 0.5);
    const trigger = ((cx - RAIL.x0) / (RAIL.x1 - RAIL.x0)) * RAIL_SHARE;
    return frac(t.g - trigger);
  }
  // Extension 0→1→0 over the first 60% of each station's cycle.
  const extension = (ph) => (ph < 0.6 ? Math.sin((Math.PI * ph) / 0.6) : 0);

  function drawStations(s, d, speed) {
    const P = d.psi;
    const labels = [];
    ACTUATORS.forEach((a, i) => {
      const cx = STATION_X0 + STATION_W * (i + 0.5);
      const n = s.actuators[a.id];
      const unlocked = E.isUnlocked(s, 'actuator', a.id);
      const active = n > 0 && P >= a.psi;
      const ph = stationPhase(i);
      const e = active && speed > 0 ? ease(extension(ph)) : 0;

      // slot divider; labels are drawn after the machines so nothing covers them
      line([[cx - STATION_W / 2, 146], [cx - STATION_W / 2, FLOOR - 40]], 'rgba(255,255,255,0.04)', 1);
      labels.push({ a, cx, n, unlocked, active });

      // drop from header + directional valve with solenoid lamps
      if (active) {
        pipe([[cx, HEADER], [cx, 146]], 6);
        oil([[cx, HEADER], [cx, 146]], t.flow, colors.oil, 3, [5, 6]);
      } else {
        circle(cx, HEADER + 8, 4, '#2b333c', colors.steel, 1); // capped tee
      }
      ctx.globalAlpha = active ? 1 : 0.35;
      rect(cx - 22, 146, 22, 22, '#2b333c', colors.steel, 1.2);
      rect(cx, 146, 22, 22, '#2b333c', colors.steel, 1.2);
      line(e > 0.02 ? [[cx - 18, 164], [cx - 4, 150]] : [[cx - 18, 157], [cx - 4, 157]], colors.steel, 1.2);
      circle(cx - 28, 157, 4, e > 0.02 ? colors.ok : '#1b3324');
      circle(cx + 28, 157, 4, active && e <= 0.02 ? '#1b3324' : '#1b3324');
      ctx.globalAlpha = 1;
      if (active) {
        const work = [[cx - 8, 168], [cx - 8, 252]];
        pipe(work, 5);
        if (e > 0.02) oil(work, t.flow, colors.oil, 2, [4, 5]);
      }

      // the machine itself
      ctx.save();
      if (!active) ctx.globalAlpha = unlocked ? 0.3 : 0.16;
      STATION_DRAW[a.id](cx, e, active);
      ctx.restore();

      // incident: the line is down
      if (s.safety && s.safety.incident && s.safety.incident.id === a.id) {
        const on = Math.sin(t.beacon * 1.5) > 0;
        ctx.globalAlpha = on ? 0.22 : 0.1; rect(cx - STATION_W / 2 + 2, 236, STATION_W - 4, BELT - 236, colors.pressure); ctx.globalAlpha = 1;
        rrect(cx - 44, 286, 88, 34, 4, 'rgba(17,20,24,0.9)', colors.pressure, 1.5);
        text('LINE DOWN', cx, 300, { size: 11, align: 'center', color: colors.pressure, weight: '700' });
        text(`${Math.ceil(s.safety.incident.left)}s`, cx, 314, { size: 10, align: 'center', color: colors.pressure });
        if (Math.random() < 0.5) puff(cx + (Math.random() - 0.5) * 40, 330, 'spray');
      }

      // finished part → conveyor (fires once per cycle at full extension)
      const prev = t.prevPhase[a.id] ?? ph;
      if (active && speed > 0 && prev < 0.3 && ph >= 0.3) spawnProduct(a.id, cx);
      t.prevPhase[a.id] = ph;
    });

    for (const { a, cx, n, unlocked, active } of labels) {
      rrect(cx - 58, 196, 116, 34, 4, 'rgba(17,20,24,0.85)', active ? colors.edge : null, 1);
      ctx.globalAlpha = active ? 1 : unlocked ? 0.6 : 0.4;
      const name = a.name.replace('Injection Molding Press', 'Injection Molder').replace('Open-Die Forging Press', 'Forging Press');
      text(name.toUpperCase(), cx, 210, { size: 9, align: 'center', color: active ? colors.text : colors.muted, weight: '600' });
      ctx.globalAlpha = 1;
      if (active) {
        text(`×${n} · $${fmt(d.perActuator[a.id] * d.utilization * d.thermalMult * d.surgeMult * d.m.patentMult)}/s`,
          cx, 224, { size: 9, align: 'center', color: colors.oil });
      } else {
        const why = !unlocked ? (a.requires ? 'R&D LOCKED' : `NEEDS ${fmt(a.psi)} PSI`) : 'FOR SALE';
        text(why, cx, 224, { size: 9, align: 'center', color: unlocked ? colors.ok : colors.muted });
      }
    }
  }

  const STEEL = '#59687a', DARK = '#2b333c';

  const STATION_DRAW = {
    // Bottle jack lifting a pickup truck.
    jack(cx, e) {
      const base = BELT - 6;
      rect(cx - 30, base - 8, 60, 8, DARK, colors.steel, 1.2);
      rect(cx - 12, base - 60, 24, 52, '#3a4652', colors.steel, 1.2);
      const top = base - 60 - e * 46;
      rect(cx - 6, top, 12, base - 60 - top + 2, '#c9d2db');
      rect(cx - 14, top - 4, 28, 5, colors.steel);
      // truck rides on the saddle
      const ty = top - 28;
      rrect(cx - 44, ty, 70, 22, 3, '#7a2f2f', '#a64242', 1.2);
      rrect(cx - 10, ty - 14, 28, 16, 3, '#7a2f2f', '#a64242', 1.2);
      rect(cx - 4, ty - 10, 16, 8, '#9fc7e8');
      circle(cx - 30, ty + 24 + e * 4, 9, '#14181c', '#555', 2);
      circle(cx + 14, ty + 24 + e * 4, 9, '#14181c', '#555', 2);
    },
    // Horizontal ram drives a log into a wedge.
    splitter(cx, e) {
      const y = BELT - 30;
      rect(cx - 56, y + 16, 112, 10, DARK, colors.steel, 1.2);
      rect(cx - 56, y - 8, 30, 24, '#3a4652', colors.steel, 1.2);
      const rx = cx - 26 + e * 34;
      rect(cx - 26, y, rx - (cx - 26), 8, '#c9d2db');
      rect(rx, y - 10, 6, 28, colors.steel);
      // wedge
      ctx.beginPath(); ctx.moveTo(cx + 54, y - 14); ctx.lineTo(cx + 30, y + 4); ctx.lineTo(cx + 54, y + 22); ctx.closePath();
      ctx.fillStyle = colors.steel; ctx.fill();
      const lx = rx + 20;
      if (e > 0.85) {
        circleHalf(lx + 2, y + 4 - 6, 15, true); circleHalf(lx + 2, y + 4 + 6, 15, false);
      } else {
        circle(lx, y + 4, 15, '#7a5230', '#a87444', 2);
        circle(lx, y + 4, 9, null, '#a87444', 1); circle(lx, y + 4, 4, null, '#a87444', 1);
      }
    },
    // H-frame shop press seating a bearing.
    press(cx, e) {
      const base = BELT - 6;
      rect(cx - 44, 250, 10, base - 250, '#3a4652', colors.steel, 1.2);
      rect(cx + 34, 250, 10, base - 250, '#3a4652', colors.steel, 1.2);
      rect(cx - 48, 244, 96, 16, '#3a4652', colors.steel, 1.2);
      rect(cx - 12, 236, 24, 24, '#4a5866', colors.steel, 1.2);
      const ram = 260 + 40 + e * 70;
      rect(cx - 5, 260, 10, ram - 260, '#c9d2db');
      rect(cx - 18, ram, 36, 8, colors.steel);
      rect(cx - 40, base - 40, 80, 10, DARK, colors.steel, 1.2);
      const sq = e > 0.9 ? 3 : 0;
      ctx.beginPath(); ctx.ellipse(cx, base - 48 + sq / 2, 16, 7 - sq, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#b8c4cf'; ctx.fill(); ctx.strokeStyle = '#6b7a88'; ctx.stroke();
      if (e > 0.95 && Math.random() < 0.4) spark(cx + 14, base - 48, '#fff', 2);
    },
    // Excavator: boom, stick and bucket.
    excavator(cx, e) {
      const base = BELT - 6;
      rrect(cx - 50, base - 16, 64, 16, 8, '#1b2229', colors.steel, 1.2);
      for (let k = 0; k < 5; k++) circle(cx - 42 + k * 12, base - 8, 4, '#3a4652');
      rrect(cx - 44, base - 52, 46, 36, 3, '#b07d12', '#d9a21a', 1.2);
      rect(cx - 36, base - 46, 18, 16, '#9fc7e8');
      const px = cx - 2, py = base - 40;
      const boomA = -1.15 + 0.55 * e, stickA = boomA + 1.9 - 1.1 * e;
      const bx = px + Math.cos(boomA) * 58, by = py + Math.sin(boomA) * 58;
      const sx = bx + Math.cos(stickA) * 44, sy = by + Math.sin(stickA) * 44;
      line([[px, py], [bx, by]], '#d9a21a', 7);
      line([[bx, by], [sx, sy]], '#d9a21a', 5);
      line([[px + 6, py + 6], [(px + bx) / 2, (py + by) / 2]], '#c9d2db', 3); // boom cylinder
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(stickA + 0.6 + 0.9 * e);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(14, 0); ctx.lineTo(10, 12); ctx.lineTo(-2, 10); ctx.closePath();
      ctx.fillStyle = '#5a6672'; ctx.fill();
      if (e > 0.5) { ctx.fillStyle = '#6b4a2a'; ctx.fillRect(1, 2, 9, 6); }
      ctx.restore();
      // dirt pile
      ctx.beginPath(); ctx.moveTo(cx + 22, base); ctx.quadraticCurveTo(cx + 40, base - 26, cx + 58, base); ctx.fillStyle = '#5a3e22'; ctx.fill();
      if (e > 0.9 && Math.random() < 0.5) spark(sx, sy, '#7a5230', 2);
    },
    // Injection molding: barrel, hopper, clamp.
    molding(cx, e) {
      const base = BELT - 6;
      rect(cx - 56, base - 28, 112, 28, DARK, colors.steel, 1.2);
      rect(cx - 56, base - 58, 40, 14, '#3a4652', colors.steel, 1.2);           // barrel
      ctx.beginPath(); ctx.moveTo(cx - 48, base - 58); ctx.lineTo(cx - 40, base - 76); ctx.lineTo(cx - 26, base - 76); ctx.lineTo(cx - 30, base - 58); ctx.fillStyle = '#4a5866'; ctx.fill();
      rect(cx - 16, base - 78, 8, 50, '#4a5866', colors.steel, 1.2);              // fixed platen
      const mp = cx - 6 + (1 - e) * 26;
      rect(mp, base - 78, 8, 50, '#4a5866', colors.steel, 1.2);                   // moving platen
      rect(mp + 8, base - 58, cx + 40 - mp - 8, 8, '#c9d2db');                    // tie rod / ram
      rect(cx + 40, base - 70, 16, 34, '#3a4652', colors.steel, 1.2);             // clamp cylinder
      if (e > 0.8) { rect(cx - 16, base - 55, 4, 6, colors.oil); rect(cx - 8, base - 62, Math.max(2, mp - cx + 8), 18, 'rgba(58,160,255,0.6)'); }
    },
    // Open-die forging press squashing a glowing billet.
    forge(cx, e) {
      const base = BELT - 6;
      rect(cx - 54, 238, 14, base - 238, '#30383f', colors.steel, 1.2);
      rect(cx + 40, 238, 14, base - 238, '#30383f', colors.steel, 1.2);
      rect(cx - 58, 232, 116, 22, '#30383f', colors.steel, 1.2);
      rect(cx - 18, 222, 36, 12, '#4a5866', colors.steel, 1.2);
      const die = 254 + 50 + e * 92;
      rect(cx - 8, 254, 16, die - 254, '#c9d2db');
      rect(cx - 30, die, 60, 14, '#59687a', colors.steel, 1.2);
      rect(cx - 34, base - 22, 68, 22, '#30383f', colors.steel, 1.2);              // anvil
      const squash = ease(clamp((e - 0.7) / 0.3, 0, 1));
      const bh = 34 - 16 * squash, bw = 30 + 20 * squash;
      const glow = ctx.createLinearGradient(0, base - 22 - bh, 0, base - 22);
      glow.addColorStop(0, '#ffd27a'); glow.addColorStop(1, '#e8641c');
      ctx.save(); ctx.globalAlpha = 0.3; rrect(cx - bw / 2 - 6, base - 28 - bh, bw + 12, bh + 10, 8, '#ff8a2a'); ctx.globalAlpha = 1;
      rrect(cx - bw / 2, base - 22 - bh, bw, bh, 4, glow); ctx.restore();
      if (e > 0.85 && Math.random() < 0.7) spark(cx + (Math.random() - 0.5) * bw, base - 24, '#ffb04a', 3);
    },
    // Ship lift: a caisson rises through the water.
    shiplift(cx, e) {
      const base = BELT - 6;
      rect(cx - 56, 270, 112, base - 270, 'rgba(58,160,255,0.08)', colors.steel, 1.2);
      rect(cx - 54, 360, 108, base - 360, 'rgba(58,160,255,0.35)');               // lower pool
      const cy = base - 30 - e * 120;
      rect(cx - 42, cy + 16, 6, base - cy - 16, '#c9d2db');
      rect(cx + 36, cy + 16, 6, base - cy - 16, '#c9d2db');
      rect(cx - 48, cy, 96, 18, 'rgba(58,160,255,0.55)', colors.steel, 1.2);       // caisson with water
      ctx.beginPath(); ctx.moveTo(cx - 34, cy); ctx.lineTo(cx + 30, cy); ctx.lineTo(cx + 22, cy + 10); ctx.lineTo(cx - 26, cy + 10); ctx.closePath();
      ctx.fillStyle = '#c94a3a'; ctx.fill();                                       // hull
      rect(cx - 12, cy - 16, 22, 16, '#dde3ea');                                   // bridge
      rect(cx - 30, cy - 10, 14, 10, '#3a7bd5');                                   // container
    },
    // Tectonic press: plates squeeze a mountain upward.
    tectonic(cx, e) {
      const base = BELT - 6;
      const lx = cx - 56 + e * 22, rx = cx + 56 - e * 22;
      rect(cx - 60, base - 70, 10, 50, '#4a5866', colors.steel, 1.2);
      rect(cx + 50, base - 70, 10, 50, '#4a5866', colors.steel, 1.2);
      rect(cx - 50, base - 50, lx - (cx - 50), 8, '#c9d2db');
      rect(rx, base - 50, cx + 50 - rx, 8, '#c9d2db');
      rect(lx - 6, base - 110, 8, 110, '#59687a', colors.steel, 1.2);
      rect(rx - 2, base - 110, 8, 110, '#59687a', colors.steel, 1.2);
      const peak = base - 60 - e * 70;
      ctx.beginPath(); ctx.moveTo(lx + 2, base); ctx.lineTo(cx - 8, peak + 14); ctx.lineTo(cx, peak); ctx.lineTo(cx + 9, peak + 18); ctx.lineTo(rx - 2, base); ctx.closePath();
      ctx.fillStyle = '#6a5a7a'; ctx.fill(); ctx.strokeStyle = '#8f7aa6'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 6, peak + 10); ctx.lineTo(cx, peak); ctx.lineTo(cx + 6, peak + 12); ctx.closePath(); ctx.fillStyle = '#e8eef4'; ctx.fill();
      if (e > 0.85 && Math.random() < 0.6) spark(cx + (Math.random() - 0.5) * 30, peak + 10, '#c9b5e0', 2);
    },
  };

  function circleHalf(x, y, r, top) {
    ctx.beginPath(); ctx.arc(x, y, r, top ? Math.PI : 0, top ? Math.PI * 2 : Math.PI); ctx.closePath();
    ctx.fillStyle = '#7a5230'; ctx.fill(); ctx.strokeStyle = '#d4a06a'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  // ---- Conveyor and products -----------------------------------------------------

  const PRODUCT = {
    jack:      (x, y) => { circle(x, y - 6, 6, '#14181c', '#666', 2); },
    splitter:  (x, y) => { rect(x - 7, y - 8, 14, 7, '#7a5230', '#a87444', 1); },
    press:     (x, y) => { circle(x, y - 5, 5, '#b8c4cf', '#6b7a88', 1); circle(x, y - 5, 2, '#14181c'); },
    excavator: (x, y) => { circle(x, y - 5, 6, '#5a3e22'); },
    molding:   (x, y) => { rect(x - 6, y - 9, 12, 9, '#3a7bd5', '#7ab0f0', 1); },
    forge:     (x, y) => { rect(x - 8, y - 6, 16, 6, '#e8641c', '#ffb04a', 1); },
    shiplift:  (x, y) => { rect(x - 8, y - 9, 16, 9, '#c94a3a', '#e07b6c', 1); },
    tectonic:  (x, y) => { ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 6, y - 5); ctx.lineTo(x, y); ctx.lineTo(x - 6, y - 5); ctx.closePath(); ctx.fillStyle = '#b48ee0'; ctx.fill(); },
  };

  // Parts should visibly reach Shipping even when the line is starved.
  const beltSpeed = (running, speed) => (running ? 90 + 110 * speed : 0);

  function spawnProduct(id, cx) {
    if (products.length > 70) return;
    products.push({ id, x: cx + 30, y: BELT - 30, vy: 0, onBelt: false, falling: false });
  }

  function drawConveyor(dt, speed) {
    // belt with moving cleats and rollers
    rrect(STATION_X0 - 20, BELT, BIN_X - STATION_X0 + 26, 12, 6, '#1b2229', colors.steel, 1.2);
    ctx.save(); ctx.setLineDash([3, 13]); ctx.lineDashOffset = -t.belt;
    line([[STATION_X0 - 14, BELT + 6], [BIN_X, BELT + 6]], '#4a5866', 8); ctx.restore();
    for (let x = STATION_X0 - 12; x < BIN_X; x += 44) {
      circle(x, BELT + 6, 4, '#2b333c', colors.steel, 1);
      const a = t.belt / 4;
      line([[x, BELT + 6], [x + Math.cos(a) * 4, BELT + 6 + Math.sin(a) * 4]], colors.steel, 1);
    }
    const v = beltSpeed(speed > 0, speed);
    for (let i = products.length - 1; i >= 0; i--) {
      const p = products[i];
      if (!p.onBelt && !p.falling) {
        p.vy += 900 * dt; p.y += p.vy * dt;
        if (p.y >= BELT) { p.y = BELT; p.onBelt = true; }
      } else if (p.onBelt) {
        p.x += v * dt;
        if (p.x > BIN_X - 4) { products.splice(i, 1); wh.inbound = Math.min(12, wh.inbound + 1); t.shipped++; continue; }
      }
      PRODUCT[p.id](p.x, p.y);
    }

  }

  // ---- The ball run ---------------------------------------------------------------

  function drawBall(running) {
    let x, y;
    const g = t.g;
    if (g < RAIL_SHARE) {                       // rolling right along the sequence rail
      const f = g / RAIL_SHARE;
      x = RAIL.x0 + (RAIL.x1 - RAIL.x0) * f; y = RAIL.y0 + (RAIL.y1 - RAIL.y0) * f - 6;
    } else if (g < RAIL_SHARE + 0.1) {          // elevator lifts it
      const f = ease((g - RAIL_SHARE) / 0.1);
      x = LIFT_X; y = RAIL.y1 - 6 - (RAIL.y1 - UPPER.y0) * f;
    } else {                                    // rolls back left on the return rail
      const f = (g - RAIL_SHARE - 0.1) / (1 - RAIL_SHARE - 0.1);
      x = LIFT_X - 14 - (LIFT_X - 14 - RAIL.x0 - 8) * f; y = UPPER.y0 + (UPPER.y1 - UPPER.y0) * f - 6;
    }
    // elevator cylinder
    const liftF = g >= RAIL_SHARE && g < RAIL_SHARE + 0.1 ? ease((g - RAIL_SHARE) / 0.1) : g >= RAIL_SHARE + 0.1 ? 1 - ease(Math.min(1, (g - RAIL_SHARE - 0.1) / 0.06)) : 0;
    rect(LIFT_X - 8, RAIL.y1 + 4, 16, 36, '#3a4652', colors.steel, 1.2);
    const cupY = RAIL.y1 - (RAIL.y1 - UPPER.y0) * liftF;
    rect(LIFT_X - 3, cupY + 2, 6, RAIL.y1 + 4 - cupY, '#c9d2db');
    rect(LIFT_X - 10, cupY, 20, 4, colors.steel);
    text('LIFT', LIFT_X, RAIL.y1 + 52, { size: 8, align: 'center' });
    // ball with a highlight
    circle(x, y, 6, running ? '#8a96a3' : '#4a5866');
    circle(x - 2, y - 2, 2.5, '#ffffff');
  }

  // ---- Particles ------------------------------------------------------------------

  function puff(x, y, kind) {
    if (particles.length > (quality ? 260 : 60)) return;
    particles.push({ kind, x, y, vx: (Math.random() - 0.3) * 30, vy: -20 - Math.random() * 30, life: 1 });
  }
  function spark(x, y, color, n = 1) {
    for (let i = 0; i < n && particles.length < (quality ? 260 : 60); i++) {
      particles.push({ kind: 'spark', color, x, y, vx: (Math.random() - 0.5) * 120, vy: -40 - Math.random() * 80, life: 0.6 });
    }
  }
  function drawParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'spark') {
        p.vy += 260 * dt;
        ctx.globalAlpha = clamp(p.life / 0.6, 0, 1); rect(p.x, p.y, 2, 2, p.color);
      } else if (p.kind === 'steam') {
        ctx.globalAlpha = 0.35 * p.life; circle(p.x, p.y, 4 + (1 - p.life) * 10, '#c8d2dc');
      } else if (p.kind === 'spray') {
        ctx.globalAlpha = 0.7 * p.life; circle(p.x, p.y, 2 + (1 - p.life) * 4, colors.pressure);
      } else if (p.kind === 'coin') {
        ctx.globalAlpha = clamp(p.life, 0, 1);
        text('$', p.x, p.y, { size: 13, align: 'center', color: colors.ok, weight: '700' });
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---- Corner readout ----------------------------------------------------------------

  function drawOverlay(s, d) {
    const tier = TIERS[s.tier];
    text('THE WORKS', 18, 26, { size: 15, color: colors.text, font: colors.head, weight: '600' });
    text(`${tier.name} · ${fmt(d.psi)} psi · ${fmt(d.hydraulicHP)} HP delivered`, 18, 42, { size: 10 });
    if (d.order && d.order.factor < 0.999) {
      const neck = E.DATA.DEPARTMENTS.find((x) => x.id === d.order.bottleneck).name.toUpperCase();
      text(`ORDER LINE ${Math.round(d.order.factor * 100)}% · ${neck} SHORT-STAFFED`, 18, 58, { size: 10, color: colors.pressure, weight: '600' });
    }
    if (d.surging) text('SURGE', 18, 76, { size: 13, color: colors.cool, font: colors.head, weight: '600' });
    if (d.demand === 0) text('Buy a Bottle Jack Bay to start the line →', 600, 300, { size: 13, color: colors.oil });
  }

  // ---- People sprites ------------------------------------------------------------

  /** A person, seated (upper body only) or standing, in their own colors. */
  function person(x, y, lk, { standing = false, bob = 0, reach = 0, label = null } = {}) {
    const hy = y - (standing ? 52 : 26) + bob;            // head centre
    if (standing) {
      line([[x - 4, y - 18], [x - 5, y]], '#2b333c', 4);   // legs
      line([[x + 4, y - 18], [x + 5, y]], '#2b333c', 4);
      rrect(x - 9, hy + 8, 18, 26, 5, lk.shirt);
      line([[x + 8, hy + 14], [x + 14 + reach * 6, hy + 22 - reach * 14]], lk.shirt, 4);
    } else {
      rrect(x - 10, hy + 8, 20, 22, 6, lk.shirt);
    }
    circle(x, hy, 7, lk.skin);
    ctx.fillStyle = lk.hair;
    ctx.beginPath();
    if (lk.style === 0) { ctx.arc(x, hy - 1, 7.5, Math.PI, Math.PI * 2); ctx.fill(); }
    else if (lk.style === 1) { ctx.arc(x, hy - 2, 7.5, Math.PI * 0.9, Math.PI * 2.1); ctx.fill(); }
    else { ctx.arc(x, hy - 1, 7.5, Math.PI, Math.PI * 2); ctx.rect(x - 7.5, hy - 1, 3, 9); ctx.rect(x + 4.5, hy - 1, 3, 9); ctx.fill(); }
    if (label) text(label, x, hy - 12, { size: 8, align: 'center', color: colors.oil, weight: '600' });
  }
  const sortCache = {};
  /** A department's team, strongest first; cached until the team changes. */
  function sortedTeam(st, id) {
    const c = sortCache[id];
    if (c && c.src === st.team && c.n === st.team.length) return c.list;
    const list = st.team.slice().sort((a, b) => E.effectiveness(b, id) - E.effectiveness(a, id));
    sortCache[id] = { src: st.team, n: st.team.length, list };
    return list;
  }
  const OWNER = { skin: '#e0ac69', hair: '#5a3a1e', shirt: '#f2a900', style: 0 };

  // ---- Office mezzanine -------------------------------------------------------------

  const ROOMS = [
    { id: 'outside_sales', label: 'OUTSIDE SALES', prop: 'map' },
    { id: 'inside_sales',  label: 'INSIDE SALES',  prop: 'phones' },
    { id: 'purchasing',    label: 'PURCHASING',    prop: 'files' },
    { id: 'accounting',    label: 'ACCOUNTING',    prop: 'files' },
    { id: 'quality',       label: 'QUALITY LAB',   prop: 'bench' },
    { id: 'engineering',   label: 'ENGINEERING',   prop: 'cad' },
    { id: 'it',            label: 'IT',            prop: 'servers' },
    { id: 'safety',        label: 'SAFETY',        prop: 'board' },
    { id: 'management',    label: 'MANAGEMENT',    prop: 'plant' },
  ];
  const ROOM_W = W / ROOMS.length;
  const DESK_Y = 196;
  const deskX = (i, rx) => rx + 34 + i * 62;

  function drawOfficeBackdrop() {
    rect(0, 0, W, OFFICE_H, '#151a20');
    // a Cedar Rapids-ish night skyline in the windows, seeded so it never jumps
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    ROOMS.forEach((room, i) => {
      const rx = i * ROOM_W;
      rect(rx + 1, 8, ROOM_W - 2, OFFICE_H - 22, i % 2 ? '#1b2128' : '#192028');
      const sky = ctx.createLinearGradient(0, 30, 0, 82);
      sky.addColorStop(0, '#0b1e33'); sky.addColorStop(1, '#1d3a57');
      rect(rx + 16, 30, ROOM_W - 32, 52, sky);
      ctx.fillStyle = '#0a121b';
      for (let x = rx + 16; x < rx + ROOM_W - 16; x += 10 + rnd() * 14) {
        const h = 8 + rnd() * 30, w = 8 + rnd() * 12;
        ctx.fillRect(x, 82 - h, Math.min(w, rx + ROOM_W - 16 - x), h);
        for (let k = 0; k < 3; k++) if (rnd() < 0.5) { ctx.fillStyle = 'rgba(242,169,0,0.5)'; ctx.fillRect(x + 2 + rnd() * (w - 4), 82 - h + 3 + rnd() * (h - 6), 2, 2); ctx.fillStyle = '#0a121b'; }
      }
      rect(rx + 16, 30, ROOM_W - 32, 52, null, '#3a4652', 2);
      line([[rx + ROOM_W / 2, 30], [rx + ROOM_W / 2, 82]], '#3a4652', 2);
      line([[rx, 8], [rx, OFFICE_H - 14]], '#2e3843', 2);
      // desks
      for (let k = 0; k < 3; k++) {
        const x = deskX(k, rx);
        rect(x - 24, DESK_Y, 48, 5, '#6b5232');
        rect(x - 22, DESK_Y + 5, 44, 18, '#4a3a24');
      }
    });
    // mezzanine slab with hazard edge
    rect(0, OFFICE_H - 14, W, 14, '#2b333c');
    line([[0, OFFICE_H - 14], [W, OFFICE_H - 14]], colors.edge, 2);
    for (let x = 0; x < W; x += 28) {
      ctx.fillStyle = 'rgba(242,169,0,0.35)';
      ctx.beginPath(); ctx.moveTo(x, OFFICE_H - 6); ctx.lineTo(x + 14, OFFICE_H - 6); ctx.lineTo(x + 8, OFFICE_H); ctx.lineTo(x - 6, OFFICE_H); ctx.fill();
    }
    text('OFFICE', 6, OFFICE_H - 3, { size: 8, color: colors.muted });
  }

  function drawProp(kind, x, y) {
    if (kind === 'map') {                       // territory map with pins
      rect(x - 18, y - 60, 36, 28, '#2a4a3a', colors.steel, 1);
      [[-10, -50], [2, -44], [10, -54], [-4, -38]].forEach(([dx, dy], k) => circle(x + dx, y + dy, 2, ['#f2a900', '#3aa0ff', '#46c37b', '#e5484d'][k]));
    } else if (kind === 'phones') {
      rect(x - 14, y - 70, 28, 40, '#22303c', colors.steel, 1);
      text('ORDERS', x, y - 58, { size: 7, align: 'center', color: colors.ok });
      for (let k = 0; k < 3; k++) rect(x - 10, y - 52 + k * 7, 20 * (0.4 + 0.6 * frac(t.clock * 0.2 + k * 0.3)), 3, colors.ok);
    } else if (kind === 'files') {
      for (let k = 0; k < 3; k++) rect(x - 12, y - 22 - k * 16, 24, 15, '#59687a', '#2b333c', 1);
    } else if (kind === 'bench') {
      rect(x - 18, y - 16, 36, 16, '#3a4652', colors.steel, 1);
      circle(x, y - 30, 9, '#0d1013', colors.steel, 1.5);
      const a = -2.2 + 1.6 * (0.5 + 0.5 * Math.sin(t.clock * 2));
      line([[x, y - 30], [x + Math.cos(a) * 7, y - 30 + Math.sin(a) * 7]], colors.pressure, 1.5);
    } else if (kind === 'cad') {
      rect(x - 18, y - 52, 36, 26, '#0d1a2a', colors.steel, 1);
      ctx.strokeStyle = colors.cool; ctx.lineWidth = 1; ctx.strokeRect(x - 12, y - 46, 14, 10); circle(x + 8, y - 38, 4, null, colors.cool, 1);
    } else if (kind === 'servers') {
      rect(x - 13, y - 74, 26, 74, '#1b2229', colors.steel, 1);
      for (let k = 0; k < 6; k++) circle(x - 6 + (k % 2) * 12, y - 66 + Math.floor(k / 2) * 0 + k * 10, 2, Math.sin(t.clock * 7 + k * 1.7) > 0 ? colors.ok : '#1b3324');
    } else if (kind === 'board') {
      rect(x - 18, y - 66, 36, 30, '#e8eef4', colors.steel, 1);
      text('DAYS', x, y - 56, { size: 7, align: 'center', color: '#333' });
      text('SAFE', x, y - 48, { size: 7, align: 'center', color: '#333' });
      text(String(safeDaysNow), x, y - 39, { size: 8, align: 'center', color: safeDaysNow ? '#1f7a3f' : '#c0392b', weight: '700' });
    } else if (kind === 'plant') {
      rect(x - 7, y - 16, 14, 16, '#7a5230');
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.ellipse(x + (k - 2) * 4, y - 24 - Math.abs(k - 2) * 3, 4, 9, (k - 2) * 0.4, 0, Math.PI * 2); ctx.fillStyle = '#2f7a46'; ctx.fill(); }
    }
  }

  let safeDaysNow = 0;
  function drawOffice(s, d) {
    safeDaysNow = E.safeDays(s);
    const order = d.order;
    ROOMS.forEach((room, i) => {
      const rx = i * ROOM_W;
      const dept = E.DATA.DEPARTMENTS.find((x) => x.id === room.id);
      const open = E.departmentOpen(s, dept);
      const st = s.depts[room.id];
      const o = order.depts[room.id];
      const neck = order.bottleneck === room.id && order.factor < 0.999;

      // name plate
      text(room.label, rx + 16, 104, { size: 10, color: open ? colors.text : colors.muted, weight: '600' });
      // prop on the right
      drawProp(room.prop, rx + ROOM_W - 30, DESK_Y + 22);

      if (!open) {
        ctx.globalAlpha = 0.72; rect(rx + 1, 8, ROOM_W - 2, OFFICE_H - 22, '#0b0e11'); ctx.globalAlpha = 1;
        const op = dept.opens;
        const when = op.lifetime ? `OPENS AT $${fmt(op.lifetime)}` : 'OPENS LATER';
        rrect(rx + ROOM_W / 2 - 8, 132, 16, 12, 2, colors.muted);              // padlock
        ctx.beginPath(); ctx.arc(rx + ROOM_W / 2, 132, 5, Math.PI, 0); ctx.strokeStyle = colors.muted; ctx.lineWidth = 2; ctx.stroke();
        text(when, rx + ROOM_W / 2, 162, { size: 9, align: 'center', color: colors.muted });
        text(room.label, rx + 16, 104, { size: 10, color: colors.muted, weight: '600' });
        return;
      }

      if (!st) {
        // support departments: open, no hiring yet
        person(deskX(0, rx), DESK_Y, OWNER, { label: 'YOU', bob: Math.sin(t.clock * 3 + i) * 0.6 });
        text('HIRING SOON', rx + 16, 118, { size: 8, color: colors.muted });
        return;
      }

      // coverage chip (Engineering shows its Know-how multiplier instead)
      if (o) {
        const pct = Math.round(o.coverage * 100);
        text(`${pct}%`, rx + ROOM_W - 16, 104, { size: 10, align: 'right', color: neck ? colors.pressure : o.coverage < 1 ? colors.oil : colors.ok, weight: '600' });
      } else {
        const chip = {
          engineering: () => `KH ×${E.engKhMult(s).toFixed(1)}`,
          it: () => `LINE +${Math.round((E.itMult(s) - 1) * 100)}%`,
          safety: () => `${E.safeDays(s)} DAYS SAFE`,
          management: () => `TEAMS +${Math.round((E.mgmtMult(s) - 1) * 100)}%`,
        }[room.id];
        if (chip) text(chip(), rx + ROOM_W - 16, 104, { size: 10, align: 'right', color: colors.cool, weight: '600' });
      }
      const heads = E.headcount(st) + (st.mgr ? 1 : 0);
      text(`${heads + 1} STAFF${st.mgr && st.auto && o ? ' · AUTO' : ''}`, rx + 16, 118, { size: 8, color: colors.muted });

      // the three best people take the desks; the owner covers an empty department
      const team = sortedTeam(st, room.id);
      // the manager takes the first desk
      const people = (st.mgr ? [st.mgr] : []).concat(team).slice(0, 3);
      const seats = people.length ? people.map((p) => ({ lk: look(p.a), name: p.n.split(' ')[0], mgr: p === st.mgr }))
        : [{ lk: OWNER, name: 'YOU' }];
      seats.forEach((p, k) => {
        const x = deskX(k, rx);
        const busy = d.demand > 0;
        const bob = busy ? Math.sin(t.clock * (5 + k) + i * 1.3) * 0.8 : 0;
        person(x, DESK_Y, p.lk, { bob, label: p.mgr ? 'MGR' : null });
        // laptop with a screen that flickers while working
        rect(x - 9, DESK_Y - 9, 18, 9, '#2b333c');
        rect(x - 8, DESK_Y - 8, 16, 7, busy && Math.sin(t.clock * 9 + k * 2 + i) > -0.6 ? '#3aa0ff' : '#1d3a57');
        if ((room.prop === 'phones' || room.id === 'outside_sales') && busy && Math.sin(t.clock * 0.9 + k * 2.1 + i) > 0.55) {
          rect(x + 7, DESK_Y - 36 + bob, 4, 12, '#14181c');           // on the phone
        }
        text(p.name.toUpperCase(), x, DESK_Y + 34, { size: 7, align: 'center', color: colors.muted });
      });
      if (heads > 3) {
        rrect(rx + ROOM_W - 64, 112, 34, 14, 7, '#2b333c', colors.edge, 1);
        text(`+${heads - 3}`, rx + ROOM_W - 47, 122, { size: 9, align: 'center', color: colors.text });
      }
      if (neck) {
        const on = Math.sin(t.beacon) > 0;
        circle(rx + ROOM_W - 30, 18, 6, on ? colors.pressure : '#5a1f22');
        if (on) { ctx.globalAlpha = 0.18; rect(rx + 1, 8, ROOM_W - 2, OFFICE_H - 22, colors.pressure); ctx.globalAlpha = 1; }
        text('SHORT-STAFFED', rx + ROOM_W / 2, 140, { size: 10, align: 'center', color: colors.pressure, weight: '700' });
      }
    });
  }

  // ---- Warehouse ---------------------------------------------------------------------

  const WH_X = 1700;                              // left edge of the warehouse floor
  const RACKS = [{ x: 1770, w: 96 }, { x: 1900, w: 96 }];
  const LEVELS = [452, 402, 352, 302];            // beam heights (floor coordinates)
  const PACK_X = 2030, DOCK_X = 2120;
  const wh = { inbound: 0, stock: 6, pack: 0, boxes: [], packT: 0, robots: [], trailer: { fill: 0, x: 0, mode: 'loading' }, trucks: 0 };

  function drawWarehouseBackdrop() {
    rect(WH_X, 120, W - WH_X, FLOOR - 120, 'rgba(0,0,0,0.18)');
    line([[WH_X, 120], [WH_X, FLOOR]], colors.edge, 2);
    text('WAREHOUSE', 1880, 140, { size: 13, align: 'center', color: colors.text, font: colors.head, weight: '600' });
    text('SHIPPING', 2210, 140, { size: 13, align: 'center', color: colors.text, font: colors.head, weight: '600' });
    // pallet racks: orange beams, blue uprights
    for (const r of RACKS) {
      for (const x of [r.x, r.x + r.w]) rect(x - 3, 280, 6, FLOOR - 280, '#2f5d8a');
      for (const y of LEVELS) rect(r.x, y, r.w, 5, '#d9771c');
    }
    // inbound table, pack table, outbound rollers
    rect(BIN_X - 2, BELT - 2, 34, 6, '#3a4652', colors.steel, 1);
    rect(PACK_X - 30, 436, 64, 6, '#6b5232');
    rect(PACK_X - 28, 442, 60, 58, '#4a3a24');
    for (let x = PACK_X + 36; x < DOCK_X; x += 10) circle(x, 444, 3, '#3a4652', colors.steel, 1);
    // dock wall and door
    rect(DOCK_X - 4, 180, 10, FLOOR - 180, '#2b333c', colors.edge, 1);
    rect(DOCK_X - 4, 330, 10, FLOOR - 330, '#0d1013');
    for (let y = 186; y < 326; y += 10) line([[DOCK_X - 4, y], [DOCK_X + 6, y]], '#3a4652', 1);
    text('DOCK 1', DOCK_X + 1, 176, { size: 8, align: 'center' });
  }

  function drawTote(x, y, color = '#3a7bd5') { rect(x - 11, y - 14, 22, 14, color, 'rgba(0,0,0,0.4)', 1); line([[x - 7, y - 10], [x + 7, y - 10]], 'rgba(255,255,255,0.25)', 1); }
  function drawBox(x, y) { rect(x - 9, y - 12, 18, 12, '#b8864b', '#7a5230', 1); line([[x - 9, y - 6], [x + 9, y - 6]], '#d9b07a', 2); }

  function drawWarehouse(s, d, dt, speed) {
    const st = s.depts.warehouse;
    const o = d.order.depts.warehouse;
    const open = E.departmentOpen(s, E.DATA.DEPARTMENTS.find((x) => x.id === 'warehouse'));
    const work = d.demand > 0 ? Math.max(0.25, speed) * (open ? o.coverage : 1) : 0;
    const team = open ? sortedTeam(st, 'warehouse') : [];

    // inbound totes waiting at the end of the conveyor
    for (let k = 0; k < Math.min(wh.inbound, 3); k++) drawTote(BIN_X + 14, BELT - 2 - k * 14, '#59687a');

    // rack stock
    let n = 0;
    const slots = Math.min(wh.stock, RACKS.length * LEVELS.length * 3);
    for (const r of RACKS) for (const y of LEVELS) for (let k = 0; k < 3; k++) {
      if (n++ >= slots) break;
      drawTote(r.x + 18 + k * 30, y, ['#3a7bd5', '#46c37b', '#c94a3a', '#8f7aa6'][(n * 7) % 4]);
    }

    // AMR robots shuttle totes: inbound → racks → pack station
    const robots = clamp(1 + Math.floor(E.headcount(st) / 6), 1, 3);
    while (wh.robots.length < robots) wh.robots.push({ x: 1740, dir: 1, load: false, wait: wh.robots.length * 0.7 });
    wh.robots.length = robots;
    wh.robots.forEach((r, i) => {
      if (r.wait > 0) r.wait -= dt;
      else if (work > 0) {
        const target = r.dir > 0 ? PACK_X - 50 : 1740 + i * 4;
        r.x += Math.sign(target - r.x) * Math.min(Math.abs(target - r.x), 120 * work * dt);
        if (Math.abs(target - r.x) < 1) {
          if (r.dir < 0) {            // at inbound/racks: pick up a tote
            if (wh.inbound > 0) { wh.inbound--; wh.stock++; }
            if (wh.stock > 0) { wh.stock--; r.load = true; }
            r.dir = 1; r.wait = 0.4;
          } else {                    // at pack station: drop it
            if (r.load) wh.pack++;
            r.load = false; r.dir = -1; r.wait = 0.4;
          }
        }
      }
      const y = FLOOR - 4;
      rrect(r.x - 18, y - 14, 36, 12, 3, '#e8eef4', colors.steel, 1);
      circle(r.x - 11, y - 1, 4, '#14181c'); circle(r.x + 11, y - 1, 4, '#14181c');
      circle(r.x, y - 17, 3, Math.sin(t.clock * 8 + i) > 0 ? colors.cool : '#1d3a57');
      if (r.load) drawTote(r.x, y - 15);
    });

    // pickers at the racks (the team's best, after the packer)
    const pickers = team.slice(1, 3);
    pickers.forEach((p, k) => {
      const x = RACKS[k].x + RACKS[k].w / 2 + Math.sin(t.clock * 0.6 + k) * 30;
      const reach = work > 0 ? 0.5 + 0.5 * Math.sin(t.clock * 3 + k) : 0;
      person(x, FLOOR - 16, look(p.a), { standing: true, reach });
      text(p.n.split(' ')[0].toUpperCase(), x, FLOOR - 76, { size: 7, align: 'center', color: colors.muted });
    });

    // packer at the pack station turns totes into boxes
    const packer = team[0] ? { lk: look(team[0].a), name: team[0].n.split(' ')[0].toUpperCase() } : { lk: OWNER, name: 'YOU' };
    person(PACK_X, 436, packer.lk, { standing: true, reach: wh.pack > 0 && work > 0 ? 0.5 + 0.5 * Math.sin(t.clock * 6) : 0 });
    text(packer.name, PACK_X, 372, { size: 7, align: 'center', color: colors.muted });
    if (wh.pack > 0) drawTote(PACK_X - 18, 436, '#59687a');
    if (wh.pack > 0 && work > 0) {
      wh.packT += dt * work;
      if (wh.packT > 0.9) { wh.packT = 0; wh.pack--; wh.boxes.push({ x: PACK_X + 18 }); }
    }
    // boxes roll to the dock and into the trailer
    for (let k = wh.boxes.length - 1; k >= 0; k--) {
      const b = wh.boxes[k];
      b.x += 60 * dt;
      if (b.x > DOCK_X + 6) { wh.boxes.splice(k, 1); if (wh.trailer.mode === 'loading') wh.trailer.fill += 1 / 21; continue; }
      drawBox(b.x, 441);
    }
    const label = open ? `${E.headcount(st) + 1} STAFF · ${Math.round(o.coverage * 100)}%` : 'RUN BY YOU';
    text(label, 1880, 156, { size: 9, align: 'center', color: open && o.coverage < 1 ? colors.oil : colors.muted });
  }

  // ---- Shipping dock -------------------------------------------------------------

  function drawShipping(dt) {
    const tr = wh.trailer;
    if (tr.mode === 'loading' && tr.fill >= 1) { tr.mode = 'leaving'; }
    if (tr.mode === 'leaving') { tr.x += 160 * dt; if (tr.x > 240) { tr.mode = 'arriving'; tr.fill = 0; wh.trucks++; particles.push({ kind: 'coin', x: 2200, y: 300, vx: 0, vy: -30, life: 1.4 }); } }
    if (tr.mode === 'arriving') { tr.x = Math.max(0, tr.x - 160 * dt); if (tr.x === 0) tr.mode = 'loading'; }
    const x = DOCK_X + 10 + tr.x, y = 330, w = 164, h = 130;
    ctx.save();
    ctx.beginPath(); ctx.rect(DOCK_X + 6, 0, W - DOCK_X, FLOOR + 30); ctx.clip();
    rect(x, y, w, h, '#e8eef4', colors.steel, 2);                   // trailer box (cut away)
    rect(x + 4, y + 4, w - 8, h - 8, '#1b2229');
    const boxes = Math.floor(tr.fill * 21);
    for (let k = 0; k < boxes; k++) drawBox(x + 16 + (k % 7) * 20, y + h - 6 - Math.floor(k / 7) * 14);
    rect(x, y - 18, w, 18, '#c94a3a');
    text('IFP MSI', x + w / 2, y - 5, { size: 12, align: 'center', color: '#fff', font: colors.head, weight: '600' });
    circle(x + 30, y + h + 14, 13, '#14181c', '#555', 3); circle(x + 60, y + h + 14, 13, '#14181c', '#555', 3);
    circle(x + w - 30, y + h + 14, 13, '#14181c', '#555', 3);
    ctx.restore();
    text(`${fmt(wh.trucks)} TRUCKS SHIPPED`, 2210, 158, { size: 9, align: 'center', color: colors.muted });
    if (tr.mode === 'loading') {
      rect(2150, 168, 120, 6, '#0f1317', colors.edge, 1);
      rect(2150, 168, 120 * Math.min(1, tr.fill), 6, colors.oil);
    }
  }

  // ---- Events from the game -------------------------------------------------------------

  function stroke() {
    t.lever = 1;
    for (let i = 0; i < 4; i++) spark(TANK.x - 12, TANK.y + 10, colors.oil, 1);
  }

  root.PW = root.PW || {};
  root.PW.machine = { init, frame, stroke, resize, size: { W, H } };
})(window);
