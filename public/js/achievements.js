// Erfolge: einmalig, geben Erfahrungspunkte. Prüfung nach jedem Spiel (Zahlen aus dem lokalen Spielstand + Besonderheiten des Spiels).
import { levelOf } from './cosmetics.js';
export const ACH = [
  { id: 'erster', name: 'Erster Sieg', text: 'Gewinne ein Spiel.', xp: 40, ok: (d) => d.wins >= 1 },
  { id: 'sieg10', name: 'Zehn Siege', text: 'Gewinne 10 Spiele.', xp: 80, ok: (d) => d.wins >= 10 },
  { id: 'sieg50', name: 'Fünfzig Siege', text: 'Gewinne 50 Spiele.', xp: 250, ok: (d) => d.wins >= 50 },
  { id: 'spiele25', name: 'Stammgast', text: 'Spiele 25 Partien.', xp: 80, ok: (d) => d.played >= 25 },
  { id: 'spiele100', name: 'Hallenbewohner', text: 'Spiele 100 Partien.', xp: 250, ok: (d) => d.played >= 100 },
  { id: 'beide', name: 'Allrounder', text: 'Gewinne je ein 8-Ball- und ein 9-Ball-Spiel.', xp: 80, ok: (d) => d.by['8ball'].w >= 1 && d.by['9ball'].w >= 1 },
  { id: 'schwer', name: 'Maschinenbezwinger', text: 'Besiege den Computer auf „Schwer“.', xp: 120, ok: (d) => d.vsBot.schwer[1] >= 1 },
  { id: 'online', name: 'Online gewonnen', text: 'Gewinne ein Online-Spiel.', xp: 100, ok: (d) => d.online.w >= 1 },
  { id: 'wertung1100', name: 'Aufsteiger', text: 'Erreiche Online-Wertung 1100.', xp: 100, ok: (d) => d.rating >= 1100 },
  { id: 'wertung1300', name: 'Spitzenklasse', text: 'Erreiche Online-Wertung 1300.', xp: 300, ok: (d) => d.rating >= 1300 },
  { id: 'serie3', name: 'Heißer Lauf', text: 'Gewinne 3 Spiele in Folge.', xp: 80, ok: (d) => d.best >= 3 },
  { id: 'serie7', name: 'Unaufhaltsam', text: 'Gewinne 7 Spiele in Folge.', xp: 250, ok: (d) => d.best >= 7 },
  { id: 'kugeln100', name: 'Taschenjäger', text: 'Versenke insgesamt 100 Kugeln.', xp: 100, ok: (d) => d.pocketed >= 100 },
  { id: 'kugeln500', name: 'Taschenkönig', text: 'Versenke insgesamt 500 Kugeln.', xp: 300, ok: (d) => d.pocketed >= 500 },
  { id: 'lauf4', name: 'Im Fluss', text: 'Versenke in einem Spiel 4 Stöße hintereinander.', xp: 100, ok: (d, c) => c.run >= 4 },
  { id: 'golden', name: 'Goldener Anstoß', text: 'Gewinne ein 9-Ball-Spiel direkt mit dem Anstoß.', xp: 300, ok: (d, c) => !!c.golden },
  { id: 'sauber', name: 'Saubere Weste', text: 'Gewinne ein Spiel ohne eigenes Foul.', xp: 80, ok: (d, c) => !!c.clean },
  { id: 'level5', name: 'Level 5', text: 'Erreiche Level 5.', xp: 0, ok: (d) => levelOf(d.xp) >= 5 },
  { id: 'level10', name: 'Level 10', text: 'Erreiche Level 10.', xp: 0, ok: (d) => levelOf(d.xp) >= 10 },
];
// Gibt neu erreichte Erfolge zurück und markiert sie; die Punkte schreibt der Aufrufer gut.
export function check(d, ctx) {
  d.ach = d.ach || {}; const got = [];
  for (const a of ACH) if (!d.ach[a.id] && a.ok(d, ctx || {})) { d.ach[a.id] = Date.now(); got.push(a); }
  return got;
}
