// ===== Interfaz =====
const P_LIST = PUMPS.map(preparePump);
const SYS_DEFAULT = { Hest: 8, L: 500, D1: 0.22, D2: 0.17, f: 0.01, fq: 0.3, alas: 2 };
const N_MIN = 1000, N_ENG_MAX = 2100, POR = [0.7, 1.2];
const st = { pump: 'pp1212', n: 1500, eng: '076A', qt: 1100, lim: 80, sys: { ...SYS_DEFAULT } };

const $ = id => document.getElementById(id);
const fmt = (v, d = 0) => (v == null || !isFinite(v)) ? '—' : v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const pump = () => P_LIST.find(p => p.id === st.pump);
const eng = () => ENGINES[st.eng];
const nMax = p => Math.min(p.nmax || N_ENG_MAX, N_ENG_MAX);
const chip = (cls, txt) => `<span class="chip ${cls}">${txt}</span>`;

function statusChips(p, o, opts = {}) {
  const c = [];
  if (!o.ok) { c.push(chip('bad', o.reason === 'fuera de curva' ? 'Fuera de la curva publicada' : 'Sin caudal: no vence la altura estática')); return c; }
  if (opts.target != null) c.push(o.Q >= opts.target - 0.5 ? chip('good', 'Cumple Q objetivo') : chip('bad', `Falta ${fmt(opts.target - o.Q)} m³/h`));
  if (o.extrap) c.push(chip('warn', 'Curva extrapolada'));
  if (p.hasEff) {
    const inPor = o.ratio >= POR[0] && o.ratio <= POR[1];
    c.push(inPor ? chip('good', `En zona recomendada (${fmt(o.ratio * 100)} % BEP)`) : chip('warn', `Fuera de zona recomendada (${fmt(o.ratio * 100)} % BEP)`));
    if (o.load != null) c.push(o.load > 1 ? chip('bad', 'Excede la potencia del motor') : o.load > st.lim / 100 ? chip('warn', `Carga motor ${fmt(o.load * 100)} %`) : chip('good', `Carga motor ${fmt(o.load * 100)} %`));
  } else c.push(chip('', 'Sin datos de rendimiento'));
  return c;
}

// ---------- Controles ----------
function initControls() {
  $('pump').innerHTML = P_LIST.map(p => `<option value="${p.id}">${p.name}${p.hasEff ? '' : ' (solo H–Q)'}</option>`).join('');
  $('eng').innerHTML = Object.entries(ENGINES).map(([k, e]) => `<option value="${k}">${e.name}</option>`).join('');
  $('pump').value = st.pump; $('eng').value = st.eng;
  const sysIds = { sHest: 'Hest', sL: 'L', sD1: 'D1', sD2: 'D2', sF: 'f', sFq: 'fq', sAlas: 'alas' };
  const fillSys = () => Object.entries(sysIds).forEach(([id, k]) => $(id).value = st.sys[k]);
  fillSys();
  $('pump').addEventListener('change', e => { st.pump = e.target.value; const p = pump(); const t = rpmForQ(p, st.qt, st.sys, N_MIN, nMax(p)); st.n = t.n ? Math.round(t.n / 10) * 10 : Math.min(st.n, nMax(p)); render(); });
  const setN = v => { const p = pump(); st.n = Math.max(N_MIN, Math.min(nMax(p), Math.round(+v || st.n))); render(); };
  $('rpmR').addEventListener('input', e => setN(e.target.value));
  $('rpmN').addEventListener('change', e => setN(e.target.value));
  $('eng').addEventListener('change', e => { st.eng = e.target.value; render(); });
  $('qt').addEventListener('change', e => { st.qt = Math.max(100, +e.target.value || 1100); render(); });
  $('lim').addEventListener('change', e => { st.lim = Math.max(40, Math.min(100, +e.target.value || 80)); render(); });
  Object.entries(sysIds).forEach(([id, k]) => $(id).addEventListener('change', e => { const v = +e.target.value; if (isFinite(v) && v >= 0) st.sys[k] = (k === 'alas' ? Math.max(1, Math.round(v)) : v); if (st.sys.D1 <= 0) st.sys.D1 = SYS_DEFAULT.D1; if (st.sys.D2 <= 0) st.sys.D2 = SYS_DEFAULT.D2; render(); }));
  $('sReset').addEventListener('click', () => { st.sys = { ...SYS_DEFAULT }; fillSys(); render(); });
  // rpm inicial = la necesaria para el objetivo
  const t = rpmForQ(pump(), st.qt, st.sys, N_MIN, nMax(pump())); if (t.n) st.n = Math.round(t.n / 10) * 10;
}

// ---------- Resumen ----------
function kpi(k, v, u, s = '') { return `<div class="kpi"><div class="k">${k}</div><div class="v">${v}<span class="u">${u}</span></div><div class="s">${s || '&nbsp;'}</div></div>`; }

function renderSummary(p, o, tgt, best) {
  const e = eng();
  $('opTitle').textContent = `${p.name} a ${fmt(st.n)} rpm`;
  $('kpis').innerHTML = [
    kpi('Caudal', o.ok ? fmt(o.Q) : '—', 'm³/h', o.ok ? `${fmt(o.Q / st.sys.alas)} m³/h por ala` : ''),
    kpi('Altura', o.ok ? fmt(o.H, 1) : '—', 'm', o.ok ? `${fmt(o.H / 10.197, 2)} bar` : ''),
    kpi('Rendimiento', o.ok && p.hasEff ? fmt(o.E, 1) : '—', '%', o.ok && p.hasEff ? `BEP a esta rpm: ${fmt(o.Qbep)} m³/h` : 's/d'),
    kpi('Potencia al eje', o.ok && p.hasEff ? fmt(o.P) : '—', 'kW', o.ok && p.hasEff ? `${fmt(o.P / 0.7457)} hp` : 's/d'),
    kpi('Carga del motor', o.ok && p.hasEff ? fmt(o.load * 100) : '—', '%', `disponible ${fmt(enginePower(e, st.n))} kW`),
    kpi('Consumo estimado', o.ok && p.hasEff ? fmt(o.fuel, 1) : '—', 'L/h', o.ok && p.hasEff ? `${fmt(o.fuelM3 * 1000, 1)} mL/m³ · ${fmt(o.kWhM3, 3)} kWh/m³` : 's/d'),
  ].join('');
  $('opChips').innerHTML = statusChips(p, o, { target: st.qt }).join('') + (o.ok && o.npsh != null ? chip('', `NPSH requerido ${fmt(o.npsh, 1)} m`) : '');

  // Óptimo 1: rpm para Q objetivo
  let h = `<div class="sec-head" style="margin-bottom:6px"><h2>Para entregar ${fmt(st.qt)} m³/h</h2></div>`;
  if (tgt.n && tgt.o.ok) {
    const t = tgt.o;
    h += `<div class="big">${fmt(tgt.n)}<small>rpm</small></div><div class="chips">${statusChips(p, t).join('')}</div><dl>
      <dt>Altura</dt><dd>${fmt(t.H, 1)} m</dd>
      <dt>Rendimiento</dt><dd>${p.hasEff ? fmt(t.E, 1) + ' %' : 's/d'}</dd>
      <dt>Potencia al eje</dt><dd>${p.hasEff ? fmt(t.P) + ' kW' : 's/d'}</dd>
      <dt>Carga del motor</dt><dd>${p.hasEff ? fmt(t.load * 100) + ' %' : 's/d'}</dd>
      <dt>Consumo estimado</dt><dd>${p.hasEff ? fmt(t.fuel, 1) + ' L/h' : 's/d'}</dd></dl>
      <button type="button" data-n="${Math.round(tgt.n)}">Ver a ${fmt(tgt.n)} rpm</button>`;
  } else if (tgt.n) {
    h += `<div class="big">≥ ${fmt(tgt.n)}<small>rpm</small></div><div class="chips">${chip('warn', 'El punto cae fuera de la curva publicada')}</div><p class="muted" style="margin:0;font-size:12.5px">La bomba necesitaría trabajar más allá del rango con datos del fabricante para dar este caudal.</p>`;
  } else {
    const oMax = operate(p, nMax(p), st.sys, eng());
    h += `<div class="big">—</div><div class="chips">${chip('bad', 'No alcanza el caudal objetivo')}</div><p class="muted" style="margin:0;font-size:12.5px">A la velocidad máxima (${fmt(nMax(p))} rpm) entrega ${oMax.ok ? fmt(oMax.Q) + ' m³/h' : 'un caudal fuera de la curva publicada'}.</p>`;
  }
  $('optTarget').innerHTML = h;

  // Óptimo 2: máximo rendimiento
  let h2 = `<div class="sec-head" style="margin-bottom:6px"><h2>Máximo rendimiento</h2></div>`;
  if (best) {
    const b = operate(p, best.n, st.sys, eng());
    const edge = best.n >= nMax(p) - 2 ? 'en el límite superior de velocidad' : best.n <= N_MIN + 2 ? 'en el límite inferior de velocidad' : 'el punto de trabajo coincide con el BEP';
    h2 += `<div class="big">${fmt(best.n)}<small>rpm</small></div><div class="chips">${chip(b.Q >= st.qt - 0.5 ? 'good' : 'warn', b.Q >= st.qt - 0.5 ? 'Cumple Q objetivo' : `Entrega ${fmt(b.Q)} m³/h`)}</div><dl>
      <dt>Rendimiento</dt><dd>${fmt(b.E, 1)} %</dd>
      <dt>Caudal</dt><dd>${fmt(b.Q)} m³/h</dd>
      <dt>Altura</dt><dd>${fmt(b.H, 1)} m</dd>
      <dt>Potencia al eje</dt><dd>${fmt(b.P)} kW</dd>
      <dt>Consumo por m³</dt><dd>${fmt(b.fuelM3 * 1000, 1)} mL/m³</dd></dl>
      <p class="muted" style="margin:8px 0 0;font-size:12px">Máximo ${edge}.</p>
      <button type="button" data-n="${best.n}">Ver a ${fmt(best.n)} rpm</button>`;
  } else h2 += `<p class="muted" style="margin:0">Esta bomba solo tiene curva H–Q; no se puede determinar el rendimiento.</p>`;
  $('optEff').innerHTML = h2;
  document.querySelectorAll('.opt button[data-n]').forEach(b => b.addEventListener('click', () => { st.n = Math.min(nMax(p), +b.dataset.n); render(); }));
}

// ---------- Gráficos ----------
const charts = {};
function baseOpts(xTitle, yTitle, extra = {}) {
  const ink2 = css('--ink-2'), ink3 = css('--ink-3'), grid = css('--grid');
  return {
    responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
    interaction: { mode: 'nearest', intersect: false, axis: 'x' },
    plugins: { legend: { display: false }, tooltip: {
      backgroundColor: css('--panel'), titleColor: css('--ink'), bodyColor: ink2, borderColor: css('--rule'), borderWidth: 1,
      titleFont: { weight: '600' }, bodyFont: { size: 11.5 }, padding: 8,
      filter: i => !i.dataset.noTip, ...(extra.tooltip || {}) } },
    scales: {
      x: { type: 'linear', title: { display: !!xTitle, text: xTitle, color: ink3, font: { size: 11.5 } }, grid: { color: grid }, border: { color: css('--rule') }, ticks: { color: ink3, font: { size: 10.5 }, callback: v => fmt(v) }, ...(extra.x || {}) },
      y: { type: 'linear', title: { display: !!yTitle, text: yTitle, color: ink3, font: { size: 11.5 } }, grid: { color: grid }, border: { color: css('--rule') }, ticks: { color: ink3, font: { size: 10.5 }, callback: v => fmt(v) }, beginAtZero: true, ...(extra.y || {}) },
    },
  };
}
// etiquetas directas al final de cada curva
const endLabels = {
  id: 'endLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, i) => {
      if (!ds.endLabel) return;
      const meta = chart.getDatasetMeta(i); if (meta.hidden || !meta.data.length) return;
      const pt = meta.data[ds.labelAt != null ? ds.labelAt : meta.data.length - 1]; if (!pt) return;
      ctx.save(); ctx.font = `${ds.labelBold ? '600 ' : ''}11px "Segoe UI", system-ui, sans-serif`; ctx.fillStyle = ds.labelColor || css('--ink-3');
      ctx.textAlign = ds.labelAlign || 'left'; ctx.textBaseline = 'middle';
      const area = chart.chartArea; let x = pt.x + (ds.labelDx ?? 6), y = pt.y + (ds.labelDy ?? 0);
      x = Math.min(x, area.right - 2); y = Math.max(area.top + 6, Math.min(area.bottom - 6, y));
      if (ctx.textAlign === 'left' && x + ctx.measureText(ds.endLabel).width > area.right) { ctx.textAlign = 'right'; x = area.right - 2; y -= 9; }
      ctx.fillText(ds.endLabel, x, y); ctx.restore();
    });
  }
};

function pumpCurve(p, n, step) {
  const r = n / p.n0, pts = [];
  const qEnd = p.qExt * r;
  for (let q = 0; q <= qEnd + 1e-6; q += step) pts.push({ x: q, y: r * r * p.h(q / r) });
  return pts;
}

function drawHQ(p, o) {
  const accent = css('--accent'), sys = css('--sys'), ink2 = css('--ink-2'), ink3 = css('--ink-3'), rule = css('--rule'), panel = css('--panel');
  const nTop = nMax(p);
  const qAxis = Math.max(p.qExt * nTop / p.n0, st.qt * 1.15);
  const step = qAxis / 160;
  const ds = [];
  const fam = [1200, 1400, 1600, 1800, 2000].filter(n => n <= nTop && Math.abs(n - st.n) > 70);
  fam.forEach(n => ds.push({ label: `${n} rpm`, data: pumpCurve(p, n, step), borderColor: rule, borderWidth: 1.25, pointRadius: 0, endLabel: `${n} rpm`, labelColor: ink3, labelAt: 3, labelDx: 2, labelDy: -9, segment: { borderDash: c => c.p1.parsed.x > p.qMax * n / p.n0 ? [3, 3] : undefined } }));
  // sistema
  const sysPts = []; for (let q = 0; q <= qAxis; q += step) sysPts.push({ x: q, y: hSys(q, st.sys) });
  ds.push({ label: 'Curva del sistema', data: sysPts, borderColor: sys, borderWidth: 2, pointRadius: 0, endLabel: 'Sistema', labelColor: ink2, labelBold: true });
  // lugar del BEP
  if (p.hasEff) {
    const kb = p.bepH / (p.bepQ * p.bepQ), b = []; for (let q = 0; q <= qAxis; q += step) b.push({ x: q, y: kb * q * q });
    ds.push({ label: 'Lugar geométrico del BEP', data: b, borderColor: ink3, borderWidth: 1, borderDash: [5, 4], pointRadius: 0, noTip: true });
  }
  // curva actual
  const r = st.n / p.n0;
  ds.push({ label: `${fmt(st.n)} rpm`, data: pumpCurve(p, st.n, step), borderColor: accent, borderWidth: 2.5, pointRadius: 0, endLabel: `${fmt(st.n)} rpm`, labelColor: accent, labelBold: true, labelAt: 3, labelDx: 2, labelDy: -9, segment: { borderDash: c => c.p1.parsed.x > p.qMax * r ? [5, 4] : undefined } });
  // BEP a rpm actual
  if (p.hasEff) ds.push({ label: 'BEP a esta rpm', data: [{ x: p.bepQ * r, y: p.bepH * r * r }], showLine: false, pointRadius: 5, pointStyle: 'rectRot', pointBackgroundColor: panel, pointBorderColor: accent, pointBorderWidth: 2 });
  // objetivo
  ds.push({ label: 'Q objetivo', data: [{ x: st.qt, y: 0 }, { x: st.qt, y: 1e4 }], borderColor: ink2, borderWidth: 1, borderDash: [2, 3], pointRadius: 0, noTip: true });
  // punto de trabajo
  if (o.ok) ds.push({ label: 'Punto de trabajo', data: [{ x: o.Q, y: o.H }], showLine: false, pointRadius: 7, pointHoverRadius: 8, pointBackgroundColor: accent, pointBorderColor: panel, pointBorderWidth: 2.5 });
  const yMax = Math.ceil(Math.max(p.H[0] * (nTop / p.n0) ** 2, hSys(st.qt, st.sys)) * 1.08 / 10) * 10;
  const opts = baseOpts('Caudal Q (m³/h)', 'Altura H (m)', { x: { min: 0, max: Math.ceil(qAxis / 100) * 100 }, y: { min: 0, max: yMax },
    tooltip: { callbacks: { title: it => `Q = ${fmt(it[0].parsed.x)} m³/h`, label: it => `${it.dataset.label}: ${fmt(it.parsed.y, 1)} m` } } });
  mk('cHQ', ds, opts);
  $('hqLegend').innerHTML = `<span><i class="sw" style="border-color:${accent}"></i>${p.name} a ${fmt(st.n)} rpm</span>
    <span><i class="sw" style="border-color:${rule};border-top-width:1.5px"></i>Otras velocidades</span>
    <span><i class="sw" style="border-color:${sys}"></i>Curva del sistema</span>
    ${p.hasEff ? `<span><i class="sw dash" style="border-color:${ink3}"></i>Lugar geométrico del BEP</span>` : ''}
    <span><i class="sw dash" style="border-color:${ink2};border-top-style:dotted"></i>Q objetivo ${fmt(st.qt)} m³/h</span>
    <span><i class="sw dot" style="background:${accent}"></i>Punto de trabajo</span>`;
  $('hqNote').textContent = `Referencia: ${fmt(p.n0)} rpm · tramo punteado = extrapolado`;
}

function mk(id, datasets, options) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), { type: 'line', data: { datasets }, options, plugins: [endLabels] });
}

function drawSide(p, sweep, tgt, best) {
  const accent = css('--accent'), ink2 = css('--ink-2'), ink3 = css('--ink-3'), panel = css('--panel');
  const nTop = nMax(p);
  const xs = { min: N_MIN, max: nTop };
  const cur = (yMax) => ({ label: 'rpm actual', data: [{ x: st.n, y: 0 }, { x: st.n, y: yMax }], borderColor: accent, borderWidth: 1, borderDash: [2, 3], pointRadius: 0, noTip: true });
  const tipN = { callbacks: { title: it => `${fmt(it[0].parsed.x)} rpm`, label: it => `${it.dataset.label}: ${fmt(it.parsed.y, it.dataset.dec ?? 0)} ${it.dataset.unit || ''}` } };
  const ok = sweep.filter(s => s.o.ok);
  // Q
  const qMaxY = Math.ceil(Math.max(st.qt * 1.2, ...ok.map(s => s.o.Q)) / 200) * 200;
  const dsQ = [{ label: 'Caudal', unit: 'm³/h', data: ok.map(s => ({ x: s.n, y: s.o.Q })), borderColor: accent, borderWidth: 2, pointRadius: 0,
      segment: { borderDash: c => sweep.find(s => s.n === c.p1.parsed.x)?.o.extrap ? [4, 3] : undefined } },
    { label: 'Q objetivo', unit: 'm³/h', data: [{ x: N_MIN, y: st.qt }, { x: nTop, y: st.qt }], borderColor: ink2, borderWidth: 1, borderDash: [2, 3], pointRadius: 0, noTip: true, endLabel: `${fmt(st.qt)}`, labelAt: 0, labelDx: 2, labelDy: -8, labelColor: ink2 },
    cur(qMaxY)];
  if (tgt.n && tgt.o.ok) dsQ.push({ label: 'rpm para Q objetivo', data: [{ x: tgt.n, y: st.qt }], showLine: false, pointRadius: 5, pointBackgroundColor: panel, pointBorderColor: accent, pointBorderWidth: 2, unit: 'm³/h' });
  mk('cQ', dsQ, baseOpts('', '', { x: xs, y: { min: 0, max: qMaxY }, tooltip: tipN }));
  const hasE = p.hasEff;
  $('bE').hidden = !hasE; $('eE').hidden = hasE; $('bP').hidden = !hasE; $('eP').hidden = hasE;
  if (hasE) {
    const dsE = [{ label: 'Rendimiento', unit: '%', dec: 1, data: ok.map(s => ({ x: s.n, y: s.o.E })), borderColor: accent, borderWidth: 2, pointRadius: 0 }, cur(100)];
    if (best) dsE.push({ label: 'Máximo', unit: '%', dec: 1, data: [{ x: best.n, y: best.E }], showLine: false, pointRadius: 5, pointStyle: 'rectRot', pointBackgroundColor: panel, pointBorderColor: accent, pointBorderWidth: 2 });
    const eMin = Math.max(0, Math.floor(Math.min(...ok.map(s => s.o.E)) / 10) * 10 - 10);
    mk('cE', dsE, baseOpts('', '', { x: xs, y: { min: eMin, max: 90, beginAtZero: false }, tooltip: tipN }));
    const e = eng(), avail = [], limit = [];
    for (let n = N_MIN; n <= nTop; n += 10) { avail.push({ x: n, y: enginePower(e, n) }); limit.push({ x: n, y: enginePower(e, n) * st.lim / 100 }); }
    const pY = Math.ceil(Math.max(...avail.map(a => a.y), ...ok.map(s => s.o.P)) * 1.1 / 50) * 50;
    mk('cP', [
      { label: 'Potencia al eje', unit: 'kW', data: ok.map(s => ({ x: s.n, y: s.o.P })), borderColor: accent, borderWidth: 2, pointRadius: 0, endLabel: 'Bomba', labelColor: accent, labelBold: true, labelDx: -4, labelAlign: 'right', labelDy: 10 },
      { label: 'Disponible motor', unit: 'kW', data: avail, borderColor: ink2, borderWidth: 1.5, pointRadius: 0, endLabel: 'Motor', labelAlign: 'right', labelDx: -4, labelDy: -9, labelColor: ink2 },
      { label: `Límite ${st.lim} %`, unit: 'kW', data: limit, borderColor: ink3, borderWidth: 1, borderDash: [4, 3], pointRadius: 0, endLabel: `Límite ${st.lim} %`, labelAt: 0, labelAlign: 'left', labelDx: 4, labelDy: -9, labelColor: ink3 },
      cur(pY)], baseOpts('Velocidad (rpm)', '', { x: xs, y: { min: 0, max: pY }, tooltip: tipN }));
  }
  $('sideLegend').innerHTML = `<span><i class="sw" style="border-color:${accent}"></i>${p.name}</span><span><i class="sw dash" style="border-color:${accent};border-top-style:dotted"></i>rpm actual (${fmt(st.n)})</span>`;
}

// ---------- Tablas ----------
function renderTable(p, sweep, tgt) {
  const steps = []; for (let n = N_MIN; n <= nMax(p); n += 100) steps.push(n);
  if (tgt.n && tgt.o.ok) steps.push(Math.round(tgt.n));
  if (!steps.includes(st.n)) steps.push(st.n);
  const rows = [...new Set(steps)].sort((a, b) => a - b).map(n => {
    const o = operate(p, n, st.sys, eng());
    const cls = [n === st.n ? 'cur' : '', tgt.n && Math.round(tgt.n) === n ? 'tgt' : ''].join(' ');
    if (!o.ok) return `<tr class="${cls}"><td>${fmt(n)}</td><td colspan="9" class="txt muted">${o.reason === 'fuera de curva' ? 'Punto fuera de la curva publicada' : 'No vence la altura estática'}</td></tr>`;
    const e = p.hasEff;
    const por = e ? (o.ratio >= POR[0] && o.ratio <= POR[1] ? '' : ' muted') : '';
    return `<tr class="${cls}"><td>${fmt(n)}</td><td>${fmt(o.Q)}${o.extrap ? '*' : ''}</td><td>${fmt(o.H, 1)}</td><td>${e ? fmt(o.E, 1) : '—'}</td><td class="${por}">${e ? fmt(o.ratio * 100) : '—'}</td><td>${e ? fmt(o.P) : '—'}</td><td>${e ? fmt(o.load * 100) : '—'}</td><td>${e ? fmt(o.fuel, 1) : '—'}</td><td>${e ? fmt(o.fuelM3 * 1000, 1) : '—'}</td><td>${o.npsh != null ? fmt(o.npsh, 1) : '—'}</td></tr>`;
  }).join('');
  $('tblRpm').innerHTML = `<thead><tr><th>rpm</th><th>Q<br>m³/h</th><th>H<br>m</th><th><span class="nc">η</span><br>%</th><th>Q/Q<sub>BEP</sub><br>%</th><th>P eje<br>kW</th><th>Carga<br>motor %</th><th>Gasoil<br>L/h</th><th>Gasoil<br>mL/m³</th><th>NPSHr<br>m</th></tr></thead><tbody>${rows}</tbody>`;
  $('tblNote').textContent = `${p.name} · * caudal en tramo extrapolado · fila resaltada: rpm actual`;
}

function renderCompare() {
  const e = eng();
  const rows = P_LIST.map(p => {
    const t = rpmForQ(p, st.qt, st.sys, N_MIN, nMax(p));
    const o = t.n ? operate(p, t.n, st.sys, e) : null;
    return { p, t, o };
  });
  const key = r => (!r.o || !r.o.ok) ? 1e9 : r.p.hasEff ? r.o.P : 1e8;
  rows.sort((a, b) => key(a) - key(b));
  const body = rows.map(({ p, t, o }) => {
    const sel = p.id === st.pump ? 'sel' : '';
    const name = `<td class="txt"><b>${p.name}</b><span class="sub">${p.detail} · ref. ${fmt(p.n0)} rpm${p.nmax ? ` · máx. ${fmt(p.nmax)}` : ''}</span></td>`;
    if (!o || !o.ok) {
      const msg = !t.n ? `No alcanza ${fmt(st.qt)} m³/h hasta ${fmt(nMax(p))} rpm` : 'El punto cae fuera de la curva publicada';
      return `<tr class="${sel}" data-id="${p.id}" tabindex="0">${name}<td>${t.n ? '≥ ' + fmt(t.n) : '—'}</td><td colspan="7" class="txt">${chip('bad', msg)}</td></tr>`;
    }
    const e2 = p.hasEff;
    return `<tr class="${sel}" data-id="${p.id}" tabindex="0">${name}<td>${fmt(t.n)}</td><td>${fmt(o.H, 1)}</td><td>${e2 ? fmt(o.E, 1) : '—'}</td><td>${e2 ? fmt(o.P) : '—'}</td><td>${e2 ? fmt(o.load * 100) : '—'}</td><td>${e2 ? fmt(o.fuel, 1) : '—'}</td><td>${e2 ? fmt(o.ratio * 100) : '—'}</td><td class="txt">${statusChips(p, o).filter(c => !c.includes('Carga motor') || c.includes('warn') || c.includes('bad')).join(' ')}</td></tr>`;
  }).join('');
  $('cmp').innerHTML = `<thead><tr><th>Bomba</th><th>rpm<br>requeridas</th><th>H<br>m</th><th><span class="nc">η</span><br>%</th><th>P eje<br>kW</th><th>Carga<br>motor %</th><th>Gasoil<br>L/h</th><th>Q/Q<sub>BEP</sub><br>%</th><th style="text-align:left">Estado</th></tr></thead><tbody>${body}</tbody>`;
  $('cmp').querySelectorAll('tbody tr').forEach(tr => {
    const go = () => { $('pump').value = tr.dataset.id; $('pump').dispatchEvent(new Event('change')); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    tr.addEventListener('click', go); tr.addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
  });
}

// ---------- Render ----------
function render() {
  const p = pump(), top = nMax(p);
  st.n = Math.max(N_MIN, Math.min(top, st.n));
  $('rpmR').max = top; $('rpmN').max = top; $('rpmR').value = st.n; $('rpmN').value = st.n;
  $('rpmHint').textContent = p.nmax ? `Rango ${fmt(N_MIN)}–${fmt(top)} rpm · máximo: ${p.nmaxNote.toLowerCase()}` : `Rango ${fmt(N_MIN)}–${fmt(top)} rpm (límite del motor)`;
  $('pumpDetail').textContent = `${p.detail} · ref. ${fmt(p.n0)} rpm`;
  $('engHint').textContent = `${eng().rating} · ${fmt(enginePower(eng(), st.n))} kW a ${fmt(st.n)} rpm`;
  $('tbQ').textContent = fmt(st.qt); $('tbH').textContent = fmt(st.sys.Hest, 1);
  const s = st.sys;
  $('formula').innerHTML = `H = ${fmt(s.Hest, 1)} + v₂²/2g + ${fmt(s.f, 3)}·(${fmt(s.L)}/${fmt(s.D1, 3)} + ${fmt(s.L)}/${fmt(s.D2, 3)})·v̄²/2g &nbsp;→&nbsp; H(${fmt(st.qt)} m³/h) = ${fmt(hSys(st.qt, s), 1)} m`;
  const o = operate(p, st.n, s, eng());
  const t = rpmForQ(p, st.qt, s, N_MIN, top);
  const tgt = { n: t.n, o: t.n ? operate(p, t.n, s, eng()) : { ok: false } };
  const best = rpmMaxEff(p, s, N_MIN, top);
  const sweep = []; for (let n = N_MIN; n <= top; n += 10) sweep.push({ n, o: operate(p, n, s, eng()) });
  renderSummary(p, o, tgt, best);
  drawHQ(p, o);
  drawSide(p, sweep, tgt, best);
  renderTable(p, sweep, tgt);
  renderCompare();
}

function boot() {
  $('sources').innerHTML = P_LIST.map(p => `<li><b>${p.name}:</b> ${p.src}.</li>`).join('') +
    `<li><b>Motor:</b> fichas Scania DC13 076A (IFN) y DC13 084A (ICFN), 331 kW / 450 hp.</li><li><b>Curva del sistema:</b> planilla “Curvas de bomba”, hoja “Bomba Cornell Nueva-usada”.</li>`;
  initControls(); render();
  let raf; const rerender = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerender);
  new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  
}
if (window.Chart) boot(); else window.addEventListener('load', boot);
