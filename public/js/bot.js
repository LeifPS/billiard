// Computergegner: sucht saubere Stöße (Geisterkugel), prüft sie in der echten Physik und würfelt je nach Stufe einen Fehler dazu.
import { R, HX, HY, POCKET_MOUTH, cueShot } from './physics.js';
import { grp, HEAD_X } from './rules.js';

export const LEVELS = {
  leicht: { name: 'Leicht', angErr: 2.4, powErr: 0.14, tries: 3, spin: false },
  mittel: { name: 'Mittel', angErr: 0.9, powErr: 0.07, tries: 6, spin: false },
  schwer: { name: 'Schwer', angErr: 0.25, powErr: 0.03, tries: 10, spin: true },
};
const D2R = Math.PI / 180;
const gauss = (rand) => { let u = 0, v = 0; while (!u) u = rand(); while (!v) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t - px, qy = ay + dy * t - py; return Math.sqrt(qx * qx + qy * qy);
}

// Mögliche Stöße (Ziel, Tasche) von der Weißen bei (cx,cy) aus, nach Geometrie sortiert
function candidates(game, cx, cy, legal) {
  const s = game.sim, out = [];
  for (const t of legal) {
    for (let p = 0; p < 6; p++) {
      const M = POCKET_MOUTH[p];
      let tx = M.x - s.x[t], ty = M.y - s.y[t]; const tl = Math.sqrt(tx * tx + ty * ty); if (tl < 1) continue; tx /= tl; ty /= tl;
      const gx = s.x[t] - tx * 2 * R, gy = s.y[t] - ty * 2 * R;
      if (Math.abs(gx) > HX - R || Math.abs(gy) > HY - R) continue;
      let ax = gx - cx, ay = gy - cy; const al = Math.sqrt(ax * ax + ay * ay); if (al < 0.5) continue; ax /= al; ay /= al;
      const cos = ax * tx + ay * ty; if (cos < 0.26) continue; // Schnitt über ~75 Grad
      let blocked = false;
      for (let i = 1; i < 16 && !blocked; i++) {
        if (!s.on[i] || i === t) continue;
        if (segDist(s.x[i], s.y[i], cx, cy, gx, gy) < 2 * R - 0.15) blocked = true;
        else if (segDist(s.x[i], s.y[i], s.x[t], s.y[t], M.x, M.y) < 2 * R - 0.15) blocked = true;
      }
      if (blocked) continue;
      const score = cos * 60 - (al + tl) * 0.12 - (1 - cos) * 40;
      out.push({ t, p, ang: Math.atan2(ay, ax), score, dist: al + tl, cos });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function powerFor(dist) { return Math.max(0.2, Math.min(0.9, 0.2 + dist * 0.0036)); }

function evaluate(game, shot, call) {
  const g = game.cloneFast();
  const me = g.turn, r = g.shoot(shot, call, false);
  if (!r) return -9999;
  const o = r.out; let sc = 0;
  if (o.winner === me) return 10000;
  if (o.winner >= 0) return -10000;
  if (o.foul) sc -= 300 + (o.pocketed.includes(0) ? 40 : 0);
  const mine = g.groups[me];
  for (const b of o.pocketed) { if (b === 0) continue; sc += (g.mode === '9ball' || !mine || grp(b) === mine) ? 100 : -40; }
  if (o.continues) sc += 60;
  return sc;
}

// Wahl der Weißen-Position bei freier Platzierung
export function botPlace(game, rand) {
  if (game.inHand === 'break') return { x: HEAD_X - 3 - rand() * 18, y: (rand() - 0.5) * 24 };
  const legal = game.legalFirst();
  let best = null, bs = -Infinity;
  for (let i = 0; i < 70; i++) {
    const x = -HX + 8 + rand() * (2 * HX - 16), y = -HY + 8 + rand() * (2 * HY - 16);
    if (!game.canPlace(x, y)) continue;
    const c = candidates(game, x, y, legal);
    const sc = c.length ? c[0].score + Math.min(c.length, 4) * 3 : -100;
    if (sc > bs) { bs = sc; best = { x, y }; }
  }
  return best || game.nearestPlace(HEAD_X, 0);
}

// Wählt den Stoß. Gibt { ang, power, a, b, call } zurück (vor dem Fehler der Stufe).
export function botShot(game, level, rand) {
  const L = LEVELS[level] || LEVELS.mittel, s = game.sim, cx = s.x[0], cy = s.y[0];
  if (game.phase === 'break') {
    const ang = Math.atan2(0 - cy, game.sim.x[1] * 0 + (HX / 2) - cx);
    return finish({ ang: Math.atan2(-cy, (HX / 2 - cx)), power: 0.95, a: 0, b: 0, call: 0 }, L, rand);
  }
  const legal = game.legalFirst();
  const cand = candidates(game, cx, cy, legal).slice(0, L.tries);
  let best = null, bs = -Infinity;
  const needCall = game.eightIsTarget();
  for (const c of cand) {
    const shot = cueShot(c.ang, powerFor(c.dist), 0, 0);
    const sc = evaluate(game, shot, c.p) + c.score * 0.1;
    if (sc > bs) { bs = sc; best = { ang: c.ang, power: powerFor(c.dist), a: 0, b: 0, call: c.p }; }
  }
  // Nichts Brauchbares: sicher spielen (leicht gegen eine erlaubte Kugel, ohne Foul)
  if (!best || bs < 0) {
    let sb = best ? bs : -Infinity, sbest = best;
    for (let k = 0; k < 14; k++) {
      const t = legal[Math.floor(rand() * legal.length)];
      const ang = Math.atan2(s.y[t] - cy, s.x[t] - cx) + (rand() - 0.5) * 0.25, pw = 0.25 + rand() * 0.4;
      const sc = evaluate(game, cueShot(ang, pw, 0, 0), Math.floor(rand() * 6));
      if (sc > sb) { sb = sc; sbest = { ang, power: pw, a: 0, b: 0, call: Math.floor(rand() * 6) }; }
    }
    best = sbest || { ang: 0, power: 0.4, a: 0, b: 0, call: 0 };
  }
  if (!needCall) best.call = 0;
  return finish(best, L, rand);
}

function finish(b, L, rand) {
  const out = { ...b };
  out.ang += gauss(rand) * L.angErr * D2R;
  out.power = Math.max(0.12, Math.min(1, out.power * (1 + gauss(rand) * L.powErr)));
  return out;
}
