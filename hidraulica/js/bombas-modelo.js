// ===== Modelo hidráulico: curvas de bomba, afinidad, sistema, motor =====
const G = 9.81;

// Interpolación cúbica monótona (Fritsch–Carlson)
function makeInterp(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const dEnd = (ys[n - 1] - ys[n - 2]) / (xs[n - 1] - xs[n - 2]);
  const f = x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1] + dEnd * (x - xs[n - 1]); // extrapolación lineal (acotada por el llamador)
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
  f.min = xs[0]; f.max = xs[n - 1];
  return f;
}

function preparePump(p) {
  p.h = makeInterp(p.Q, p.H);
  p.qMax = p.Q[p.Q.length - 1];
  p.qExt = p.qMax * 1.15; // tramo extrapolado admitido
  p.hasEff = p.kind === 'full';
  if (p.hasEff) {
    p.e = makeInterp(p.EQ || p.Q, p.E);
    p.p = makeInterp(p.Q, p.P);
    // BEP a velocidad de referencia
    let best = 0, qb = 0;
    for (let q = 0; q <= p.qMax; q += p.qMax / 400) { const e = p.e(q); if (e > best) { best = e; qb = q; } }
    p.bepQ = qb; p.bepE = best; p.bepH = p.h(qb);
  }
  if (p.NQ) p.npsh = makeInterp(p.NQ, p.N);
  return p;
}

// Curva del sistema — modelo de la planilla (hoja "Bomba Cornell Nueva-usada")
// H = Hest + v2²/2g + f·(L/D1 + L/D2)·v̄²/2g ; v1 = (Q/alas)/A1 ; v2 = (fq·Q/alas)/A2 ; v̄ = (v1+v2)/2
function hSys(Q, s) {
  const A1 = Math.PI * s.D1 * s.D1 / 4, A2 = Math.PI * s.D2 * s.D2 / 4;
  const v1 = Q / s.alas / A1 / 3600, v2 = s.fq * Q / s.alas / A2 / 3600, vb = (v1 + v2) / 2;
  return s.Hest + v2 * v2 / (2 * G) + s.f * (s.L / s.D1 + s.L / s.D2) * vb * vb / (2 * G);
}

// Motores Scania DC13 450 hp — fichas Scania
const ENGINES = {
  '076A': { name: 'Scania DC13 076A · 331 kW (IFN)', rating: 'IFN · servicio intermitente', n: [1200, 1500, 1800, 2100], P: [229, 307, 331, 331], sfc: [183, 203, 213, 225] },
  '084A': { name: 'Scania DC13 084A · 331 kW (ICFN)', rating: 'ICFN · servicio continuo', n: [1200, 1500, 1800, 2100], P: [278, 331, 331, 331], sfc: [194, 194, 200, 213] },
};
function lin(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let i = 0; while (x > xs[i + 1]) i++;
  return ys[i] + (ys[i + 1] - ys[i]) * (x - xs[i]) / (xs[i + 1] - xs[i]);
}
function enginePower(eng, n) { // kW disponibles; debajo de 1200 rpm: par constante
  return n < eng.n[0] ? eng.P[0] * n / eng.n[0] : lin(eng.n, eng.P, n);
}
function fuelLh(eng, n, Pkw) { // estimación: CEC de plena carga + 10 % a carga nula (lineal)
  const load = Math.max(0.3, Math.min(1, Pkw / enginePower(eng, n)));
  const sfc = lin(eng.n, eng.sfc, n) * (1 + 0.10 * (1 - load));
  return Pkw * sfc / 1000 / 0.84; // densidad gasoil 0,84 kg/L
}

// Punto de trabajo de la bomba a n rpm contra el sistema
function operate(p, n, s, eng) {
  const r = n / p.n0, qMax = p.qExt * r;
  const hp = q => r * r * p.h(q / r);
  const g = q => hp(q) - hSys(q, s);
  const out = { n, r, qMax, ok: false };
  if (g(0) <= 0) { out.reason = 'sin caudal'; return out; }
  if (g(qMax) > 0) { out.reason = 'fuera de curva'; out.Q = qMax; out.beyond = true; return out; }
  let a = 0, b = qMax;
  for (let i = 0; i < 60; i++) { const m = (a + b) / 2; g(m) > 0 ? a = m : b = m; }
  const Q = (a + b) / 2;
  Object.assign(out, { ok: true, Q, H: hSys(Q, s), extrap: Q / r > p.qMax + 1e-6 });
  if (p.hasEff) {
    out.E = p.e(Q / r);
    out.P = r * r * r * p.p(Q / r);
    out.Qbep = p.bepQ * r;
    out.ratio = Q / out.Qbep;
    if (eng) {
      out.Pav = enginePower(eng, n);
      out.load = out.P / out.Pav;
      out.fuel = fuelLh(eng, n, out.P);
      out.fuelM3 = out.fuel / Q;
      out.kWhM3 = out.P / Q;
    }
  }
  if (p.npsh) {
    const qr = Q / r;
    out.npsh = (qr >= p.npsh.min * 0.98 && qr <= p.npsh.max) ? r * r * p.npsh(qr) : null;
  }
  return out;
}

// rpm necesarias para entregar Qt (búsqueda hasta nLimit)
function rpmForQ(p, Qt, s, lo, hi) {
  const q = n => { const o = operate(p, n, s); return o.ok ? o.Q : (o.beyond ? o.qMax : 0); }; // fuera de curva: cota inferior
  if (q(hi) < Qt) return { n: null, reachable: false };
  if (q(lo) >= Qt) return { n: lo, reachable: true, atMin: true };
  let a = lo, b = hi;
  for (let i = 0; i < 50; i++) { const m = (a + b) / 2; q(m) >= Qt ? b = m : a = m; }
  return { n: b, reachable: true };
}

// rpm de máximo rendimiento en el punto de trabajo
function rpmMaxEff(p, s, lo, hi) {
  if (!p.hasEff) return null;
  let best = null;
  for (let n = lo; n <= hi + 1e-9; n += 2) {
    const o = operate(p, n, s);
    if (o.ok && (!best || o.E > best.E)) best = { n, E: o.E };
  }
  return best;
}

if (typeof module !== 'undefined') module.exports = { makeInterp, preparePump, hSys, ENGINES, enginePower, fuelLh, operate, rpmForQ, rpmMaxEff };
