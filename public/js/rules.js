// Spielregeln (8-Ball und 9-Ball) auf Basis der Physik. Wird im Spiel und im Server benutzt.
import { Sim, R, HX, HY } from './physics.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (arr, rand) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
export const grp = (b) => (b === 8 ? 'eight' : b < 8 ? 'solid' : 'stripe');
const bits = (m) => { let n = 0; while (m) { n += m & 1; m >>>= 1; } return n; };

export const HEAD_X = -HX / 2, FOOT_X = HX / 2;

export class Game {
  constructor(opts) {
    const o = opts || {};
    this.mode = o.mode === '9ball' ? '9ball' : '8ball';
    this.seed = (o.seed >>> 0) || 1;
    this.turn = o.first === 1 ? 1 : 0;
    this.breaker = this.turn;
    this.sim = new Sim();
    this.phase = 'break';
    this.groups = [null, null];
    this.inHand = 'break';
    this.winner = -1; this.reason = '';
    this.fouls = [0, 0];
    this.shots = 0;
    this.rackNo = 0;
    this.rack();
  }

  rack() {
    const rand = rng(this.seed + this.rackNo * 7919);
    this.rackNo++;
    const s = this.sim; s.on.fill(0);
    const dxRow = Math.sqrt(3) * R + 0.02, dy = 2 * R + 0.02;
    const slots = [];
    if (this.mode === '8ball') {
      for (let r = 0; r < 5; r++) for (let k = 0; k <= r; k++) slots.push({ x: FOOT_X + r * dxRow, y: (k - r / 2) * dy });
      const solids = shuffle([1, 2, 3, 4, 5, 6, 7], rand), stripes = shuffle([9, 10, 11, 12, 13, 14, 15], rand);
      const order = new Array(15);
      order[4] = 8;
      const corner = rand() < 0.5 ? [solids.pop(), stripes.pop()] : [stripes.pop(), solids.pop()];
      order[10] = corner[0]; order[14] = corner[1];
      const rest = shuffle(solids.concat(stripes), rand);
      for (let i = 0; i < 15; i++) if (order[i] === undefined) order[i] = rest.pop();
      for (let i = 0; i < 15; i++) s.put(order[i], slots[i].x, slots[i].y);
    } else {
      const rows = [1, 2, 3, 2, 1];
      for (let r = 0; r < 5; r++) for (let k = 0; k < rows[r]; k++) slots.push({ x: FOOT_X + r * dxRow, y: (k - (rows[r] - 1) / 2) * dy });
      const order = new Array(9); order[0] = 1; order[4] = 9;
      const rest = shuffle([2, 3, 4, 5, 6, 7, 8], rand);
      for (let i = 0; i < 9; i++) if (order[i] === undefined) order[i] = rest.pop();
      for (let i = 0; i < 9; i++) s.put(order[i], slots[i].x, slots[i].y);
    }
    s.put(0, HEAD_X, 0);
    this.inHand = 'break';
  }

  onTable(b) { return !!this.sim.on[b]; }
  maxBall() { return this.mode === '9ball' ? 9 : 15; }
  tableBalls() { const r = []; for (let b = 1; b <= this.maxBall(); b++) if (this.sim.on[b]) r.push(b); return r; }

  // Welche Kugeln darf der Spieler am Zug zuerst treffen?
  legalFirst() {
    const t = this.tableBalls();
    if (this.mode === '9ball') return t.length ? [t[0]] : [];
    const g = this.groups[this.turn];
    if (this.phase === 'break') return t;
    if (!g) return t.filter((b) => b !== 8);
    const own = t.filter((b) => grp(b) === g);
    return own.length ? own : [8];
  }
  // Ist die 8 jetzt die Zielkugel? (dann muss die Tasche gewählt werden)
  eightIsTarget() {
    if (this.mode !== '8ball' || this.phase === 'break') return false;
    const g = this.groups[this.turn];
    if (!g) return false;
    return !this.tableBalls().some((b) => grp(b) === g);
  }

  canPlace(x, y) {
    const lim = R + 0.05;
    if (x < -HX + lim || x > HX - lim || y < -HY + lim || y > HY - lim) return false;
    if (this.inHand === 'break' && x > HEAD_X) return false;
    for (let i = 1; i < 16; i++) if (this.sim.on[i]) { const dx = this.sim.x[i] - x, dy = this.sim.y[i] - y; if (dx * dx + dy * dy < (2 * R + 0.02) * (2 * R + 0.02)) return false; }
    return true;
  }
  // nächstliegender erlaubter Platz zu (x,y)
  nearestPlace(x, y) {
    if (this.canPlace(x, y)) return { x, y };
    let best = null, bd = Infinity;
    for (let r = 0.5; r < 60; r += 0.5) {
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (this.canPlace(px, py)) { const d = r; if (d < bd) { bd = d; best = { x: px, y: py }; } }
      }
      if (best) return best;
    }
    return { x: HEAD_X, y: 0 };
  }
  place(x, y) {
    if (!this.inHand || !this.canPlace(x, y)) return false;
    this.sim.put(0, x, y); return true;
  }

  // Stoß ausführen. shot = Ergebnis von cueShot, call = gewählte Tasche (nur für die 8). record = Bilder für die Animation.
  shoot(shot, call, record) {
    if (this.phase === 'over') return null;
    if (this.inHand) { if (!this.sim.on[0]) return null; }
    const pre = this.pre();
    this.sim.apply(shot);
    const st = this.sim.run({ record: !!record });
    const out = this.resolve(st, pre, call);
    this.shots++;
    return { st, out };
  }
  pre() {
    const t = this.tableBalls();
    const g = this.groups[this.turn];
    return {
      isBreak: this.phase === 'break', legal: this.legalFirst(),
      ownLeft: g ? t.filter((b) => grp(b) === g).length : -1,
      lowest: t.length ? t[0] : 0,
    };
  }

  resolve(st, pre, call) {
    const me = this.turn, opp = 1 - me, s = this.sim;
    const P = st.pocketed.map((p) => p.b);
    const cueScr = P.includes(0), objP = P.filter((b) => b !== 0), nineOrEight = this.mode === '9ball' ? 9 : 8;
    let foul = null;
    if (cueScr) foul = 'Weiße versenkt';
    else if (st.first < 0) foul = 'Keine Kugel getroffen';
    else if (this.mode === '9ball') { if (st.first !== pre.lowest) foul = 'Nicht die niedrigste Kugel getroffen'; }
    else if (!pre.isBreak && !pre.legal.includes(st.first)) foul = st.first === 8 ? 'Die 8 zu früh getroffen' : 'Falsche Kugel zuerst getroffen';
    if (!foul && !objP.length && !st.railAfter) foul = 'Keine Bande nach dem Treffer';
    if (!foul && pre.isBreak && !objP.length && bits(st.railMask) < 4) foul = 'Ungültiger Anstoß (weniger als 4 Kugeln an die Bande)';
    const out = { foul, pocketed: P.slice(), first: st.first, continues: false, winner: -1, reason: '', rerack: false, assigned: null, spotted: null, player: me };

    if (this.mode === '8ball') {
      if (objP.includes(8)) {
        if (pre.isBreak) { out.rerack = true; out.reason = 'Die 8 fiel beim Anstoß: neu aufbauen'; this.rackNo += 0; this.rack(); this.turn = me; this.phase = 'break'; out.continues = true; return out; }
        const ok = !foul && pre.ownLeft === 0 && this.groups[me] && this.callMatches(st, call);
        out.winner = ok ? me : opp;
        out.reason = ok ? 'Die 8 sauber versenkt' : (foul ? 'Die 8 bei einem Foul versenkt' : pre.ownLeft !== 0 ? 'Die 8 zu früh versenkt' : 'Die 8 in der falschen Tasche versenkt');
        this.finish(out.winner, out.reason); return out;
      }
      if (!foul && !pre.isBreak && !this.groups[me]) {
        const types = new Set(objP.map(grp));
        if (types.size === 1) { const g = [...types][0]; this.groups[me] = g; this.groups[opp] = g === 'solid' ? 'stripe' : 'solid'; out.assigned = this.groups.slice(); }
      }
      if (!foul) out.continues = pre.isBreak ? objP.length > 0 : (this.groups[me] ? objP.some((b) => grp(b) === this.groups[me]) : objP.length > 0);
    } else {
      if (objP.includes(9)) {
        if (!foul) { out.winner = me; out.reason = 'Die 9 versenkt'; this.finish(me, out.reason); return out; }
        const p = this.spotNine(); out.spotted = p; // beim Foul zurück auf den Fußpunkt
      }
      if (!foul) out.continues = objP.length > 0;
    }

    this.phase = 'play';
    if (foul) { this.fouls[me]++; this.inHand = 'any'; this.turn = opp; }
    else { this.inHand = false; if (!out.continues) this.turn = opp; }
    if (cueScr && !foul) this.inHand = 'any';
    return out;
  }
  callMatches(st, call) {
    const e = st.pocketed.find((p) => p.b === 8);
    return e && call === e.p;
  }
  spotNine() {
    const s = this.sim;
    for (let dx = 0; dx < 120; dx += 0.5) for (const sgn of [1, -1]) {
      const x = FOOT_X + sgn * dx; if (x > HX - R - 0.1 || x < -HX + R + 0.1) continue;
      let free = true; for (let i = 0; i < 16; i++) if (s.on[i] && (s.x[i] - x) ** 2 + s.y[i] ** 2 < (2 * R + 0.05) ** 2) { free = false; break; }
      if (free) { s.put(9, x, 0); return { x, y: 0 }; }
    }
    s.put(9, FOOT_X, 0); return { x: FOOT_X, y: 0 };
  }
  finish(w, reason) { this.winner = w; this.reason = reason; this.phase = 'over'; }
  forfeit(p, reason) { this.finish(1 - p, reason || 'Aufgegeben'); }
  // Zeitüberschreitung: Foul, Gegner bekommt die Weiße in die Hand
  timeout() {
    if (this.phase === 'over') return null;
    const me = this.turn;
    this.fouls[me]++; this.inHand = 'any'; this.turn = 1 - me; if (this.phase === 'break') this.phase = 'play';
    return { foul: 'Zeit abgelaufen', pocketed: [], first: -1, continues: false, winner: -1, reason: '', player: me };
  }

  // Zustand zum Übertragen / Wiederherstellen
  toJSON() {
    const s = this.sim, a = (arr) => Array.from(arr);
    return { mode: this.mode, seed: this.seed, turn: this.turn, breaker: this.breaker, phase: this.phase, groups: this.groups, inHand: this.inHand, winner: this.winner, reason: this.reason, fouls: this.fouls, shots: this.shots, rackNo: this.rackNo, sim: { x: a(s.x), y: a(s.y), on: a(s.on) } };
  }
  static fromJSON(j) {
    const g = new Game({ mode: j.mode, seed: j.seed });
    Object.assign(g, { turn: j.turn, breaker: j.breaker, phase: j.phase, groups: j.groups, inHand: j.inHand, winner: j.winner, reason: j.reason, fouls: j.fouls, shots: j.shots, rackNo: j.rackNo });
    g.sim.x.set(j.sim.x); g.sim.y.set(j.sim.y); g.sim.on.set(j.sim.on);
    g.sim.vx.fill(0); g.sim.vy.fill(0); g.sim.wx.fill(0); g.sim.wy.fill(0); g.sim.wz.fill(0);
    return g;
  }
  clone() { return Game.fromJSON(JSON.parse(JSON.stringify(this.toJSON()))); }
  cloneFast() {
    const g = Object.create(Game.prototype);
    Object.assign(g, this); g.sim = this.sim.clone(); g.groups = this.groups.slice(); g.fouls = this.fouls.slice();
    return g;
  }
}
