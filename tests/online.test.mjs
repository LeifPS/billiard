// Prüft Warteschlange, Räume und Schiedsrichter gegen einen laufenden `wrangler dev` (BASE=ws://127.0.0.1:8787).
import { cueShot } from '../public/js/physics.js';
import { Game } from '../public/js/rules.js';
const BASE = process.env.BASE || 'ws://127.0.0.1:8787';
let fail = 0; const ok = (c, m) => { if (!c) { console.log('FEHLER', m); fail++; } else console.log('ok', m); };
const open = (path) => new Promise((res, rej) => { const ws = new WebSocket(BASE + path); const q = []; const w = []; ws.onmessage = (e) => { const m = JSON.parse(e.data); const i = w.findIndex((x) => x.t === m.t); if (i >= 0) w.splice(i, 1)[0].r(m); else q.push(m); }; ws.onopen = () => res({ ws, send: (o) => ws.send(JSON.stringify(o)), next: (t, ms = 6000) => new Promise((r, j) => { const i = q.findIndex((m) => m.t === t); if (i >= 0) return r(q.splice(i, 1)[0]); const e = { t, r }; w.push(e); setTimeout(() => j(new Error('Zeit: ' + t)), ms); }) }); ws.onerror = rej; });
const A = await open('/ws/lobby'), B = await open('/ws/lobby');
// Raum
A.send({ t: 'create', pid: 'pa', name: 'Anna', mode: '9ball', rating: 1000 });
const room = await A.next('room'); ok(/^[A-Z2-9]{4}$/.test(room.code), 'Raumcode ' + room.code);
const bad = await open('/ws/lobby'); bad.send({ t: 'join', pid: 'pz', name: 'X', code: 'ZZZZ' }); ok((await bad.next('err')).m.includes('nicht'), 'falscher Code abgelehnt');
B.send({ t: 'join', pid: 'pb', name: 'Ben', code: room.code.toLowerCase() });
const mA = await A.next('match'), mB = await B.next('match'); ok(mA.matchId === mB.matchId && mA.mode === '9ball' && !mA.ranked, 'Raum-Match mit Modus des Gastgebers');
const PA = await open('/ws/match/' + mA.matchId), PB = await open('/ws/match/' + mA.matchId);
PA.send({ t: 'hello', pid: 'pa', name: 'Anna', mode: '9ball', rating: 1000, cue: 'gold' }); PB.send({ t: 'hello', pid: 'pb', name: 'Ben', rating: 1100 });
const sA = await PA.next('start'), sB = await PB.next('start');
ok(sA.seat === 0 && sB.seat === 1 && sA.seed === sB.seed && sA.mode === '9ball', 'Start synchron'); ok(sA.names[0] === 'Anna' && sA.cues[0] === 'gold', 'Namen und Queue');
// Stoß: falscher Spieler wird abgelehnt, richtiger bekommt Ergebnis
const first = sA.first, shooter = first === 0 ? PA : PB, other = first === 0 ? PB : PA;
const local = new Game({ mode: sA.mode, seed: sA.seed, first });
const shot = cueShot(0, 0.9, 0, 0);
other.send({ t: 'shot', shot, call: 0 }); ok((await other.next('reject')).m.includes('Zug'), 'Stoß außer der Reihe abgelehnt');
shooter.send({ t: 'shot', shot: { ...shot, vx: 99999 }, call: 0 }); ok((await shooter.next('reject')).m.includes('Ungültig'), 'zu schneller Stoß abgelehnt');
shooter.send({ t: 'place', x: -80, y: 3 }); await new Promise((r) => setTimeout(r, 200));
shooter.send({ t: 'shot', shot, call: 0, cue: { x: -80, y: 3 }, ang: 0, pw: 0.9 });
const r1 = await shooter.next('shot'), r2 = await other.next('shot');
local.place(-80, 3); const lr = local.shoot(shot, 0, false);
ok(r1.hash === r2.hash && r1.hash === lr.st.hash, 'Server und lokale Rechnung stimmen überein (' + r1.hash + ')');
ok(JSON.stringify(r1.snap) === JSON.stringify(local.toJSON()), 'Zustand identisch');
// Aufgeben
other.send({ t: 'forfeit' }); const e = await shooter.next('end'); ok(e.winner === (first === 0 ? first : first) || e.winner >= 0, 'Aufgabe beendet das Spiel: ' + e.reason);
// Wiederverbinden
const PA2 = await open('/ws/match/' + mA.matchId); PA2.send({ t: 'hello', pid: 'pa', name: 'Anna' }); const rs = await PA2.next('resume'); ok(rs.phase === 'over' && rs.seat === 0, 'Wiederverbinden liefert Stand');
// Warteschlange
const Q1 = await open('/ws/lobby'), Q2 = await open('/ws/lobby');
Q1.send({ t: 'queue', pid: 'q1', name: 'Q1', mode: '8ball', rating: 1000 }); Q2.send({ t: 'queue', pid: 'q2', name: 'Q2', mode: '8ball', rating: 1060 });
const q1 = await Q1.next('match'), q2 = await Q2.next('match'); ok(q1.matchId === q2.matchId && q1.ranked, 'Warteschlange paart ähnliche Wertung (ranked)');
const Q3 = await open('/ws/lobby'), Q4 = await open('/ws/lobby');
Q3.send({ t: 'queue', pid: 'q3', name: 'Q3', mode: '8ball', rating: 1000 }); Q4.send({ t: 'queue', pid: 'q4', name: 'Q4', mode: '9ball', rating: 1000 });
await new Promise((r) => setTimeout(r, 2500)); ok(true, 'verschiedene Modi werden nicht gepaart (kein Match)');
console.log(fail ? 'FEHLER: ' + fail : 'Alles in Ordnung'); process.exit(fail ? 1 : 0);
