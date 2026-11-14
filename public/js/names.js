// Gegner-Identität für Spiele gegen den Computer: wirkt wie ein normaler Spielername und trägt einen Stab
import { ITEMS } from './cosmetics.js';

const FIRST = ['jonas', 'lukas', 'felix', 'leon', 'noah', 'finn', 'ben', 'tim', 'max', 'paul', 'nico', 'jan', 'tom', 'erik', 'marlon', 'dennis', 'sven', 'kevin', 'marvin', 'tobi', 'chris', 'alex', 'mo', 'ali', 'emre', 'luca', 'jule', 'lena', 'anna', 'mia', 'sarah', 'lisa', 'nele', 'carla', 'sophie', 'emma', 'hanna', 'katha', 'laura', 'mila'];
const LAST = ['k', 'm', 'b', 'schmidt', 'meyer', 'w', 'h', 'r', 'fischer', 'bauer', 'koch', 'weber', 'wolf', 'l', 'z', 'berg', 'p', 'neumann'];
const TAGS = ['pool', 'cue', 'billard', 'break', 'rack', 'kugel', 'chalk', 'bank', 'eight', 'ball', 'queue', 'kreide', 'snooker', 'tisch'];
const WORDS = ['schwarze8', 'eightballer', 'der_stoss', 'kugelblitz', 'tischkante', 'queuetip', 'rackattack', 'chalkdust', 'bankshot', 'breakpoint', 'kreidefinger', 'lochjaeger', 'nullachtfuenfzehn', 'stossgebet', 'banden_bernd', 'cue_ball', 'pocketking', 'ballhunter', 'darkhorse', 'nachtfalke', 'kleinerhai', 'poolhai', 'gruenerfilz', 'doppelbande', 'weisse_kugel', 'lucky8', 'sidespin', 'followme', 'tablerunner', 'snipe', 'okapi', 'pixelpaule', 'kaffeekanne', 'wolke7', 'turbotim', 'sonnenblume', 'pfefferminz', 'zitronenfalter'];

const pick = (rand, a) => a[Math.floor(rand() * a.length)];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const num = (rand) => { const r = rand(); return r < 0.4 ? String(Math.floor(rand() * 99)) : r < 0.75 ? String(1985 + Math.floor(rand() * 21)).slice(-2 + (rand() < 0.4 ? -2 : 0)) : String(Math.floor(rand() * 9) + 1); };

export function botName(rand) {
  const r = rand(); let n;
  if (r < 0.2) n = cap(pick(rand, FIRST)) + '.' + cap(pick(rand, LAST).slice(0, 1 + Math.floor(rand() * 2)));
  else if (r < 0.4) n = pick(rand, FIRST) + '_' + pick(rand, LAST) + num(rand);
  else if (r < 0.55) n = pick(rand, FIRST) + num(rand);
  else if (r < 0.7) n = pick(rand, TAGS) + '_' + pick(rand, FIRST) + (rand() < 0.5 ? num(rand) : '');
  else if (r < 0.9) n = pick(rand, WORDS) + (rand() < 0.3 ? num(rand) : '');
  else n = cap(pick(rand, FIRST)) + cap(pick(rand, TAGS)) + (rand() < 0.5 ? num(rand) : '');
  return n.replace(/[^A-Za-z0-9._]/g, '').slice(0, 14);
}

// Stab des Gegners: meist ein schlichter, manchmal ein besonderer
export function botCue(rand) {
  const all = ITEMS.cue, basic = all.filter((c) => !c.special && !c.rainbow), fancy = all.filter((c) => c.special || c.rainbow);
  return (rand() < 0.65 ? pick(rand, basic) : pick(rand, fancy)).id;
}
