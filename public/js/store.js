// Lokaler Spielstand (localStorage). Nichts davon liegt auf einem Server.
import { levelOf } from './cosmetics.js';
const KEY = 'billiard.v1';
const rnd = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const DEF = () => ({
  v: 1, pid: rnd(), name: '', xp: 0, rating: 1000, played: 0, wins: 0, losses: 0, pocketed: 0, fouls: 0, streak: 0, best: 0,
  by: { '8ball': { p: 0, w: 0 }, '9ball': { p: 0, w: 0 } }, vsBot: { leicht: [0, 0], mittel: [0, 0], schwer: [0, 0] }, online: { p: 0, w: 0 },
  cos: { cloth: 'gruen', frame: 'nuss', balls: 'klassik', cue: 'ahorn', trail: 'keine' },
  set: { sound: true, guide: 1, mode: '8ball', level: 'mittel', lefty: false },
  hist: [], ach: {},
});
let data = null;
export function load() {
  if (data) return data;
  let d = null;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { d = null; }
  const def = DEF();
  data = d && typeof d === 'object' ? Object.assign(def, d, { cos: Object.assign(def.cos, d.cos), set: Object.assign(def.set, d.set), by: Object.assign(def.by, d.by), vsBot: Object.assign(def.vsBot, d.vsBot), online: Object.assign(def.online, d.online) }) : def;
  if (!data.name) data.name = 'Spieler ' + (1000 + Math.floor(Math.random() * 9000));
  save(); return data;
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* voll oder gesperrt */ } }
export const level = () => levelOf(load().xp);
// Erfahrung gutschreiben; gibt zurück, ob ein neues Level erreicht wurde
export function addXp(n) { const d = load(), before = levelOf(d.xp); d.xp += Math.max(0, Math.round(n)); save(); return { from: before, to: levelOf(d.xp), gained: Math.round(n) }; }
export function recordMatch(r) {
  const d = load();
  d.played++; d.pocketed += r.pocketed || 0; d.fouls += r.fouls || 0;
  if (r.win) { d.wins++; d.streak++; d.best = Math.max(d.best, d.streak); } else { d.losses++; d.streak = 0; }
  const m = d.by[r.mode]; if (m) { m.p++; if (r.win) m.w++; }
  if (r.kind === 'bot') { const b = d.vsBot[r.level]; if (b) { b[0]++; if (r.win) b[1]++; } }
  if (r.kind === 'online') { d.online.p++; if (r.win) d.online.w++; if (Number.isFinite(r.rating)) d.rating = Math.max(100, Math.round(r.rating)); }
  d.hist.unshift({ t: Date.now(), mode: r.mode, kind: r.kind, opp: r.opp || '', win: !!r.win }); d.hist.length = Math.min(d.hist.length, 20);
  save();
}
