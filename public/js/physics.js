// Billiard-Physik: deterministisch (nur + - * / und sqrt in der Schleife), Einheiten: cm und Sekunden.
// Wird vom Spiel (Animation) und vom Server (Schiedsrichter) identisch benutzt.
// Modell: Gleiten und Rollen mit Reibung (Vorlauf/Rückläufer/Stoppball entstehen von selbst), Seiteneffet (wz),
// Kugel-Kugel-Stoß mit Reibung ("Throw"), Banden mit Reibung und Seitendrall, Taschenkanten als Rundungen.

export const R = 2.85;            // Kugelradius
export const HX = 127, HY = 63.5; // halbe Spielfläche (Bandenkante zu Bandenkante, 9-Fuß-Tisch)
export const DT = 0.001;          // Schrittweite
export const VMAX = 800;          // größte Anstoßgeschwindigkeit (cm/s)
export const FRAME_STEPS = 16;    // Aufzeichnung alle 16 ms

const G = 981, MU_S = 0.2, MU_R = 0.013, MU_B = 0.045, MU_C = 0.18, E_B = 0.96;
const WZ_DAMP = 1 - 0.0007;       // Seitendrall klingt langsam ab
const V_STOP = 0.8;               // darunter bleibt eine rollende Kugel liegen

// Taschen: Eck-Taschenmaul ca. 12,7 cm, Seiten-Taschenmaul ca. 13,6 cm Spitze zu Spitze (Kugel: 5,7 cm) – wie ein echter Tisch
export const CK = 10.0, SK = 7.2;
export const POCKETS = [
  { x: -HX - 1.5, y: -HY - 1.5, r: 7.4, c: 1 }, { x: 0, y: -HY - 2, r: 5.4, c: 0 }, { x: HX + 1.5, y: -HY - 1.5, r: 7.4, c: 1 },
  { x: -HX - 1.5, y: HY + 1.5, r: 7.4, c: 1 }, { x: 0, y: HY + 2, r: 5.4, c: 0 }, { x: HX + 1.5, y: HY + 1.5, r: 7.4, c: 1 },
];
// Mittelpunkte der Taschenöffnungen (für die Anzeige; Index wie POCKETS)
export const POCKET_MOUTH = [
  { x: -HX, y: -HY }, { x: 0, y: -HY }, { x: HX, y: -HY },
  { x: -HX, y: HY }, { x: 0, y: HY }, { x: HX, y: HY },
];
// Zielpunkt für saubere Stöße: Mitte des Taschenmauls (nicht die Bandenecke, dort stößt die Kugel an die Taschenkante)
export const POCKET_AIM = [
  { x: -(HX - 3.5), y: -(HY - 3.5) }, { x: 0, y: -HY }, { x: HX - 3.5, y: -(HY - 3.5) },
  { x: -(HX - 3.5), y: HY - 3.5 }, { x: 0, y: HY }, { x: HX - 3.5, y: HY - 3.5 },
];
const RK = R + 1.0;
const KNUCKLES = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
  KNUCKLES.push({ x: sx * (HX - CK), y: sy * HY }, { x: sx * HX, y: sy * (HY - CK) }, { x: sx * SK, y: sy * HY });
}

export class Sim {
  constructor() {
    this.x = new Float64Array(16); this.y = new Float64Array(16);
    this.vx = new Float64Array(16); this.vy = new Float64Array(16);
    this.wx = new Float64Array(16); this.wy = new Float64Array(16); this.wz = new Float64Array(16);
    this.on = new Uint8Array(16);
    this.t = 0;
    this.rec = null;
  }
  clone() { const s = new Sim(); s.copyFrom(this); return s; }
  copyFrom(o) {
    this.x.set(o.x); this.y.set(o.y); this.vx.set(o.vx); this.vy.set(o.vy);
    this.wx.set(o.wx); this.wy.set(o.wy); this.wz.set(o.wz); this.on.set(o.on); this.t = o.t;
  }
  put(i, x, y) { this.x[i] = x; this.y[i] = y; this.vx[i] = this.vy[i] = this.wx[i] = this.wy[i] = this.wz[i] = 0; this.on[i] = 1; }
  remove(i) { this.on[i] = 0; this.vx[i] = this.vy[i] = this.wx[i] = this.wy[i] = this.wz[i] = 0; }
  moving() {
    for (let i = 0; i < 16; i++) if (this.on[i] && (this.vx[i] !== 0 || this.vy[i] !== 0 || Math.abs(this.wz[i]) > 0.3)) return true;
    return false;
  }
  // Stabile Prüfsumme des Endzustands (Vergleich zwischen Server und Spielern)
  hash() {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < 16; i++) {
      const v = this.on[i] ? [Math.round(this.x[i] * 100), Math.round(this.y[i] * 100)] : [-99999, i];
      for (const n of v) { h ^= (n | 0) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
    }
    return h.toString(16);
  }
  // Stoß auf die Weiße: Geschwindigkeit (vx,vy) und Drall (wx,wy,wz) wurden vorher berechnet (siehe cueShot)
  apply(shot) {
    this.vx[0] = shot.vx; this.vy[0] = shot.vy; this.wx[0] = shot.wx; this.wy[0] = shot.wy; this.wz[0] = shot.wz;
  }

  step(st) {
    const x = this.x, y = this.y, vx = this.vx, vy = this.vy, wx = this.wx, wy = this.wy, wz = this.wz, on = this.on;
    // 1) Bewegung mit Gleit- und Rollreibung
    for (let i = 0; i < 16; i++) {
      if (!on[i]) continue;
      let svx = vx[i], svy = vy[i];
      const moving = svx !== 0 || svy !== 0;
      if (moving) {
        const ux = svx - R * wy[i], uy = svy + R * wx[i];
        const us = Math.sqrt(ux * ux + uy * uy);
        if (us > 1.0) {
          // gleitet: Reibung bremst die Bewegung und dreht die Kugel in Richtung Rollen
          let dt = DT; const full = 3.5 * MU_S * G;
          if (us < full * dt) dt = us / full;
          const fx = ux / us, fy = uy / us, a = MU_S * G * dt, b = (5 * MU_S * G / (2 * R)) * dt;
          svx -= a * fx; svy -= a * fy;
          wx[i] -= b * fy; wy[i] += b * fx;
        } else {
          // rollt
          wy[i] = svx / R; wx[i] = -svy / R;
          const sp = Math.sqrt(svx * svx + svy * svy), ns = sp - MU_R * G * DT;
          if (ns <= V_STOP) { svx = 0; svy = 0; wx[i] = 0; wy[i] = 0; }
          else { const k = ns / sp; svx *= k; svy *= k; wy[i] = svx / R; wx[i] = -svy / R; }
        }
        vx[i] = svx; vy[i] = svy;
        x[i] += svx * DT; y[i] += svy * DT;
      } else {
        wx[i] = 0; wy[i] = 0;
      }
      if (wz[i] !== 0) { wz[i] *= WZ_DAMP; if (wz[i] < 0.3 && wz[i] > -0.3 && !moving) wz[i] = 0; }
    }
    // 2) Banden und Taschenkanten
    for (let i = 0; i < 16; i++) {
      if (!on[i]) continue;
      const px = x[i], py = y[i];
      if (py > HY - R) { if ((px > SK && px < HX - CK) || (px < -SK && px > -(HX - CK))) { y[i] = HY - R; this.rail(i, 0, 1, st); } }
      else if (py < -HY + R) { if ((px > SK && px < HX - CK) || (px < -SK && px > -(HX - CK))) { y[i] = -HY + R; this.rail(i, 0, -1, st); } }
      if (px > HX - R) { if (py > -(HY - CK) && py < HY - CK) { x[i] = HX - R; this.rail(i, 1, 0, st); } }
      else if (px < -HX + R) { if (py > -(HY - CK) && py < HY - CK) { x[i] = -HX + R; this.rail(i, -1, 0, st); } }
      if (Math.abs(x[i]) > HX - 14 || Math.abs(y[i]) > HY - 14) this.knuckles(i, st);
    }
    // 3) Kugel-Kugel (mehrere Durchgänge für Haufen beim Anstoß)
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < 15; i++) {
        if (!on[i]) continue;
        for (let j = i + 1; j < 16; j++) {
          if (!on[j]) continue;
          const dx = x[j] - x[i], dy = y[j] - y[i], d2 = dx * dx + dy * dy;
          if (d2 >= 4 * R * R) continue;
          this.ballHit(i, j, dx, dy, d2, st);
        }
      }
    }
    // 4) Taschen (auch eine Kugel, die schon hinter der Bandenlinie liegt, ist durch das Maul gekommen und fällt)
    for (let i = 0; i < 16; i++) {
      if (!on[i]) continue;
      const past = Math.abs(x[i]) > HX + 0.5 || Math.abs(y[i]) > HY + 0.5;
      for (let p = 0; p < 6; p++) {
        const P = POCKETS[p], dx = x[i] - P.x, dy = y[i] - P.y;
        if (dx * dx + dy * dy < P.r * P.r || (past && (x[i] * P.x >= 0 || P.x === 0) && (y[i] * P.y >= 0) && dx * dx + dy * dy < 20 * 20)) {
          if (st) { st.pocketed.push({ b: i, p, t: this.t }); st.events.push({ k: 'pocket', t: this.t, a: i, p, s: Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]) }); }
          this.remove(i);
          break;
        }
      }
    }
    this.t += DT;
  }

  rail(i, nx, ny, st) {
    const vx = this.vx, vy = this.vy;
    const vn = vx[i] * nx + vy[i] * ny;
    if (vn <= 0) return;
    const tx = -ny, ty = nx, vt = vx[i] * tx + vy[i] * ty;
    let e = 0.82 - 0.0004 * vn; if (e < 0.5) e = 0.5;
    const jn = (1 + e) * vn;
    let jt = -(vt + R * this.wz[i]) / 3.5; const lim = MU_C * jn;
    if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
    vx[i] += -jn * nx + jt * tx; vy[i] += -jn * ny + jt * ty;
    this.wz[i] += 2.5 * jt / R;
    if (st) {
      if (vn > 4) st.events.push({ k: 'rail', t: this.t, a: i, s: vn });
      if (st.first >= 0) st.railAfter = true;
      if (i !== 0) st.railMask |= (1 << i);
    }
  }

  knuckles(i, st) {
    const x = this.x, y = this.y, vx = this.vx, vy = this.vy;
    for (let k = 0; k < KNUCKLES.length; k++) {
      const K = KNUCKLES[k], dx = x[i] - K.x, dy = y[i] - K.y, d2 = dx * dx + dy * dy;
      if (d2 >= RK * RK || d2 === 0) continue;
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = vx[i] * nx + vy[i] * ny;
      x[i] = K.x + nx * RK; y[i] = K.y + ny * RK;
      if (vn < 0) {
        const e = 0.6; vx[i] -= (1 + e) * vn * nx; vy[i] -= (1 + e) * vn * ny;
        if (st) { if (-vn > 4) st.events.push({ k: 'rail', t: this.t, a: i, s: -vn }); if (st.first >= 0) st.railAfter = true; if (i !== 0) st.railMask |= (1 << i); }
      }
    }
  }

  ballHit(i, j, dx, dy, d2, st) {
    const x = this.x, y = this.y, vx = this.vx, vy = this.vy, wz = this.wz;
    // Genauer Berührungszeitpunkt: die Kugeln stecken schon bis zu einem Schritt ineinander. Wir rechnen zurück bis zur
    // Berührung, stoßen dort (richtige Stoßrichtung, auch bei schnellen Stößen) und laufen den Rest des Schritts weiter.
    const rvx = vx[i] - vx[j], rvy = vy[i] - vy[j], bq = dx * rvx + dy * rvy, aq = rvx * rvx + rvy * rvy;
    const vix = vx[i], viy = vy[i], vjx = vx[j], vjy = vy[j];
    let tau = 0;
    if (aq > 1e-9 && bq > 0) { const disc = bq * bq - aq * (d2 - 4 * R * R); if (disc >= 0) tau = (-bq + Math.sqrt(disc)) / aq; if (!(tau > 0)) tau = 0; if (tau > 2 * DT) tau = 2 * DT; }
    let ex = dx + rvx * tau, ey = dy + rvy * tau; const el2 = ex * ex + ey * ey;
    const d = el2 > 0 ? Math.sqrt(el2) : 1e-9;
    const nx = el2 > 0 ? ex / d : 1, ny = el2 > 0 ? ey / d : 0;
    if (tau === 0) { const over = 2 * R - d; x[i] -= nx * over * 0.5; y[i] -= ny * over * 0.5; x[j] += nx * over * 0.5; y[j] += ny * over * 0.5; }
    const c = (vx[i] - vx[j]) * nx + (vy[i] - vy[j]) * ny; // Annäherungsgeschwindigkeit
    if (c <= 0) return;
    const jn = (1 + E_B) * c * 0.5;
    vx[i] -= jn * nx; vy[i] -= jn * ny; vx[j] += jn * nx; vy[j] += jn * ny;
    // Reibung zwischen den Kugeln (Mitnahme/Throw, Drall)
    const tx = -ny, ty = nx;
    const s = (vx[i] - vx[j]) * tx + (vy[i] - vy[j]) * ty + R * (wz[i] + wz[j]);
    let jt = -s / 7; const lim = MU_B * jn;
    if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
    vx[i] += jt * tx; vy[i] += jt * ty; vx[j] -= jt * tx; vy[j] -= jt * ty;
    wz[i] += 2.5 * jt / R; wz[j] += 2.5 * jt / R;
    if (tau > 0) {
      x[i] += (vx[i] - vix) * tau; y[i] += (vy[i] - viy) * tau; x[j] += (vx[j] - vjx) * tau; y[j] += (vy[j] - vjy) * tau;
      const fx = x[j] - x[i], fy = y[j] - y[i], fd2 = fx * fx + fy * fy;
      if (fd2 < 4 * R * R && fd2 > 0) { const fd = Math.sqrt(fd2), o2 = (2 * R - fd) * 0.5; x[i] -= fx / fd * o2; y[i] -= fy / fd * o2; x[j] += fx / fd * o2; y[j] += fy / fd * o2; }
    }
    if (st) {
      if (c > 1.5) {
        st.events.push({ k: 'ball', t: this.t, a: i, b: j, s: c });
        if (st.first < 0 && i === 0) st.first = j;
      }
    }
  }

  // Läuft bis alles liegt (oder maxT). Gibt Ergebnis und aufgezeichnete Bilder zurück.
  run(opts) {
    const o = opts || {};
    const st = { events: [], pocketed: [], first: -1, railAfter: false, railMask: 0, frames: o.record ? [] : null };
    const maxT = o.maxT || 60, maxSteps = Math.round(maxT / DT);
    const rec = (n) => {
      const f = new Float32Array(16 * 6);
      for (let i = 0; i < 16; i++) { f[i * 6] = this.x[i]; f[i * 6 + 1] = this.y[i]; f[i * 6 + 2] = this.wx[i]; f[i * 6 + 3] = this.wy[i]; f[i * 6 + 4] = this.wz[i]; f[i * 6 + 5] = this.on[i]; }
      st.frames.push(f);
    };
    if (st.frames) rec();
    let n = 0;
    while (n < maxSteps) {
      this.step(st); n++;
      if (st.frames && n % FRAME_STEPS === 0) rec();
      if (n % 50 === 0 && !this.moving()) break;
    }
    if (n >= maxSteps) for (let i = 0; i < 16; i++) { this.vx[i] = this.vy[i] = this.wx[i] = this.wy[i] = this.wz[i] = 0; }
    if (st.frames) rec();
    st.time = this.t; st.hash = this.hash();
    if (st.events.length > 600) st.events = st.events.filter((e, k) => k % 2 === 0 || e.k === 'pocket');
    return st;
  }
}

// Stoß: Winkel (rad), Stärke 0..1, Treffpunkt auf der Kugel (a = rechts/links, b = oben/unten, je -1..1).
// Rechnet Geschwindigkeit und Drall aus und rundet sie, damit jedes Gerät dieselben Zahlen bekommt.
export function cueShot(angle, power, a, b) {
  const v = Math.max(8, Math.min(1, power) * VMAX);
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const off = 0.5; // größter Treffpunkt: halber Radius (darüber würde die Kugel verspringen)
  const top = 2.5 * v * (b * off) / R;          // Vor-/Rückdrall
  const side = -2.5 * v * (a * off) / R;        // Seitendrall (a > 0 = rechts vom Schützen aus gesehen, Bildschirm: y nach unten)
  const q = (n) => Math.round(n * 100) / 100;
  return { vx: q(v * dx), vy: q(v * dy), wx: q(-dy * top), wy: q(dx * top), wz: q(side), ang: q(angle * 1000) / 1000 };
}
// Prüft die Zahlen eines (fremden) Stoßes
export function validShot(s) {
  if (!s || ![s.vx, s.vy, s.wx, s.wy, s.wz].every(Number.isFinite)) return false;
  const v = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  if (v < 1 || v > VMAX * 1.001) return false;
  const lim = 2.5 * v * 0.5 / R * 1.02 + 0.5;
  return Math.sqrt(s.wx * s.wx + s.wy * s.wy) <= lim && Math.abs(s.wz) <= lim;
}

// Zielhilfe: Weg der Weißen bis zur ersten Kugel (Geisterkugel) oder Bande
export function aimInfo(sim, angle) {
  const dx = Math.cos(angle), dy = Math.sin(angle), cx = sim.x[0], cy = sim.y[0];
  let best = Infinity, hit = -1;
  for (let i = 1; i < 16; i++) {
    if (!sim.on[i]) continue;
    const px = sim.x[i] - cx, py = sim.y[i] - cy, proj = px * dx + py * dy;
    if (proj <= 0) continue;
    const perp2 = px * px + py * py - proj * proj, r2 = 4 * R * R;
    if (perp2 >= r2) continue;
    const t = proj - Math.sqrt(r2 - perp2);
    if (t < best) { best = t; hit = i; }
  }
  // Bande
  let tw = Infinity;
  if (dx > 1e-9) tw = Math.min(tw, (HX - R - cx) / dx); else if (dx < -1e-9) tw = Math.min(tw, (-HX + R - cx) / dx);
  if (dy > 1e-9) tw = Math.min(tw, (HY - R - cy) / dy); else if (dy < -1e-9) tw = Math.min(tw, (-HY + R - cy) / dy);
  if (best > tw) { best = tw; hit = -1; }
  const gx = cx + dx * best, gy = cy + dy * best;
  const out = { t: best, hit, gx, gy, dx, dy };
  if (hit > 0) {
    const nx = sim.x[hit] - gx, ny = sim.y[hit] - gy, nl = Math.sqrt(nx * nx + ny * ny) || 1;
    out.ox = nx / nl; out.oy = ny / nl;                       // Richtung der Zielkugel
    const dot = dx * out.ox + dy * out.oy;
    let tx = dx - dot * out.ox, ty = dy - dot * out.oy;       // Richtung der Weißen danach (Tangente)
    const tl = Math.sqrt(tx * tx + ty * ty);
    out.cx = tl > 1e-6 ? tx / tl : 0; out.cy = tl > 1e-6 ? ty / tl : 0; out.cut = tl;
  }
  return out;
}

// Vorausberechnung des echten Stoßes bis kurz nach dem ersten Kontakt (für die Zielhilfe): zeigt Mitnahme (Throw),
// Vor-/Rückdrall und Treffpunkt genauso, wie sie dann wirklich ablaufen. Gibt null zurück, wenn die Weiße vorher an die Bande läuft.
export function predictShot(sim, angle, a, b, power) {
  const s = sim.clone(); s.apply(cueShot(angle, power, a, b));
  const st = { events: [], pocketed: [], first: -1, railAfter: false, railMask: 0 };
  let n = 0, hitN = -1, seen = 0, sx = 0, sy = 0, ox0 = 0, oy0 = 0, obj = -1;
  const cue = { x: 0, y: 0, on: 1, frozen: false }, ob = { x: 0, y: 0, on: 1, frozen: false };
  while (n < 3000) {
    s.step(st); n++;
    if (hitN < 0) {
      for (; seen < st.events.length; seen++) if (st.events[seen].k === 'rail' && st.events[seen].a === 0) return null;
      if (st.first >= 0) { hitN = n; obj = st.first; sx = s.x[0]; sy = s.y[0]; ox0 = s.x[obj]; oy0 = s.y[obj]; cue.x = sx; cue.y = sy; ob.x = ox0; ob.y = oy0; }
      else if (!s.on[0]) return null;
      continue;
    }
    // Weg nur bis zur nächsten Bande oder Kugel verfolgen (danach ändert sich die Richtung, das gehört nicht mehr zum Stoß)
    for (; seen < st.events.length; seen++) {
      const e = st.events[seen];
      if (e.k === 'rail') { if (e.a === 0) cue.frozen = true; else if (e.a === obj) ob.frozen = true; }
      else if (e.k === 'ball' && (e.a === 0 || e.b === 0 || e.a === obj || e.b === obj) && !(e.a === 0 && e.b === obj) && !(e.a === obj && e.b === 0)) { if (e.a === 0 || e.b === 0) cue.frozen = true; if (e.a === obj || e.b === obj) ob.frozen = true; }
    }
    if (!cue.frozen) { if (s.on[0]) { cue.x = s.x[0]; cue.y = s.y[0]; } else { cue.on = 0; cue.frozen = true; } }
    if (!ob.frozen) { if (s.on[obj]) { ob.x = s.x[obj]; ob.y = s.y[obj]; } else { ob.on = 0; ob.frozen = true; } }
    if (n - hitN >= 400 || (cue.frozen && ob.frozen)) break;
  }
  if (hitN < 0) return null;
  const dir = (x, y) => { const l = Math.sqrt(x * x + y * y); return { l, x: l > 1e-6 ? x / l : 0, y: l > 1e-6 ? y / l : 0 }; };
  const c = dir(cue.x - sx, cue.y - sy), o = dir(ob.x - ox0, ob.y - oy0);
  const pocket = st.pocketed.find((q) => q.b === obj);
  return { obj, ox: o.x, oy: o.y, olen: o.l, cx: c.x, cy: c.y, clen: c.l, objIn: pocket ? pocket.p : -1, scratch: st.pocketed.some((q) => q.b === 0), gx: sx, gy: sy };
}
