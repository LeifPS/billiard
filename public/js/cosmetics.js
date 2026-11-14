// Freischaltbare Kosmetik. Alles rein optisch; freigeschaltet wird über das Spielerlevel (Erfahrung aus gespielten Partien).
export const CATS = [
  { id: 'cloth', name: 'Tuch' },
  { id: 'frame', name: 'Rahmen' },
  { id: 'balls', name: 'Kugeln' },
  { id: 'cue', name: 'Queue' },
  { id: 'trail', name: 'Spur der Weißen' },
];

export const ITEMS = {
  cloth: [
    { id: 'gruen', name: 'Klassikgrün', lv: 0, c: '#1f7a4a', d: '#16603a' },
    { id: 'blau', name: 'Turnierblau', lv: 2, c: '#2a6ab3', d: '#1f4f88' },
    { id: 'rot', name: 'Burgunder', lv: 4, c: '#9a2b3d', d: '#771f2e' },
    { id: 'grau', name: 'Anthrazit', lv: 6, c: '#4a5058', d: '#383d44' },
    { id: 'violett', name: 'Samtviolett', lv: 9, c: '#6a3fa0', d: '#51307d' },
    { id: 'tuerkis', name: 'Lagune', lv: 12, c: '#17909a', d: '#106e76' },
    { id: 'sand', name: 'Sandstein', lv: 15, c: '#b79a63', d: '#927a4c' },
    { id: 'nacht', name: 'Mitternacht', lv: 20, c: '#1a2342', d: '#121a33' },
  ],
  frame: [
    { id: 'nuss', name: 'Nussholz', lv: 0, c: '#5a3a22', a: '#c8a15a' },
    { id: 'ahorn', name: 'Ahorn', lv: 3, c: '#b98a55', a: '#f1e2c4' },
    { id: 'schwarz', name: 'Schwarzlack', lv: 5, c: '#17171a', a: '#d8d8e0' },
    { id: 'mahagoni', name: 'Mahagoni', lv: 7, c: '#6b2417', a: '#e6b86a' },
    { id: 'kupfer', name: 'Kupfer', lv: 10, c: '#9a5a36', a: '#ffd9a8' },
    { id: 'marmor', name: 'Marmorweiß', lv: 14, c: '#d9d6cf', a: '#7a7468' },
    { id: 'gold', name: 'Gold', lv: 22, c: '#b78a22', a: '#fff1b0' },
  ],
  balls: [
    { id: 'klassik', name: 'Klassisch', lv: 0 },
    { id: 'neon', name: 'Neon', lv: 4 },
    { id: 'pastell', name: 'Pastell', lv: 8 },
    { id: 'retro', name: 'Retro', lv: 13 },
    { id: 'nacht', name: 'Nachtschicht', lv: 18 },
  ],
  cue: [
    { id: 'ahorn', name: 'Ahorn', lv: 0, a: '#e8c98f', b: '#b98a55', t: '#3a7bd5' },
    { id: 'ebenholz', name: 'Ebenholz', lv: 2, a: '#3a2a22', b: '#17110d', t: '#d9d9d9' },
    { id: 'rotweiss', name: 'Rot-Weiß', lv: 5, a: '#f3f3f3', b: '#c0392b', t: '#3a7bd5' },
    { id: 'blausilber', name: 'Blau-Silber', lv: 8, a: '#c7d3e0', b: '#2a5aa8', t: '#e8e8e8' },
    { id: 'gold', name: 'Goldrausch', lv: 12, a: '#ffe08a', b: '#b8860b', t: '#2b2b2b' },
    { id: 'karbon', name: 'Karbon', lv: 16, a: '#2e2e33', b: '#111114', t: '#ff5a3c' },
    { id: 'regenbogen', name: 'Regenbogen', lv: 20, a: '#ff66c4', b: '#4fc3f7', t: '#ffffff', rainbow: true },
    // Besondere Stäbe: leuchten und sprühen, auch der Gegner sieht sie (fx = Effektart, glow = Leuchtfarbe)
    { id: 'glut', name: 'Glutstab', lv: 7, a: '#3a1a10', b: '#1a0a06', t: '#ff7a2a', fx: 'glut', glow: '#ff6a1a', special: true },
    { id: 'frost', name: 'Eiszapfen', lv: 10, a: '#dff6ff', b: '#6fb8e8', t: '#ffffff', fx: 'frost', glow: '#8fe3ff', special: true },
    { id: 'neon', name: 'Neon-Puls', lv: 14, a: '#14161f', b: '#0b0c12', t: '#00ffd5', fx: 'neon', glow: '#00ffd5', special: true },
    { id: 'blitz', name: 'Gewitter', lv: 18, a: '#2b2d42', b: '#14151f', t: '#fff36b', fx: 'blitz', glow: '#fff36b', special: true },
    { id: 'galaxie', name: 'Sternenhimmel', lv: 22, a: '#1b1448', b: '#0a0723', t: '#e9d5ff', fx: 'galaxie', glow: '#b48cff', special: true },
  ].sort((x, y) => x.lv - y.lv),
  trail: [
    { id: 'keine', name: 'Keine', lv: 0 },
    { id: 'kreide', name: 'Kreidestaub', lv: 6, col: '#cfe3ff' },
    { id: 'funke', name: 'Funken', lv: 11, col: '#ffb347' },
    { id: 'eis', name: 'Eiskristall', lv: 16, col: '#8fe3ff' },
    { id: 'regenbogen', name: 'Regenbogen', lv: 24, col: 'rainbow' },
  ],
};

export const TITLES = [
  { lv: 0, t: 'Neuling' }, { lv: 3, t: 'Kreidesammler' }, { lv: 6, t: 'Bandenprofi' }, { lv: 10, t: 'Stoßkünstler' },
  { lv: 15, t: 'Tischkönner' }, { lv: 20, t: 'Meister der Bande' }, { lv: 30, t: 'Billard-Legende' },
];

// Erfahrung -> Level: Level n braucht 80*n + 20*n^2 Gesamterfahrung (Level 1 bei 100, Level 5 bei 900 ...)
export const xpForLevel = (n) => (n <= 0 ? 0 : 80 * n + 20 * n * n);
export function levelOf(xp) { let n = 0; while (xp >= xpForLevel(n + 1)) n++; return n; }
export const titleFor = (lv) => { let t = TITLES[0].t; for (const x of TITLES) if (lv >= x.lv) t = x.t; return t; };
export const find = (cat, id) => ITEMS[cat].find((i) => i.id === id) || ITEMS[cat][0];

// Kugelfarben je Set: [Vollfarbe 1..7] (Streifen 9..15 nutzen dieselben Farben 1..7 mit weißer Fläche; 8 = Schwarz)
export const BALL_SETS = {
  klassik: { cols: ['#f2c500', '#1b4fb3', '#d6261f', '#5b2a86', '#f0731a', '#1f8a3c', '#7a1f1f'], eight: '#101010', cue: '#f6f6f0', bg: '#f7f7f2' },
  neon: { cols: ['#fff200', '#00b7ff', '#ff2a6d', '#b14aff', '#ff8a00', '#00ff9d', '#ff4d4d'], eight: '#0b0b12', cue: '#ffffff', bg: '#f0fff8' },
  pastell: { cols: ['#f7d774', '#8db6ee', '#ef8c8c', '#b99be0', '#f5b27c', '#8fd3a4', '#c98a8a'], eight: '#3b3b44', cue: '#fffdf6', bg: '#fffdf6' },
  retro: { cols: ['#e2a826', '#2c6e91', '#b5412c', '#6e4a7a', '#cf6f2a', '#4d7c4a', '#6a3326'], eight: '#1a1713', cue: '#efe6d0', bg: '#efe6d0' },
  nacht: { cols: ['#ffd23f', '#3b8bff', '#ff4d6d', '#9d5bff', '#ff9a3c', '#3ddc97', '#ff6b6b'], eight: '#000000', cue: '#dfe8ff', bg: '#1a1d2e', dark: true },
};
