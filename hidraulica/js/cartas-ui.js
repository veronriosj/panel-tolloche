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
  const tipo = t => ({ spray: 'Spray (torre)', asp: 'Aspersor', drain: 'Drenaje' })[t];
  const store = { get(k) { try { return JSON.parse(localStorage.getItem('hidCartas') || '{}')[k]; } catch (e) { return undefined; } },
    set(k, v) { try { const o = JSON.parse(localStorage.getItem('hidCartas') || '{}'); o[k] = v; localStorage.setItem('hidCartas', JSON.stringify(o)); } catch (e) {} } };

  const st = { id: store.get('id') || 'J1', Q: null, Ppsi: null, sep: null, v: window.HID_V100, sP: 0, sT: 0, sC: 0, f: 'all', mm: null };
  const eq = () => EQ.find(e => e.id === st.id) || EQ[0];
  const defQ = e => e.id === 'J1' ? 980.2 : Math.round(e.ancho * 0.816 / 10) * 10;  // misma lámina que la J1 (3,3 mm al 100 %)

  function loadChart(cb) {
    if (window.Chart) return cb();
    const urls = ['https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js', 'https://unpkg.com/chart.js@4.4.0/dist/chart.umd.min.js'];
    let i = 0; (function next() { if (i >= urls.length) return; const s = document.createElement('script'); s.src = urls[i]; s.onload = cb; s.onerror = () => { i++; next(); }; document.head.appendChild(s); })();
  }

  function init() {
    $('eq').innerHTML = EQ.map(e => `<option value="${e.id}">${e.id} · ${e.marca} · ${fmt(e.ancho)} m · ${e.tramos} tramos</option>`).join('');
    $('eq').value = st.id;
    const reset = () => { const e = eq(); st.Q = store.get('Q_' + e.id) || defQ(e); st.sep = e.sepTabla || 2.29; st.Ppsi = null; $('q').value = st.Q; $('sep').value = st.sep; $('p').value = ''; };
    reset(); $('v').value = st.v;
    $('eq').onchange = ev => { st.id = ev.target.value; store.set('id', st.id); reset(); render(); };
    $('q').onchange = ev => { const v = +ev.target.value; if (v > 0) { st.Q = v; store.set('Q_' + st.id, v); } render(); };
    $('p').onchange = ev => { const v = ev.target.value === '' ? null : +ev.target.value; st.Ppsi = v > 0 ? v : null; render(); };
    $('sep').onchange = ev => { const v = +ev.target.value; if (v > 0.5) st.sep = v; render(); };
    $('v').onchange = ev => { const v = +ev.target.value; if (v > 0) st.v = v; render(); };
    $('mm').oninput = ev => { st.mm = +ev.target.value || null; renderLam(); };
    const seg = (id, key, attr = 's') => document.querySelectorAll(`#${id} button`).forEach(b => b.onclick = () => { st[key] = attr === 's' ? +b.dataset.s : b.dataset.f; render(); });
    seg('segP', 'sP'); seg('segT', 'sT'); seg('segC', 'sC'); seg('segF', 'f', 'f');
    $('btnPrint').onclick = () => { buildPrint(); window.print(); };
    loadChart(render); render();
  }

  let cur, lam;
  function render() {
    const e = eq(), Pin = st.Ppsi ? st.Ppsi * C.PSI : null;
    cur = C.carta(e, TAB, { Q: st.Q, Pin, reg: 10, sep: st.sep });
    lam = C.lamina(e, st.Q, st.v);
    ['segP', 'segT', 'segC'].forEach((id, i) => document.querySelectorAll(`#${id} button`).forEach(b => b.setAttribute('aria-pressed', +b.dataset.s === [st.sP, st.sT, st.sC][i])));
    document.querySelectorAll('#segF button').forEach(b => b.setAttribute('aria-pressed', b.dataset.f === st.f));
    const nAsp = cur.res.reduce((a, r) => a + r.regs.length, 0);
    $('eqHint').textContent = `${cur.brand.nombre} · ${fmt(e.ancho)} m de ancho · ${fmt(e.recorrido)} m de recorrido · voladizo ${fmt(e.voladizo, 2)} m · ${e.anio}`;
    $('sepHint').textContent = `m · ${nAsp} aspersores${e.totales ? ` (planilla: ${e.totales})` : ' (planilla sin dato: 2,29 m)'}`;

    // KPIs
    const ok = cur.ok, P = cur.PinReq;
    $('kpis').innerHTML = [
      `<div class="k ${st.Ppsi && !ok ? 'bad' : ''}"><div class="l">Presión mínima de entrada</div><div class="v">${fmt(P / C.PSI, 1)}<small>psi</small></div><div class="s">${fmt(P, 2)} bar en el manómetro · PSR 10 psi</div></div>`,
      `<div class="k"><div class="l">Lámina al 100 %</div><div class="v">${fmt(lam.mm100, 2)}<small>mm</small></div><div class="s">${fmt(lam.h100, 1)} h por pasada · ${fmt(st.v, 3)} m/min</div></div>`,
      `<div class="k"><div class="l">Caudal por lado</div><div class="v">${fmt(cur.res[0].Qs, 1)}<small>m³/h</small></div><div class="s">lado B ${fmt(cur.res[1].Qs, 1)} m³/h · ${fmt(st.Q / 3.6 / (e.ancho * e.recorrido / 1e4), 3)} L/s por ha</div></div>`,
      `<div class="k"><div class="l">Aspersores</div><div class="v">${nAsp}<small>+ 2 drenajes</small></div><div class="s">cada ${fmt(cur.sep, 2)} m · ${cur.brand.nombre}</div></div>`,
    ].join('');
    const ch = [];
    if (st.Ppsi) ch.push(ok ? chip('ok', `Con ${fmt(st.Ppsi, 1)} psi regulan todos los bajantes`) : chip('bad', `Con ${fmt(st.Ppsi, 1)} psi no regulan los últimos bajantes: faltan ${fmt((P - Pin) / C.PSI, 1)} psi`));
    else ch.push(chip('', 'Presiones calculadas con la presión mínima de entrada'));
    if (cur.overMax) ch.push(chip('bad', `${cur.overMax} bajantes piden más caudal que la boquilla más grande de la tabla (${cur.tab[cur.tab.length - 1].label})`));
    if (cur.underMin) ch.push(chip('warn', `${cur.underMin} bajantes piden menos que la boquilla más chica`));
    ch.push(chip('ok', `Regulador 10 psi dentro del rango del aspersor (${cur.brand.pmin}–${cur.brand.pmax} psi)`));
    $('chips').innerHTML = ch.join('');

    // Boquillas
    const ids = Object.keys(cur.count).sort((a, b) => cur.count[b] - cur.count[a]);
    const byId = id => cur.tab.find(z => z.id === id);
    const side = (i, id) => cur.res[i].count[id] || 0;
    const drain = cur.res[0].outs.find(o => o.t === 'drain').noz;
    $('nozSub').textContent = 'a 10 psi · por lado y total';
    $('noz').innerHTML = `<thead><tr><th>Boquilla</th><th style="text-align:left">Color</th><th>Lado A</th><th>Lado B</th><th>Total</th><th>m³/h c/u</th></tr></thead><tbody>` +
      ids.map(id => { const z = byId(id); return `<tr><td><b>${z.label}</b></td><td class="t">${dot(z)}${colorOf(z)[0]}${z.half ? ' · medio nº' : ''}</td><td>${side(0, id)}</td><td>${side(1, id)}</td><td><b>${cur.count[id]}</b></td><td>${fmt(C.qNoz(z, 10), 2)}</td></tr>`; }).join('') +
      `<tr><td><b>${drain.label}</b></td><td class="t">${dot(drain)}${colorOf(drain)[0]} · drenaje de punta, sin regulador</td><td>1</td><td>1</td><td><b>2</b></td><td>${fmt(cur.res[0].qDrain, 2)}</td></tr>` +
      `<tr class="sep"><td colspan="2">Total</td><td>${cur.res[0].regs.length + 1}</td><td>${cur.res[1].regs.length + 1}</td><td>${nAsp + 2}</td><td>${fmt(cur.Qact, 1)} m³/h</td></tr></tbody>`;

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
    const s = C.regulatorStudy(eq(), TAB, st.Q, Pin, st.sep);
    $('reg').innerHTML = `<thead><tr><th>PSR</th><th>Entrada mín.</th><th>Boquillas</th><th style="text-align:left">Con tu presión</th></tr></thead><tbody>` +
      s.map(r => `<tr class="${r.reg === 10 ? 'sel' : ''}"><td>${r.reg} psi${r.reg === 10 ? ' <span class="muted">(instalado)</span>' : ''}</td><td>${fmt(r.PinReq / C.PSI, 1)} psi<br><span class="muted">${fmt(r.PinReq, 2)} bar</span></td><td>${r.nMin.label} a ${r.nMax.label}</td><td class="t">${!r.inRange ? chip('warn', 'fuera de rango') : Pin == null ? '<span class="muted">—</span>' : r.ok ? chip('ok', 'alcanza') : chip('bad', 'no alcanza')}</td></tr>`).join('') + '</tbody>';
    const b = cur.brand;
    $('regNote').textContent = `${b.nombre}: rango ${b.pmin}–${b.pmax} psi, recomendado ${b.rec} psi. Más calibración da más alcance de mojado pero pide más presión de entrada; menos calibración usa boquillas más grandes.`;
  }

  function renderTramos() {
    const r = cur.res[st.sT];
    $('tramos').innerHTML = `<thead><tr><th>Tramo</th><th>Caño</th><th>Largo m</th><th>Bajantes</th><th style="text-align:left">Boquillas</th><th>Q req. m³/h</th><th>Q real m³/h</th><th>Desvío</th><th>Línea al final bar</th></tr></thead><tbody>` +
      r.spans.map((s, si) => {
        const mix = Object.entries(s.cnt).sort((a, b) => b[1] - a[1]).map(([id, k]) => { const z = cur.tab.find(t => t.id === id); return `<span style="white-space:nowrap">${k}× ${dot(z)}${z.label}</span>`; }).join(' · ');
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
      h += `<tr class="${o.t !== 'drain' && o.margin < 0 ? 'flag' : ''}"><td>${o.c}</td><td>${fmt(o.x, 2)}</td><td class="t">${tipo(o.t)}</td><td>${dot(o.noz)}<b>${o.noz.label}</b></td><td>${o.drop ? fmt(o.drop) : '—'}</td><td>${fmt(o.line, 2)}</td><td>${fmt(o.q, 2)}</td></tr>`;
    }
    return `<thead><tr><th>Nº</th><th>Dist. m</th><th style="text-align:left">Tipo</th><th>Boquilla</th><th>Bajante cm</th><th>Línea bar</th><th>Q m³/h</th></tr></thead><tbody>${h}</tbody>`;
  }
  function printRows(r) {   // carta compacta para A4: tablas de 56 filas, 3 por hoja
    const rows = []; let si = -1;
    for (const o of r.outs) {
      if (o.span !== si) { si = o.span; const s = r.spans[si]; rows.push(`<tr class="sep"><td colspan="5">${s.n === 'OH' ? 'Voladizo' : 'Tramo ' + s.n + (s.d === '8' ? ' · 8⅝"' : ' · 6⅝"')} · hasta ${fmt(s.end, 1)} m</td></tr>`); }
      rows.push(`<tr><td>${o.c}</td><td>${fmt(o.x, 1)}</td><td>${dot(o.noz)}<b>${o.noz.label}</b>${o.t === 'spray' ? ' S' : o.t === 'drain' ? ' D' : ''}</td><td>${fmt(o.line, 2)}</td><td>${fmt(o.q, 2)}</td></tr>`);
    }
    const head = '<thead><tr><th>Nº</th><th>m</th><th>Boquilla</th><th>bar</th><th>m³/h</th></tr></thead>';
    const N = 52, tables = [];
    for (let i = 0; i < rows.length; i += N) tables.push(`<table class="cp">${head}<tbody>${rows.slice(i, i + N).join('')}</tbody></table>`);
    let html = '';
    for (let i = 0; i < tables.length; i += 3) html += `<div class="pg">${tables.slice(i, i + 3).join('')}</div>`;
    return html;
  }
  function renderFull() { $('full').innerHTML = fullRows(cur.res[st.sC], st.f); }

  function buildPrint() {
    const e = eq(), hoy = new Date().toLocaleDateString('es-AR');
    const noz = $('noz').outerHTML, tram = i => { const keep = st.sT; st.sT = i; renderTramos(); const h = $('tramos').outerHTML; st.sT = keep; renderTramos(); return h; };
    $('print').innerHTML = `
      <h1>Carta de aspersión · Equipo ${e.id}</h1>
      <table class="hdr"><tr>
        <td><b>Establecimiento</b>Finca Tolloche</td><td><b>Equipo</b>${e.id} · lineal centerfeed · ${e.tramos} tramos</td><td><b>Aspersor</b>${cur.brand.nombre}</td><td><b>Regulador</b>PSR 10 psi (0,69 bar)</td><td><b>Fecha</b>${hoy}</td>
      </tr><tr>
        <td><b>Caudal de entrada</b>${fmt(st.Q, 1)} m³/h</td><td><b>Presión mínima de entrada</b>${fmt(cur.PinReq / C.PSI, 1)} psi · ${fmt(cur.PinReq, 2)} bar</td><td><b>Ancho / recorrido</b>${fmt(e.ancho)} m / ${fmt(e.recorrido)} m</td><td><b>Separación</b>${fmt(cur.sep, 2)} m</td><td><b>Lámina 100 %</b>${fmt(lam.mm100, 2)} mm · ${fmt(lam.h100, 1)} h</td>
      </tr></table>
      ${st.Ppsi ? `<p>Presión de entrada informada: ${fmt(st.Ppsi, 1)} psi — ${cur.ok ? 'regulan todos los bajantes' : 'NO alcanza para regular todos los bajantes'}.</p>` : ''}
      <h2>Boquillas a colocar</h2>${noz}
      <h2>Lámina según % de avance</h2>${$('lam').outerHTML}
      <h2>Resumen por tramo · Lado A</h2>${tram(0)}
      <h2>Resumen por tramo · Lado B</h2>${tram(1)}
      <h2 class="pb">Carta completa · Lado A <span style="font-weight:400;text-transform:none">(S = spray de torre · D = drenaje)</span></h2>${printRows(cur.res[0])}
      <h2 class="pb">Carta completa · Lado B</h2>${printRows(cur.res[1])}
      <p class="foot">Cálculo: Panel Tolloche · Cálculos hidráulicos. Tablas Senninger / Komet KPT a 10 psi; fricción Hazen-Williams C 170; perfil de tramos según carta Valley J1. Verificar en campo la presión de entrada y el caudal.</p>`;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
