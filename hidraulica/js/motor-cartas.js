// ===== Cálculos hidráulicos · Motor de cartas de aspersión =====
// Equipos lineales Valley con alimentación central. Caudal m³/h, presión bar, largos m.
(function (root) {
  const PSI = 0.0689476, REG_MARGIN = 0.414, BAR_M = 0.0980665, G = 9.81;
  const ID_8 = 8.41, ID_6 = 6.42, ID_4 = 3.79, C_HW = 170;   // diámetros internos galvanizado (carta Valley J1)
  const TIP_4IN = 8.35;                                    // caño de 4" en la punta del voladizo (carta J1)
  const GAUGE = 1.22, LAST_COVER = 0.3;

  // Perfil del caño (largo de bajante, cm) en función de la posición relativa dentro del tramo — carta Valley J1
  const ARCH = {
    '8': [[0.022, 246], [0.063, 249], [0.105, 257], [0.146, 267], [0.187, 272], [0.229, 279], [0.269, 284], [0.311, 290], [0.352, 292], [0.393, 295], [0.434, 297], [0.5, 297], [0.558, 297], [0.599, 295], [0.64, 292], [0.681, 290], [0.723, 284], [0.764, 279], [0.805, 274], [0.847, 267], [0.888, 259], [0.929, 251], [0.97, 246]],
    '6': [[0.022, 249], [0.064, 257], [0.105, 269], [0.147, 279], [0.189, 290], [0.23, 300], [0.271, 307], [0.313, 312], [0.355, 318], [0.396, 323], [0.438, 325], [0.5, 325], [0.562, 325], [0.604, 323], [0.645, 318], [0.687, 312], [0.729, 307], [0.77, 300], [0.812, 290], [0.853, 279], [0.895, 269], [0.936, 257], [0.978, 249]],
    'OH': [[0.03, 236], [0.122, 246], [0.213, 254], [0.304, 264], [0.365, 269], [0.456, 279], [0.547, 290], [0.638, 297], [0.697, 305], [0.788, 312], [0.88, 323], [0.971, 330]],
  };
  const lin = (pts, x) => { if (x <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [a, ya] = pts[i - 1], [b, yb] = pts[i]; return ya + (yb - ya) * (x - a) / (b - a); } return pts[pts.length - 1][1]; };

  const BRANDS = {
    'I-WOB': { tabla: 'senninger', nombre: 'Senninger I-Wob', pmin: 6, pmax: 15, rec: 10 },
    'UP3': { tabla: 'senninger', nombre: 'Senninger UP3', pmin: 6, pmax: 15, rec: 10 },
    'UP3 chino': { tabla: 'senninger', nombre: 'UP3 (compatible)', pmin: 6, pmax: 15, rec: 10 },
    'S. SPRAY': { tabla: 'senninger', nombre: 'Senninger Super Spray', pmin: 6, pmax: 40, rec: 10 },
    'KOMET': { tabla: 'komet', nombre: 'Komet Twister M01 (KPT)', pmin: 6, pmax: 20, rec: 10 },
  };

  // Genera las salidas de un lado del equipo
  function buildSide(eq, li) {
    const spans = [], outs = []; let x = 0;
    for (const [n, d, L] of eq.lados[li]) for (let k = 0; k < n; k++) { spans.push({ n: String(spans.length + 1), d, L, start: x, end: x + L }); x += L; }
    spans.push({ n: 'OH', d: 'OH', L: eq.voladizo, start: x, end: x + eq.voladizo }); x += eq.voladizo;
    let c = 1;
    // Armado de campo (todos los equipos):
    // · 3 bajantes por caño, a 1,11 · 3,31 · 5,51 m de la brida (2,20 m entre bajantes); caño = largo del tramo / cantidad de caños.
    // · 1er caño del 1er tramo anulado (salida de la T) en ambas alas.
    // · Se anula el bajante junto a cada torre (2 por tramo); en cada torre una huella seca con 2 aspersores, uno a cada lado.
    // · Voladizo: 2 caños de 6 5/8" con 3 bajantes c/u + caño de 4" con 5 bajantes; drenaje en la punta.
    const OFF = [1.11, 3.31, 5.51], PIPE = 6.87;
    spans.forEach((s, si) => {
      if (s.d === 'OH') {
        for (let p = 0; p < 2; p++) OFF.forEach(o => { const xx = s.start + p * PIPE + o; outs.push({ x: xx, t: 'asp', span: si, drop: Math.round(lin(ARCH.OH, (xx - s.start) / s.L)) }); });
        const r0 = s.start + 2 * PIPE + 0.6, r1 = s.end - 0.74;
        for (let k = 0; k < 5; k++) { const xx = r0 + k * (r1 - r0) / 4; outs.push({ x: xx, t: 'asp', span: si, drop: Math.round(lin(ARCH.OH, (xx - s.start) / s.L)) }); }
        return;
      }
      const pipes = s.L < 51 ? 7 : 8, pitch = s.L / pipes;
      for (let p = 0; p < pipes; p++) {
        if (si === 0 && p === 0) continue;                       // caño anulado a la salida de la T
        OFF.forEach((o, j) => {
          if (p === 0 && j === 0) return;                        // anulado junto a la torre anterior
          if (p === pipes - 1 && j === 2) return;                // anulado junto a la torre siguiente (sale la huella seca)
          const xx = s.start + p * pitch + o;
          outs.push({ x: xx, t: 'asp', span: si, drop: Math.round(lin(ARCH[s.d], (xx - s.start) / s.L)) });
        });
      }
      // huella seca en la torre del final del tramo: un aspersor a cada lado de la torre
      outs.push({ x: s.end - 1.2, t: 'spray', span: si, drop: Math.round(lin(ARCH[s.d], 0.978)) });
      const nx = spans[si + 1];
      if (nx && nx.d !== 'OH') outs.push({ x: s.end + 1.2, t: 'spray', span: si + 1, drop: Math.round(lin(ARCH[nx.d], 0.022)) });
    });
    outs.sort((p, q) => p.x - q.x); outs.forEach(o => o.c = c++);
    outs.push({ c: c++, x: x - 0.31, t: 'drain', span: spans.length - 1, drop: null });
    const L8 = spans.filter(s => s.d === '8').reduce((a, s) => a + s.L, 0);
    const L6 = spans.filter(s => s.d === '6').reduce((a, s) => a + s.L, 0);
    const tip = Math.min(TIP_4IN, eq.voladizo / 3 * 1.0 > TIP_4IN ? TIP_4IN : eq.voladizo / 3);
    const pipes = [{ L: L8, id_in: ID_8 }, { L: L6 + eq.voladizo - tip, id_in: ID_6 }, { L: tip, id_in: ID_4 }];
    return { spans, outlets: outs, pipes, L: x };
  }

  const pipeAt = (pipes, x) => { let a = 0; for (const p of pipes) { a += p.L; if (x <= a + 1e-6) return p.id_in; } return pipes[pipes.length - 1].id_in; };
  const hw = (L, Q, Din) => (Q <= 0 || L <= 0) ? 0 : 10.67 * L * Math.pow(Q / 3600, 1.852) / (Math.pow(C_HW, 1.852) * Math.pow(Din * 0.0254, 4.87)) * BAR_M;
  const qNoz = (z, psi) => psi > 0 ? z.q10 / 1000 * Math.sqrt(psi / 10) : 0;

  // Carta de un lado: Qs caudal del lado, Pin presión en manómetro (bar), reg calibración (psi)
  function calcSide(side, tab, drainNoz, Qs, Pin, reg, tol = 0.005) {
    const outs = side.outlets.map(o => ({ ...o })), spans = side.spans;
    const regs = outs.filter(o => o.t !== 'drain'), drain = outs.find(o => o.t === 'drain');
    regs.forEach((o, i) => {
      const a = i === 0 ? o.x - (regs[1].x - o.x) / 2 : (regs[i - 1].x + o.x) / 2;
      const b = i === regs.length - 1 ? side.L + LAST_COVER : (o.x + regs[i + 1].x) / 2;
      o.cov = b - a;
    });
    const covTot = regs.reduce((s, o) => s + o.cov, 0);
    const regBar = reg * PSI, q = i => qNoz(tab[i], reg);
    let qDrain = qNoz(drainNoz, 10), res;
    for (let it = 0; it < 6; it++) {
      const qm = (Qs - qDrain) / covTot;
      regs.forEach(o => {
        o.rq = qm * o.cov;
        let bi = 0, e = Infinity;
        tab.forEach((z, i) => { if (z.half) return; const d = Math.abs(q(i) - o.rq); if (d < e) { e = d; bi = i; } });
        o.i = bi;
      });
      spans.forEach((s, si) => {   // ajuste del tramo con tamaños vecinos
        const g = regs.filter(o => o.span === si); if (!g.length) return;
        const rq = g.reduce((a, o) => a + o.rq, 0);
        for (let k = 0; k < g.length; k++) {
          const act = g.reduce((a, o) => a + q(o.i), 0), dev = (act - rq) / rq;
          if (Math.abs(dev) <= tol) break;
          const dir = dev < 0 ? 1 : -1; let cand = null, gain = 0;
          for (const o of g) {
            if (tab[o.i].half) continue;
            const j = o.i + dir; if (j < 0 || j >= tab.length) continue;
            const gg = Math.abs(act - rq) - Math.abs(act - q(o.i) + q(j) - rq);
            if (gg > gain + 1e-9) { gain = gg; cand = o; }
          }
          if (!cand) break;
          cand.i += dir;
        }
      });
      let lastDrop = regs[0].drop; outs.forEach(o => { if (o.drop) lastDrop = o.drop; o.z = lastDrop / 100; });
      const z0 = outs[0].z;
      let Pf = Pin, x = GAUGE, Q = Qs, minMargin = Infinity, worst = null;
      for (const o of outs) {
        Pf -= hw(o.x - x, Q, pipeAt(side.pipes, (x + o.x) / 2)); x = o.x;
        o.line = Pf - (o.z - z0) * BAR_M;
        if (o.t === 'drain') { o.noz = drainNoz; o.q = qNoz(drainNoz, Math.max(0, o.line) / PSI); }
        else {
          o.noz = tab[o.i]; o.pin = o.line + o.z * BAR_M; o.margin = o.pin - (regBar + REG_MARGIN);
          o.psp = o.margin >= 0 ? regBar : Math.max(0, Math.min(regBar, o.pin - 3 * PSI));
          o.q = qNoz(o.noz, o.psp / PSI);
          if (o.margin < minMargin) { minMargin = o.margin; worst = o; }
        }
        Q -= o.q;
      }
      res = { outs, regs, Qs, qDrain: drain.q, Pend: outs[outs.length - 1].line, minMargin, worst };
      if (Math.abs(drain.q - qDrain) < 1e-4) break;
      qDrain = drain.q;
    }
    res.spans = spans.map((s, si) => {
      const g = res.regs.filter(o => o.span === si), cnt = {};
      g.forEach(o => cnt[o.noz.id] = (cnt[o.noz.id] || 0) + 1);
      const rq = g.reduce((a, o) => a + o.rq, 0), act = g.reduce((a, o) => a + o.q, 0);
      return { ...s, rq, act, dev: rq ? (act - rq) / rq : 0, cnt, k: g.length };
    });
    res.overMax = res.regs.filter(o => o.i === tab.length - 1 && o.rq > qNoz(tab[o.i], reg) * 1.02).length;
    res.underMin = res.regs.filter(o => o.i === 0 && o.rq < qNoz(tab[0], reg) * 0.98).length;
    res.count = {}; res.regs.forEach(o => res.count[o.noz.id] = (res.count[o.noz.id] || 0) + 1);
    res.Qact = res.regs.reduce((a, o) => a + o.q, 0) + res.qDrain;
    res.PinReq = Pin - res.minMargin;
    return res;
  }

  // Carta completa del equipo (los dos lados). Si Pin es null, calcula con la presión mínima de entrada.
  function carta(eq, TABLAS, { Q, Pin = null, reg = 10 }) {
    const brand = BRANDS[eq.marca] || BRANDS['I-WOB'];
    const tab = TABLAS[brand.tabla];
    const drainNoz = brand.tabla === 'komet' ? tab.find(z => z.d128 === 42) : tab.find(z => z.d128 === 42);
    const sides = [0, 1].map(li => buildSide(eq, li));
    const Ltot = sides[0].L + sides[1].L;
    const run = P => sides.map(sd => calcSide(sd, tab, drainNoz, Q * sd.L / Ltot, P, reg));
    let r = run(5);                                     // presión alta: todos regulan → presión mínima
    const PinReq = Math.max(...r.map(x => x.PinReq));
    const Puse = Pin == null ? PinReq : Pin;
    r = run(Puse);
    const count = {}; r.forEach(x => Object.entries(x.count).forEach(([k, v]) => count[k] = (count[k] || 0) + v));
    return { eq, brand, tab, sides, res: r, PinReq, overMax: r.reduce((a, x) => a + x.overMax, 0), underMin: r.reduce((a, x) => a + x.underMin, 0), Pin: Puse, ok: Math.min(...r.map(x => x.minMargin)) >= -1e-9, count, Qact: r.reduce((a, x) => a + x.Qact, 0), reg };
  }

  function regulatorStudy(eq, TABLAS, Q, Pin) {
    const brand = BRANDS[eq.marca] || BRANDS['I-WOB'];
    return [6, 10, 15, 20].map(reg => {
      const c = carta(eq, TABLAS, { Q, Pin, reg });
      const idx = Object.keys(c.count).map(id => c.tab.findIndex(z => z.id === id));
      return { reg, PinReq: c.PinReq, ok: Pin == null ? true : Pin >= c.PinReq - 1e-9, inRange: reg >= brand.pmin && reg <= brand.pmax,
        nMin: c.tab[Math.min(...idx)], nMax: c.tab[Math.max(...idx)] };
    });
  }

  // Lámina y tiempos según % de avance (timer)
  function lamina(eq, Q, v100) {
    const mm100 = Q / (eq.ancho * v100 * 60) * 1000;
    const h100 = eq.recorrido / (v100 * 60);
    return { mm100, h100, rows: [100, 90, 80, 70, 60, 50, 45, 40, 35, 30, 25, 20, 15, 10, 5].map(p => ({ p, mm: mm100 * 100 / p, h: h100 * 100 / p })) };
  }

  // ===================== Modo "según carta Valley" =====================
  // Usa el armado de la carta oficial (posición y modelo de cada salida) y la tabla de caudales de Valley.
  // Con el caudal de la carta reproduce sus boquillas; con otro caudal escala el caudal de cada salida y
  // elige la boquilla más cercana del mismo modelo, ajustando cada tramo a ±0,5 %.
  const VMODELS = {
    IW: { nombre: 'Senninger I-Wob', pmin: 6, pmax: 15, rec: 10, r: n => n <= 18 ? 1.022 : 1.022 - 0.0155 * (n - 18) },
    UP3: { nombre: 'Senninger I-Wob UP3', pmin: 6, pmax: 15, rec: 10, r: n => 1.061 * (n <= 18 ? 1.022 : 1.022 - 0.0155 * (n - 18)) },
    SS: { nombre: 'Senninger Super Spray', pmin: 6, pmax: 40, rec: 10, r: n => 1.008 - 0.0127 * (n - 18.5) },
    D: { nombre: 'Senninger Directional', pmin: 6, pmax: 40, rec: 10, r: () => 1.01 },
  };
  const VCORTO = { IW: 'I-Wob', UP3: 'I-Wob UP3', SS: 'Super Spray', D: 'Directional' };
  const vTabCache = {};
  function vTab(TABLAS, m) {               // tabla de un modelo: nº 11 a 26 cada medio número, L/h a 10 psi
    if (vTabCache[m]) return vTabCache[m];
    const t = TABLAS.senninger.filter(z => z.d128 >= 22 && z.d128 <= 52).map(z => {
      const n = z.d128 / 2;
      return { id: m + n, label: '#' + String(n).replace('.', ','), n, d128: z.d128, color: z.color, half: z.half, modelo: VCORTO[m], m, q10: Math.round(z.q10 * VMODELS[m].r(n)) };
    });
    return (vTabCache[m] = t);
  }
  const archOf = (s, x) => lin(ARCH[s.d], Math.min(1, Math.max(0, (x - s.start) / s.L)));

  function valleyChart(eq) {
    const V = root.HID_VALLEY || {}, map = root.HID_VALLEY_MAP || {};
    return V[eq.id] || V[map[eq.id]] || null;
  }

  function cartaValley(eq, TABLAS, { Q, Pin = null, reg = 10, tol = 0.005 }) {
    const ch = valleyChart(eq); if (!ch) return null;
    const k = Q / ch.Q, regBar = reg * PSI;
    const tabs = { main: vTab(TABLAS, ch.main), D: vTab(TABLAS, 'D') };
    const tab = [...tabs.main, ...tabs.D];
    const lados = [ch.lados[0], ch.lados[1] || ch.lados[0]];
    // armado de cada lado
    const sides = lados.map(ld => {
      const spans = []; let a = 0, acc = 0;
      const pipeD = x => { let s = 0; for (const p of ld.pipes) { s += p[0]; if (x <= s + 1e-6) return p[1]; } return ld.pipes[ld.pipes.length - 1][1]; };
      [...ld.torres, ld.fin].forEach((b, i) => {
        const oh = i === ld.torres.length, mid = (a + b) / 2, D = pipeD(mid);
        spans.push({ n: oh ? 'OH' : String(i + 1), d: oh ? 'OH' : D > 7 ? '8' : '6', L: b - a, start: a, end: b }); a = b;
      });
      const spanOf = x => { const i = spans.findIndex(s => x <= s.end + 1e-6); return i < 0 ? spans.length - 1 : i; };
      const outs = ld.o.map(([x, t, n], i) => {
        const si = spanOf(x), m = t === '/' ? 'main' : 'D', z0 = tabs[m].find(z => z.n === n) || tabs[m][tabs[m].length - 1];
        return { c: i + 1, x, t: t === '/' ? 'asp' : t === 'D' ? 'dir' : 'drain', m, span: si, n0: n, z0, drop: t === 'X' ? null : Math.round(archOf(spans[si], x)) };
      });
      return { spans, outlets: outs, pipes: ld.pipes.map(p => ({ L: p[0], id_in: p[1], C: p[2] })), L: ld.fin };
    });

    function calc(side, P) {
      const outs = side.outlets.map(o => ({ ...o })), spans = side.spans;
      const regs = outs.filter(o => o.t !== 'drain'), drains = outs.filter(o => o.t === 'drain');
      const qAt = z => qNoz(z, reg);
      // caudal objetivo de cada salida: el de la carta escalado
      regs.forEach(o => {
        o.rq = qNoz(o.z0, 10) * k;
        const T = tabs[o.m]; let bi = 0, e = Infinity;
        T.forEach((z, i) => { const d = Math.abs(qAt(z) - o.rq); if (d < e - 1e-12) { e = d; bi = i; } });
        o.i = bi; o.T = T;
      });
      if (Math.abs(k - 1) > 1e-9 || reg !== 10) spans.forEach((s, si) => {
        const g = regs.filter(o => o.span === si); if (!g.length) return;
        const rq = g.reduce((a, o) => a + o.rq, 0);
        for (let it = 0; it < g.length; it++) {
          const act = g.reduce((a, o) => a + qAt(o.T[o.i]), 0), dev = (act - rq) / rq;
          if (Math.abs(dev) <= tol) break;
          const dir = dev < 0 ? 1 : -1; let cand = null, gain = 0;
          for (const o of g) {
            const j = o.i + dir; if (j < 0 || j >= o.T.length) continue;
            const gg = Math.abs(act - rq) - Math.abs(act - qAt(o.T[o.i]) + qAt(o.T[j]) - rq);
            if (gg > gain + 1e-9) { gain = gg; cand = o; }
          }
          if (!cand) break;
          cand.i += dir;
        }
      });
      let lastDrop = regs[0].drop; outs.forEach(o => { if (o.drop) lastDrop = o.drop; o.z = lastDrop / 100; });
      const z0 = outs[0].z;
      let Pf = P, x = GAUGE, minMargin = Infinity, worst = null;
      const drainQ = o => qNoz(o.z0, Math.max(0, o.line) / PSI);
      // caudal de paso: suma de lo que sale aguas abajo (iterado una vez para el drenaje)
      regs.forEach(o => { o.noz = o.T[o.i]; o.q = qAt(o.noz); });
      drains.forEach(o => { o.noz = o.z0; o.q = qNoz(o.z0, 10); });
      for (let pass = 0; pass < 3; pass++) {
        let Qp = outs.reduce((a, o) => a + o.q, 0); Pf = P; x = GAUGE; minMargin = Infinity; worst = null;
        for (const o of outs) {
          Pf -= hw(o.x - x, Qp, pipeAt(side.pipes, (x + o.x) / 2)); x = o.x;
          o.line = Pf - (o.z - z0) * BAR_M;
          if (o.t === 'drain') o.q = drainQ(o);
          else {
            o.pin = o.line + o.z * BAR_M; o.margin = o.pin - (regBar + REG_MARGIN);
            o.psp = o.margin >= 0 ? regBar : Math.max(0, Math.min(regBar, o.pin - 3 * PSI));
            o.q = qNoz(o.noz, o.psp / PSI);
            if (o.margin < minMargin) { minMargin = o.margin; worst = o; }
          }
          Qp -= o.q;
        }
      }
      const res = { outs, regs, Qs: outs.reduce((a, o) => a + o.q, 0), qDrain: drains.reduce((a, o) => a + o.q, 0), Pend: outs[outs.length - 1].line, minMargin, worst, drains };
      res.spans = spans.map((s, si) => {
        const g = regs.filter(o => o.span === si), cnt = {};
        g.forEach(o => cnt[o.noz.id] = (cnt[o.noz.id] || 0) + 1);
        const rq = g.reduce((a, o) => a + o.rq, 0), act = g.reduce((a, o) => a + o.q, 0);
        return { ...s, rq, act, dev: rq ? (act - rq) / rq : 0, cnt, k: g.length };
      });
      res.overMax = regs.filter(o => o.i === o.T.length - 1 && o.rq > qAt(o.noz) * 1.02).length;
      res.underMin = regs.filter(o => o.i === 0 && o.rq < qAt(o.noz) * 0.98).length;
      res.count = {}; regs.forEach(o => res.count[o.noz.id] = (res.count[o.noz.id] || 0) + 1);
      res.cambios = regs.filter(o => o.noz.n !== o.n0).length;
      res.Qact = regs.reduce((a, o) => a + o.q, 0) + res.qDrain;
      res.PinReq = P - minMargin;
      return res;
    }
    let r = sides.map(sd => calc(sd, 6));
    const PinReq = Math.max(...r.map(x => x.PinReq));
    const Puse = Pin == null ? PinReq : Pin;
    r = sides.map(sd => calc(sd, Puse));
    const count = {}; r.forEach(x => Object.entries(x.count).forEach(([id, v]) => count[id] = (count[id] || 0) + v));
    const b = VMODELS[ch.main];
    return { eq, modo: 'valley', chart: ch, k, brand: { nombre: b.nombre, pmin: b.pmin, pmax: b.pmax, rec: b.rec }, tab, sides, res: r, PinReq, Pin: Puse,
      ok: Math.min(...r.map(x => x.minMargin)) >= -1e-9, count, Qact: r.reduce((a, x) => a + x.Qact, 0), reg,
      overMax: r.reduce((a, x) => a + x.overMax, 0), underMin: r.reduce((a, x) => a + x.underMin, 0), cambios: r.reduce((a, x) => a + x.cambios, 0) };
  }

  function regulatorStudyValley(eq, TABLAS, Q, Pin) {
    return [6, 10, 15, 20].map(reg => {
      const c = cartaValley(eq, TABLAS, { Q, Pin, reg });
      const ns = c.res.flatMap(r => r.regs.filter(o => o.m === 'main').map(o => o.noz));
      ns.sort((a, b) => a.n - b.n);
      return { reg, PinReq: c.PinReq, ok: Pin == null ? true : Pin >= c.PinReq - 1e-9, inRange: reg >= c.brand.pmin && reg <= c.brand.pmax, nMin: ns[0], nMax: ns[ns.length - 1] };
    });
  }

  const api = { PSI, REG_MARGIN, BRANDS, VMODELS, buildSide, calcSide, carta, cartaValley, valleyChart, regulatorStudy, regulatorStudyValley, lamina, qNoz };
  root.HIDcartas = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
