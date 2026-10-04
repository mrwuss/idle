/*
 * Pressure Works — DOM rendering. Reads state + engine, never mutates state
 * except through the handlers main.js passes in.
 */
(function (root) {
  'use strict';

  const E = root.PW.engine;
  const { fmt, fmtTime } = root.PW.format;
  const { PUMPS, ACTUATORS, COOLERS, TECH, TIERS, DEPARTMENTS, PAKS, ERAS, REGIONS, STATES } = E.DATA;
  const $ = (id) => document.getElementById(id);
  const SVGNS = 'http://www.w3.org/2000/svg';

  // ---- Icons (40×40, line-art in the spirit of ISO 1219 symbols) -----------

  const ICONS = {
    gear: '<circle cx="14" cy="20" r="9"/><circle cx="27" cy="20" r="7"/><circle class="solid" cx="14" cy="20" r="2"/><circle class="solid" cx="27" cy="20" r="2"/>',
    vane: '<circle cx="20" cy="20" r="14"/><circle cx="22" cy="20" r="8"/><path d="M22 12 V7 M30 20 h4 M22 28 v5 M14 20 h-7"/>',
    axial: '<rect x="6" y="12" width="22" height="16"/><path class="accent" d="M30 8 L36 32"/><path d="M8 16 h18 M8 20 h18 M8 24 h18"/>',
    radial: '<circle cx="20" cy="20" r="6"/><path d="M20 14 V4 M20 26 V36 M14 20 H4 M26 20 H36 M15.5 15.5 L9 9 M24.5 24.5 L31 31 M24.5 15.5 L31 9 M15.5 24.5 L9 31"/>',
    ls: '<circle cx="20" cy="20" r="13"/><path class="solid" d="M20 8 L14 18 H26 Z"/><path class="accent" d="M8 32 L32 8 M27 8 H32 V13"/>',
    dd: '<circle cx="20" cy="20" r="14"/><circle class="solid" cx="20" cy="10" r="2"/><circle class="solid" cx="29" cy="17" r="2"/><circle class="solid" cx="26" cy="28" r="2"/><circle class="solid" cx="14" cy="28" r="2"/><circle class="solid" cx="11" cy="17" r="2"/><path class="accent" d="M21 15 L17 21 H23 L19 27"/>',
    jack: '<rect x="10" y="30" width="20" height="6"/><rect x="13" y="16" width="14" height="14"/><rect x="17" y="6" width="6" height="10"/><path class="accent" d="M14 6 H26"/>',
    splitter: '<circle cx="12" cy="20" r="8"/><circle cx="12" cy="20" r="3"/><path class="accent" d="M20 20 L34 12 V28 Z"/><path d="M34 20 H38"/>',
    press: '<path d="M6 36 V6 H34 V36 M4 36 H36"/><rect x="16" y="6" width="8" height="10"/><rect class="solid" x="13" y="16" width="14" height="4"/><rect x="12" y="28" width="16" height="8"/>',
    excavator: '<path d="M4 34 H18 V26 H8 Z"/><path class="accent" d="M14 26 L22 10 L33 18"/><path d="M33 18 L36 28 L28 28 Z"/>',
    molding: '<rect x="4" y="12" width="16" height="16"/><rect x="20" y="16" width="10" height="8"/><path class="accent" d="M30 20 H36"/><path d="M8 28 V34 M16 28 V34"/>',
    forge: '<path d="M8 30 H32 L28 24 H12 Z M16 30 V36 M24 30 V36"/><rect x="14" y="4" width="12" height="10"/><path class="accent" d="M20 14 V20 M14 20 H26"/>',
    shiplift: '<path d="M6 22 H34 L30 28 H10 Z"/><path d="M14 22 V16 H24 V22"/><path d="M4 34 H36"/><path class="accent" d="M8 34 V28 M32 34 V28"/>',
    tectonic: '<path d="M4 34 L16 12 L22 22 L28 14 L36 34 Z"/><path class="accent" d="M2 22 L8 22 M5 19 L8 22 L5 25 M38 22 L32 22 M35 19 L32 22 L35 25"/>',
    fan: '<circle cx="20" cy="20" r="15"/><path class="accent" d="M20 20 C20 10 28 8 28 12 Z M20 20 C30 20 32 28 28 28 Z M20 20 C20 30 12 32 12 28 Z M20 20 C10 20 8 12 12 12 Z"/>',
    shell: '<rect x="6" y="12" width="28" height="16" rx="8"/><path class="accent" d="M8 17 H32 M8 20 H32 M8 23 H32"/><path d="M14 12 V6 M26 28 V34"/>',
    plate: '<path d="M10 6 V34 M15 6 V34 M20 6 V34 M25 6 V34 M30 6 V34"/><path class="accent" d="M6 12 H34 M6 28 H34"/>',
    chiller: '<path class="accent" d="M20 4 V36 M6 12 L34 28 M6 28 L34 12"/><path d="M16 7 L20 11 L24 7 M16 33 L20 29 L24 33"/>',
    subsea: '<path class="accent" d="M2 10 Q8 6 14 10 T26 10 T38 10"/><rect x="8" y="18" width="24" height="14" rx="3"/><circle cx="20" cy="25" r="4"/><path d="M14 32 V36 M26 32 V36"/>',
    damgate: '<path d="M4 6 V36 M36 6 V36 M4 6 H36"/><rect x="9" y="12" width="22" height="14"/><path class="accent" d="M9 32 Q14 29 20 32 T31 32"/>',
    launch: '<path d="M20 3 L25 12 V30 H15 V12 Z"/><path class="accent" d="M17 30 L20 37 L23 30"/><path d="M6 36 V16 M34 36 V16 M6 20 H15 M34 20 H25"/>',
    cryo: '<rect x="8" y="6" width="24" height="28" rx="4"/><path class="accent" d="M20 11 V29 M12 15 L28 25 M12 25 L28 15"/>',
  };
  const icon = (id) => `<svg class="item-icon" viewBox="0 0 40 40" aria-hidden="true">${ICONS[id] || ''}</svg>`;

  // ---- Gauges ---------------------------------------------------------------

  function makeGauge(fig, unit) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 120 102');
    fig.prepend(svg);
    const cx = 60, cy = 56, r = 44;
    const ang = (f) => (-225 + 270 * f) * Math.PI / 180;   // 0..1 → radians, 7:30 → 4:30
    const pt = (f, rr) => [cx + rr * Math.cos(ang(f)), cy + rr * Math.sin(ang(f))];
    const arc = (f0, f1, rr) => {
      const [x0, y0] = pt(f0, rr), [x1, y1] = pt(f1, rr);
      return `M${x0} ${y0} A${rr} ${rr} 0 ${(f1 - f0) * 270 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
    };
    svg.innerHTML = `<circle class="face" cx="${cx}" cy="${cy}" r="${r + 4}"/>
      <path class="zone" stroke="var(--pressure)" />
      <g class="ticks"></g>
      <text class="readout" x="${cx}" y="${cy + 33}"></text>
      <text class="unit" x="${cx}" y="${cy + 42}">${unit}</text>
      <line class="g-needle" x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - r + 6}" style="transform-origin:${cx}px ${cy}px"/>
      <circle class="hub" cx="${cx}" cy="${cy}" r="4"/>`;
    const zone = svg.querySelector('.zone'), ticks = svg.querySelector('.ticks');
    const needle = svg.querySelector('.g-needle'), readout = svg.querySelector('.readout');
    let lastScale = null;
    return {
      set(value, min, max, zoneFrom, label) {
        const key = `${min}|${max}|${zoneFrom}`;
        if (key !== lastScale) {
          lastScale = key;
          let html = '';
          for (let i = 0; i <= 10; i++) {
            const f = i / 10, major = i % 5 === 0;
            const [x0, y0] = pt(f, r - (major ? 8 : 4)), [x1, y1] = pt(f, r);
            html += `<line class="tick${major ? ' major' : ''}" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>`;
            if (major) {
              const [tx, ty] = pt(f, r - 15);
              html += `<text class="scale" x="${tx}" y="${ty + 2}">${fmt(min + (max - min) * f, 0)}</text>`;
            }
          }
          ticks.innerHTML = html;
          const zf = Math.min(1, Math.max(0, (zoneFrom - min) / (max - min)));
          zone.setAttribute('d', zf < 1 ? arc(zf, 1, r - 3) : '');
        }
        const f = Math.min(1.02, Math.max(0, (value - min) / (max - min)));
        needle.style.transform = `rotate(${-135 + 270 * f}deg)`;
        readout.textContent = label;
      },
    };
  }

  // ---- Builders ---------------------------------------------------------------

  const rows = { pump: {}, actuator: {}, cooler: {} };

  function buildList(container, kind, items, onBuy) {
    container.innerHTML = '';
    for (const it of items) {
      const el = document.createElement('div');
      el.className = 'item';
      el.innerHTML = `${icon(it.id)}
        <div class="item-name">${it.name} <span class="item-count"></span></div>
        <div class="item-stats"></div>
        <button class="btn"></button>
        <div class="item-milestone"><div></div></div>
        <div class="item-flavor">${it.flavor || ''}</div>`;
      el.querySelector('.btn').addEventListener('click', () => onBuy(kind, it.id));
      container.appendChild(el);
      rows[kind][it.id] = {
        el, count: el.querySelector('.item-count'), stats: el.querySelector('.item-stats'),
        btn: el.querySelector('.btn'), ms: el.querySelector('.item-milestone'), msBar: el.querySelector('.item-milestone div'),
      };
    }
  }

  const techEls = {};
  function techDepth(id, memo = {}) {
    if (memo[id] != null) return memo[id];
    const t = TECH.find((x) => x.id === id);
    return (memo[id] = t.requires.length ? 1 + Math.max(...t.requires.map((r) => techDepth(r, memo))) : 0);
  }
  function buildTech(container, onResearch) {
    const cols = [];
    for (const t of TECH) (cols[techDepth(t.id)] ||= []).push(t);
    container.innerHTML = '';
    cols.forEach((list, i) => {
      const col = document.createElement('div');
      col.className = 'tech-col';
      col.innerHTML = `<h4>Stage ${i + 1}</h4>`;
      for (const t of list) {
        const b = document.createElement('button');
        b.className = 'tech';
        b.innerHTML = `<span class="t-name">${t.name}</span><span class="t-desc">${t.desc}</span><span class="t-cost"></span>`;
        b.addEventListener('click', () => onResearch(t.id));
        col.appendChild(b);
        techEls[t.id] = { el: b, cost: b.querySelector('.t-cost') };
      }
      container.appendChild(col);
    });
  }

  // Company tab: departments are a design scaffold. Cards show what each
  // department will do and when it opens; nothing here affects income yet.
  const deptEls = {}, pakEls = {};
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const staffed = (id) => E.HIREABLE.some((d) => d.id === id);
  const INCIDENTS = ['Burst hose', 'Blown seal', 'Pinched-finger near miss'];

  // ---- People ----------------------------------------------------------------
  const look = root.PW.format.look;
  function avatar(a) {
    const l = look(a);
    const hair = l.style === 0 ? `<path d="M5 9 Q12 1 19 9 L19 7 Q12 -1 5 7 Z" fill="${l.hair}"/>`
      : l.style === 1 ? `<path d="M4 11 Q4 2 12 2 Q20 2 20 11 L18 8 Q12 4 6 8 Z" fill="${l.hair}"/>`
      : `<path d="M5 8 Q12 2 19 8 L19 15 L17 15 L17 9 Q12 6 7 9 L7 15 L5 15 Z" fill="${l.hair}"/>`;
    return `<svg class="avatar" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 24 Q3 16 12 16 Q21 16 21 24 Z" fill="${l.shirt}"/>
      <circle cx="12" cy="10" r="6" fill="${l.skin}"/>${hair}</svg>`;
  }
  const STAT = Object.fromEntries(E.DATA.STATS.map((x, i) => [x.id, { ...x, i }]));
  const traitName = Object.fromEntries(E.DATA.TRAITS.map((t) => [t.id, t]));
  const DEPT_BY_ID = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d]));
  const ENG_TEAM_INFO = Object.fromEntries(DEPT_BY_ID.engineering.teams.map((t) => [t.id, t]));
  const grade = (eff) => (eff >= 1.4 ? 'star' : eff >= 1.1 ? 'good' : eff < 0.85 ? 'weak' : 'ok');
  const GRADE_WORD = { star: 'Star fit', good: 'Strong fit', ok: 'Solid fit', weak: 'Weak fit' };
  const first = (n) => n.split(' ')[0];
  /** A tappable headshot: opens the person's ID badge. */
  function face(p, deptId, kind, idx, extra = '') {
    const eff = E.effectiveness(p, deptId);
    return `<div class="face-wrap"><button class="face ${grade(eff)}${kind === 'mgr' ? ' mgr' : ''}" data-person="${deptId}|${kind}|${idx}" title="${p.n}: tap for ID">
      <span class="face-img">${avatar(p.a)}${kind === 'mgr' ? '<i class="face-tag">MGR</i>' : ''}</span>
      <span class="face-name">${first(p.n)}</span><span class="face-eff">×${eff.toFixed(2)}</span></button>${extra}</div>`;
  }

  function buildCompany() {
    const card = (d) => {
      const el = document.createElement('div');
      el.className = 'dept' + (d.id === 'production' ? ' production' : '');
      el.innerHTML = `<div class="dept-head"><span class="dept-name">${d.name}</span><span class="dept-status"></span></div>
        <div class="dept-role">${d.role}</div>
        <div class="dept-twist">${d.twist}</div>
        ${d.teams ? `<div class="dept-teams">${d.teams.map((t) => `<span title="${t.role}">${t.name}</span>`).join('')}</div>` : ''}
        <div class="dept-progress"><div></div></div>
        ${staffed(d.id) ? `<div class="dept-staff" hidden>
          <div class="staff-text"></div>
          <div class="cov" title="Coverage: team output ÷ work needed"><div></div></div>
          <div class="people-strip"></div>
          <div class="card-actions">
            <button class="btn mini" data-hire-best="${d.id}"></button>
            <button class="btn mini ghost open-dept" data-open-dept="${d.id}">Team &amp; details ›</button>
          </div>
        </div>` : ''}
        <div class="dept-era">Era ${ROMAN[d.era]} · ${ERAS[d.era]}</div>`;
      if (d.id === 'production') el.addEventListener('click', () => setTab('actuators'));
      // Tapping an open department's card (not one of its buttons) opens its focus view.
      if (staffed(d.id)) el.addEventListener('click', (ev) => {
        if (!ev.target.closest('button') && el.querySelector('.dept-staff:not([hidden])')) openDept(d.id);
      });
      const q = (sel) => el.querySelector(sel);
      deptEls[d.id] = { el, status: q('.dept-status'), prog: q('.dept-progress'), bar: q('.dept-progress div'),
        staff: q('.dept-staff'), staffText: q('.staff-text'), cov: q('.cov div'), strip: q('.people-strip'),
        best: q('[data-hire-best]'), twist: q('.dept-twist') };
      return el;
    };
    const line = $('order-line'), support = $('support-depts');
    DEPARTMENTS.filter((d) => d.group === 'order').forEach((d, i) => {
      const el = card(d);
      el.querySelector('.dept-head').insertAdjacentHTML('afterbegin', `<span class="dept-step">${i + 1}</span>`);
      line.appendChild(el);
    });
    DEPARTMENTS.filter((d) => d.group === 'support').forEach((d) => support.appendChild(card(d)));
    const chain = $('pak-chain');
    PAKS.forEach((p, i) => {
      if (i) chain.insertAdjacentHTML('beforeend', '<span class="pak-arrow" aria-hidden="true">→</span>');
      const el = document.createElement('div');
      el.className = 'pak';
      el.innerHTML = `<div class="dept-head"><span class="dept-name">${p.name}</span><span class="pak-value"></span></div>
        <div class="dept-role">${p.desc}</div><div class="dept-twist">Built from: ${p.recipe}</div>
        <div class="pak-stats"></div><div class="cov pak-prog"><div></div></div>
        <div class="pak-foot"><span class="dept-status"></span><button class="btn mini" data-pak-target="${p.id}">Build these</button></div>`;
      chain.appendChild(el);
      pakEls[p.id] = { el, status: el.querySelector('.dept-status'), value: el.querySelector('.pak-value'),
        stats: el.querySelector('.pak-stats'), prog: el.querySelector('.pak-prog div'), btn: el.querySelector('[data-pak-target]') };
    });
  }

  // Territory: a tile cartogram of the 13 states, coloured by region.
  const regionEls = {}, stateEls = {};
  function buildTerritory() {
    const T = 56, G = 4, X0 = 4 - T - G, Y0 = 4;   // x starts at 1 in the data
    let svg = '';
    for (const st of STATES) {
      const x = X0 + st.x * (T + G), y = Y0 + st.y * (T + G);
      const r = REGIONS.find((g) => g.id === st.region);
      svg += `<g class="tile region-${st.region}${st.offshore ? ' offshore' : ''}" data-state="${st.id}">
        <title>${st.name} · ${r.name} · customer base ${st.customers}${st.branch ? ' · location: ' + r.branch : ''}</title>
        <rect x="${x}" y="${y}" width="${T}" height="${T}" rx="5"/>
        ${st.offshore ? `<path class="waves" d="M${x + 8} ${y + 40} q6 -6 12 0 t12 0 t12 0 t12 0"/>` : ''}
        <text x="${x + T / 2}" y="${y + (st.branch ? 26 : 34)}">${st.offshore ? 'GULF' : st.id}</text>
        ${st.branch ? `<circle cx="${x + T / 2}" cy="${y + 40}" r="5"/>` : ''}
      </g>`;
    }
    const map = $('territory-map');
    map.innerHTML = svg;
    map.querySelectorAll('[data-state]').forEach((g) => (stateEls[g.dataset.state] = g));

    const list = $('region-list');
    for (const r of REGIONS) {
      const states = STATES.filter((st) => st.region === r.id).map((st) => st.offshore ? 'Gulf offshore' : st.id);
      const el = document.createElement('div');
      el.className = `region region-${r.id}`;
      el.innerHTML = `<div class="dept-head"><span class="dept-name"><i class="swatch"></i>${r.name}</span><span class="dept-status"></span></div>
        <div class="dept-role">Branch: <b>${r.branch}</b> · ${states.join(', ')}</div>
        <div class="dept-teams">${r.markets.map((m) => `<span>${m}</span>`).join('')}</div>
        <div class="dept-twist">Customer base potential <b>${fmt(E.customerBase(null, r.id))}</b>${r.id === 'hq'
          ? ' · every location runs the same departments and processes as HQ'
          : ` · ${(E.customerBase(null, r.id) / E.customerBase(null, 'hq')).toFixed(1)}× HQ`}</div>`;
      list.appendChild(el);
      regionEls[r.id] = { el, status: el.querySelector('.dept-status') };
    }
  }

  function renderTerritory(s) {
    const total = STATES.reduce((sum, st) => sum + st.customers, 0);
    $('customer-base').textContent = `customer base ${fmt(E.customerBase(s))} / ${fmt(total)}`;
    for (const r of REGIONS) {
      const open = E.regionOpen(s, r);
      regionEls[r.id].el.classList.toggle('closed', !open);
      const i = REGIONS.indexOf(r), prev = REGIONS[i - 1];
      regionEls[r.id].status.textContent = r.id === 'hq' ? 'Home' : open ? 'Open'
        : prev && !E.regionOpen(s, prev) ? `Opens after ${prev.name} · ${opensText(s, r).replace('Opens: ', '')}` : opensText(s, r);
      for (const st of STATES) if (st.region === r.id) stateEls[st.id].classList.toggle('closed', !open);
    }
  }

  function opensText(s, d) {
    const o = d.opens, parts = [];
    if (o.lifetime != null) parts.push(`$${fmt(o.lifetime)} earned`);
    if (o.tier != null) parts.push(TIERS[o.tier].name);
    if (o.overhauls != null) parts.push('first Overhaul');
    return 'Opens: ' + parts.join(' or ');
  }

  /** Plain-language health of a hireable department: [status, detail, big number]. */
  function deptHealth(s, dd, d) {
    const st = s.depts[d.id], o = dd.order, c = o.depts[d.id];
    const strength = E.strength(st, d.id), pct = (x) => `${Math.round((x - 1) * 100)}%`;
    if (!c) {
      return {
        engineering: () => {
          const ts = (id) => E.teamStrength(s, id);
          return [`Know-how ×${E.engKhMult(s).toFixed(2)}`,
            `Design ${ts('design').toFixed(1)} · Controls ${ts('controls').toFixed(1)} · Project ${ts('project').toFixed(1)}`,
            `×${E.engKhMult(s).toFixed(2)}`,
            `Design engineers raise Know-how (+${Math.round(ts('design') * E.DATA.CONSTANTS.engKhPerStrength * 100)}%). Controls engineers make Controls research cheaper and are needed for Sys-Paks. Project engineers build Paks (${fmt(E.pakHoursRate(s))} hrs/s).`];
        },
        it: () => [`Order Line +${pct(E.itMult(s))}`, `every Order Line team works +${pct(E.itMult(s))} harder (max +100%)`,
          `+${pct(E.itMult(s))}`, `IT multiplies the output of every Order Line team by ×${E.itMult(s).toFixed(2)}. More IT strength, bigger boost, up to ×2.`],
        safety: () => {
          const rate = E.incidentRate(s, dd) * 60;
          const risk = rate > 0 ? `about one incident every ${fmt(Math.max(1, 1 / rate))} min` : 'no incident risk below 3,000 psi';
          return [`${E.safeDays(s)} days safe`, `${risk} · streak bonus +${pct(E.safetyStreakMult(s))}`, `${E.safeDays(s)}`,
            `Incidents shut a production line for 30 s. Safety staff make them rarer; every incident-free shop day adds +1% income (max +25%, now +${pct(E.safetyStreakMult(s))}). Risk: ${risk}.`];
        },
        management: () => [`Every team +${pct(E.mgmtMult(s))}`, `+${pct(E.mgmtMult(s))} to every team · +${E.mgmtPool(s)} applicants everywhere`,
          `+${pct(E.mgmtMult(s))}`, `Management boosts every team in the company by ×${E.mgmtMult(s).toFixed(2)} (max ×1.5) and adds ${E.mgmtPool(s)} applicant${E.mgmtPool(s) === 1 ? '' : 's'} to every department.`],
      }[d.id]().concat([strength]);
    }
    const neck = o.bottleneck === d.id && o.factor < 0.999;
    const load = Math.round(c.load * 100), bonus = Math.round(c.bonus * 1000) / 10;
    const status = neck ? `Bottleneck · ${load}%` : bonus > 0 ? `Covered · ${load}% · +${bonus}% income` : `Covered · ${Math.min(100, load)}%`;
    const reach = c.reach !== 1 ? ` · reach ×${c.reach.toFixed(2)}` : '';
    const detail = `Output ${c.effective.toFixed(1)} of ${c.required.toFixed(1)} needed${reach}`;
    const story = neck
      ? `Short-handed. This team handles ${c.effective.toFixed(1)} units of work but the shop needs ${c.required.toFixed(1)}, so the whole Order Line (and your income) runs at ${Math.round(o.factor * 100)}%. Hire here first.`
      : bonus > 0 ? `Ahead of demand. This team handles ${c.effective.toFixed(1)} units of work and the shop needs ${c.required.toFixed(1)}. The extra capacity adds +${bonus}% income, and the cushion lasts as production grows.`
      : `Keeping up. Need grows as production grows (+4 staff for every 10× production), so keep an eye on it.`;
    return [status, detail, `${load}%`, story, strength, neck];
  }
  /** Chips that break down where a team's output comes from. */
  function boostChips(s, dd, d) {
    const st = s.depts[d.id], c = dd.order.depts[d.id] || {};
    const out = [`<span class="chip-s">People ${(1 + E.strength(st, d.id) / E.mgrBonus(st)).toFixed(1)}</span>`];
    if (st.mgr) out.push(`<span class="chip-s good">Manager +${Math.round((E.mgrBonus(st) - 1) * 100)}%</span>`);
    if (E.itMult(s) > 1 && c.required) out.push(`<span class="chip-s good">IT +${Math.round((E.itMult(s) - 1) * 100)}%</span>`);
    if (E.mgmtMult(s) > 1) out.push(`<span class="chip-s good">Management +${Math.round((E.mgmtMult(s) - 1) * 100)}%</span>`);
    if (c.reach && c.reach !== 1) out.push(`<span class="chip-s good">Locations ×${c.reach.toFixed(2)}</span>`);
    if (d.id === 'purchasing' && E.purchasingDiscount(s) < 1) out.push(`<span class="chip-s">Prices −${Math.round((1 - E.purchasingDiscount(s)) * 100)}%</span>`);
    return out.join('');
  }
  const setBtn = (b, cost, label, cash) => {
    if (!b) return;
    const html = `$${fmt(cost)}<small>${label}</small>`;
    if (b._html !== html) { b._html = html; b.innerHTML = html; }
    b.disabled = cost > cash;
  };

  /** A department card on the Company tab: health, faces, quick hire. Details live in the focus sheet. */
  function renderStaffed(s, dd, d, r) {
    const o = dd.order, st = s.depts[d.id], c = o.depts[d.id];
    const [status, detail, , , , neck] = deptHealth(s, dd, d);
    r.staff.hidden = false;
    r.twist.hidden = true;
    r.status.textContent = status;
    setPart(r.staffText, `You + ${E.headcount(st)} hired · ${detail}`, true);
    r.cov.parentElement.hidden = !c;
    if (c) {
      r.el.classList.toggle('neck', !!neck);
      r.cov.style.width = `${Math.min(100, c.coverage * 100)}%`;
      r.cov.parentElement.style.setProperty('--sur', `${Math.min(1, Math.max(0, c.load - 1)) * 100}%`);
      r.cov.parentElement.classList.toggle('short', c.coverage < 0.999);
    }
    const key = (st.mgr ? st.mgr.n : '') + '|' + st.team.length + '|' + st.staff;
    if (r.strip._key !== key) {
      r.strip._key = key;
      const team = st.team.map((p, i) => [p, i]).sort((x, y) => E.effectiveness(y[0], d.id) - E.effectiveness(x[0], d.id));
      const shown = team.slice(0, 4), more = team.length - shown.length + st.staff;  // one row on a phone
      r.strip.innerHTML = (st.mgr ? face(st.mgr, d.id, 'mgr', 0) : '<div class="face-wrap"><span class="face empty" title="No manager yet">?<span class="face-name">No mgr</span></span></div>')
        + shown.map(([p, i]) => face(p, d.id, 'team', i)).join('')
        + (more > 0 ? `<button class="face more" data-open-dept="${d.id}">+${more}</button>` : '')
        + (!team.length && !st.staff ? '<span class="muted strip-empty">Just you so far. Open the team to hire.</span>' : '');
    }
    const many = E.hireQuote(s, d.id, ui.qty);
    setBtn(r.best, many.cost, `hire best ${many.qty}`, s.cash);
  }

  // ---- Department focus sheet and ID badge -------------------------------------

  function openDept(id) {
    ui.sheet = id;
    ui.person = null;
    $('sheet').hidden = false;
    $('idcard').hidden = true;
    $('sheet-body')._key = null;
    document.body.classList.add('modal-open');
    render(lastState);
  }
  function closeSheet() { ui.sheet = null; ui.person = null; $('sheet').hidden = true; $('idcard').hidden = true; document.body.classList.remove('modal-open'); }
  function openPerson(spec) {
    const [dept, kind, idx] = spec.split('|');
    ui.person = { dept, kind, idx: Number(idx) };
    $('idcard').hidden = false;
    $('id-body')._key = null;
    document.body.classList.add('modal-open');
    render(lastState);
  }
  function closePerson() { ui.person = null; $('idcard').hidden = true; if (!ui.sheet) document.body.classList.remove('modal-open'); }

  function personOf(s, sp) {
    const st = s.depts[sp.dept];
    if (!st) return null;
    return sp.kind === 'mgr' ? st.mgr : sp.kind === 'pool' ? st.pool[sp.idx] : st.team[sp.idx];
  }

  function renderSheet(s, dd) {
    if (ui.sheet.startsWith('exec:')) return renderExecSheet(s, dd);
    const d = DEPT_BY_ID[ui.sheet], st = s.depts[d.id], body = $('sheet-body'), foot = $('sheet-foot');
    if (!E.departmentOpen(s, d)) return closeSheet();
    const isEng = d.id === 'engineering';
    const [, , big, story, , neck] = deptHealth(s, dd, d);
    const key = [d.id, st.mgr && st.mgr.n + st.mgr.g, st.auto, st.staff, st.team.map((p) => p.n + (p.g || '')).join(','),
      st.pool.map((p) => p.n).join(','), JSON.stringify(s.engUp)].join('#');
    if (body._key !== key) {
      body._key = key;
      const [a, b] = E.DATA.DEPT_STATS[d.id];
      const team = st.team.map((p, i) => [p, i]).sort((x, y) => E.effectiveness(y[0], d.id) - E.effectiveness(x[0], d.id));
      const lea = st.mgr && E.leadership(st.mgr), support = !dd.order.depts[d.id];
      const mgrHtml = st.mgr
        ? `<div class="mgr-card">${face(st.mgr, d.id, 'mgr', 0)}<div class="mgr-info"><b>${st.mgr.n}</b>
            <span>Leadership <b>${lea}</b>/10</span>
            <ul class="plain"><li>Team works <b>+${Math.round((E.mgrBonus(st) - 1) * 100)}%</b> harder (5% per Leadership point)</li>
            <li>Screens <b>${E.poolSize(st, s)}</b> applicants for you</li>
            ${!st.auto ? '<li>Auto-staff is off: you hire and replace people yourself</li>' : `${support ? '' : `<li>Hires up to <b>${1 + Math.floor(lea / 4)}</b> people every 2 s when the team falls behind</li>`}
            <li>Every ${E.DATA.CONSTANTS.mgrReviewEvery} s, lets the weakest person go when an applicant beats them by <b>+${E.mgrReplaceGap(lea).toFixed(2)}</b> (e.g. ×1.00 → ×${(1 + E.mgrReplaceGap(lea)).toFixed(2)}; a smaller gap with more Leadership)</li>`}</ul>
            <button class="btn mini ${st.auto ? '' : 'ghost'}" data-auto="${d.id}">${st.auto ? 'Auto-staff: on' : 'Auto-staff: off'}</button>
            <ul class="exec-log mgr-log" data-k="mgrlog"></ul></div></div>`
        : `<p class="mgr none">No manager yet. Tap someone with high <b>Leadership</b> and choose <b>Promote</b>: a manager boosts the whole team${support ? '' : ', screens more applicants and keeps the team staffed'}.</p>`;
      const faces = (list) => list.map(([p, i]) => face(p, d.id, 'team', i)).join('');
      const teamHtml = isEng
        ? E.ENG_TEAMS.map((tid) => {
          const members = team.filter(([p]) => E.engTeamOf(p) === tid);
          return `<div class="eng-team"><div class="eng-team-head"><b>${ENG_TEAM_INFO[tid].name}</b> <span class="muted" data-k="ts-${tid}"></span></div>
            <p class="muted">${ENG_TEAM_INFO[tid].role}</p>
            <div class="faces">${(tid === 'design' && st.staff ? `<span class="face more">+${st.staff}</span>` : '') + faces(members) || '<span class="muted">Nobody yet. Tap an engineer to move them here.</span>'}</div></div>`;
        }).join('')
        : `<div class="faces">${faces(team)}${st.staff ? `<span class="face more" title="Hired before named staff">+${st.staff}</span>` : ''}${!team.length && !st.staff ? '<span class="muted">Nobody hired yet.</span>' : ''}</div>`;
      const engHtml = isEng ? `<section><h4>Engineering projects</h4>${E.DATA.ENG_UPGRADES.map((u) => {
        const owned = s.engUp[u.id];
        return `<div class="eng-up${owned ? ' owned' : ''}"><div class="p-main"><span class="p-name">${u.name} <b>×${u.kh} Know-how</b></span>
          <span class="p-stats" data-k="eng-${u.id}"></span></div>
          ${owned ? '<span class="p-eff good">✓</span>' : `<button class="btn mini" data-eng="${u.id}"></button>`}</div>`;
      }).join('')}</section>` : '';
      body.innerHTML = `<header class="sh-head"><h3 id="sheet-title">${d.name}</h3><button class="sh-x" data-close="sheet" aria-label="Close">✕</button></header>
        <p class="sh-role">${d.role}</p>
        <section class="sh-health"><div class="sh-big" data-k="big"></div><p data-k="story"></p></section>
        ${dd.order.depts[d.id] ? '<div class="cov sh-cov"><div></div></div>' : ''}
        <div class="chips" data-k="chips"></div>
        <section><h4>What makes someone good here</h4>
          <div class="statfit"><div class="sf key"><b>${STAT[a].name}</b> <em>counts double</em><p>${STAT[a].desc}</p></div>
          <div class="sf"><b>${STAT[b].name}</b><p>${STAT[b].desc}</p></div></div>
          <p class="muted small">Each person counts as about 0.55–1.9 staff here, from these two stats plus any matching quirk. Tap a face for their ID badge.</p></section>
        <section><h4>Manager</h4>${mgrHtml}</section>
        <section><h4>Team <span class="muted">· ${E.headcount(st)}</span></h4>${teamHtml}</section>
        ${engHtml}
        <section><h4>Applicants${st.mgr ? ` <span class="muted">· screened by ${first(st.mgr.n)}</span>` : ''}</h4>
          <div class="faces apps">${st.pool.map((p, i) => face(p, d.id, 'pool', i, `<button class="btn mini" data-hire="${d.id}" data-idx="${i}"></button>`)).join('')}</div></section>`;
      foot.innerHTML = `<button class="btn ghost" data-reroll="${d.id}"></button><button class="btn primary" data-hire-best="${d.id}"></button>`;
    }
    // live numbers
    const k = (name) => body.querySelector(`[data-k="${name}"]`);
    setPart(k('big'), big, true);
    k('big').className = 'sh-big' + (neck ? ' bad' : '');
    setPart(k('story'), story, true);
    setPart(k('chips'), boostChips(s, dd, d));
    if (k('mgrlog')) {
      const lines = s.execLog.filter((l) => l.x === 'mgr:' + d.id).slice(0, 3);
      setPart(k('mgrlog'), lines.map((l) => `<li><span class="muted">${fmtTime(Math.max(0, s.time - l.t))} ago</span> ${l.m}</li>`).join(''));
    }
    const c = dd.order.depts[d.id], cov = body.querySelector('.sh-cov');
    if (c && cov) {
      cov.firstChild.style.width = `${Math.min(100, c.coverage * 100)}%`;
      cov.style.setProperty('--sur', `${Math.min(1, Math.max(0, c.load - 1)) * 100}%`);
      cov.classList.toggle('short', c.coverage < 0.999);
    }
    if (isEng) {
      for (const tid of E.ENG_TEAMS) {
        const ts = E.teamStrength(s, tid);
        const what = tid === 'design' ? `+${Math.round(ts * E.DATA.CONSTANTS.engKhPerStrength * 100)}% Know-how`
          : tid === 'controls' ? `Controls research −${Math.round((1 - Math.max(E.DATA.CONSTANTS.controlsTechFloor, 1 - E.DATA.CONSTANTS.controlsTechPer * ts)) * 100)}%${ts >= 1 ? (s.tech.plc ? ' · Sys-Paks ready' : ' · Sys-Paks after PLC Automation') : ' · strength 1 needed for Sys-Paks'}`
          : `${fmt(E.pakHoursRate(s))} hrs/s on the Pak line`;
        setPart(k(`ts-${tid}`), `· strength ${ts.toFixed(1)} · ${what}`, true);
      }
      const heads = E.headcount(st);
      for (const u of E.DATA.ENG_UPGRADES) {
        const el = k(`eng-${u.id}`);
        if (el) setPart(el, s.engUp[u.id] ? 'Built' : heads >= u.engineers ? u.desc : `Needs ${u.engineers} engineer${u.engineers > 1 ? 's' : ''} (have ${heads})`, true);
        const btn = body.querySelector(`[data-eng="${u.id}"]`);
        if (btn) { setBtn(btn, u.cost * dd.m.costMult, 'build', s.cash); btn.disabled = !E.canBuyEng(s, u.id); }
      }
    }
    const one = E.hireQuote(s, d.id, 1), many = E.hireQuote(s, d.id, ui.qty);
    body.querySelectorAll('[data-hire]').forEach((b) => setBtn(b, one.cost, 'hire', s.cash));
    setBtn(foot.querySelector('[data-hire-best]'), many.cost, `hire best ${many.qty}`, s.cash);
    setBtn(foot.querySelector('[data-reroll]'), E.rerollCost(s), 'new applicants', s.cash);
  }

  function renderPerson(s, dd) {
    const sp = ui.person, p = personOf(s, sp), body = $('id-body'), foot = $('id-foot');
    if (!p) return closePerson();
    const d = DEPT_BY_ID[sp.dept], st = s.depts[sp.dept], isEng = sp.dept === 'engineering';
    const key = [sp.dept, sp.kind, sp.idx, p.n, p.g, st.mgr && st.mgr.n].join('#');
    if (body._key !== key) {
      body._key = key;
      const eff = E.effectiveness(p, sp.dept), g = grade(eff);
      const [a, b] = E.DATA.DEPT_STATS[sp.dept];
      const tr = p.t && traitName[p.t], fits = tr && (tr.dept === sp.dept || tr.dept === 'any');
      const lea = E.leadership(p);
      const empNo = `1972-${String((p.a * 7 + p.n.length * 131) % 10000).padStart(4, '0')}`;
      const title = sp.kind === 'mgr' ? `${d.name} Manager` : sp.kind === 'pool' ? `Applicant · ${d.name}` : `${d.name}${isEng ? ` · ${ENG_TEAM_INFO[E.engTeamOf(p)].name} team` : ''}`;
      const stats = E.DATA.STATS.map((x) => {
        const v = x.id === 'leadership' ? lea : p.s[STAT[x.id].i];
        const role = x.id === a ? 'key' : x.id === b ? 'key2' : x.id === 'leadership' ? 'lead' : '';
        const tag = x.id === a ? 'counts double here' : x.id === b ? 'counts here' : x.id === 'leadership' ? 'for managing' : '';
        return `<li class="${role}"><span class="st-name">${x.name}${tag ? ` <em>${tag}</em>` : ''}</span>
          <span class="st-bar"><i style="width:${v * 10}%"></i></span><b>${v}</b><small>${x.desc}</small></li>`;
      }).join('');
      const tmp = { mgr: p, team: [] };
      body.innerHTML = `<div class="idc ${g}">
        <div class="idc-top"><span class="idc-brand">${root.PW.brand ? root.PW.brand.logoHTML({ h: 20, white: true }) : 'IFP'}<span>MSI · Cedar Rapids</span></span><span>${sp.kind === 'pool' ? 'APPLICANT' : 'EMPLOYEE ID'}</span></div>
        <div class="idc-main"><div class="idc-photo">${avatar(p.a)}</div>
          <div><h3>${p.n}</h3><div class="idc-title">${title}</div><div class="idc-no">No. ${empNo}</div></div>
          <button class="sh-x" data-close="idcard" aria-label="Close">✕</button></div>
        <div class="idc-fit"><b>${GRADE_WORD[g]}</b>: counts as <b>${eff.toFixed(2)}</b> staff in ${d.name}
          <p>From ${STAT[a].name} ${p.s[STAT[a].i]} (counts double) and ${STAT[b].name} ${p.s[STAT[b].i]}${fits ? `, plus +${tr.bonus.toFixed(2)} from their quirk` : ''}. An average person counts as about 1.0.</p></div>
        <h4>Stats <span class="muted">· 1 to 10</span></h4>
        <ul class="idc-stats">${stats}</ul>
        ${tr ? `<div class="idc-quirk"><b>Quirk:</b> ${tr.name}<p>${fits ? `Worth <b>+${tr.bonus.toFixed(2)}</b> staff in ${d.name}.` : `Helps in ${tr.dept === 'any' ? 'any job' : DEPT_BY_ID[tr.dept].name} (+${tr.bonus.toFixed(2)}), not here.`}</p></div>` : ''}
        <div class="idc-lead"><b>As a manager</b> (Leadership ${lea}): the team works +${Math.round((E.mgrBonus(tmp) - 1) * 100)}% harder, ${E.poolSize(tmp, s)} applicants screened, up to ${1 + Math.floor(lea / 4)} hires every 2 s.</div>
        ${isEng && sp.kind !== 'pool' ? `<h4>Engineering team</h4><div class="seg">${E.ENG_TEAMS.map((tid) =>
          `<button class="btn mini${E.engTeamOf(p) === tid ? ' on' : ' ghost'}" data-engteam="${tid}" data-who="${sp.kind === 'mgr' ? 'mgr' : sp.idx}">${ENG_TEAM_INFO[tid].name}</button>`).join('')}</div>
          <p class="muted small">${ENG_TEAM_INFO[E.engTeamOf(p)].role}</p>` : ''}
      </div>`;
      foot.innerHTML = `<button class="btn ghost" data-close="idcard">Close</button>`
        + (sp.kind === 'pool' ? `<button class="btn primary" data-hire="${sp.dept}" data-idx="${sp.idx}"></button>`
          : sp.kind === 'team' ? `<button class="btn primary" data-promote="${sp.dept}" data-idx="${sp.idx}">${st.mgr ? `Make manager<small>${first(st.mgr.n)} rejoins the team</small>` : 'Promote to manager<small>boosts the whole team</small>'}</button>` : '');
    }
    setBtn(foot.querySelector('[data-hire]'), E.hireQuote(s, sp.dept, 1).cost, 'hire', s.cash);
  }


  // ---- Executive track: org chart, executive sheet, Board ----------------------

  const EXEC_INFO = Object.fromEntries(E.DATA.EXECS.map((x) => [x.id, x]));
  const deptNames = (ids) => ids.map((id) => DEPT_BY_ID[id].name).join(', ');
  function execFace(p, label, sheet) {
    return `<button class="face mgr exec-face" data-open-dept="${sheet}" title="${p.n}"><span class="face-img">${avatar(p.a)}<i class="face-tag">${label}</i></span>
      <span class="face-name">${first(p.n)}</span></button>`;
  }
  function renderOrg(s) {
    const open = E.execOpen(s), org = $('org');
    setPart($('exec-hint'), open
      ? 'Executives run whole divisions on their own: every few seconds they fix managers, hire toward a cushion, replace weak staff with better applicants and refresh poor applicant pools, spending a little cash. Promote from inside for free, or hire from outside.'
      : 'Opens with Management ($1B earned or your first Overhaul). Executives run whole divisions for you.', true);
    const last = s.execLog[0];
    setPart($('exec-summary'), open ? `· ${E.execCount(s)}/4 seated${s.president ? ' · President' : ''}${last ? ` · latest: ${last.m}` : ''}` : '', true);
    org.classList.toggle('closed', !open);
    const key = [open, s.president && s.president.n, ...E.DATA.EXECS.map((x) => s.execs[x.id] && s.execs[x.id].n), E.canAppointPresident(s)].join('|');
    if (org._key !== key) {
      org._key = key;
      const seat = (id, title, p, sub) => `<div class="seat${p ? '' : ' vacant'}" data-open-dept="exec:${id}">
        ${p ? execFace(p, title, `exec:${id}`) : `<span class="face empty">${title}</span>`}
        <div class="seat-info"><b>${p ? p.n : 'Vacant'}</b><span class="muted">${sub}</span><span class="seat-skill" data-k="sk-${id}"></span></div></div>`;
      org.innerHTML = `<div class="org-top">${seat('pres', 'PRES', s.president, s.president ? 'President · runs Management' : E.canAppointPresident(s) ? 'Name one of your executives' : 'Needs 3 executives')}</div>
        <div class="org-row">${E.DATA.EXECS.map((x) => seat(x.id, x.short, s.execs[x.id], deptNames(x.depts))).join('')}</div>`;
    }
    for (const x of [...E.DATA.EXECS.map((e) => e.id), 'pres']) {
      const el = org.querySelector(`[data-k="sk-${x}"]`);
      if (!el) continue;
      const sk = x === 'pres' ? E.presidentSkill(s) : E.execSkill(s, x);
      setPart(el, sk ? (x === 'pres' ? `skill ${sk} · income +${Math.round((E.presidentMult(s) - 1) * 100)}%` : `skill ${sk} · teams +${Math.round(sk * E.DATA.CONSTANTS.execBonusPer * 100)}%`) : (open ? 'Tap to appoint' : ''), true);
    }
    // Board
    const bopen = E.boardOpen(s), board = $('board');
    $('board-wrap').hidden = !open && !bopen && !s.board.length;
    if (bopen) E.fillBoardPool(s);
    const cost = E.boardSeatCost(s);
    setPart($('board-summary'), bopen ? `· ${s.board.length}/${E.DATA.BOARD_COSTS.length} seats · directors stay through Overhaul` : '· opens after 2 Overhauls or $1T earned', true);
    const prop = E.boardProposal(s);
    const bkey = [bopen, s.board.map((m) => m.perk + m.n).join(), s.boardPool.map((m) => m.perk).join(),
      prop && prop.seat + prop.cand.p.n + prop.cost].join('|');
    if (board._key !== bkey) {
      board._key = bkey;
      const perk = (id) => E.DATA.BOARD_PERKS.find((k) => k.id === id);
      const q = (m) => `LEA ${E.leadership(m)} · perk strength ×${E.directorQuality(m).toFixed(2)}`;
      const chairOf = prop ? prop.chair : s.board.length > 1 && s.board.reduce((a, b) => (E.leadership(b) > E.leadership(a) ? b : a));
      board.innerHTML = s.board.map((m) => `<div class="director${m === chairOf ? ' chair' : ''}"><span class="face-img">${avatar(m.a)}</span><div><b>${m.n}${m === chairOf ? ' <span class="chair-tag">Chair</span>' : ''}</b><span>${perk(m.perk).name}</span><em>${perk(m.perk).desc} · ${q(m)}</em></div></div>`).join('')
        + (prop ? `<div class="board-prop"><div class="app-head">${first(prop.chair.n)} (Chair) proposes</div>
          <div class="director cand"><span class="face-img">${avatar(prop.cand.p.a)}</span><div><b>${prop.cand.p.n}</b>
            <span>${DEPT_BY_ID[prop.cand.dept].name}${prop.cand.kind === 'mgr' ? ' manager' : ''} · replaces ${prop.out.n} as ${perk(prop.out.perk).name}</span>
            <em>LEA ${E.leadership(prop.out)} → ${E.leadership(prop.cand.p)} · perk strength ×${E.directorQuality(prop.out).toFixed(2)} → ×${E.directorQuality(prop.cand.p).toFixed(2)}</em></div>
            <button class="btn mini" data-board-replace>${prop.cost} patent${prop.cost > 1 ? 's' : ''}<small>replace</small></button></div>
          <p class="muted small">The Chair watches for anyone in the company who leads clearly better than the weakest director. ${first(prop.out.n)} retires; ${first(prop.cand.p.n)} leaves their job.</p></div>` : '')
        + (bopen && cost != null ? `<div class="board-cands"><div class="app-head">Candidates for seat ${s.board.length + 1} · ${cost} patents</div>${s.boardPool.map((m, i) =>
          `<div class="director cand"><span class="face-img">${avatar(m.a)}</span><div><b>${m.n}</b><span>${perk(m.perk).name}</span><em>${perk(m.perk).desc} · ${q(m)}</em></div>
            <button class="btn mini" data-board-elect="${i}">${cost} patents<small>elect</small></button></div>`).join('')}
          <p class="muted small">Patents spent on the Board are gone for good (each was worth +10% income), so pick perks that beat that.</p></div>` : '')
        + (!bopen ? '' : !s.board.length && cost == null ? '' : '');
    }
    board.querySelectorAll('[data-board-elect]').forEach((b) => (b.disabled = cost == null || s.patents < cost));
    board.querySelectorAll('[data-board-replace]').forEach((b) => (b.disabled = !prop || s.patents < prop.cost));
  }

  function renderExecSheet(s, dd) {
    const id = ui.sheet.slice(5), isPres = id === 'pres', body = $('sheet-body'), foot = $('sheet-foot');
    if (!E.execOpen(s)) return closeSheet();
    const C = E.DATA.CONSTANTS, x = EXEC_INFO[id];
    const p = isPres ? s.president : s.execs[id];
    const skill = isPres ? E.presidentSkill(s) : E.execSkill(s, id);
    const cands = isPres ? E.DATA.EXECS.filter((e) => s.execs[e.id]).map((e) => ({ seat: e.id, p: s.execs[e.id] })) : E.execCandidates(s, id);
    if (!isPres) E.fillExecPool(s, id);
    const key = [id, p && p.n, cands.map((c) => c.p.n + c.dept + c.idx).join(','), !isPres && s.execPool[id].map((q) => q.n).join(','), E.canAppointPresident(s), s.president && s.president.n].join('#');
    if (body._key !== key) {
      body._key = key;
      const title = isPres ? 'President' : `${x.name} (${x.short})`;
      const statName = STAT[isPres ? E.DATA.PRESIDENT.stat : x.stat].name;
      const what = isPres
        ? `<ul class="plain"><li>All income <b>+${Math.round(C.presidentIncomePer * 100)}%</b> per skill point</li>
            <li>Every executive <b>+1 skill</b> per ${C.presidentSkillDiv} President skill</li>
            <li>Runs Management: its team <b>+${Math.round(C.execBonusPer * 100)}%</b> per skill point</li>
            <li>Every ${C.presReviewEvery} s, reviews the C-suite: fills a vacant seat with the best person in its division (skill ${C.presFillSkill}+), or replaces an executive when someone would be <b>${E.presReplaceGap(s)}+</b> skill better (the gap shrinks as the President improves). The outgoing executive takes the newcomer's old job.</li></ul>`
        : `<ul class="plain"><li>Division teams work <b>+${Math.round(C.execBonusPer * 100)}%</b> harder per skill point</li>
            <li>Every ${C.execEvery} s, takes <b>1 + skill÷3</b> actions, each spending at most <b>${(C.execBudgetBase * 100).toFixed(1)}% + ${(C.execBudgetPer * 100).toFixed(1)}% per skill</b> of your cash:</li>
            <li>• makes the best leader each team's manager</li>
            <li>• hires Order Line teams up to <b>100% + ${Math.round(C.execTargetPer * 100)}% per skill</b> coverage, and tops up support teams while cheap</li>
            <li>• lets the weakest person go when an applicant is clearly better (acts on smaller gains with more skill)</li>
            <li>• refreshes an applicant pool with nobody worth hiring</li></ul>`;
      const card = p ? `<div class="mgr-card">${execFace(p, isPres ? 'PRES' : x.short, ui.sheet)}<div class="mgr-info"><b>${p.n}</b>
          <span>Skill <b data-k="skill"></b></span>
          <span class="muted small">(2 × Leadership ${E.leadership(p)} + ${statName} ${isPres ? p.s[STAT[E.DATA.PRESIDENT.stat].i] : (x.stat === 'leadership' ? E.leadership(p) : p.s[STAT[x.stat].i])}) ÷ 3${!isPres && s.president ? ', plus the President’s lift' : ''}</span>
          ${!isPres && E.canAppointPresident(s) ? `<button class="btn mini" data-exec-pres="${id}">${s.president ? `Make President<small>${first(s.president.n)} retires</small>` : 'Make President'}</button>` : ''}
          ${isPres ? '' : `<button class="btn mini ghost" data-exec-dismiss="${id}">Let go</button>`}</div></div>`
        : `<p class="mgr none">Vacant. ${isPres ? (E.canAppointPresident(s) ? 'Name one of your executives below.' : 'Seat at least 3 executives first.') : 'Promote someone from the division for free, or hire an outside candidate.'}</p>`;
      const candRow = (c) => isPres
        ? `<div class="cand-row">${execFace(c.p, EXEC_INFO[c.seat].short, `exec:${c.seat}`)}<div class="p-main"><span class="p-name">${c.p.n}</span>
            <span class="p-stats">${EXEC_INFO[c.seat].short} · President skill ${Math.round((2 * E.leadership(c.p) + c.p.s[STAT[E.DATA.PRESIDENT.stat].i]) / 3)}</span></div>
            <button class="btn mini" data-exec-pres="${c.seat}">Name President</button></div>`
        : `<div class="cand-row">${face(c.p, c.dept, c.kind, c.idx)}<div class="p-main"><span class="p-name">${c.p.n}</span>
            <span class="p-stats">${DEPT_BY_ID[c.dept].name}${c.kind === 'mgr' ? ' manager' : ''} · LEA ${E.leadership(c.p)} · would be skill <b>${c.skill}</b></span></div>
            <button class="btn mini" data-exec-appoint="${id}" data-dept="${c.dept}" data-kind="${c.kind}" data-idx="${c.idx}">${p ? 'Replace' : 'Appoint'}<small>free</small></button></div>`;
      const outside = isPres ? '' : `<section><h4>Outside candidates</h4>${s.execPool[id].map((q, i) =>
        `<div class="cand-row"><span class="face"><span class="face-img">${avatar(q.a)}</span><span class="face-name">${first(q.n)}</span></span><div class="p-main"><span class="p-name">${q.n}</span>
          <span class="p-stats">LEA ${E.leadership(q)} · ${statName} ${x.stat === 'leadership' ? E.leadership(q) : q.s[STAT[x.stat].i]} · would be skill <b>${E.execSkill(s, id, q)}</b></span></div>
          <button class="btn mini" data-exec-hire="${id}" data-idx="${i}"></button></div>`).join('')}</section>`;
      body.innerHTML = `<header class="sh-head"><h3 id="sheet-title">${title}</h3><button class="sh-x" data-close="sheet" aria-label="Close">✕</button></header>
        <p class="sh-role">${isPres ? 'Leads the executives and the company.' : `${x.desc} Division: ${deptNames(x.depts)}.`}</p>
        <section><h4>${isPres ? 'President' : 'Executive'}</h4>${card}</section>
        <section><h4>What they do</h4>${what}</section>
        <section><h4>Recent decisions</h4><ul class="exec-log" data-k="log"></ul></section>
        <section><h4>${isPres ? 'Your executives' : 'Promote from inside'} <span class="muted">· key stats: Leadership ×2 and ${statName}</span></h4>
          ${cands.length ? cands.map(candRow).join('') : `<p class="muted">${isPres ? 'No executives seated yet.' : 'Nobody in this division yet.'}</p>`}</section>
        ${outside}`;
      foot.innerHTML = `<button class="btn ghost" data-close="sheet">Close</button>`;
    }
    const k = (n) => body.querySelector(`[data-k="${n}"]`);
    if (k('skill')) setPart(k('skill'), String(skill), true);
    if (k('log')) {
      const lines = s.execLog.filter((l) => l.x === id).slice(0, 8);
      setPart(k('log'), lines.length ? lines.map((l) => `<li><span class="muted">${fmtTime(Math.max(0, s.time - l.t))} ago</span> ${l.m}</li>`).join('') : '<li class="muted">Nothing yet. Decisions show up here every few seconds.</li>');
    }
    const cost = E.execHireCost(s, dd);
    body.querySelectorAll('[data-exec-hire]').forEach((b) => setBtn(b, cost, 'hire', s.cash));
  }


  // ---- Shake-up card --------------------------------------------------------------
  const SHAKE_LABEL = { board: 'Board', cxo: 'Executives', mgr: 'Managers', staff: 'Employees' };
  const SHAKE_WHAT = {
    board: 'Anyone in the company may take a Board seat, if it raises output (each seat keeps its perk).',
    cxo: 'Executive seats and the President go to whoever, anywhere in the company, does the most for output.',
    mgr: 'Any leader may take any team; every team ends up with a manager.',
    staff: 'People swap between departments, the most promising swaps first, until no swap raises output.',
  };
  function renderShake(s, dd) {
    const box = $('shake'), sh = s.shake, C = E.DATA.CONSTANTS;
    box.hidden = !E.shakeOpen(s);
    if (box.hidden) return;
    const key = [sh.phase, sh.moves.length, sh.report && sh.report.at, sh.cooldown > 0, E.canFreeShake(s)].join('|');
    if (box._key !== key) {
      box._key = key;
      const idx = E.SHAKE_PHASES.indexOf(sh.phase);
      const steps = E.SHAKE_PHASES.map((ph, i) => `<li class="${sh.phase ? (i < idx ? 'done' : i === idx ? 'now' : '') : ''}">
        <b>${SHAKE_LABEL[ph]}</b><span>${Math.round(C.shakePhaseS[ph])} s</span></li>`).join('');
      const moves = sh.moves.slice(-6).reverse().map((m) => `<li>${m}</li>`).join('');
      box.innerHTML = `<div class="shake-head"><h4>Company shake-up</h4><span class="muted small" data-k="sh-status"></span></div>
        <ol class="shake-steps">${steps}</ol>
        ${sh.phase ? `<div class="cov shake-prog"><div data-k="sh-prog"></div></div>
          <p class="small">${SHAKE_WHAT[sh.phase]} <span class="bad-text">While it runs: incidents ×${C.shakeIncidentMult}, Order Line at ${Math.round(C.shakeDisruption * 100)}%.</span></p>`
          : `<p class="small muted">Reorganize the whole company for output: anyone can move to any seat, from the Board down. Each phase tests thousands of moves, keeps the ones that raise income (without hurting Know-how, safety, Controls or costs) and stops when nothing helps. It takes about ${Math.round(Object.values(C.shakePhaseS).reduce((a, b) => a + b, 0) / 60)} minutes, and while it runs incidents are ${C.shakeIncidentMult}× likelier and the Order Line works at ${Math.round(C.shakeDisruption * 100)}%.</p>`}
        ${moves ? `<ul class="exec-log">${moves}</ul>` : ''}
        ${!sh.phase && sh.report ? `<p class="small">Last ${sh.report.free ? 'reorg (free)' : 'shake-up'}: <b>${sh.report.moves}</b> move${sh.report.moves === 1 ? '' : 's'}, income <b>${sh.report.change >= 0 ? '+' : ''}${(sh.report.change * 100).toFixed(1)}%</b>.</p>` : ''}
        ${sh.phase ? '' : `<div class="shake-btns">${E.canFreeShake(s) ? '<button class="btn primary" data-shake-free="1">Free instant reorg<small>one time · no cost, no disruption</small></button>' : ''}<button class="btn ${E.canFreeShake(s) ? 'ghost' : 'primary'}" data-shake="1"></button></div>`}`;
    }
    const k = (n) => box.querySelector(`[data-k="${n}"]`);
    if (sh.phase) {
      const total = C.shakePhaseS[sh.phase];
      k('sh-prog').style.width = `${Math.min(100, (1 - sh.left / total) * 100)}%`;
      setPart(k('sh-status'), `${SHAKE_LABEL[sh.phase]} · ${Math.ceil(sh.left)} s left`, true);
    } else {
      setPart(k('sh-status'), sh.cooldown > 0 ? `ready again in ${fmtTime(sh.cooldown)}` : 'ready', true);
      const b = box.querySelector('[data-shake]');
      if (b) {
        const cost = E.shakeCost(s, dd);
        const html = sh.cooldown > 0 ? `Cooling down<small>${fmtTime(sh.cooldown)}</small>` : `Start shake-up<small>$${fmt(cost)}</small>`;
        if (b._html !== html) { b._html = html; b.innerHTML = html; }
        b.disabled = !E.canShake(s);
      }
    }
  }


  // ---- SCADA cockpit ----------------------------------------------------------------
  // A control-room screen built from the game's own instruments: the same pressure and
  // temperature dials and flow/accumulator meters as the control panel, plus trend charts
  // with labelled axes. Numbers in this game get enormous, so money and Know-how trends
  // switch to a log scale when they span orders of magnitude, and every label uses fmt().

  const HIST_N = 300;            // 5 minutes at one sample per second
  const hist = { t: [], income: [], production: [], psi: [], temp: [], tempEq: [], supply: [], demand: [], kh: [], pak: [], acc: [], heat: [] };
  let lastSample = 0;
  function sample(s, d) {
    if (s.time - lastSample < 1 && hist.t.length) return;
    lastSample = s.time;
    const push = (k, v) => { hist[k].push(Number.isFinite(v) ? v : 0); if (hist[k].length > HIST_N) hist[k].shift(); };
    push('t', s.time); push('income', d.income); push('production', d.production); push('psi', d.psi);
    push('temp', s.temp); push('tempEq', Math.min(d.tempEq, 9999)); push('supply', d.supply); push('demand', d.demand);
    push('kh', d.khRate); push('pak', E.pakIncome(s, d)); push('acc', d.accCap > 0 ? (100 * s.accCharge) / d.accCap : 0); push('heat', d.heatHP);
  }
  /** Change per minute over (up to) the last minute of history; null until there's 10 s of it. */
  function rocWin(key) {
    const a = hist[key], t = hist.t;
    if (a.length < 2) return null;
    const i = t.length - 1;
    let j = i;
    while (j > 0 && t[i] - t[j] < 60) j--;
    const dt = (t[i] - t[j]) / 60;
    return dt >= 10 / 60 ? { per: (a[i] - a[j]) / dt, from: a[j], dt } : null;
  }
  const roc = (key) => { const r = rocWin(key); return r && r.per; };
  /** Percent change per minute against the value a minute ago (null when that was ~0). */
  function pctRoc(key) {
    const r = rocWin(key);
    if (!r || !(r.from > 0)) return null;
    return Math.max(-999, Math.min(999, (r.per / r.from) * 100));
  }
  // Rates: small ones with decimals, big ones through fmt() so 1e30/min reads as "1.00No".
  const sign = (v, unit, dp = 1) => (v == null ? '— ' + unit.trim()
    : `${v >= 0 ? '▲ +' : '▼ −'}${Math.abs(v) < 1000 ? Math.abs(v).toFixed(dp) : fmt(Math.abs(v))}${unit}`);

  /** A y-scale for `vals`: linear, or log10 when `log` and the positive values span more than 100×. */
  function yScale(vals, log, padF = 0.08) {
    const pos = vals.filter((v) => v > 0);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const useLog = log && pos.length > 1 && Math.max(...pos) / Math.min(...pos) > 100;
    if (useLog) { lo = Math.min(...pos); hi = Math.max(...pos); }
    const tf = (v) => (useLog ? Math.log10(Math.max(v, lo)) : v);
    let a = tf(lo), b = tf(hi);
    if (b - a < 1e-9) { const pad = useLog ? 0.5 : Math.max(1, Math.abs(a) * 0.05); a -= pad; b += pad; }
    else { const pad = (b - a) * padF; a -= pad; b += pad; }
    if (!useLog && lo >= 0 && a < 0) a = 0;
    return { a, b, tf, useLog };
  }

  /**
   * A digital gauge's sparkline: the last `win` seconds of history stretched across the
   * width (time-based, so a fresh install fills the strip instead of bunching up), an area
   * fill under the main series, dashed references, and optionally a forecast of the next
   * stretch from the current rate of change.
   */
  function spark(cv, { series, win, marks = [], forecast = false, log = false }) {
    if (!cv) return null;
    const dpr = Math.min(2, root.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return null;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'), cs = getComputedStyle($('scada')), col = (n) => (n.startsWith('#') ? n : cs.getPropertyValue(n).trim());
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const t = hist.t, n = t.length;
    if (n < 2) return null;
    const now = t[n - 1];
    let i0 = n - 1;
    while (i0 > 0 && now - t[i0 - 1] <= win) i0--;
    if (n - i0 < 2) return null;
    const t0 = t[i0], span = Math.max(1, now - t0), fw = forecast ? span * 0.25 : 0;
    const main = hist[series[0].key].slice(i0);
    const r = forecast ? rocWin(series[0].key) : null;
    const fEnd = r ? main[main.length - 1] + (r.per / 60) * fw : null;
    const vals = series.flatMap((x) => hist[x.key].slice(i0)).concat(marks.map((m) => m.v), fEnd != null ? [fEnd] : []).filter(Number.isFinite);
    const { a, b, tf } = yScale(vals, log, 0.12);
    const T = 4, B = 4, h = H - T - B;
    const X = (tt) => ((tt - t0) / (span + fw)) * (W - 4);
    const Y = (v) => T + h - ((tf(v) - a) / (b - a)) * h;
    // faint grid
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1;
    for (let k = 1; k < 4; k++) { const yy = Math.round(T + (h * k) / 4) + 0.5; g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke(); }
    if (fw) { const xn = Math.round(X(now)) + 0.5; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(xn, 0); g.lineTo(xn, H); g.stroke(); g.setLineDash([]); }
    for (const m of marks) {
      const yy = Y(m.v);
      if (yy < 0 || yy > H) continue;
      g.setLineDash([4, 3]); g.strokeStyle = col(m.color); g.globalAlpha = 0.8; g.beginPath(); g.moveTo(0, yy); g.lineTo(W, yy); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    }
    series.forEach((x, si) => {
      const arr = hist[x.key].slice(i0), c = col(x.color);
      const pts = arr.map((v, i) => [X(t[i0 + i]), Y(v)]);
      if (si === 0) {
        const grad = g.createLinearGradient(0, T, 0, H);
        grad.addColorStop(0, c); grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad; g.globalAlpha = 0.3; g.beginPath(); g.moveTo(pts[0][0], H);
        for (const [xx, yy] of pts) g.lineTo(xx, yy);
        g.lineTo(pts[pts.length - 1][0], H); g.closePath(); g.fill(); g.globalAlpha = 1;
      }
      g.strokeStyle = c; g.lineWidth = si === 0 ? 1.8 : 1.3; g.lineJoin = 'round';
      if (x.dash) g.setLineDash([3, 3]);
      g.beginPath(); pts.forEach(([xx, yy], i) => (i ? g.lineTo(xx, yy) : g.moveTo(xx, yy))); g.stroke(); g.setLineDash([]);
      if (si === 0) {
        const [lx, ly] = pts[pts.length - 1];
        if (fEnd != null) { g.setLineDash([2, 3]); g.globalAlpha = 0.7; g.beginPath(); g.moveTo(lx, ly); g.lineTo(X(now + fw), Y(fEnd)); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
        g.shadowColor = c; g.shadowBlur = 8; g.fillStyle = c; g.beginPath(); g.arc(lx, ly, 2.8, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
      }
    });
    return { lo: Math.min(...main), hi: Math.max(...main), fEnd };
  }

  /**
   * A trend chart in the game's style: gridlines, y-axis labels through fmt(), "−5m … now",
   * the latest value marked. `log` switches to log10 when the data spans more than 100×.
   */
  function trend(cv, series, { log = false, unit = '', marks = [] } = {}) {
    if (!cv) return;
    const dpr = Math.min(2, root.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'), cs = getComputedStyle($('scada'));
    const col = (n) => cs.getPropertyValue(n).trim();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const L = 46, R = 8, T = 8, B = 16, w = W - L - R, h = H - T - B;
    const vals = series.flatMap((x) => hist[x.key]).concat(marks.map((m) => m.v)).filter(Number.isFinite);
    if (vals.length < 2) { g.fillStyle = col('--muted'); g.font = `11px ${col('--font-mono')}`; g.fillText('collecting data…', L, T + h / 2); return; }
    // Log scale looks at positive values only (a 0 before the first sale mustn't disable it);
    // zeros and negatives then sit on the bottom edge.
    const { a, b, tf, useLog } = yScale(vals, log);
    const y = (v) => T + h - ((tf(v) - a) / (b - a)) * h;
    const inv = (yy) => { const f = a + (1 - (yy - T) / h) * (b - a); return useLog ? 10 ** f : f; };
    // grid + y labels
    g.font = `10px ${col('--font-mono')}`; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let k = 0; k <= 3; k++) {
      const yy = T + (h * k) / 3;
      g.strokeStyle = col('--edge'); g.lineWidth = 1; g.beginPath(); g.moveTo(L, yy + 0.5); g.lineTo(L + w, yy + 0.5); g.stroke();
      g.fillStyle = col('--muted'); g.fillText(fmt(inv(yy)) + unit, L - 4, yy);
    }
    // x axis
    g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText('−5m', L, H - 3);
    g.textAlign = 'right'; g.fillText(useLog ? 'now · log' : 'now', L + w, H - 3);
    // reference lines (limits, setpoints)
    for (const m of marks) {
      const yy = y(m.v);
      if (yy < T || yy > T + h) continue;
      g.setLineDash([4, 3]); g.strokeStyle = m.color; g.beginPath(); g.moveTo(L, yy); g.lineTo(L + w, yy); g.stroke(); g.setLineDash([]);
      g.fillStyle = m.color; g.textAlign = 'left'; g.fillText(m.label, L + 4, yy - 3);
    }
    // series
    for (const x of series) {
      const arr = hist[x.key], n = arr.length, x0 = L + w * (1 - (n - 1) / (HIST_N - 1));
      g.strokeStyle = col(x.color); g.lineWidth = 2; g.beginPath();
      arr.forEach((v, i) => { const xx = x0 + (w * i) / (HIST_N - 1), yy = y(v); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); });
      g.stroke();
      const last = arr[n - 1];
      g.fillStyle = col(x.color); g.beginPath(); g.arc(L + w, y(last), 3, 0, Math.PI * 2); g.fill();
    }
  }

  const SCADA_TILES = ['income', 'production', 'psi', 'temp', 'flow', 'acc', 'heat', 'kh', 'pak', 'safety'];
  const TILE_LABEL = { income: 'Income', production: 'Production · Order Line', psi: 'System pressure', temp: 'Oil temperature',
    flow: 'Flow', acc: 'Accumulator', heat: 'Heat balance', kh: 'Know-how', pak: 'Pak line', safety: 'Safety' };
  const CHARTS = [
    { id: 'money', title: 'Income & production · $/s', series: [{ key: 'income', color: '--ok' }, { key: 'production', color: '--steel' }], log: true },
    { id: 'temp', title: 'Oil temperature · °F', series: [{ key: 'temp', color: '--oil' }, { key: 'tempEq', color: '--muted' }] },
    { id: 'flow', title: 'Flow · GPM supply vs demand', series: [{ key: 'supply', color: '--cool' }, { key: 'demand', color: '--accent' }], log: true },
    { id: 'kh', title: 'Know-how · per second', series: [{ key: 'kh', color: '--steel' }], log: true },
  ];
  let scG = null;
  // Digital gauges. `needs`: the operator-panel upgrade that adds it.
  const DGAUGES = [
    { id: 'income', title: 'Income', unit: '$/s', series: [{ key: 'income', color: '--ok' }], log: true, pct: true },
    { id: 'psi', title: 'System pressure', unit: 'psi', series: [{ key: 'psi', color: '--accent' }] },
    { id: 'temp', title: 'Oil temperature', unit: '°F', series: [{ key: 'temp', color: '--oil' }, { key: 'tempEq', color: '--muted', dash: true }] },
    { id: 'flow', title: 'Flow · supply vs demand', unit: 'GPM', series: [{ key: 'supply', color: '--cool' }, { key: 'demand', color: '--accent', dash: true }], log: true, needs: 'alarms' },
    { id: 'acc', title: 'Accumulator', unit: '%', series: [{ key: 'acc', color: '--cool' }], needs: 'alarms' },
    { id: 'heat', title: 'Heat load', unit: 'HP', series: [{ key: 'heat', color: '--pressure' }], log: true, needs: 'alarms' },
  ];
  const PANEL_BY_ID = Object.fromEntries(E.DATA.SCADA_PANEL.map((u) => [u.id, u]));

  function openScada() { ui.scada = true; $('scada').hidden = false; document.body.classList.add('modal-open'); $('scada-body')._key = null; render(lastState); }
  function closeScada() { ui.scada = false; $('scada').hidden = true; if (!ui.sheet && !ui.person) document.body.classList.remove('modal-open'); }

  function renderScada(s, d) {
    const body = $('scada-body'), C = E.DATA.CONSTANTS, P = s.scadaPrefs, owned = s.scada.owned;
    setPart($('scada-meta'), `T+${fmtTime(s.time)} · ${owned ? `scan ${C.scadaEvery}s × ${E.scadaScan(s)} · tuning +${Math.round((E.scadaMult(s) - 1) * 1000) / 10}%` : 'NOT INSTALLED'}`, true);
    const panel = (id) => E.hasPanel(s, id), nextP = E.nextPanel(s);
    const key = [owned, E.scadaReady(s), P.cool, P.pumps, P.lines, P.tier, P.budget, E.DATA.SCADA_PANEL.map((u) => +panel(u.id)).join('')].join('|');
    if (body._key !== key) {
      body._key = key;
      scG = null;
      if (!owned) {
        const cs = E.teamStrength(s, 'controls');
        body.innerHTML = `<div class="scada-install"><h3>SCADA · supervisory control</h3>
          <p>Your Controls engineers can tie every pump, valve, cooler and line into one supervisory system: live instruments, trends and alarms, <b>loop tuning</b> (+${C.scadaTunePer * 100}% income per Controls strength, up to +${C.scadaTuneMax * 100}%) and <b>autonomous control</b> that keeps the plant cool, balanced and growing on its own.</p>
          <ul class="plain"><li>${s.tech.telematics ? '✓' : '✗'} Telematics researched</li>
            <li>${cs >= C.scadaControls ? '✓' : '✗'} Controls team strength ${C.scadaControls}+ (now ${cs.toFixed(1)}; move engineers to Controls on their ID badge)</li>
            <li data-k="kh-req"></li></ul>
          <button class="btn primary" data-scada-buy="1">Install SCADA<small>${fmt(C.scadaKH)} Know-how</small></button></div>`;
      } else {
        const dg = (g) => g.needs && !panel(g.needs)
          ? `<div class="dg locked"><div class="dg-head"><span>${g.title}</span></div><div class="dg-lock">🔒 ${PANEL_BY_ID[g.needs].name}</div></div>`
          : `<div class="dg" data-dg="${g.id}"><div class="dg-head"><span>${g.title}</span><span class="dg-state"><i></i><b data-x="st"></b></span></div>
              <div class="dg-read"><b data-x="v"></b><small>${g.unit}</small></div>
              <div class="dg-range"><div data-x="zones"></div><i data-x="mk"></i></div>
              <canvas class="dg-spark"></canvas>
              <div class="dg-foot"><span data-x="f1"></span><span data-x="f2"></span><span data-x="f3"></span></div></div>`;
        const step = (u, i) => {
          const own = panel(u.id), isNext = nextP && nextP.id === u.id;
          return `<div class="pn-step${own ? ' own' : isNext ? ' next' : ' later'}"><div class="pn-n">${own ? '✓' : i + 1}</div>
            <div class="pn-txt"><b>${u.name}</b><span>${u.desc}</span></div>
            ${own ? '<em>online</em>' : isNext ? `<button class="btn mini" data-scada-panel="${u.id}">${fmt(u.kh)}<small>Know-how</small></button>` : `<em>${fmt(u.kh)} KH</em>`}</div>`;
        };
        body.innerHTML = `<div class="dg-grid">${DGAUGES.map(dg).join('')}</div>
          <section class="scada-panel pn"><h4>Operator panel <span class="muted">· ${E.DATA.SCADA_PANEL.filter((u) => panel(u.id)).length}/${E.DATA.SCADA_PANEL.length} upgrades</span></h4>
            <div class="pn-steps">${E.DATA.SCADA_PANEL.map(step).join('')}</div></section>
          <div class="scada-grid">${SCADA_TILES.map((id) => `<div class="tile-s" data-tile="${id}">
            <div class="ts-label">${TILE_LABEL[id]}</div><div class="ts-val" data-k="v-${id}"></div><div class="ts-sub" data-k="s-${id}"></div></div>`).join('')}</div>
          ${panel('historian') ? `<div class="scada-charts">${CHARTS.map((c) => `<section class="scada-panel"><h4>${c.title}</h4><canvas class="trend" data-c="${c.id}"></canvas></section>`).join('')}</div>`
            : `<div class="scada-panel dg-lock wide">🔒 5-minute trend charts come with the ${PANEL_BY_ID.historian.name}</div>`}
          <div class="scada-row">
            <section class="scada-panel"><h4>Alarms</h4><ul class="scada-alarms" data-k="alarms"></ul></section>
            <section class="scada-panel"><h4>Autonomous control</h4>
              ${[['cool', 'Auto-cooling', 'keeps the oil under its limit, and buys coolers when heat is costing output'],
                 ['pumps', 'Auto-pumps', 'buys pumps for a starved plant, and the pumps to feed each new line'],
                 ['lines', 'Auto-lines', 'adds the actuator line that grows revenue most per $'],
                 ['tier', 'Auto-tier & accumulator', 'raises the pressure tier when it beats every other buy per $; the accumulator when no revenue buy fits']].map(([k, n, w]) =>
                `<button class="auto-row${P[k] ? ' on' : ''}" data-scada-auto="${k}"><b>${n}</b><span>${w}</span><i>${P[k] ? 'ON' : 'OFF'}</i></button>`).join('')}
              <div class="seg scada-budget">${C.scadaBudgets.map((b, i) => `<button class="btn mini${P.budget === i ? ' on' : ' ghost'}" data-scada-budget="${i}">≤ ${b * 100}% cash / action</button>`).join('')}</div>
              <p class="muted small" data-k="scan"></p>
              <ul class="exec-log scada-log" data-k="log"></ul></section>
          </div>`;
      }
    }
    const k = (n) => body.querySelector(`[data-k="${n}"]`);
    if (!owned) {
      setPart(k('kh-req'), `${s.kh >= C.scadaKH ? '✓' : '✗'} ${fmt(C.scadaKH)} Know-how (you have ${fmt(s.kh)})`, true);
      const b = body.querySelector('[data-scada-buy]');
      if (b) b.disabled = !E.canBuyScada(s);
      return;
    }
    // Digital gauges: value, state lamp, a range bar with zones, and a sparkline whose
    // window, low/high and forecast depend on the operator-panel upgrades.
    const lim = d.tempLimit, accF = s.accCharge / d.accCap;
    const win = panel('historian') ? 300 : 60, fc = panel('predictive');
    const red = '--pressure';
    const G = {
      income: { v: d.income, label: fmt(d.income), state: d.income > 0 ? 'ok' : 'warn', st: d.surging ? `SURGE ×${d.m.surgeMult}` : 'ONLINE',
        rate: () => sign(pctRoc('income'), '%/min') },
      psi: { v: d.psi, label: fmt(d.psi, 0), state: d.overRelief > 0 ? 'warn' : 'ok', st: d.overRelief > 0 ? 'RELIEF' : 'RATED',
        range: [0, niceMax(d.psi * 1.25)], zones: [[0, d.psi, 'ok'], [d.psi, d.psi * 1.1, 'warn'], [d.psi * 1.1, Infinity, 'alarm']],
        rate: () => sign(roc('psi'), '/min', 0) },
      temp: { v: s.temp, label: `${Math.round(s.temp)}`, range: [60, Math.max(260, lim + 80)], zones: [[60, lim - 15, 'ok'], [lim - 15, lim, 'warn'], [lim, Infinity, 'alarm']],
        state: s.temp > lim ? 'alarm' : s.temp > lim - 15 || d.tempEq > lim ? 'warn' : 'ok',
        st: s.temp > lim ? 'OVER LIMIT' : s.temp > lim - 15 ? 'HIGH' : d.tempEq > lim ? 'RISING' : 'NORMAL',
        marks: [{ v: lim, color: red }], rate: () => sign(roc('temp'), '°/min') },
      flow: { v: d.supply, label: fmt(d.supply), state: d.utilization < 0.999 ? 'alarm' : d.overRelief > 0 ? 'warn' : 'ok',
        st: d.utilization < 0.999 ? 'STARVED' : d.overRelief > 0 ? 'DUMPING' : 'BALANCED',
        range: [0, Math.max(d.supply, d.demand, 1) * 1.1], zones: [[0, d.demand, 'warn'], [d.demand, Infinity, 'ok']], rate: () => sign(pctRoc('supply'), '%/min') },
      acc: { v: 100 * accF, label: `${Math.round(100 * accF)}`, range: [0, 100], zones: [[0, 100, 'ok']],
        state: d.surging ? 'warn' : 'ok', st: E.canSurge(s) ? 'READY' : d.surging ? `SURGE ${Math.ceil(s.surgeLeft)}s` : 'CHARGING', rate: () => sign(roc('acc'), '%/min') },
      heat: { v: d.heatHP, label: fmt(d.heatHP), state: d.tempEq > lim ? 'alarm' : 'ok', st: d.tempEq > lim ? 'OVER COOLING' : 'IN BUDGET',
        rate: () => sign(pctRoc('heat'), '%/min') },
    };
    for (const def of DGAUGES) {
      const el = body.querySelector(`[data-dg="${def.id}"]`);
      if (!el) continue;
      const g = G[def.id], x = (n) => el.querySelector(`[data-x="${n}"]`);
      el.className = `dg s-${g.state}`;
      setPart(x('v'), g.label, true);
      setPart(x('st'), g.st, true);
      const rangeEl = el.querySelector('.dg-range');
      if (g.range) {
        const [mn, mx] = g.range, f = (v) => Math.min(100, Math.max(0, ((v - mn) / (mx - mn)) * 100));
        const zk = g.zones.map((z) => z.join()).join('|') + mx;
        if (rangeEl._k !== zk) { rangeEl._k = zk; x('zones').innerHTML = g.zones.map(([z0, z1, c]) => `<span class="z-${c}" style="left:${f(z0)}%;width:${f(z1) - f(z0)}%"></span>`).join(''); }
        x('mk').style.left = `${f(g.v)}%`;
      } else rangeEl.hidden = true;
      const sp = spark(el.querySelector('.dg-spark'), { series: def.series, win, log: def.log, marks: g.marks || [], forecast: fc });
      setPart(x('f1'), panel('historian') && sp ? `lo ${fmt(sp.lo)}` : `${win / 60} min`, true);
      setPart(x('f2'), fc ? g.rate() : '', true);
      setPart(x('f3'), panel('historian') && sp ? `hi ${fmt(sp.hi)}` : '', true);
    }

    const o = d.order, tRoc = roc('temp');
    const v = {
      income: [`$${fmt(d.income)}/s`, `${sign(pctRoc('income'), '%/min')} · surge ${d.surging ? 'ON ×' + d.m.surgeMult : 'off'}`],
      production: [`$${fmt(d.production)}/s`, `Order Line ${Math.round(o.factor * 100)}%${o.bottleneck && o.factor < 0.999 ? ' · neck: ' + DEPT_BY_ID[o.bottleneck].name : ''} · surplus +${fmt((o.bonus - 1) * 100, 1)}%`],
      psi: [`${fmt(d.psi)} psi`, `${TIERS[s.tier].name} · ${sign(roc('psi'), ' psi/min', 0)}`],
      temp: [`${Math.round(s.temp)}°F`, `${sign(tRoc, '°F/min')} · heading for ${fmt(Math.min(d.tempEq, 9999), 0)}°F · limit ${lim}°F${s.temp > lim ? ' · income ×' + d.thermalMult.toFixed(2) : ''}`],
      flow: [`${Math.round(d.utilization * 100)}% used`, `supply ${fmt(d.supply)} · demand ${fmt(d.demand)} GPM · relief ${fmt(d.overRelief)} · to acc ${fmt(d.toAcc)}`],
      acc: [`${Math.round(100 * accF)}%`, `${E.canSurge(s) ? 'READY' : d.surging ? `surging ${Math.ceil(s.surgeLeft)}s` : 'charging'}${d.m.autoSurge ? ' · PLC auto' : ''}`],
      heat: [`${fmt(d.heatHP)} HP`, `pumps ${fmt(d.pumpLossHP)} + relief ${fmt(d.reliefHP)} HP · cooling k ${fmt(d.k)}`],
      kh: [`${fmt(d.khRate)}/s`, `${sign(pctRoc('kh'), '%/min')} · bank ${fmt(s.kh)}`],
      pak: [`$${fmt(E.pakIncome(s, d))}/s`, E.pakOpen(s) ? `${fmt(E.pakHoursRate(s))} hrs/s · building ${E.pakNext(s)}` : 'no Engineering yet'],
      safety: [`${fmt(E.safeDays(s))} days safe`, (() => { const r = E.incidentRate(s, d) * 3600; return s.safety && s.safety.incident ? `LINE DOWN · ${Math.ceil(s.safety.incident.left)}s` : r > 0 ? `≈ ${fmt(r, 1)} incidents/hour${s.shake && s.shake.phase ? ' (shake-up ×3)' : ''}` : 'no incident risk'; })()],
    };
    for (const id of SCADA_TILES) {
      setPart(k(`v-${id}`), v[id][0], true); setPart(k(`s-${id}`), v[id][1], true);
      if (k(`s-${id}`).title !== v[id][1]) k(`s-${id}`).title = v[id][1]; // full text when it's clipped
    }
    const tile = (id) => body.querySelector(`[data-tile="${id}"]`);
    tile('temp').classList.toggle('alarm', s.temp > lim);
    tile('temp').classList.toggle('warn', s.temp <= lim && d.tempEq > lim);
    tile('flow').classList.toggle('alarm', d.utilization < 0.999);
    tile('production').classList.toggle('warn', o.factor < 0.999);
    tile('safety').classList.toggle('alarm', !!(s.safety && s.safety.incident));
    for (const c of CHARTS) {
      const marks = c.id === 'temp' ? [{ v: lim, label: `limit ${lim}°F`, color: getComputedStyle($('scada')).getPropertyValue('--pressure').trim() }] : [];
      trend(body.querySelector(`[data-c="${c.id}"]`), c.series, { log: c.log, marks });
    }
    setPart(k('alarms'), $('alerts').innerHTML || '<li class="good">No active alarms</li>');
    body.querySelectorAll('[data-scada-panel]').forEach((b) => {
      const u = PANEL_BY_ID[b.dataset.scadaPanel];
      b.disabled = !E.canBuyPanel(s, u.id);
      b.title = b.disabled ? `Needs ${fmt(u.kh)} Know-how (you have ${fmt(s.kh)})` : '';
    });
    setPart(k('scan'), `Scan every ${C.scadaEvery}s, up to ${E.scadaScan(s)} action${E.scadaScan(s) === 1 ? '' : 's'} per scan (1 + Controls strength ÷ 3). Buys only what pays for itself within ${Math.round(C.scadaMaxPaybackS / 60)} min.${s.scada.idle ? ' ' + s.scada.idle + '.' : ''}`, true);
    setPart(k('log'), s.scada.log.slice(0, 6).map((l) => `<li><span class="muted">${fmtTime(Math.max(0, s.time - l.t))} ago</span> ${l.m}</li>`).join('') || '<li class="muted">No automated actions yet.</li>');
  }

  function renderPaks(s, dd) {
    const open = E.pakOpen(s), rate = E.pakHoursRate(s), target = E.pakTarget(s), next = E.pakNext(s);
    setPart($('pak-summary'), open ? `· ${fmt(rate)} engineering hrs/s · ≈ +$${fmt(E.pakIncome(s, dd))}/s` : '', true);
    setPart($('pak-hint'), !open ? 'Opens with Engineering. Project engineers build packaged products from your own hardware.'
      : rate <= 0 ? 'Nobody is on the Project team. Open Engineering, tap an engineer and move them to Project.'
      : `Choose what the line builds. It makes the parts it needs first (a Base-Pak uses a Valve-Pak, a Sys-Pak uses four Base-Paks) and sells each finished one through the Order Line. Higher tiers pay more per engineering hour.`, true);
    for (const p of PAKS) {
      const r = pakEls[p.id], price = E.pakPrice(s, dd, p.id);
      const sysBlocked = p.id === 'sys' && !E.sysReady(s);
      r.el.classList.toggle('closed', !open);
      r.el.classList.toggle('target', open && s.pak.target === p.id);
      r.el.classList.toggle('building', open && rate > 0 && next === p.id);
      setPart(r.value, open ? `sells $${fmt(price)}` : `×${p.value} value`, true);
      setPart(r.stats, open ? `${fmt(p.hours)} hrs each · built ${fmt(s.pak.built[p.id])}${p.id !== 'sys' ? ` · in stock ${s.pak.stock[p.id]}` : ''}${E.pakGrade(s, p.id) > 1 ? ` · grade ×${E.pakGrade(s, p.id).toFixed(1)}` : ''}` : '', true);
      r.prog.parentElement.hidden = !(open && rate > 0 && next === p.id);
      if (next === p.id) r.prog.style.width = `${Math.min(100, (s.pak.work / p.hours) * 100)}%`;
      setPart(r.status, !open ? 'Opens with Engineering'
        : sysBlocked ? `Needs ${s.tech.plc ? '' : 'PLC Automation and '}a Controls engineer (strength 1)`
        : next === p.id && rate > 0 ? `Building · ${fmt((p.hours - s.pak.work) / rate)}s left`
        : s.pak.target === p.id ? 'Target' : '', true);
      r.btn.hidden = !open || s.pak.target === p.id;
      r.btn.disabled = sysBlocked;
    }
  }

  function renderCompany(s, dd) {
    renderTerritory(s);
    const era = E.currentEra(s);
    $('era-num').textContent = ROMAN[era];
    $('era-name').textContent = ERAS[era];
    const o = dd.order;
    $('order-summary').textContent = o.factor < 0.999
      ? `· running at ${Math.round(o.factor * 100)}%, ${DEPARTMENTS.find((x) => x.id === o.bottleneck).name} is the bottleneck`
      : '· running at 100%';
    if (o.bonus > 1.0005) $('order-summary').textContent += ` · surplus staff +${Math.round((o.bonus - 1) * 1000) / 10}% income`;
    $('order-summary').classList.toggle('bad', o.factor < 0.999);
    const sq = E.staffLineQuote(s), sb = $('btn-staff-line');
    sb.hidden = !sq.hires;
    sb.disabled = sq.cost > s.cash;
    sb.innerHTML = `Staff the line to 100%<small>${sq.hires} hire${sq.hires === 1 ? '' : 's'} · $${fmt(sq.cost)}</small>`;
    for (const d of DEPARTMENTS) {
      const r = deptEls[d.id], open = E.departmentOpen(s, d);
      r.el.classList.toggle('closed', !open);
      r.el.classList.remove('neck');
      if (d.id === 'production') r.status.textContent = `Active · $${fmt(dd.production)}/s of work`;
      else if (!open) r.status.textContent = opensText(s, d);
      else if (staffed(d.id)) renderStaffed(s, dd, d, r);
      else r.status.textContent = 'Open · hiring coming soon';
      r.prog.hidden = open || d.opens.lifetime == null;
      if (!open && d.opens.lifetime != null) {
        // log scale so early progress is visible
        const f = Math.log10(1 + s.lifetime) / Math.log10(1 + d.opens.lifetime);
        r.bar.style.width = `${Math.min(100, f * 100)}%`;
      }
    }
    renderPaks(s, dd);
    renderOrg(s);
    renderShake(s, dd);
  }

  // ---- Init ---------------------------------------------------------------

  let gP, gT, ui = { tab: 'actuators', qty: 1 }, handlers;

  function init(h) {
    handlers = h;
    root.PW.machine.init($('machine'), {
      open(tab, id, dept) { setFull(false); h.openFromMachine(tab, id, dept); },
      stroke: h.strokeFromMachine,
      expand() { if (!phone.matches || document.body.classList.contains('works-full')) return false; setFull(true); return true; },
    });
    $('btn-works-full').addEventListener('click', () => setFull(true));
    $('btn-works-close').addEventListener('click', () => setFull(false));
    $('m-status').addEventListener('click', () => setTab('works'));
    $('btn-scada').addEventListener('click', openScada);
    $('scada-close').addEventListener('click', closeScada);
    // Brand: the iFP mark in the header and the tab icon; Light (IFP) / Dark theme switch.
    const B = root.PW.brand;
    if (B) {
      $('brand-logo').innerHTML = B.logoHTML({ h: 40 });
      if ($('favicon')) $('favicon').href = B.FAVICON;
    }
    const themeBtns = document.querySelectorAll('[data-theme-set]');
    const showTheme = () => themeBtns.forEach((b) => b.classList.toggle('on', (document.documentElement.dataset.theme || 'light') === b.dataset.themeSet));
    themeBtns.forEach((b) => b.addEventListener('click', () => {
      const dark = b.dataset.themeSet === 'dark';
      if (dark) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
      try { localStorage.setItem('pw-theme', dark ? 'dark' : 'light'); } catch (e) { /* storage blocked */ }
      showTheme();
    }));
    showTheme();
    // Department focus sheet and ID badges
    document.addEventListener('click', (ev) => {
      const od = ev.target.closest('[data-open-dept]');
      if (od) return openDept(od.dataset.openDept);
      const pe = ev.target.closest('[data-person]');
      if (pe) return openPerson(pe.dataset.person);
      const cl = ev.target.closest('[data-close]');
      if (cl) return cl.dataset.close === 'idcard' ? closePerson() : closeSheet();
    });
    // Hiring or promoting from a badge closes it (main.js does the work on the same click).
    $('id-foot').addEventListener('click', (ev) => {
      if (ev.target.closest('[data-hire], [data-promote]')) setTimeout(() => { closePerson(); render(lastState); }, 0);
    });
    document.querySelector('.era-card').addEventListener('click', (ev) => ev.currentTarget.classList.toggle('open'));
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (ui.person) closePerson(); else if (ui.sheet) closeSheet(); else if (ui.scada) closeScada(); else setFull(false);
    });
    phone.addEventListener('change', () => { if (!phone.matches) { setFull(false); if (ui.tab === 'works') setTab('actuators'); } });
    setTab(ui.tab);
    gP = makeGauge($('g-pressure'), 'PSI');
    gT = makeGauge($('g-temp'), '°F');
    buildList($('list-actuators'), 'actuator', ACTUATORS, h.buy);
    buildList($('list-pumps'), 'pump', PUMPS, h.buy);
    buildList($('list-coolers'), 'cooler', COOLERS, h.buy);
    buildTech($('tech-tree'), h.research);
    buildCompany();
    buildTerritory();

    document.querySelectorAll('.tabs [data-tab]').forEach((b) =>
      b.addEventListener('click', () => setTab(b.dataset.tab)));
    document.querySelectorAll('#buyqty [data-qty]').forEach((b) =>
      b.addEventListener('click', () => {
        ui.qty = ['max', 'next'].includes(b.dataset.qty) ? b.dataset.qty : Number(b.dataset.qty);
        document.querySelectorAll('#buyqty [data-qty]').forEach((x) => x.setAttribute('aria-checked', x === b));
        h.qtyChanged && h.qtyChanged(ui.qty);
      }));
  }

  // Phones get the one-handed layout (see the end of style.css): a Works tab, a bottom dock.
  const phone = root.matchMedia ? root.matchMedia('(max-width: 760px)') : { matches: false, addEventListener() {} };
  function setFull(on) {
    document.body.classList.toggle('works-full', on);
  }

  function setTab(tab) {
    if (tab !== ui.tab && phone.matches) root.scrollTo(0, 0);
    ui.tab = tab;
    document.body.dataset.view = tab;
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    document.querySelectorAll('.tab-body').forEach((b) => (b.hidden = b.dataset.body !== tab));
    $('buyqty').hidden = !['actuators', 'pumps', 'system', 'company'].includes(tab);
  }

  // ---- Render (≈5×/s) ---------------------------------------------------------

  function quoteFor(s, kind, id) {
    const q = E.quote(s, kind, id, ui.qty);
    return { ...q, ok: q.cost <= s.cash };
  }

  function renderList(s, d, kind, items, describe) {
    const bucket = { pump: 'pumps', actuator: 'actuators', cooler: 'coolers' }[kind];
    let shownLocked = false;
    for (const it of items) {
      const r = rows[kind][it.id], n = s[bucket][it.id];
      const unlocked = E.isUnlocked(s, kind, it.id);
      // Show everything unlocked plus a single locked teaser.
      r.el.hidden = !unlocked && shownLocked && n === 0;
      if (!unlocked && n === 0) shownLocked = true;
      r.el.classList.toggle('locked', !unlocked);
      r.count.textContent = n ? `×${n}` : '';
      if (!unlocked) {
        r.stats.textContent = lockReason(s, kind, it);
        r.btn.disabled = true;
        r.btn.innerHTML = 'Locked';
        r.ms.hidden = true;
        continue;
      }
      r.stats.textContent = describe(it, n);
      const q = quoteFor(s, kind, it.id);
      r.btn.disabled = !q.ok;
      r.btn.innerHTML = `$${fmt(q.cost)}<small>buy ${q.qty}</small>`;
      if (kind !== 'cooler') {
        const next = E.nextMilestone(n), prev = [0, ...E.DATA.CONSTANTS.milestones].filter((m) => m <= n).pop();
        r.ms.hidden = !next;
        if (next) {
          r.msBar.style.width = `${((n - prev) / (next - prev)) * 100}%`;
          r.ms.title = `×2 output at ${next} owned`;
        }
      } else r.ms.hidden = true;
    }
  }

  function lockReason(s, kind, it) {
    if (it.requires && !s.tech[it.requires]) return `Requires research: ${TECH.find((t) => t.id === it.requires).name}`;
    if (kind === 'actuator') {
      const tier = TIERS.find((t) => t.psi >= it.psi);
      return `Needs ${fmt(it.psi)} psi — upgrade to ${tier ? tier.name : 'a higher rating'}`;
    }
    return 'Locked';
  }

  let lastState = null, lastKhRate = 0;
  function render(s) {
    lastState = s;
    const d = E.derive(s);
    lastKhRate = d.khRate;
    const m = d.m;

    // top bar
    $('r-cash').textContent = '$' + fmt(s.cash);
    $('r-income').textContent = `+$${fmt(d.income)}/s`;
    const nLoc = REGIONS.filter((r) => E.regionOpen(s, r)).length;
    $('tagline-loc').textContent = nLoc > 1 ? `${nLoc} locations` : 'Cedar Rapids, Iowa';
    $('r-kh').textContent = fmt(s.kh);
    $('r-khrate').textContent = `+${fmt(d.khRate)}/s`;
    $('r-patents-wrap').hidden = s.patents === 0 && !E.canOverhaul(s);
    $('r-patents').textContent = fmt(s.patents);
    $('r-patentbonus').textContent = `+${fmt((m.patentMult - 1) * 100)}% income`;

    // machine panel
    $('tier-name').textContent = `${TIERS[s.tier].name} · ${fmt(d.psi)} psi`;
    $('m-flow-text').textContent = `${fmt(d.supply)} / ${fmt(d.demand)} GPM`;
    const flowMax = Math.max(d.supply, d.demand, 1) * 1.1;
    $('m-flow').style.width = `${(d.supply / flowMax) * 100}%`;
    $('m-flow').classList.toggle('starved', d.utilization < 1);
    $('m-flow-demand').style.left = `${(d.demand / flowMax) * 100}%`;
    const accFrac = s.accCharge / d.accCap;
    $('m-acc-text').textContent = `${fmt(s.accCharge)} / ${fmt(d.accCap)} gal`;
    $('m-acc').style.width = `${accFrac * 100}%`;
    $('m-acc').classList.toggle('full', accFrac >= 0.999);

    const tMax = Math.max(260, d.tempLimit + 80);
    gT.set(s.temp, 60, tMax, d.tempLimit, `${Math.round(s.temp)}°`);

    $('stroke-sub').textContent = `+$${fmt(E.DATA.CONSTANTS.clickBase + m.clickPct * d.income)} · +${fmt(E.strokeGal(d.accCap))} gal`;
    const surgeBtn = $('btn-surge');
    surgeBtn.disabled = !E.canSurge(s);
    surgeBtn.classList.toggle('active', d.surging);
    $('surge-sub').textContent = d.surging ? `×${m.surgeMult} income · ${Math.ceil(s.surgeLeft)}s`
      : E.canSurge(s) ? `Dump for ×${m.surgeMult} income, ${E.DATA.CONSTANTS.surgeSeconds}s`
      : m.autoSurge ? 'PLC fires when full' : `Charging… ${Math.floor(accFrac * 100)}%`;

    renderAlerts(s, d);

    // lists (only the visible tab, plus badges)
    if (ui.tab === 'actuators') {
      renderList(s, d, 'actuator', ACTUATORS, (a, n) => {
        const each = a.rate * Math.sqrt(d.psi / a.psi) * E.milestoneMult(n) * m.actMult * m.patentMult;
        return `${fmt(a.gpm)} GPM · ≥${fmt(a.psi)} psi · $${fmt(each)}/s each` +
          (n ? ` · total $${fmt(d.perActuator[a.id] * d.utilization * d.thermalMult * d.surgeMult * m.patentMult)}/s` : '');
      });
    }
    if (ui.tab === 'pumps') {
      renderList(s, d, 'pump', PUMPS, (p, n) => {
        const each = p.gpm * m.pumpMult * E.milestoneMult(n);
        return `${fmt(each)} GPM each · η ${Math.round(p.eff * 100)}%` + (n ? ` · total ${fmt(each * n)} GPM` : '');
      });
    }
    if (ui.tab === 'system') renderSystem(s, d);
    if (ui.tab === 'tech') renderTech(s);
    if (ui.tab === 'company') renderCompany(s, d);
    sample(s, d);
    if (ui.scada) renderScada(s, d);
    if (ui.sheet) renderSheet(s, d);
    if (ui.person) renderPerson(s, d);
    $('company-badge').hidden = d.order.factor >= 0.95;
    if (phone.matches) renderPhoneStatus(s, d);
    if (ui.tab === 'overhaul') renderOverhaul(s);
    if (ui.tab === 'settings') renderStats(s, d);

    const ready = TECH.filter((t) => E.techAvailable(s, t.id) && s.kh >= E.techCost(s, t.id)).length + (E.officeOpen(s) && s.kh >= E.fileCost(s) ? 1 : 0);
    $('tech-badge').hidden = !ready;
    $('tech-badge').textContent = ready;
    $('tab-overhaul').classList.toggle('locked', !E.canOverhaul(s) && s.patents === 0);
    return d;
  }

  // The phone's one-line status: pressure, oil temperature, flow and accumulator.
  function renderPhoneStatus(s, d) {
    const bar = (f) => `<i><b style="width:${Math.round(Math.min(1, Math.max(0, f)) * 100)}%"></b></i>`;
    const flow = d.demand > 0 ? Math.min(1, d.supply / d.demand) : 1;
    const hot = s.temp > d.tempLimit ? 'bad' : d.tempEq > d.tempLimit ? 'warn' : '';
    setPart($('m-status'),
      `<span>${fmt(d.psi)} psi${bar(d.psi / TIERS[s.tier].psi)}</span>`
      + `<span class="${hot}">${Math.round(s.temp)}°F${bar((s.temp - 60) / Math.max(1, d.tempLimit - 60))}</span>`
      + `<span class="${d.utilization < 1 ? 'bad' : ''}">flow ${Math.round(flow * 100)}%${bar(flow)}</span>`
      + `<span class="acc">acc ${Math.round(100 * s.accCharge / d.accCap)}%${bar(s.accCharge / d.accCap)}</span>`);
    const n = $('alerts').querySelectorAll('.bad').length;
    $('works-badge').hidden = !n;
    $('works-badge').textContent = n;
  }

  function renderAlerts(s, d) {
    const out = [];
    if (d.demand === 0) out.push(['warn', 'Nothing is connected. Buy a Bottle Jack Bay to start earning.']);
    if (d.utilization < 1) out.push(['bad', `Flow-starved: actuators running at ${Math.round(d.utilization * 100)}%. Add pumps.`]);
    if (d.toAcc < 0) out.push(['warn', `Accumulator is covering a ${fmt(-d.toAcc)} GPM shortfall.`]);
    if (d.overRelief > 0) out.push(['warn', `Relief valve dumping ${fmt(d.overRelief)} GPM over the relief valve: ${fmt(d.reliefHP)} HP of heat.`]);
    if (s.temp > d.tempLimit) out.push(['bad', `Oil at ${Math.round(s.temp)}°F and thinning: income ×${d.thermalMult.toFixed(2)}. Add cooling.`]);
    else if (d.tempEq > d.tempLimit) out.push(['warn', `Oil heading for ${Math.round(Math.min(d.tempEq, 999))}°F, above the ${d.tempLimit}°F limit.`]);
    const inc = s.safety && s.safety.incident;
    if (inc) {
      const name = ACTUATORS.find((a) => a.id === inc.id).name;
      out.push(['bad', `${INCIDENTS[inc.kind || 0]} at the ${name}: line down ${Math.ceil(inc.left)}s. Safety staff make incidents rarer.`]);
    }
    if (d.order.factor < 0.999) {
      const neck = DEPARTMENTS.find((x) => x.id === d.order.bottleneck).name;
      out.push([d.order.factor < 0.8 ? 'bad' : 'warn', `Order Line at ${Math.round(d.order.factor * 100)}%: ${neck} is short-staffed. Hire on the Company tab.`]);
    }
    if (s.shake && s.shake.phase) out.push(['warn', `Shake-up in progress (${({ board: 'Board', cxo: 'executives', mgr: 'managers', staff: 'employees' })[s.shake.phase]}, ${Math.ceil(s.shake.left)} s): incidents ×${E.DATA.CONSTANTS.shakeIncidentMult}, Order Line at ${Math.round(E.DATA.CONSTANTS.shakeDisruption * 100)}%.`]);
    if (d.surging) out.push(['good', `SURGE: accumulator dumping, income ×${d.m.surgeMult}.`]);
    const html = out.map(([c, t]) => `<li class="${c}">${t}</li>`).join('');
    const box = $('alerts');
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  function renderSystem(s, d) {
    const next = E.nextTier(s), cm = d.m.costMult;
    const ladder = TIERS.map((t, i) => `<span class="${i < s.tier ? 'done' : i === s.tier ? 'now' : ''}">${fmt(t.psi)}</span>`).join('');
    let nextHtml = '<p class="muted">Maximum rating reached — for now.</p>';
    if (next) {
      const needs = next.requires && !s.tech[next.requires] ? TECH.find((t) => t.id === next.requires).name : null;
      nextHtml = `<div class="card-row"><div>Next: <b>${next.name}</b> — ${fmt(next.psi)} psi
        <div class="muted">${needs ? `Requires research: ${needs}` : 'Higher pressure unlocks new actuators and pays more for existing ones.'}</div></div>
        <button class="btn" data-act="tier" ${E.canUpgradeTier(s) ? '' : 'disabled'}>$${fmt(next.cost * cm)}<small>upgrade</small></button></div>`;
    }
    setHtml('tier-box', `<div>Current: <b>${TIERS[s.tier].name}</b>, relief valve set to ${fmt(d.psi)} psi.</div>${nextHtml}<div class="ladder">${ladder}</div>`);

    const accCost = E.accUpgradeCost(s);
    setHtml('acc-box', `<div class="card-row"><div>Bladder size <b>${s.accLevel + 1}</b>: ${fmt(d.accCap)} gal
      <div class="muted">Stores surplus flow. Covers shortfalls. When full, Surge dumps it for ×${d.m.surgeMult} income.</div></div>
      <button class="btn" data-act="acc" ${s.cash >= accCost ? '' : 'disabled'}>$${fmt(accCost)}<small>×${E.DATA.CONSTANTS.accGrowth} capacity</small></button></div>`);

    renderList(s, d, 'cooler', COOLERS, (c, n) =>
      `+${fmt(c.k)} HP/°F each` + (n ? ` · total ${fmt(n * c.k)} HP/°F` : ''));
    rows.cooler.fan.stats.textContent += ` · now rejecting ${fmt(d.heatHP)} HP (k=${fmt(d.k)})`;
  }

  /** Replace an element's content only when it changed (keeps buttons stable). */
  function setPart(el, html, asText = false) {
    if (el._html === html) return;
    el._html = html;
    if (asText) el.textContent = html; else el.innerHTML = html;
  }

  function setHtml(id, html) {
    const el = $(id);
    if (el._html !== html) { el.innerHTML = html; el._html = html; }
  }

  /** Patent Office: once the tree is finished, Know-how files patents. */
  function renderOffice(s) {
    const box = $('patent-office'), open = E.officeOpen(s);
    const done = TECH.filter((t) => s.tech[t.id]).length, cost = E.fileCost(s), q = E.fileQuote(s);
    const key = [open, s.patentsFiled || 0].join('|');
    if (box._key !== key) {
      box._key = key;
      box.innerHTML = `<h3>Patent Office</h3>` + (open
        ? `<p>Your engineers have researched everything. Now Know-how can <b>file patents</b>: each one adds <b>+10% income forever</b>, survives Overhaul, and can be spent on Board seats. Each filing costs ×${E.DATA.CONSTANTS.patentFileGrowth} more than the last.</p>
          <p class="muted small" data-k="pf-status"></p>
          <div class="row-btns"><button class="btn primary" data-file="1"></button><button class="btn" data-file="max"></button></div>`
        : `<p class="muted">Opens once every technology is researched (<span data-k="pf-done"></span>/${TECH.length}). From then on, Know-how files patents: +10% income each, forever.</p>`);
    }
    const k = (n) => box.querySelector(`[data-k="${n}"]`);
    if (!open) return setPart(k('pf-done'), String(done), true);
    setPart(k('pf-status'), `Filed so far: ${fmt(s.patentsFiled || 0)} · you hold ${fmt(s.patents)} patents (+${fmt(s.patents * 10)}% income) · Know-how ${fmt(s.kh)} (+${fmt(lastKhRate)}/s)`, true);
    const set = (b, html, ok) => { if (b._html !== html) { b._html = html; b.innerHTML = html; } b.disabled = !ok; };
    set(box.querySelector('[data-file="1"]'), `File a patent<small>${fmt(cost)} KH</small>`, s.kh >= cost);
    set(box.querySelector('[data-file="max"]'), q.n > 1 ? `File ${q.n}<small>${fmt(q.cost)} KH</small>` : `File max<small>${q.n ? fmt(q.cost) + ' KH' : 'not enough KH'}</small>`, q.n > 0);
  }

  function renderTimeMachine(s) {
    const box = $('time-machine'), open = E.warpOpen(s), C = E.DATA.CONSTANTS, w = s.warp;
    box.hidden = !open;
    if (!open) return;
    const key = [!!w, w && w.hours, s.lastWarp && s.lastWarp.at].join('|');
    if (box._key !== key) {
      box._key = key;
      const L = s.lastWarp;
      box.innerHTML = `<h3>Time Machine</h3>
        <p>Spend Know-how to jump ahead. The skipped time plays out for real: income and Know-how pile up, managers hire, executives act, SCADA buys, Paks get built and incidents can happen. Each jump this run costs ×${C.warpGrowth} more.</p>
        ${w ? `<div class="cov warp-prog"><div data-k="wp"></div></div><p class="small" data-k="wp-text"></p>`
          : `<div class="row-btns warp-btns">${C.warpHours.map((h) => `<button class="btn${h === 24 ? ' primary' : ''}" data-warp="${h}"></button>`).join('')}</div>`}
        ${L && !w ? `<p class="small">Last jump (${L.hours} h): <b>+$${fmt(L.earned)}</b> earned, <b>+${fmt(L.kh)}</b> Know-how${L.lines > 0 ? `, ${fmt(L.lines, 0)} lines added` : ''}.</p>` : ''}`;
    }
    if (w) {
      const done = 1 - w.left / w.total;
      box.querySelector('[data-k="wp"]').style.width = `${done * 100}%`;
      setPart(box.querySelector('[data-k="wp-text"]'), `Jumping ahead… ${fmtTime(w.total - w.left)} of ${w.hours} h`, true);
      return;
    }
    for (const b of box.querySelectorAll('[data-warp]')) {
      const h = Number(b.dataset.warp), cost = E.warpCost(s, h);
      const html = `Jump ${h} h<small>${fmt(cost)} KH</small>`;
      if (b._html !== html) { b._html = html; b.innerHTML = html; }
      b.disabled = !E.canWarp(s, h);
    }
  }

  function renderTech(s) {
    renderOffice(s);
    renderTimeMachine(s);
    for (const t of TECH) {
      const { el, cost: costEl } = techEls[t.id];
      const cost = E.techCost(s, t.id), done = !!s.tech[t.id], avail = E.techAvailable(s, t.id), ready = avail && s.kh >= cost;
      el.className = 'tech ' + (done ? 'done' : avail ? 'available' + (ready ? ' ready' : '') : 'locked');
      el.disabled = !ready;
      const price = `${fmt(cost)} KH${cost < t.cost ? ` <s>${fmt(t.cost)}</s> · Controls team` : ''}`;
      setPart(costEl, done ? '✓ Researched' : avail ? price :
        `${price} · needs ${t.requires.filter((r) => !s.tech[r]).map((r) => TECH.find((x) => x.id === r).name).join(', ')}`);
    }
  }

  function renderOverhaul(s) {
    const C = E.DATA.CONSTANTS;
    $('ov-gain').textContent = fmt(E.overhaulGain(s));
    const nextAt = ((E.patentsTotal(s.lifetime) + 1) / C.patentScale) ** 3 * C.patentDivisor;
    $('ov-detail').textContent = s.lifetime < C.overhaulMin
      ? `Available once you have earned $${fmt(C.overhaulMin)} in total (so far $${fmt(s.lifetime)}).`
      : `Lifetime earnings $${fmt(s.lifetime)}. Next patent at $${fmt(nextAt)}.`;
    $('btn-overhaul').disabled = !E.canOverhaul(s);
    renderStandards(s);
  }

  // Standards Committee: spend Patents on rules that last forever.
  function renderStandards(s) {
    const box = $('standards'), open = E.standardsOpen(s);
    box.hidden = !open && !Object.keys(s.standards || {}).length;
    if (box.hidden) return;
    const key = Object.keys(s.standards || {}).join();
    if (box._key !== key) {
      box._key = key;
      const n = Object.keys(s.standards || {}).length;
      box.innerHTML = `<h3>Standards Committee <span class="muted small">· ${n}/${E.DATA.STANDARDS.length} adopted</span></h3>
        <p>Write the rules of the industry. A standard costs Patents (gone for good: each was +10% income) and changes the game <b>forever</b>, through every Overhaul. Each one adopted makes the next cost ×${E.DATA.CONSTANTS.standardGrowth}.</p>
        <div class="std-list">${E.DATA.STANDARDS.map((sd) => {
          const own = E.hasStandard(s, sd.id);
          return `<div class="std${own ? ' own' : ''}"><div class="std-txt"><b>${sd.code}</b> <span>${sd.name}</span><em>${sd.desc}</em></div>
            ${own ? '<span class="std-ok">Adopted</span>' : `<button class="btn mini" data-standard="${sd.id}"></button>`}</div>`;
        }).join('')}</div>`;
    }
    const cost = E.standardCost(s);
    box.querySelectorAll('[data-standard]').forEach((b) => {
      const html = `${fmt(cost)} patents<small>adopt</small>`;
      if (b._html !== html) { b._html = html; b.innerHTML = html; }
      b.disabled = !E.canAdopt(s, b.dataset.standard);
    });
  }

  function renderStats(s, d) {
    const rows = [
      ['Time on the clock', fmtTime(s.time)],
      ['Hand-pump strokes', fmt(s.strokes)],
      ['Earned this rebuild', '$' + fmt(s.runEarnings)],
      ['Earned all time', '$' + fmt(s.lifetime)],
      ['Overhauls', fmt(s.overhauls)],
      ['Hydraulic power delivered', fmt(d.hydraulicHP) + ' HP'],
      ['Heat generated', fmt(d.heatHP) + ' HP'],
      ['Equilibrium temperature', Math.round(Math.min(d.tempEq, 9999)) + '°F'],
    ];
    setHtml('stats', rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join(''));
    const all = E.DATA.ACHIEVEMENTS, got = all.filter((a) => a.id in s.ach).length;
    setHtml('ach-count', `${got}/${all.length} · +${got}% income`);
    setHtml('ach', all.map((a) => {
      const done = a.id in s.ach;
      const pct = done ? 100 : Math.min(99, Math.floor(100 * E.achStat(s, a.stat) / a.goal));
      return `<div class="ach${done ? ' got' : ''}" title="${a.desc}"><b>${done ? '★' : '☆'} ${a.name}</b>`
        + `<span>${a.desc}</span><i style="width:${pct}%"></i></div>`;
    }).join(''));
  }

  // ---- Per-frame animation ---------------------------------------------------

  // Gauges and the header needle; the big machine draws itself in machine.js.
  let wob = 0;
  function animate(s, d, dt) {
    if (!d) return;
    root.PW.machine.frame(s, d, dt);
    wob += dt * (d.demand > 0 ? 2.5 * d.utilization : 0.5);
    const wobble = d.demand > 0 ? 0.88 + 0.1 * Math.abs(Math.sin(wob * Math.PI)) : 0.6;
    const shown = d.psi * (d.supply > 0 ? wobble * Math.min(1, 0.3 + d.utilization) : 0);
    gP.set(shown, 0, niceMax(d.psi * 1.25), d.psi, fmt(shown, 0));
    const frac = shown / niceMax(d.psi * 1.25);
  }
  function niceMax(v) {
    const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  // ---- Small helpers used by main.js -----------------------------------------

  function toast(msg, ms = 4000) {
    const t = $('toast');
    t.innerHTML = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.hidden = true), ms);
  }
  function floater(x, y, text) {
    const f = document.createElement('div');
    f.className = 'floater';
    f.textContent = text;
    f.style.left = `${x}px`; f.style.top = `${y}px`;
    document.body.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }

  /** Scroll a shop row into view and flash it (used when clicking the machine). */
  function focusItem(kind, id) {
    const r = rows[kind] && rows[kind][id];
    if (!r || r.el.hidden) return;
    r.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    r.el.classList.remove('flash'); void r.el.offsetWidth; r.el.classList.add('flash');
  }

  function focusDept(id) {
    const r = deptEls[id];
    if (!r) return;
    if (staffed(id) && lastState && E.departmentOpen(lastState, DEPT_BY_ID[id])) return openDept(id);
    r.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    r.el.classList.remove('flash'); void r.el.offsetWidth; r.el.classList.add('flash');
  }

  root.PW.ui = { init, render, animate, toast, floater, setTab, focusItem, focusDept, look, openDept, closeSheet, openScada, closeScada, get qty() { return ui.qty; } };
})(window);
