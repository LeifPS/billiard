// Cloudflare Worker: statische Dateien (public/) + Lobby (Warteschlange, Raumcodes) + Match (Schiedsrichter mit derselben Physik wie im Spiel).
// Der Server speichert nichts dauerhaft: Wertung und Fortschritt liegen auf den Geräten der Spieler.
import { Game } from '../public/js/rules.js';
import { validShot } from '../public/js/physics.js';

const TURN_MS = 60000, BREAK_MS = 90000, AWAY_MS = 45000, PAIR_BASE = 150, PAIR_PER_S = 60, NOMATCH_S = 14;
const send = (ws, o) => { try { ws.send(JSON.stringify(o)); } catch { /* Socket weg */ } };
const clean = (s, n = 14) => String(s ?? '').replace(/[<>\n\r\u0000-\u001f]/g, '').slice(0, n).trim();
const ID = (s, d) => (/^[a-z0-9]{1,16}$/.test(String(s)) ? String(s) : d);
const mode = (m) => (m === '9ball' ? '9ball' : '8ball');
const rate = (r) => Math.max(100, Math.min(4000, Math.round(Number(r)) || 1000));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/ws/lobby') {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket erwartet', { status: 426 });
      return env.LOBBY.get(env.LOBBY.idFromName('main')).fetch(req);
    }
    if (url.pathname.startsWith('/ws/match/')) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('WebSocket erwartet', { status: 426 });
      let id; try { id = env.MATCH.idFromString(url.pathname.split('/')[3] || ''); } catch { return new Response('Ungültiger Raum', { status: 400 }); }
      return env.MATCH.get(id).fetch(req);
    }
    if (url.pathname === '/api/ping') return new Response('ok');
    return env.ASSETS.fetch(req);
  },
};

function pair() { const [client, server] = Object.values(new WebSocketPair()); server.accept(); return { client, server }; }
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ================================================================ Lobby
export class Lobby {
  constructor(state, env) { this.env = env; this.waiting = []; this.rooms = new Map(); this.timer = null; }

  async fetch() {
    const { client, server } = pair();
    let me = null;
    server.addEventListener('message', (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'ping') return send(server, { t: 'pong' });
      if (me) { if (m.t === 'cancel') { this.remove(me); try { server.close(1000, 'cancel'); } catch { /* weg */ } } return; }
      const base = { ws: server, pid: ID(m.pid, 'x'), name: clean(m.name) || 'Spieler', mode: mode(m.mode), rating: rate(m.rating), since: Date.now(), told: false };
      if (m.t === 'queue') {
        me = base; this.waiting.push(me); send(server, { t: 'queued', n: this.waiting.length });
        this.pairUp(); this.ensureTimer();
      } else if (m.t === 'create') {
        let code; do { code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join(''); } while (this.rooms.has(code));
        me = Object.assign(base, { room: code }); this.rooms.set(code, me); send(server, { t: 'room', code });
        me.expire = setTimeout(() => { if (this.rooms.get(code) === me) { this.rooms.delete(code); send(server, { t: 'err', m: 'Der Raum ist abgelaufen.' }); try { server.close(1000, 'timeout'); } catch { /* weg */ } } }, 15 * 60 * 1000);
      } else if (m.t === 'join') {
        const code = clean(m.code, 6).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const host = this.rooms.get(code);
        if (!host) { send(server, { t: 'err', m: 'Diesen Raum gibt es nicht (mehr).' }); return; }
        if (host.pid === base.pid) { send(server, { t: 'err', m: 'Das ist dein eigener Raum.' }); return; }
        this.rooms.delete(code); clearTimeout(host.expire);
        const matchId = this.env.MATCH.newUniqueId().toString();
        send(host.ws, { t: 'match', matchId, ranked: false, mode: host.mode, room: code });
        send(server, { t: 'match', matchId, ranked: false, mode: host.mode, room: code });
        me = base;
      }
    });
    const gone = () => this.remove(me);
    server.addEventListener('close', gone); server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }

  remove(p) {
    if (!p) return;
    if (p.room && this.rooms.get(p.room) === p) { this.rooms.delete(p.room); clearTimeout(p.expire); }
    this.waiting = this.waiting.filter((w) => w !== p);
    if (!this.waiting.length && this.timer) { clearInterval(this.timer); this.timer = null; }
  }
  ensureTimer() { if (!this.timer) this.timer = setInterval(() => this.pairUp(), 1000); }

  pairUp() {
    const now = Date.now();
    for (let i = 0; i < this.waiting.length; i++) {
      for (let j = i + 1; j < this.waiting.length; j++) {
        const a = this.waiting[i], b = this.waiting[j];
        if (a.pid === b.pid || a.mode !== b.mode) continue;
        const wait = Math.min(now - a.since, now - b.since) / 1000;
        if (Math.abs(a.rating - b.rating) <= PAIR_BASE + PAIR_PER_S * wait) {
          this.remove(a); this.remove(b);
          const matchId = this.env.MATCH.newUniqueId().toString();
          send(a.ws, { t: 'match', matchId, ranked: true, mode: a.mode });
          send(b.ws, { t: 'match', matchId, ranked: true, mode: a.mode });
          return this.pairUp();
        }
      }
    }
    for (const p of this.waiting) {
      if (!p.told && (now - p.since) / 1000 >= NOMATCH_S) { p.told = true; send(p.ws, { t: 'nomatch' }); }
    }
  }
}

// ================================================================ Match
export class Match {
  constructor(state, env) {
    this.players = [null, null]; // { ws, pid, name, rating, cue, away }
    this.game = null; this.phase = 'wait'; this.mode = '8ball'; this.ranked = false;
    this.timeouts = [0, 0]; this.rematch = [false, false]; this.tTimer = null; this.aTimer = [null, null];
    this.firstOf = 0; this.lastEmote = [0, 0];
  }

  async fetch() {
    const { client, server } = pair();
    const h = { ws: server, seat: -1 };
    server.addEventListener('message', (e) => this.onMessage(h, e.data));
    const gone = () => this.onLeave(h);
    server.addEventListener('close', gone); server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }

  both(o) { for (const p of this.players) if (p && p.ws) send(p.ws, o); }
  other(seat, o) { const p = this.players[1 - seat]; if (p && p.ws) send(p.ws, o); }
  info() {
    return { mode: this.mode, ranked: this.ranked, names: this.players.map((p) => (p ? p.name : '')), ratings: this.players.map((p) => (p ? p.rating : 1000)), cues: this.players.map((p) => (p ? p.cue : 'ahorn')) };
  }

  onMessage(h, raw) {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'ping') return send(h.ws, { t: 'pong' });
    if (m.t === 'hello' && h.seat < 0) return this.hello(h, m);
    if (h.seat < 0) return;
    const seat = h.seat, g = this.game;
    switch (m.t) {
      case 'aim':
        if (this.phase === 'play' && g && g.turn === seat) this.other(seat, { t: 'aim', ang: Number(m.ang) || 0, pull: Math.max(0, Math.min(1, Number(m.pull) || 0)), a: Math.max(-1, Math.min(1, Number(m.a) || 0)), b: Math.max(-1, Math.min(1, Number(m.b) || 0)) });
        break;
      case 'place':
        if (this.phase === 'play' && g && g.turn === seat && g.inHand && Number.isFinite(m.x) && Number.isFinite(m.y) && g.place(m.x, m.y)) this.other(seat, { t: 'place', x: m.x, y: m.y });
        break;
      case 'shot': this.onShot(seat, m); break;
      case 'forfeit': if (this.phase === 'play') this.endGame(1 - seat, this.players[seat].name + ' hat aufgegeben'); break;
      case 'emote': { const now = Date.now(); if (now - this.lastEmote[seat] > 1500) { this.lastEmote[seat] = now; this.other(seat, { t: 'emote', seat, n: Math.max(0, Math.min(7, Math.floor(Number(m.n) || 0))) }); } break; }
      case 'rematch':
        if (this.phase === 'over') { this.rematch[seat] = true; this.other(seat, { t: 'rematch', seat }); if (this.rematch[0] && this.rematch[1]) this.begin(true); }
        break;
    }
  }

  hello(h, m) {
    const pid = ID(m.pid, 'x');
    let seat = this.players.findIndex((p) => p && p.pid === pid);
    if (seat >= 0) { // Wiederverbinden
      const p = this.players[seat]; try { if (p.ws && p.ws !== h.ws) p.ws.close(1000, 'neu'); } catch { /* weg */ }
      p.ws = h.ws; h.seat = seat; clearTimeout(this.aTimer[seat]); this.aTimer[seat] = null;
      if (this.phase === 'play' || this.phase === 'over') {
        send(h.ws, Object.assign({ t: 'resume', seat, phase: this.phase, snap: this.game.toJSON(), timer: TURN_MS / 1000, winner: this.game.winner, reason: this.game.reason }, this.info()));
        this.other(seat, { t: 'opp', away: false });
      }
      return;
    }
    seat = this.players.findIndex((p) => !p);
    if (seat < 0) { send(h.ws, { t: 'err', m: 'Der Raum ist voll.' }); try { h.ws.close(1000, 'voll'); } catch { /* weg */ } return; }
    if (seat === 0 || !this.players[0]) { this.mode = mode(m.mode); this.ranked = !!m.ranked; }
    this.players[seat] = { ws: h.ws, pid, name: clean(m.name) || 'Spieler', rating: rate(m.rating), cue: ID(m.cue, 'ahorn') };
    h.seat = seat;
    if (this.players[0] && this.players[1] && this.phase === 'wait') this.begin(false);
  }

  begin(again) {
    const seed = (crypto.getRandomValues(new Uint32Array(1))[0] || 1);
    const first = again ? 1 - this.firstOf : (Math.random() < 0.5 ? 0 : 1);
    this.firstOf = first;
    this.game = new Game({ mode: this.mode, seed, first });
    this.phase = 'play'; this.timeouts = [0, 0]; this.rematch = [false, false];
    for (let s = 0; s < 2; s++) send(this.players[s].ws, Object.assign({ t: 'start', seat: s, seed, first, timer: TURN_MS / 1000 }, this.info()));
    this.startClock(BREAK_MS);
  }

  startClock(ms) {
    clearTimeout(this.tTimer);
    if (this.phase !== 'play') return;
    this.tTimer = setTimeout(() => this.onTimeout(), ms);
  }
  onTimeout() {
    if (this.phase !== 'play') return;
    const seat = this.game.turn;
    this.timeouts[seat]++;
    if (this.timeouts[seat] >= 3) return this.endGame(1 - seat, this.players[seat].name + ' hat zu oft die Zeit überschritten');
    this.game.timeout();
    this.both({ t: 'timeout', seat, snap: this.game.toJSON() });
    this.startClock(TURN_MS);
  }

  onShot(seat, m) {
    const g = this.game;
    if (this.phase !== 'play' || !g || g.turn !== seat) return send(this.players[seat].ws, { t: 'reject', m: 'Nicht dein Zug' });
    const shot = m.shot;
    if (!validShot(shot)) return send(this.players[seat].ws, { t: 'reject', m: 'Ungültiger Stoß' });
    if (g.inHand) { // Weiße in der Hand: die gewählte Stelle muss erlaubt sein
      if (!m.cue || !g.place(Number(m.cue.x), Number(m.cue.y))) return send(this.players[seat].ws, { t: 'reject', m: 'Hier darf die Weiße nicht liegen' });
    }
    const call = Math.max(0, Math.min(5, Math.floor(Number(m.call) || 0)));
    clearTimeout(this.tTimer);
    this.timeouts[seat] = 0;
    const cue = { x: g.sim.x[0], y: g.sim.y[0] };
    const r = g.shoot({ vx: shot.vx, vy: shot.vy, wx: shot.wx, wy: shot.wy, wz: shot.wz }, call, false);
    if (!r) return;
    const o = r.out;
    this.both({
      t: 'shot', seat, shot: { vx: shot.vx, vy: shot.vy, wx: shot.wx, wy: shot.wy, wz: shot.wz }, call, cue,
      ang: Number(m.ang) || 0, pw: Math.max(0, Math.min(1, Number(m.pw) || 0)), a: Math.max(-1, Math.min(1, Number(m.a) || 0)), b: Math.max(-1, Math.min(1, Number(m.b) || 0)),
      hash: r.st.hash, time: r.st.time, snap: g.toJSON(),
      out: { foul: o.foul, pocketed: o.pocketed, winner: o.winner, reason: o.reason, rerack: o.rerack, assigned: o.assigned, continues: o.continues },
    });
    if (g.phase === 'over') return this.endGame(g.winner, g.reason, true);
    this.startClock(TURN_MS + Math.min(14000, r.st.time * 900)); // die Zeit der Animation zählt nicht mit
  }

  endGame(winner, reason, already) {
    if (this.phase === 'over') return;
    clearTimeout(this.tTimer); clearTimeout(this.aTimer[0]); clearTimeout(this.aTimer[1]);
    this.phase = 'over';
    if (this.game && !already) this.game.finish(winner, reason);
    this.both({ t: 'end', winner, reason });
  }

  onLeave(h) {
    if (h.seat < 0) return;
    const seat = h.seat, p = this.players[seat];
    if (!p || p.ws !== h.ws) return; // schon durch eine neue Verbindung ersetzt
    p.ws = null;
    if (this.phase === 'wait') { this.players[seat] = null; return; }
    if (this.phase !== 'play') return;
    this.other(seat, { t: 'opp', away: true, secs: AWAY_MS / 1000 });
    clearTimeout(this.aTimer[seat]);
    this.aTimer[seat] = setTimeout(() => { if (this.phase === 'play' && !this.players[seat].ws) this.endGame(1 - seat, p.name + ' hat die Verbindung verloren'); }, AWAY_MS);
  }
}
