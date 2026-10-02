// ===== Cálculos hidráulicos · Cartas de aspersión (interfaz) =====
(function () {
  const C = window.HIDcartas, EQ = window.HID_EQUIPOS, TAB = window.HID_BOQUILLAS;
  const COL = {
    'Pink': ['Rosa', '#f4a6c6'], 'Ice': ['Hielo', '#e6f2f8'], 'Light Blue': ['Celeste', '#8ecbf0'], 'Beige': ['Beige', '#e3d3b0'],
    'Gold': ['Dorado', '#d4a017'], 'Lime': ['Lima', '#a6d93a'], 'Lavender': ['Lavanda', '#b9a3e3'], 'Grey': ['Gris', '#8c8c8c'],
    'Turquoise': ['Turquesa', '#33c3c3'], 'Yellow': ['Amarillo', '#f2d21b'], 'Red': ['Rojo', '#d32f2f'], 'White': ['Blanco', '#f7f7f7'],
    'Blue': ['Azul', '#1f5fbf'], 'Dk. Brown': ['Marrón oscuro', '#5a3a1e'], 'Dark Brown': ['Marrón oscuro', '#5a3a1e'], 'Orange': ['Naranja', '#f07a1a'],
    'Dk. Green': ['Verde oscuro', '#1f5f2e'], 'Dark Green': ['Verde oscuro', '#1f5f2e'], 'Purple': ['Violeta', '#6b3fa0'], 'Black': ['Negro', '#1a1a1a'],
    'Dk. Turquoise': ['Turquesa oscuro', '#00777a'], 'Dark Turquoise': ['Turquesa oscuro', '#00777a'], 'Mustard': ['Mostaza', '#c9a227'],
    'Maroon': ['Bordó', '#7a1f2b'], 'Cream': ['Crema', '#f3ead0'], 'Dk. Blue': ['Azul oscuro', '#1b2f6b'], 'Dark Blue': ['Azul oscuro', '#1b2f6b'],
    'Copper': ['Cobre', '#b8733a'], 'Bronze': ['Bronce', '#8c6a3a'],
  };
  const $ = id => document.getElementById(id);
  const fmt = (v, d = 0) => (v == null || !isFinite(v)) ? '—' : v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const chip = (c, t) => `<span class="chip ${c}">${t}</span>`;
  const colorOf = z => COL[z.color] || [z.color || '—', '#ccc'];
  const dot = z => `<i class="dot" style="background:${colorOf(z)[1]}"></i>`;
  const tipo = t => ({ spray: 'Huella seca (torre)', dir: 'Directional (torre)', asp: 'Aspersor', drain: 'Drenaje' })[t];
  const nom = z => z.modelo ? `${z.label} <span class="muted" style="font-weight:400">${z.modelo}</span>` : z.label;
  const store = { get(k) { try { return JSON.parse(localStorage.getItem('hidCartas2') || '{}')[k]; } catch (e) { return undefined; } },
    set(k, v) { try { const o = JSON.parse(localStorage.getItem('hidCartas2') || '{}'); o[k] = v; localStorage.setItem('hidCartas2', JSON.stringify(o)); } catch (e) {} } };

  const st = { modo: store.get('modo') || 'valley', id: store.get('id') || 'J1', Q: null, Ppsi: null, v: window.HID_V100, sP: 0, sT: 0, sC: 0, f: 'all', mm: null };
  const eq = () => EQ.find(e => e.id === st.id) || EQ[0];
  const defQ = e => { const ch = C.valleyChart(e); return ch ? ch.Q : Math.round(e.ancho * 0.816 / 10) * 10; };   // caudal de la carta Valley del equipo

  function loadChart(cb) {
    if (window.Chart) return cb();
    const urls = ['https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js', 'https://unpkg.com/chart.js@4.4.0/dist/chart.umd.min.js'];
    let i = 0; (function next() { if (i >= urls.length) return; const s = document.createElement('script'); s.src = urls[i]; s.onload = cb; s.onerror = () => { i++; next(); }; document.head.appendChild(s); })();
  }

  function init() {
    $('eq').innerHTML = EQ.map(e => `<option value="${e.id}">${e.id} · ${e.marca} · ${fmt(e.ancho)} m · ${e.tramos} tramos</option>`).join('');
    $('eq').value = st.id;
    const reset = () => { const e = eq(); st.Q = store.get('Q_' + e.id) || defQ(e); st.Ppsi = null; $('q').value = st.Q; $('p').value = ''; };
    reset(); $('v').value = st.v;
    $('eq').onchange = ev => { st.id = ev.target.value; store.set('id', st.id); reset(); render(); };
    $('q').onchange = ev => { const v = +ev.target.value; if (v > 0) { st.Q = v; store.set('Q_' + st.id, v); } render(); };
    $('p').onchange = ev => { const v = ev.target.value === '' ? null : +ev.target.value; st.Ppsi = v > 0 ? v : null; render(); };
    $('v').onchange = ev => { const v = +ev.target.value; if (v > 0) st.v = v; render(); };
    $('mm').oninput = ev => { st.mm = +ev.target.value || null; renderLam(); };
    const seg = (id, key, attr = 's') => document.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => { st[key] = attr === 's' ? +b.dataset.s : b.dataset.f; render(); });
    document.querySelectorAll('#segM button').forEach(b => b.onclick = () => { st.modo = b.dataset.m; store.set('modo', st.modo); render(); });
    $('qCarta').onclick = () => { const ch = C.valleyChart(eq()); if (ch) { st.Q = ch.Q; store.set('Q_' + st.id, null); $('q').value = st.Q; render(); } };
    seg('segP', 'sP'); seg('segT', 'sT'); seg('segC', 'sC'); seg('segF', 'f', 'f');
    $('btnPrint').onclick = () => { buildPrint(); window.print(); };
    loadChart(render); render();
  }

  let cur, lam;
  function render() {
    const e = eq(), Pin = st.Ppsi ? st.Ppsi * C.PSI : null;
    const vch = C.valleyChart(e);
    if (!vch) st.modo = 'propia';
    cur = st.modo === 'valley' ? C.cartaValley(e, TAB, { Q: st.Q, Pin, reg: 10 }) : C.carta(e, TAB, { Q: st.Q, Pin, reg: 10 });
    document.querySelectorAll('#segM button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.m === st.modo); b.disabled = b.dataset.m === 'valley' && !vch; });
    $('qCarta').hidden = !vch || st.Q === vch.Q;
    $('qCarta').textContent = vch ? `Usar caudal de la carta (${fmt(vch.Q, 1)})` : '';
    $('modoNote').innerHTML = st.modo === 'valley'
      ? `Armado y boquillas de la <b>carta Valley ${vch.carta}</b> (${vch.fecha}, ${fmt(vch.Q, 1)} m³/h a ${fmt(vch.P, 2)} bar). Con otro caudal se escala cada salida y se elige la boquilla más cercana del mismo modelo.`
      : `Armado de campo (3 bajantes por caño) y tabla oficial ${e.marca === 'KOMET' ? 'Komet KPT' : 'Senninger'} del aspersor instalado (${e.marca}).`;
    lam = C.lamina(e, st.Q, st.v);
    ['segP', 'segT', 'segC'].forEach((id, i) => document.querySelectorAll(`#${id} button`).forEach(b => b.setAttribute('aria-pressed', +b.dataset.s === [st.sP, st.sT, st.sC][i])));
    document.querySelectorAll('#segF button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === st.f));
    const nAsp = cur.res.reduce((a, r) => a + r.regs.length, 0);
    const nDr = cur.res.reduce((a, r) => a + r.outs.filter(o => o.t === 'drain').length, 0);
    $('eqHint').textContent = `${cur.brand.nombre} · ${fmt(e.ancho)} m de ancho · ${fmt(e.recorrido)} m de recorrido · voladizo ${fmt(e.voladizo, 2)} m · ${e.anio}`;

    // KPIs
    const ok = cur.ok, P = cur.PinReq;
    $('kpis').innerHTML = [
      `<div class="k ${st.Ppsi && !ok ? 'bad' : ''}"><div class="l">Presión mínima de entrada</div><div class="v">${fmt(P / C.PSI, 1)}<small>psi</small></div><div class="s">${fmt(P, 2)} bar en el manómetro · PSR 10 psi${cur.modo === 'valley' ? ` · carta: ${fmt(cur.chart.P, 2)} bar a ${fmt(cur.chart.Q, 0)} m³/h` : ''}</div></div>`,
      `<div class="k"><div class="l">Lámina al 100 %</div><div class="v">${fmt(lam.mm100, 2)}<small>mm</small></div><div class="s">${fmt(lam.h100, 1)} h por pasada · ${fmt(st.v, 3)} m/min</div></div>`,
      `<div class="k"><div class="l">Caudal por lado</div><div class="v">${fmt(cur.res[0].Qs, 1)}<small>m³/h</small></div><div class="s">lado B ${fmt(cur.res[1].Qs, 1)} m³/h · ${fmt(st.Q / 3.6 / (e.ancho * e.recorrido / 1e4), 3)} L/s por ha</div></div>`,
      `<div class="k"><div class="l">Aspersores</div><div class="v">${nAsp}<small>+ ${nDr} drenajes</small></div><div class="s">${cur.modo === 'valley' ? `${cur.brand.nombre} + Directional en torres` : `3 por caño (2,20 m) · ${cur.brand.nombre}`}</div></div>`,
    ].join('');
    const ch = [];
    if (st.Ppsi) ch.push(ok ? chip('ok', `Con ${fmt(st.Ppsi, 1)} psi regulan todos los bajantes`) : chip('bad', `Con ${fmt(st.Ppsi, 1)} psi no regulan los últimos bajantes: faltan ${fmt((P - Pin) / C.PSI, 1)} psi`));
    else ch.push(chip('', 'Presiones calculadas con la presión mínima de entrada'));
    if (cur.modo === 'valley') ch.push(cur.cambios === 0 ? chip('ok', `Boquillas iguales a la carta Valley ${cur.chart.carta} (${cur.chart.fecha})`) : chip('warn', `${cur.cambios} de ${nAsp} bajantes cambian de boquilla respecto de la carta (${fmt(cur.chart.Q, 0)} → ${fmt(st.Q, 0)} m³/h)`));
    if (cur.overMax) ch.push(chip('bad', `${cur.overMax} bajantes piden más caudal que la boquilla más grande de la tabla (${cur.tab[cur.tab.length - 1].label})`));
    if (cur.underMin) ch.push(chip('warn', `${cur.underMin} bajantes piden menos que la boquilla más chica`));
    ch.push(chip('ok', `Regulador 10 psi dentro del rango del aspersor (${cur.brand.pmin}–${cur.brand.pmax} psi)`));
    if (cur.modo === 'valley' && Math.abs(cur.chart.lados[0].fin + (cur.chart.lados[1] || cur.chart.lados[0]).fin - e.ancho) > 3) ch.push(chip('warn', `La carta Valley mide ${fmt(cur.chart.lados[0].fin + (cur.chart.lados[1] || cur.chart.lados[0]).fin, 1)} m; la planilla dice ${fmt(e.ancho)} m (la lámina usa la planilla)`));
    $('chips').innerHTML = ch.join('');

    // Boquillas
    const ids = Object.keys(cur.count).sort((a, b) => cur.count[b] - cur.count[a]);
    const byId = id => cur.tab.find(z => z.id === id);
    const side = (i, id) => cur.res[i].count[id] || 0;
    const drs = {}; cur.res.forEach((r, li) => r.outs.filter(o => o.t === 'drain').forEach(o => { const d = drs[o.noz.id] || (drs[o.noz.id] = { z: o.noz, n: [0, 0], q: 0 }); d.n[li]++; d.q += o.q; }));
    $('nozSub').textContent = 'a 10 psi · por lado y total';
    $('noz').innerHTML = `<thead><tr><th>Boquilla</th><th style="text-align:left">Color</th><th>Lado A</th><th>Lado B</th><th>Total</th><th>m³/h c/u</th></tr></thead><tbody>` +
      ids.map(id => { const z = byId(id); return `<tr><td><b>${nom(z)}</b></td><td class="t">${dot(z)}${colorOf(z)[0]}</td><td>${side(0, id)}</td><td>${side(1, id)}</td><td><b>${cur.count[id]}</b></td><td>${fmt(C.qNoz(z, 10), 2)}</td></tr>`; }).join('') +
      Object.values(drs).map(d => `<tr><td><b>${nom(d.z)}</b></td><td class="t">${dot(d.z)}${colorOf(d.z)[0]} · drenaje de punta, sin regulador</td><td>${d.n[0]}</td><td>${d.n[1]}</td><td><b>${d.n[0] + d.n[1]}</b></td><td>${fmt(d.q / (d.n[0] + d.n[1]), 2)}</td></tr>`).join('') +
      `<tr class="sep"><td colspan="2">Total</td><td>${cur.res[0].outs.length}</td><td>${cur.res[1].outs.length}</td><td>${nAsp + nDr}</td><td>${fmt(cur.Qact, 1)} m³/h</td></tr></tbody>`;

    renderLam(); renderReg(); renderTramos(); drawChart(); renderFull();
  }

  function renderLam() {
    $('lamSub').textContent = `${fmt(st.Q, 1)} m³/h · ${fmt(eq().recorrido)} m de recorrido`;
    $('lam').innerHTML = `<thead><tr><th>% avance</th><th>mm por pasada</th><th>Horas por pasada</th><th>Avance m/min</th></tr></thead><tbody>` +
      lam.rows.map(r => `<tr><td>${r.p} %</td><td>${fmt(r.mm, 1)}</td><td>${fmt(r.h, 1)}</td><td>${fmt(st.v * r.p / 100, 2)}</td></tr>`).join('') + '</tbody>';
    if (st.mm) {
      const p = lam.mm100 / st.mm * 100;
      $('mmOut').innerHTML = p > 100 ? `No se llega: al 100 % da ${fmt(lam.mm100, 2)} mm.` : `Timer al <b>${fmt(p, 1)} %</b> · ${fmt(lam.h100 * 100 / p, 1)} h por pasada`;
    } else $('mmOut').textContent = 'Ingresá los mm para saber el % de avance.';
  }

  function renderReg() {
    const Pin = st.Ppsi ? st.Ppsi * C.PSI : null;
    const s = cur.modo === 'valley' ? C.regulatorStudyValley(eq(), TAB, st.Q, Pin) : C.regulatorStudy(eq(), TAB, st.Q, Pin);
    $('reg').innerHTML = `<thead><tr><th>PSR</th><th>Entrada mín.</th><th>Boquillas</th><th style="text-align:left">Con tu presión</th></tr></thead><tbody>` +
      s.map(r => `<tr class="${r.reg === 10 ? 'sel' : ''}"><td>${r.reg} psi${r.reg === 10 ? ' <span class="muted">(instalado)</span>' : ''}</td><td>${fmt(r.PinReq / C.PSI, 1)} psi<br><span class="muted">${fmt(r.PinReq, 2)} bar</span></td><td>${r.nMin.label} a ${r.nMax.label}</td><td class="t">${!r.inRange ? chip('warn', 'fuera de rango') : Pin == null ? '<span class="muted">—</span>' : r.ok ? chip('ok', 'alcanza') : chip('bad', 'no alcanza')}</td></tr>`).join('') + '</tbody>';
    const b = cur.brand;
    $('regNote').textContent = `${b.nombre}: rango ${b.pmin}–${b.pmax} psi, recomendado ${b.rec} psi. Más calibración da más alcance de mojado pero pide más presión de entrada; menos calibración usa boquillas más grandes.`;
  }

  function renderTramos() {
    const r = cur.res[st.sT];
    $('tramos').innerHTML = `<thead><tr><th>Tramo</th><th>Caño</th><th>Largo m</th><th>Bajantes</th><th style="text-align:left">Boquillas</th><th>Q req. m³/h</th><th>Q real m³/h</th><th>Desvío</th><th>Línea al final bar</th></tr></thead><tbody>` +
      r.spans.map((s, si) => {
        const mix = Object.entries(s.cnt).sort((a, b) => b[1] - a[1]).map(([id, k]) => { const z = cur.tab.find(t => t.id === id); return `<span style="white-space:nowrap">${k}× ${dot(z)}${nom(z)}</span>`; }).join(' · ');
        const last = r.outs.filter(o => o.span === si).pop();
        return `<tr><td>${s.n === 'OH' ? 'Voladizo' : s.n}</td><td>${s.d === 'OH' ? '6⅝" + 4"' : s.d === '8' ? '8⅝"' : '6⅝"'}</td><td>${fmt(s.L, 2)}</td><td>${s.k}</td><td class="t">${mix}</td><td>${fmt(s.rq, 2)}</td><td>${fmt(s.act, 2)}</td><td>${s.dev >= 0 ? '+' : ''}${fmt(s.dev * 100, 2)} %</td><td>${fmt(last.line, 2)}</td></tr>`;
      }).join('') + '</tbody>';
  }

  let chart;
  function drawChart() {
    if (!window.Chart) return;
    const r = cur.res[st.sP], need = 10 * C.PSI + C.REG_MARGIN, X = cur.sides[st.sP].L;
    const ds = [
      { label: 'Entrada al regulador', data: r.regs.map(o => ({ x: o.x, y: o.pin })), borderColor: '#1a7a4a', borderWidth: 2, pointRadius: 0 },
      { label: 'Línea (caño)', data: r.outs.map(o => ({ x: o.x, y: o.line })), borderColor: '#7a8a72', borderWidth: 1.25, pointRadius: 0 },
      { label: 'Mínimo PSR 10 psi', data: [{ x: 0, y: need }, { x: X, y: need }], borderColor: '#d93025', borderWidth: 1.5, borderDash: [5, 4], pointRadius: 0 },
    ];
    const ax = t => ({ type: 'linear', title: { display: !!t, text: t, color: '#4a5e42', font: { size: 11 } }, grid: { color: '#e3efe6' }, ticks: { color: '#4a5e42', font: { size: 10 }, maxTicksLimit: 8, callback: v => fmt(v, v % 1 ? 1 : 0) } });
    if (chart) chart.destroy();
    chart = new Chart($('cP'), { type: 'line', data: { datasets: ds }, options: { responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
      interaction: { mode: 'nearest', intersect: false, axis: 'x' },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: it => `${fmt(it[0].parsed.x, 1)} m`, label: it => ` ${it.dataset.label}: ${fmt(it.parsed.y, 2)} bar` } } },
      scales: { x: { ...ax('Distancia desde el carro (m)'), min: 0, max: Math.ceil(X / 50) * 50 }, y: { ...ax('bar'), min: 0 } } } });
    $('lgP').innerHTML = `<span><i class="ln" style="border-color:#1a7a4a"></i>Entrada al regulador (al pie del bajante)</span><span><i class="ln" style="border-color:#7a8a72;border-top-width:1.25px"></i>Línea (caño)</span><span><i class="ln d" style="border-color:#d93025"></i>Mínimo para PSR 10 psi (${fmt(need, 2)} bar)</span>`;
  }

  function fullRows(r, filter) {
    const mode = Object.entries(r.count).sort((a, b) => b[1] - a[1])[0][0];
    let h = '', si = -1;
    for (const o of r.outs) {
      if (o.span !== si) { si = o.span; const s = r.spans[si]; h += `<tr class="sep"><td colspan="7">${s.n === 'OH' ? 'Voladizo' : 'Tramo ' + s.n} · ${s.d === 'OH' ? '' : s.d === '8' ? '8⅝" · ' : '6⅝" · '}hasta ${fmt(s.end, 2)} m</td></tr>`; }
      if (filter === 'diff' && o.t !== 'drain' && o.noz.id === mode) continue;
      h += `<tr class="${o.t !== 'drain' && o.margin < 0 ? 'flag' : ''}"><td>${o.c}</td><td>${fmt(o.x, 2)}</td><td class="t">${tipo(o.t)}</td><td>${dot(o.noz)}<b>${nom(o.noz)}</b></td><td>${o.drop ? fmt(o.drop) : '—'}</td><td>${fmt(o.line, 2)}</td><td>${fmt(o.q, 2)}</td></tr>`;
    }
    return `<thead><tr><th>Nº</th><th>Dist. m</th><th style="text-align:left">Tipo</th><th>Boquilla</th><th>Bajante cm</th><th>Línea bar</th><th>Q m³/h</th></tr></thead><tbody>${h}</tbody>`;
  }
  function renderFull() { $('full').innerHTML = fullRows(cur.res[st.sC], st.f); }

  // Carta impresa: solo boquilla por bajante, con logo LIAG. Un lado por hoja, 4 columnas parejas.
  function buildPrint() {
    const e = eq(), hoy = new Date().toLocaleDateString('es-AR');
    const crit = cur.modo === 'valley' ? `Según carta Valley ${cur.chart.carta} (${cur.chart.fecha})` : 'Según tabla propia';
    const info1 = `Caudal ${fmt(st.Q, 1)} m³/h · Presión mín. de entrada ${fmt(cur.PinReq / C.PSI, 1)} psi (${fmt(cur.PinReq, 2)} bar) · Regulador PSR 10 psi`;
    const info2 = `${cur.brand.nombre} · ${crit}`;
    const corto = n => n.replace('oscuro', 'osc.').replace('Turquesa osc.', 'Turq. osc.');
    const TIPO = { spray: 'H', dir: 'Dir', drain: 'Dr', asp: '' };
    const DIAM = { '8': '8⅝"', '6': '6⅝"', 'OH': '6⅝" + 4"' };
    const MAXR = 72, COLS = 4, ALTO = 234;   // filas máx. por columna · alto útil de la grilla (mm)
    const row = o => { const z = o.noz, c = colorOf(z);
      return `<tr class="${o.t !== 'asp' ? 'esp' : ''}"><td>${o.c}</td><td>${fmt(o.x, 1)}</td><td class="bq">${z.label}</td><td class="tp">${TIPO[o.t]}</td><td class="cl"><i class="dot" style="background:${c[1]}"></i>${corto(c[0])}</td></tr>`; };
    const sep = (s, sigue) => `<tr class="sep"><td colspan="5">${s.n === 'OH' ? 'Voladizo' : 'Tramo ' + s.n}<span>${sigue ? 'continúa' : DIAM[s.d] + ' · ' + fmt(s.L, 1) + ' m'}</span></td></tr>`;
    const vacia = '<tr class="vac"><td></td><td></td><td></td><td></td><td></td></tr>';
    let pages = '';
    cur.res.forEach((r, li) => {
      // secuencia de filas: separador de tramo + bajantes
      const items = []; let si = -1;
      for (const o of r.outs) { if (o.span !== si) { si = o.span; items.push({ sep: r.spans[si] }); } items.push({ o, s: r.spans[si] }); }
      // filas por columna: parejas, con lugar para los "continúa"
      const R = Math.min(MAXR, Math.ceil((items.length + COLS) / COLS));
      const cols = []; let col = null;
      for (const it of items) {
        if (!col || col.length >= R || (it.sep && col.length >= R - 1)) { col = []; cols.push(col); if (!it.sep) col.push(sep(it.s, true)); }
        col.push(it.sep ? sep(it.sep, false) : row(it.o));
      }
      const resumen = Object.entries(r.count).sort((x, y) => y[1] - x[1]).map(([id, k]) => { const z = cur.tab.find(t => t.id === id), c = colorOf(z);
        return `<span><i class="dot" style="background:${c[1]}"></i><b>${z.label}</b>${z.modelo ? ' ' + z.modelo : ''} ${corto(c[0])} <b>×${k}</b></span>`; }).join('');
      const drs = r.outs.filter(o => o.t === 'drain').map(o => `<span><i class="dot" style="background:${colorOf(o.noz)[1]}"></i><b>${o.noz.label}</b> drenaje <b>×1</b></span>`).join('');
      const nPag = Math.ceil(cols.length / COLS);
      for (let pg = 0; pg < nPag; pg++) {
        const tablas = cols.slice(pg * COLS, (pg + 1) * COLS).map(c => {
          while (c.length < R) c.push(vacia);
          return `<table><colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"></colgroup><thead><tr><th>Nº</th><th>m</th><th>Boq.</th><th>T.</th><th>Color</th></tr></thead><tbody>${c.join('')}</tbody></table>`;
        });
        while (tablas.length < COLS) tablas.push('<div></div>');
        const rh = Math.min(4.3, ALTO / R).toFixed(2);
        pages += `<section class="page" style="--rh:${rh}mm">
          <header class="ph">${window.HID_LOGO ? `<img src="${window.HID_LOGO}" alt="LIAG Argentina S.A.U.">` : ''}
            <div><h1>Carta de aspersión · Equipo ${e.id}</h1><div class="sub">${info1}</div><div class="sub">${info2}</div></div>
            <div class="side">Lado ${li === 0 ? 'A' : 'B'}<small>${r.outs.length} salidas · hoja ${pg + 1}/${nPag}</small><small>${hoy}</small></div></header>
          ${pg === 0 ? `<div class="res">${resumen}${drs}</div>` : ''}
          <div class="grid">${tablas.join('')}</div>
          <footer class="foot"><span>Tipo: <b>Dir</b> Directional junto a la torre · <b>H</b> huella seca · <b>Dr</b> drenaje de punta sin regulador · boquillas para PSR 10 psi</span><span>LIAG Argentina S.A.U. · Finca Tolloche</span></footer>
        </section>`;
      }
    });
    $('print').innerHTML = pages;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
