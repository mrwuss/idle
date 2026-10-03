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
  const statShort = Object.fromEntries(E.DATA.STATS.map((x, i) => [x.id, [x.short, i, x.name]]));
  const traitName = Object.fromEntries(E.DATA.TRAITS.map((t) => [t.id, t]));
  function personRow(p, deptId, extra = '') {
    const eff = E.effectiveness(p, deptId);
    const [a, b] = E.DATA.DEPT_STATS[deptId];
    const tr = p.t && traitName[p.t];
    const fits = tr && (tr.dept === deptId || tr.dept === 'any');
    const grade = eff >= 1.4 ? 'star' : eff >= 1.1 ? 'good' : eff < 0.85 ? 'weak' : '';
    return `<div class="person">${avatar(p.a)}
      <div class="p-main"><span class="p-name">${p.n}</span>
        <span class="p-stats" title="${statShort[a][2]} (counts double) · ${statShort[b][2]}">${statShort[a][0]} ${p.s[statShort[a][1]]} · ${statShort[b][0]} ${p.s[statShort[b][1]]}</span>
        ${tr ? `<span class="p-trait${fits ? ' fits' : ''}" title="${fits ? `+${tr.bonus} here` : 'No bonus in this job'}">${tr.name}</span>` : ''}</div>
      <span class="p-eff ${grade}" title="Counts as ${eff} staff here">×${eff.toFixed(2)}</span>${extra}</div>`;
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
          <div class="cov" title="Coverage: team strength ÷ staff needed"><div></div></div>
          <div class="mgr-box"></div>
          ${d.id === 'engineering' ? '<div class="eng-ups"></div>' : ''}
          <div class="applicants"></div>
          <details class="team"><summary></summary><ul></ul></details>
        </div>` : ''}
        <div class="dept-era">Era ${ROMAN[d.era]} · ${ERAS[d.era]}</div>`;
      if (d.id === 'production') el.addEventListener('click', () => setTab('actuators'));
      const q = (sel) => el.querySelector(sel);
      deptEls[d.id] = { el, status: q('.dept-status'), prog: q('.dept-progress'), bar: q('.dept-progress div'),
        staff: q('.dept-staff'), staffText: q('.staff-text'), cov: q('.cov div'),
        applicants: q('.applicants'), team: q('.team'), teamSum: q('.team summary'), teamList: q('.team ul'),
        twist: q('.dept-twist'), mgr: q('.mgr-box'), eng: q('.eng-ups') };
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
      el.innerHTML = `<div class="dept-head"><span class="dept-name">${p.name}</span><span class="pak-value">×${p.value} value</span></div>
        <div class="dept-role">${p.desc}</div><div class="dept-twist">Built from: ${p.recipe}</div><div class="dept-status"></div>`;
      chain.appendChild(el);
      pakEls[p.id] = { el, status: el.querySelector('.dept-status') };
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

  /** A department you hire into: coverage, manager, applicants, team (and Engineering projects). */
  function renderStaffed(s, dd, d, r) {
    const o = dd.order, st = s.depts[d.id], isEng = d.id === 'engineering';
    const support = !o.depts[d.id];
    const c = o.depts[d.id];
    const strength = E.strength(st, d.id), heads = E.headcount(st);
    r.staff.hidden = false;
    r.twist.hidden = true;
    if (support) {
      const pct = (x) => `${Math.round((x - 1) * 100)}%`;
      const sum = {
        engineering: () => [`Know-how ×${E.engKhMult(s).toFixed(2)}`, `+${Math.round(strength * E.DATA.CONSTANTS.engKhPerStrength * 100)}% Know-how from the team`],
        it: () => [`Order Line +${pct(E.itMult(s))}`, `every Order Line department works +${pct(E.itMult(s))} harder (max +100%)`],
        safety: () => {
          const rate = E.incidentRate(s, dd) * 60;
          return [`${E.safeDays(s)} days safe`, rate > 0 ? `about one incident every ${fmt(Math.max(1, 1 / rate))} min · streak bonus +${pct(E.safetyStreakMult(s))}` : 'no incident risk below 3,000 psi'];
        },
        management: () => [`Every team +${pct(E.mgmtMult(s))}`, `+${pct(E.mgmtMult(s))} to every team (max +50%) · +${E.mgmtPool(s)} applicant${E.mgmtPool(s) === 1 ? '' : 's'} for every department`],
      }[d.id]();
      r.status.textContent = sum[0];
      r.staffText.textContent = `You + ${heads} hired · strength ${(1 + strength).toFixed(1)} · ${sum[1]}`;
      r.cov.parentElement.hidden = true;
    } else {
      const neck = o.bottleneck === d.id && o.factor < 0.999;
      r.el.classList.toggle('neck', neck);
      r.status.textContent = neck ? `Bottleneck · ${Math.round(c.coverage * 100)}%` : `Covered · ${Math.round(c.coverage * 100)}%`;
      const reach = c.reach !== 1 ? ` · reach ×${c.reach.toFixed(2)}` : '';
      const extra = d.id === 'purchasing' && E.purchasingDiscount(s) < 1 ? ` · prices −${Math.round((1 - E.purchasingDiscount(s)) * 100)}%` : '';
      r.staffText.textContent = `You + ${heads} hired · strength ${(1 + strength).toFixed(1)}${reach} · needs ${c.required.toFixed(1)}${extra}`;
      r.cov.style.width = `${Math.min(100, c.coverage * 100)}%`;
      r.cov.parentElement.classList.toggle('short', c.coverage < 0.999);
    }

    // Manager
    if (st.mgr) {
      const lea = E.leadership(st.mgr);
      setPart(r.mgr, `<div class="mgr">${avatar(st.mgr.a)}
        <div class="p-main"><span class="p-name"><b>${st.mgr.n}</b> · Manager</span>
          <span class="p-stats">LEA ${lea} · team +${Math.round((E.mgrBonus(st) - 1) * 100)}% · reviews ${E.poolSize(st, s)} applicants${support ? '' : ` · fills ${1 + Math.floor(lea / 4)}/check`}</span></div>
        ${support ? '' : `<button class="btn mini ${st.auto ? '' : 'ghost'}" data-auto="${d.id}" title="When on, the manager hires the best applicant whenever the department falls short">${st.auto ? 'Auto-hire on' : 'Auto-hire off'}</button>`}
      </div>`);
    } else {
      setPart(r.mgr, `<div class="mgr none">No manager yet. Promote someone with high <b>Leadership</b> (LEA) from the team: they'll boost everyone${support ? ' and review more applicants' : ', review more applicants and keep the department staffed'}.</div>`);
    }

    // Engineering projects
    if (isEng) {
      const key = E.DATA.ENG_UPGRADES.map((u) => (s.engUp[u.id] ? 1 : 0)).join('') + heads;
      if (r.eng._key !== key) {
        r.eng._key = key;
        r.eng.innerHTML = `<div class="app-head">Engineering projects</div>` + E.DATA.ENG_UPGRADES.map((u) => {
          const owned = s.engUp[u.id], ready = heads >= u.engineers;
          return `<div class="eng-up${owned ? ' owned' : ''}"><div class="p-main"><span class="p-name">${u.name} <b>×${u.kh} KH</b></span>
            <span class="p-stats">${owned ? 'Built' : ready ? u.desc : `Needs ${u.engineers} engineer${u.engineers > 1 ? 's' : ''} (have ${heads})`}</span></div>
            ${owned ? '<span class="p-eff good">✓</span>' : `<button class="btn mini" data-eng="${u.id}">$${fmt(u.cost * dd.m.costMult)}<small>build</small></button>`}</div>`;
        }).join('');
      }
      r.eng.querySelectorAll('[data-eng]').forEach((b) => (b.disabled = !E.canBuyEng(s, b.dataset.eng)));
    }

    // Applicants: rebuild rows only when they change; prices update in place so clicks aren't lost.
    const one = E.hireQuote(s, d.id, 1), many = E.hireQuote(s, d.id, ui.qty), rr = E.rerollCost(s);
    const key = st.pool.map((p) => p.n + p.a).join('|');
    if (r.applicants._key !== key) {
      r.applicants._key = key;
      r.applicants.innerHTML = `<div class="app-head">Applicants${st.mgr ? ` · screened by ${st.mgr.n.split(' ')[0]}` : ''}</div>${st.pool.map((p, i) =>
        personRow(p, d.id, `<button class="btn mini" data-hire="${d.id}" data-idx="${i}"></button>`)).join('')}
        <div class="app-actions">
          <button class="btn mini" data-hire-best="${d.id}"></button>
          <button class="btn mini ghost" data-reroll="${d.id}"></button>
        </div>`;
    }
    const setBtn = (b, cost, label) => {
      const html = `$${fmt(cost)}<small>${label}</small>`;
      if (b._html !== html) { b._html = html; b.innerHTML = html; }
      b.disabled = cost > s.cash;
    };
    r.applicants.querySelectorAll('[data-hire]').forEach((b) => setBtn(b, one.cost, 'hire'));
    setBtn(r.applicants.querySelector('[data-hire-best]'), many.cost, `hire best ${many.qty}`);
    setBtn(r.applicants.querySelector('[data-reroll]'), rr, 'new applicants');

    // Team roster, strongest first, with Leadership and a Promote button
    const tkey = st.team.length + '|' + (st.mgr ? st.mgr.n : '') + '|' + st.staff;
    if (r.teamList._key !== tkey) {
      r.teamList._key = tkey;
      const team = st.team.map((p, i) => [p, i]).sort((x, y) => E.effectiveness(y[0], d.id) - E.effectiveness(x[0], d.id));
      r.teamSum.textContent = `Team (${heads})${team.length ? ` · best: ${team[0][0].n} ×${E.effectiveness(team[0][0], d.id).toFixed(2)}` : ''}`;
      r.teamList.innerHTML = (st.staff ? `<li class="muted">${st.staff} hired before named staff (×1.00 each)</li>` : '') +
        team.map(([p, i]) => `<li>${personRow(p, d.id, `<span class="p-lea" title="Leadership">LEA ${E.leadership(p)}</span>
          <button class="btn mini ghost" data-promote="${d.id}" data-idx="${i}">${st.mgr ? 'Make manager' : 'Promote'}</button>`)}</li>`).join('');
    }
    r.team.hidden = !heads;
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
    const eng = E.departmentOpen(s, DEPARTMENTS.find((d) => d.id === 'engineering'));
    for (const p of PAKS) {
      pakEls[p.id].el.classList.toggle('closed', !eng);
      pakEls[p.id].status.textContent = eng ? 'Line coming in the Departments update' : 'Opens with Engineering';
    }
  }

  // ---- Init ---------------------------------------------------------------

  let gP, gT, ui = { tab: 'actuators', qty: 1 }, handlers;

  function init(h) {
    handlers = h;
    root.PW.machine.init($('machine'), { open: h.openFromMachine, stroke: h.strokeFromMachine });
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

  function setTab(tab) {
    ui.tab = tab;
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

  function render(s) {
    const d = E.derive(s);
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
    $('company-badge').hidden = d.order.factor >= 0.95;
    if (ui.tab === 'overhaul') renderOverhaul(s);
    if (ui.tab === 'settings') renderStats(s, d);

    const ready = TECH.filter((t) => E.techAvailable(s, t.id) && s.kh >= t.cost).length;
    $('tech-badge').hidden = !ready;
    $('tech-badge').textContent = ready;
    $('tab-overhaul').classList.toggle('locked', !E.canOverhaul(s) && s.patents === 0);
    return d;
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

  function renderTech(s) {
    for (const t of TECH) {
      const { el, cost } = techEls[t.id];
      const done = !!s.tech[t.id], avail = E.techAvailable(s, t.id), ready = avail && s.kh >= t.cost;
      el.className = 'tech ' + (done ? 'done' : avail ? 'available' + (ready ? ' ready' : '') : 'locked');
      el.disabled = !ready;
      cost.textContent = done ? '✓ Researched' : avail ? `${fmt(t.cost)} KH` :
        `${fmt(t.cost)} KH · needs ${t.requires.filter((r) => !s.tech[r]).map((r) => TECH.find((x) => x.id === r).name).join(', ')}`;
    }
  }

  function renderOverhaul(s) {
    const C = E.DATA.CONSTANTS;
    $('ov-gain').textContent = fmt(E.overhaulGain(s));
    const nextAt = (E.patentsTotal(s.lifetime) + 1) ** 2 * C.patentDivisor;
    $('ov-detail').textContent = s.lifetime < C.overhaulMin
      ? `Available once you have earned $${fmt(C.overhaulMin)} in total (so far $${fmt(s.lifetime)}).`
      : `Lifetime earnings $${fmt(s.lifetime)}. Next patent at $${fmt(nextAt)}.`;
    $('btn-overhaul').disabled = !E.canOverhaul(s);
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
    $('brand-needle').style.transform = `rotate(${-80 + 120 * frac}deg)`;
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
    r.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    r.el.classList.remove('flash'); void r.el.offsetWidth; r.el.classList.add('flash');
  }

  root.PW.ui = { init, render, animate, toast, floater, setTab, focusItem, focusDept, look, get qty() { return ui.qty; } };
})(window);
