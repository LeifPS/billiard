// Billiard: Spielablauf, Bedienung und Menüs.
import { Scene3D } from './render.js';
import { Game, rng, HEAD_X, FOOT_X, grp } from './rules.js';
import { R, HX, HY, POCKET_MOUTH, cueShot, aimInfo, predictShot, FRAME_STEPS, DT } from './physics.js';
import { botShot, botPlace, LEVELS } from './bot.js';
import { Sfx } from './audio.js';
import * as Store from './store.js';
import { CATS, ITEMS, find, levelOf, xpForLevel, titleFor, BALL_SETS } from './cosmetics.js';
import { Online } from './net.js';
import { ACH, check as checkAch } from './achievements.js';

const $ = (s, r) => (r || document).querySelector(s);
const el = (h) => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FRAME_DT = FRAME_STEPS * DT;

const sfx = new Sfx();
const S = Store.load();
let scene = null;
let M = null;            // laufendes Spiel
const inp = { ang: 0, power: 0, a: 0, b: 0, callManual: -1, on: false, mode: null, hold: 0 };
let anim = { kind: 'idle' };
let botAim = null;
let online = null;

// ------------------------------------------------------------------ Start
async function boot() {
  window.LGH_ZEILEN = () => [{ text: 'Ton', an: !!S.set.sound, setze: (v) => { S.set.sound = !!v; sfx.on = !!v; Store.save(); } }];
  sfx.on = !!S.set.sound;
  const canvas = $('#gl');
  try { scene = new Scene3D(canvas); } catch (e) { $('#boot').innerHTML = '<div>Dein Gerät kann kein 3D (WebGL) darstellen.</div>'; return; }
  scene.setCosmetics(S.cos); scene.setBallCount(15);
  const g = new Game({ mode: S.set.mode, seed: 7 }); scene.showSim(g.sim);
  window.addEventListener('resize', layout); window.addEventListener('orientationchange', () => setTimeout(layout, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);
  setupInput();
  layout();
  const unlock = () => sfx.unlock(); window.addEventListener('pointerdown', unlock, { passive: true }); window.addEventListener('keydown', unlock);
  requestAnimationFrame(frame);
  $('#boot').classList.add('hidden');
  const j = new URLSearchParams(location.search).get('raum');
  showMenu();
  if (j) setTimeout(() => joinRoom(j), 300);
  else Online.resume(netCtx());
}

function layout() {
  const w = window.innerWidth, h = window.innerHeight, portrait = h > w * 1.05;
  const inGame = !$('#hud').classList.contains('hidden');
  let m;
  if (!inGame) m = portrait ? { l: 6, r: 6, t: 80, b: 80 } : { l: 10, r: 10, t: 20, b: 20 };
  else if (portrait) m = { l: 6, r: 6, t: 92, b: 96 };
  else m = { l: 104, r: 78, t: 54, b: 8 };
  if (!inGame && !portrait && $('#screen') && $('#screen').dataset.side === 'right') m = { l: 10, r: w * 0.48, t: 20, b: 20 };
  scene.resize(w, h, m);
  placePower();
}

// ------------------------------------------------------------------ Menüs
function setScreen(html, cls) {
  const s = $('#screen'); s.className = 'screen' + (cls ? ' ' + cls : ''); s.dataset.side = cls && cls.includes('side') ? 'right' : '';
  s.innerHTML = html; s.scrollTop = 0; s.classList.remove('hidden'); layout();
  return s;
}
function hideScreen() { $('#screen').classList.add('hidden'); }
function lvInfo() { const lv = levelOf(S.xp), a = xpForLevel(lv), b = xpForLevel(lv + 1); return { lv, pct: Math.round(100 * (S.xp - a) / (b - a)), need: b - S.xp }; }

function showMenu() {
  leaveGame(true);
  const li = lvInfo();
  const s = setScreen(`
    <div class="card">
      <div>
        <h1>Billiard<small>8-BALL · 9-BALL</small></h1>
        <div class="who">
          <div class="row"><input id="nm" maxlength="14" value="${esc(S.name)}" aria-label="Dein Name"><span class="sub">Level ${li.lv}</span></div>
          <div class="bar"><i style="width:${li.pct}%"></i></div>
          <div class="sub" style="margin-top:5px">${esc(titleFor(li.lv))} · noch ${li.need} Punkte bis Level ${li.lv + 1}</div>
        </div>
        <div class="seg" style="margin-top:12px" id="modeseg"><button data-m="8ball" class="${S.set.mode === '8ball' ? 'on' : ''}">8-Ball</button><button data-m="9ball" class="${S.set.mode === '9ball' ? 'on' : ''}">9-Ball</button></div>
      </div>
      <div class="grid">
        <button class="btn main wide" id="bq"><b>Online spielen</b><span>Gegner suchen, Platz in der Wertung</span></button>
        <button class="btn" id="br"><b>Raum erstellen</b><span>Mit Freunden per Code</span></button>
        <button class="btn" id="bj"><b>Raum beitreten</b><span>Code eingeben</span></button>
        <button class="btn" id="bb"><b>Gegen Computer</b><span>${LEVELS[S.set.level].name}</span></button>
        <button class="btn" id="bh"><b>Zu zweit am Gerät</b><span>Abwechselnd spielen</span></button>
        <button class="btn" id="bt"><b>Training</b><span>Freies Üben</span></button>
        <button class="btn" id="bc"><b>Kosmetik</b><span>Queues, Tuch, Kugeln …</span></button>
        <button class="btn" id="bs"><b>Statistik</b><span>${S.played} Spiele, ${S.wins} Siege</span></button>
        <button class="btn" id="bg"><b>Einstellungen</b><span>Ton, Spielstand-Code</span></button>
      </div>
    </div>`);
  $('#nm', s).addEventListener('change', (e) => { S.name = (e.target.value || '').trim().slice(0, 14) || S.name; e.target.value = S.name; Store.save(); });
  $('#modeseg', s).addEventListener('click', (e) => { const m = e.target.dataset && e.target.dataset.m; if (!m) return; S.set.mode = m; Store.save(); sfx.click(); showMenu(); });
  $('#bq', s).onclick = () => startOnline('queue');
  $('#br', s).onclick = () => startOnline('create');
  $('#bj', s).onclick = () => askCode();
  $('#bb', s).onclick = () => botChoice();
  $('#bh', s).onclick = () => startMatch({ kind: 'hotseat', mode: S.set.mode });
  $('#bt', s).onclick = () => startMatch({ kind: 'training', mode: S.set.mode });
  $('#bc', s).onclick = () => showCosmetics('cloth');
  $('#bs', s).onclick = () => showStats();
  $('#bg', s).onclick = () => (window.LGH && window.LGH.oeffnen ? window.LGH.oeffnen() : null);
  const g = new Game({ mode: S.set.mode, seed: 7 }); scene.setBallCount(g.maxBall()); scene.showSim(g.sim); scene.setAim(null); scene.setPocketMarks(-1, false); scene.setHandMark(false);
}

function botChoice() {
  const m = $('#modal'); m.classList.remove('hidden');
  m.innerHTML = `<div class="box"><h3>Gegen Computer</h3><div class="sub">Wie stark soll der Gegner sein?</div>
    <div class="seg" id="lv" style="margin-top:12px">${Object.keys(LEVELS).map((k) => `<button data-l="${k}" class="${S.set.level === k ? 'on' : ''}">${LEVELS[k].name}</button>`).join('')}</div>
    <div class="acts"><button class="btn" id="x">Zurück</button><button class="btn main" id="go"><b>Los</b></button></div></div>`;
  $('#lv', m).onclick = (e) => { const l = e.target.dataset && e.target.dataset.l; if (!l) return; S.set.level = l; Store.save(); [...$('#lv', m).children].forEach((c) => c.classList.toggle('on', c.dataset.l === l)); };
  $('#x', m).onclick = () => { m.classList.add('hidden'); showMenu(); };
  $('#go', m).onclick = () => { m.classList.add('hidden'); startMatch({ kind: 'bot', mode: S.set.mode, level: S.set.level }); };
}

function showStats() {
  const li = lvInfo(), wr = S.played ? Math.round(100 * S.wins / S.played) : 0;
  const rows = S.hist.map((h) => `<div class="sub">${new Date(h.t).toLocaleDateString('de-DE')} · ${h.mode === '9ball' ? '9-Ball' : '8-Ball'} · ${h.kind === 'online' ? 'Online' : h.kind === 'bot' ? 'Computer' : 'Gerät'}${h.opp ? ' gegen ' + esc(h.opp) : ''} · <b style="color:${h.win ? 'var(--acc)' : 'var(--bad)'}">${h.win ? 'Sieg' : 'Niederlage'}</b></div>`).join('') || '<div class="sub">Noch keine Spiele.</div>';
  const s = setScreen(`<button class="back" id="x">&#10005;</button><div class="page"><h2>Statistik</h2>
    <div class="sub">Level ${li.lv} · ${esc(titleFor(li.lv))} · ${S.xp} Punkte</div>
    <div class="stat"><div><b>${S.played}</b>Spiele</div><div><b>${S.wins}</b>Siege (${wr}%)</div><div><b>${S.best}</b>Längste Serie</div><div><b>${S.pocketed}</b>Kugeln versenkt</div><div><b>${S.rating}</b>Online-Wertung</div></div>
    <div class="stat"><div><b>${S.by['8ball'].w}/${S.by['8ball'].p}</b>8-Ball</div><div><b>${S.by['9ball'].w}/${S.by['9ball'].p}</b>9-Ball</div><div><b>${S.online.w}/${S.online.p}</b>Online</div>
      <div><b>${S.vsBot.leicht[1]}/${S.vsBot.leicht[0]}</b>Computer leicht</div><div><b>${S.vsBot.mittel[1]}/${S.vsBot.mittel[0]}</b>Computer mittel</div><div><b>${S.vsBot.schwer[1]}/${S.vsBot.schwer[0]}</b>Computer schwer</div></div>
    <h3 style="margin:14px 0 6px">Erfolge (${Object.keys(S.ach || {}).length}/${ACH.length})</h3>${ACH.map((a) => { const on = !!(S.ach && S.ach[a.id]); return `<div class="sub" style="opacity:${on ? 1 : 0.55}"><b style="color:${on ? 'var(--acc)' : 'inherit'}">${on ? '✓ ' : ''}${esc(a.name)}</b> – ${esc(a.text)}${a.xp ? ' (+' + a.xp + ')' : ''}</div>`; }).join('')}
    <h3 style="margin:14px 0 6px">Letzte Spiele</h3>${rows}</div>`);
  $('#x', s).onclick = showMenu;
}

function showCosmetics(cat) {
  const lv = levelOf(S.xp);
  const sw = (c, it) => {
    if (c === 'cloth') return `background:${it.c}`;
    if (c === 'frame') return `background:linear-gradient(90deg,${it.c} 70%,${it.a} 70%,${it.a} 78%,${it.c} 78%)`;
    if (c === 'cue') return `background:linear-gradient(90deg,${it.t} 0 6%,${it.a} 6% 62%,${it.b} 62%)`;
    if (c === 'balls') { const b = BALL_SETS[it.id]; return `background:linear-gradient(90deg,${b.cols.slice(0, 7).map((x, i) => `${x} ${i * 14.3}% ${(i + 1) * 14.3}%`).join(',')})`; }
    return `background:${it.col === 'rainbow' ? 'linear-gradient(90deg,#f55,#fb5,#5f5,#5bf,#b5f)' : it.col || '#222'}`;
  };
  const items = ITEMS[cat].map((it) => {
    const open = lv >= it.lv, sel = S.cos[cat] === it.id;
    return `<button class="item ${sel ? 'sel' : ''} ${open ? '' : 'lock'}" data-id="${it.id}"><div class="sw" style="${sw(cat, it)}"></div><b style="font-size:13.5px">${it.name}</b><small>${open ? (sel ? 'Ausgewählt' : 'Frei') : 'ab Level ' + it.lv}</small></button>`;
  }).join('');
  const s = setScreen(`<button class="back" id="x">&#10005;</button><div class="page" style="width:min(520px,100%);margin-left:auto"><h2>Kosmetik</h2><div class="sub">Level ${lv} · neue Dinge schaltest du durch Spielen frei.</div>
    <div class="tabs">${CATS.map((c) => `<button data-c="${c.id}" class="${c.id === cat ? 'on' : ''}">${c.name}</button>`).join('')}</div><div class="items">${items}</div></div>`, 'side');
  $('#x', s).onclick = showMenu;
  s.querySelector('.tabs').onclick = (e) => { const c = e.target.dataset && e.target.dataset.c; if (c) showCosmetics(c); };
  s.querySelector('.items').onclick = (e) => {
    const b = e.target.closest('.item'); if (!b || b.classList.contains('lock')) return;
    S.cos[cat] = b.dataset.id; Store.save(); scene.setCosmetics(S.cos); sfx.click(); showCosmetics(cat);
  };
  scene.setCosmetics(S.cos);
}

// ------------------------------------------------------------------ Spielstart
function startMatch(o) {
  const kind = o.kind;
  const seed = (o.seed >>> 0) || (Math.floor(Math.random() * 4e9) + 1);
  const game = o.gameJSON ? Game.fromJSON(o.gameJSON) : new Game({ mode: o.mode, seed, first: o.first == null ? (Math.random() < 0.5 ? 0 : 1) : o.first });
  const lv = o.level || 'mittel';
  const names = o.names || (kind === 'bot' ? [S.name, ['Karl', 'Mia', 'Otto', 'Lena', 'Paul', 'Zoe'][seed % 6] + ' (' + LEVELS[lv].name + ')'] : kind === 'hotseat' ? ['Spieler 1', 'Spieler 2'] : [S.name, '']);
  M = {
    kind, game, mode: o.mode, level: lv, me: o.me || 0, names, cues: o.cues || [S.cos.cue, S.cos.cue], rand: rng(seed ^ 0x9e3779b9), over: false,
    timer: o.timer || 0, t0: 0, myPocketed: 0, myFouls: 0, started: Date.now(), ranked: !!o.ranked, ratings: o.ratings || null, net: o.net || null, firstShot: true, lastLog: null, waiting: null, remoteAim: null, pendingSnap: null, pendingEnd: null,
  };
  if (kind === 'training') M.names = [S.name, 'Training'];
  hideScreen(); $('#modal').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  scene.setBallCount(game.maxBall()); scene.showSim(game.sim); scene.setCosmetics({ cue: M.cues[M.me] });
  layout(); buildHud(); startTurn();
}
function leaveGame(silent) {
  if (M && M.net) { try { M.net.leave(); } catch (e) { /* weg */ } }
  M = null; anim = { kind: 'idle' }; botAim = null; inp.on = false;
  $('#hud').classList.add('hidden'); if (scene) { scene.setAim(null); scene.setPocketMarks(-1, false); scene.setHandMark(false); }
  if (!silent) showMenu();
}

// ------------------------------------------------------------------ HUD
function seatIsMe(seat) { return M.kind === 'hotseat' || M.kind === 'training' ? true : seat === M.me; }
let trayEl = null;
function buildHud() {
  const top = $('#top'); if (!trayEl) trayEl = $('#tray'); if (trayEl.parentNode) trayEl.parentNode.removeChild(trayEl); top.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    if (M.kind === 'training' && i === 1) continue;
    top.appendChild(el(`<div class="chip" id="chip${i}"><span class="dot" id="dot${i}"></span><span class="nm">${esc(M.names[i])}</span><span class="tg" id="tag${i}"></span></div>`));
  }
  top.style.justifyContent = 'center';
  const tray = trayEl; const c1 = $('#chip1'); if (c1) top.insertBefore(tray, c1); else top.appendChild(tray);
  updateHud();
}
function ballCss(n) {
  const set = BALL_SETS[S.cos.balls] || BALL_SETS.klassik;
  return n === 8 ? set.eight : set.cols[(n - 1) % 7];
}
function updateHud() {
  if (!M) return; const g = M.game;
  for (let i = 0; i < 2; i++) {
    const c = $('#chip' + i); if (!c) continue;
    c.classList.toggle('act', g.phase !== 'over' && (M.kind === 'training' || g.turn === i));
    let tag = '';
    if (M.mode === '8ball') tag = g.groups[i] ? (g.groups[i] === 'solid' ? 'Volle' : 'Halbe') : (g.phase === 'break' ? '' : 'offen');
    $('#tag' + i).textContent = M.mode === '9ball' && g.turn === i && g.phase !== 'over' ? 'Ziel ' + (g.tableBalls()[0] || '') : tag;
    const dot = $('#dot' + i);
    dot.style.background = M.mode === '8ball' && g.groups[i] ? ballCss(g.groups[i] === 'solid' ? 3 : 4) : '#e9e9e2';
  }
  const tr = trayEl; tr.innerHTML = '';
  for (let b = 1; b <= g.maxBall(); b++) {
    const i = document.createElement('i'); i.style.background = ballCss(b); if (b >= 9 && M.mode === '8ball') i.style.background = `linear-gradient(180deg,#f4f4ee 0 24%,${ballCss(b)} 24% 76%,#f4f4ee 76%)`;
    if (!g.sim.on[b]) i.className = 'out'; tr.appendChild(i);
  }
  const hint = $('#hint');
  if (M.over) hint.textContent = '';
  else if (inp.on && g.inHand) hint.textContent = g.inHand === 'break' ? 'Weiße hinter der Linie platzieren (ziehen oder tippen)' : 'Weiße frei platzieren (ziehen oder tippen)';
  else if (inp.on && g.eightIsTarget()) hint.textContent = 'Die 8: Tasche antippen (sonst automatisch)';
  else hint.textContent = '';
}
let msgT = 0;
function toast(text, kind, ms) {
  const m = $('#msg'); m.textContent = text; m.className = 'show ' + (kind || ''); clearTimeout(msgT); msgT = setTimeout(() => { m.className = ''; }, ms || 2600);
}

// ------------------------------------------------------------------ Zug
function myTurn() { return M && !M.over && M.game.phase !== 'over' && (M.kind === 'training' || (M.kind === 'hotseat') || M.game.turn === M.me) && M.kind !== 'bot-run'; }
function isBotSeat(seat) { return M.kind === 'bot' && seat !== M.me; }
function isRemoteSeat(seat) { return M.kind === 'online' && seat !== M.me; }

function startTurn() {
  if (!M) return;
  const g = M.game; updateHud(); $('#hud').classList.add('wait');
  if (g.phase === 'over') return endMatch();
  anim = { kind: 'idle' }; M.waiting = null; M.remoteAim = null; M.lastPlaceSend = null;
  scene.showSim(g.sim); scene.setPocketMarks(-1, false);
  const seat = g.turn;
  if (M.kind === 'hotseat') scene.setCosmetics({ cue: M.cues[seat] });
  if (isBotSeat(seat)) return botTurn();
  if (isRemoteSeat(seat)) { inp.on = false; scene.setCosmetics({ cue: M.cues[seat] }); startTimer(); return; }
  // eigener Zug
  $('#hud').classList.remove('wait');
  inp.on = true; inp.power = 0; inp.callManual = -1; setPowerUi(0);
  inp.a = 0; inp.b = 0; setSpinUi();
  if (g.inHand && !g.sim.on[0]) { const p = g.nearestPlace(HEAD_X, 0); g.sim.put(0, g.inHand === 'break' ? HEAD_X - 6 : p.x, g.inHand === 'break' ? 0 : p.y); if (!g.canPlace(g.sim.x[0], g.sim.y[0])) { const q = g.nearestPlace(g.sim.x[0], g.sim.y[0]); g.sim.put(0, q.x, q.y); } }
  if (g.inHand === 'break' && g.sim.x[0] > HEAD_X) g.sim.put(0, HEAD_X - 6, 0);
  scene.showSim(g.sim);
  inp.ang = defaultAim(g);
  if (M.kind === 'hotseat' && M.game.shots > 0) toast(M.names[seat] + ' ist dran', '', 1400);
  else if (M.kind !== 'training') toast(M.game.phase === 'break' ? 'Anstoß – du bist dran' : g.inHand ? 'Du bist dran – Weiße in der Hand' : 'Du bist dran', '', 1500);
  startTimer(); updateHud();
}
function defaultAim(g) {
  const s = g.sim, cx = s.x[0], cy = s.y[0];
  const legal = g.legalFirst(); let best = null, bd = 1e9;
  for (const b of legal) { const d = (s.x[b] - cx) ** 2 + (s.y[b] - cy) ** 2; if (d < bd) { bd = d; best = b; } }
  if (best == null) return 0;
  return Math.atan2(s.y[best] - cy, s.x[best] - cx);
}

function startTimer() {
  const t = $('#timer'); clearInterval(M.tint);
  if (!M || !M.timer || M.over || M.game.phase === 'over') { t.style.visibility = 'hidden'; return; }
  M.tDur = M.kind === 'online' && M.game.phase === 'break' ? 90 : M.timer; M.tEnd = Date.now() + M.tDur * 1000; t.style.visibility = 'visible';
  const bar = $('i', t);
  M.tint = setInterval(() => {
    if (!M) return;
    const left = Math.max(0, M.tEnd - Date.now()); bar.style.transform = `scaleX(${left / (M.tDur * 1000)})`; bar.style.background = left < 10000 ? 'var(--bad)' : 'var(--acc)';
  }, 100);
}
function stopTimer() { if (M) clearInterval(M.tint); $('#timer').style.visibility = 'hidden'; }

// Computer am Zug
function botTurn() {
  inp.on = false; const g = M.game;
  setTimeout(() => {
    if (!M || M.game !== g || g.phase === 'over') return;
    if (g.inHand) { const p = botPlace(g, M.rand); const q = g.canPlace(p.x, p.y) ? p : g.nearestPlace(p.x, p.y); g.sim.put(0, q.x, q.y); scene.showSim(g.sim); }
    setTimeout(() => {
      if (!M || M.game !== g) return;
      const pick = botShot(g, M.level, M.rand);
      const ang0 = defaultAim(g);
      botAim = { from: ang0, to: pick.ang, t0: performance.now(), dur: 900, power: pick.power, call: pick.call, fired: false };
    }, 350);
  }, 700);
}

// Schuss auslösen (eigener Zug)
function fire() {
  if (!M || !inp.on || M.over) return;
  if (inp.power < 0.03) return;
  inp.on = false; stopTimer();
  const call = effectiveCall();
  const shot = cueShot(inp.ang, inp.power, inp.a, inp.b);
  M.myFouls0 = M.game.fouls[M.game.turn];
  if (M.net) { // online: Server entscheidet, wir halten die Queue zurückgezogen bis sein Stoß kommt
    M.waiting = { ang: inp.ang, power: inp.power, a: inp.a, b: inp.b };
    M.net.sendShot({ shot, call, cue: { x: M.game.sim.x[0], y: M.game.sim.y[0] }, ang: inp.ang, pw: inp.power, a: inp.a, b: inp.b });
    return;
  }
  runShot(M.game.turn, shot, call, { ang: inp.ang, power: inp.power, a: inp.a, b: inp.b });
}
function effectiveCall() {
  if (!M.game.eightIsTarget()) return 0;
  if (inp.callManual >= 0) return inp.callManual;
  return autoCall();
}
function autoCall() {
  const g = M.game, s = g.sim, info = aimInfo(s, inp.ang);
  let ox, oy, px, py;
  if (info.hit === 8) { ox = info.ox; oy = info.oy; px = s.x[8]; py = s.y[8]; } else { px = s.x[8]; py = s.y[8]; ox = 0; oy = 0; }
  let best = 0, bs = 1e9;
  POCKET_MOUTH.forEach((m, i) => {
    const dx = m.x - px, dy = m.y - py, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const score = (ox || oy) ? (1 - (dx * ox + dy * oy) / d) * 100 + d * 0.05 : d;
    if (score < bs) { bs = score; best = i; }
  });
  return best;
}

// Stoß in der Physik ausführen und abspielen. info = Anzeigewerte für die Queue-Animation.
function runShot(seat, shot, call, info) {
  const g = M.game, mode = M.mode;
  const mine = seatIsMe(seat);
  if (g.inHand && !g.sim.on[0]) g.sim.put(0, HEAD_X, 0);
  const pre = { turn: g.turn };
  const res = g.shoot(shot, call, true);
  if (!res) { startTurn(); return; }
  scene.setHandMark(false); inp.on = false; $('#hint').textContent = '';
  anim = { kind: 'cue', t0: performance.now(), res, seat, mine, call, ang: info.ang, power: info.power, a: info.a, b: info.b, pre, done: false };
  scene.setPocketMarks(-1, false);
}

function finishShot(a) {
  if (M.pendingSnap) { // Online: der Stand des Servers gilt
    if (M.pendingHash != null && a.res.st.hash !== M.pendingHash) console.warn('Abweichung zum Server – Stand wird übernommen');
    M.game = Game.fromJSON(M.pendingSnap); M.pendingSnap = null; M.pendingHash = null;
  }
  const g = M.game, out = a.res.out;
  scene.showSim(g.sim);
  // Training: immer wieder derselbe Spieler, neu aufbauen wenn fertig
  if (M.kind === 'training') {
    if (g.phase === 'over') { g.phase = 'play'; g.winner = -1; g.rackNo++; g.groups = [null, null]; g.rack(); g.inHand = 'break'; toast('Alles versenkt – neues Spiel', 'good', 2200); }
    g.turn = 0; g.groups = [null, null]; if (g.phase === 'break') g.phase = 'play';
    if (out.foul) { g.inHand = 'any'; toast(out.foul + ' – Weiße in der Hand', 'foul', 2400); sfx.foul(); }
  } else {
    if (out.rerack) toast(out.reason, '', 2800);
    else if (out.foul) { toast('Foul: ' + out.foul + (g.phase !== 'over' ? ' – Gegner hat die Weiße in der Hand' : ''), 'foul', 3200); sfx.foul(); }
    else if (out.assigned) toast((M.names[a.seat]) + ' spielt ' + (g.groups[a.seat] === 'solid' ? 'die Vollen (1–7)' : 'die Halben (9–15)'), 'good', 2600);
    else if (out.continues && out.pocketed.length) toast('Versenkt – weiter', 'good', 1400);
  }
  if (a.mine && M.kind !== 'hotseat' && M.kind !== 'training') {
    const scored = out.pocketed.some((b) => b !== 0) && !out.foul;
    M.run = scored ? (M.run || 0) + 1 : 0; M.runMax = Math.max(M.runMax || 0, M.run);
    if (M.mode === '9ball' && g.shots === 1 && out.pocketed.includes(9) && !out.foul && g.phase === 'over' && g.winner === a.seat) M.golden = true;
  }
  if (a.mine && M.kind !== 'hotseat') { M.myPocketed += out.pocketed.filter((b) => b !== 0).length; if (out.foul) M.myFouls++; }
  updateHud();
  M.firstShot = false;
  if (M.pendingEnd) { const pe = M.pendingEnd; M.pendingEnd = null; setTimeout(() => endMatch(pe), 900); return; }
  if (g.phase === 'over') { setTimeout(endMatch, 900); return; }
  setTimeout(startTurn, 650);
}

// ------------------------------------------------------------------ Ende
function endMatch(info) {
  if (!M || M.over) return;
  M.over = true; stopTimer(); inp.on = false; const g = M.game; updateHud();
  const winner = info && info.winner != null ? info.winner : g.winner;
  const reason = info && info.reason || g.reason;
  const meWon = M.kind === 'hotseat' ? true : winner === M.me;
  let xp = null, text = '', sub = esc(reason || ''), achHtml = '';
  if (M.kind === 'bot' || M.kind === 'online') {
    const mult = M.kind === 'bot' ? { leicht: 0.5, mittel: 1, schwer: 1.25 }[M.level] : 1.3;
    const earn = (meWon ? 50 : 18) * mult + M.myPocketed * 3;
    xp = Store.addXp(earn);
    let rating;
    if (M.kind === 'online' && M.ratings) { const ra = M.ratings[M.me], rb = M.ratings[1 - M.me], e = 1 / (1 + Math.pow(10, (rb - ra) / 400)); rating = ra + (M.ranked ? 24 : 0) * ((meWon ? 1 : 0) - e); }
    Store.recordMatch({ mode: M.mode, kind: M.kind, level: M.level, win: meWon, pocketed: M.myPocketed, fouls: M.myFouls, opp: M.names[1 - M.me], rating });
    if (rating != null && M.ranked) sub += `<br>Wertung: ${S.rating}`;
    const got = checkAch(S, { run: M.runMax || 0, golden: M.golden && meWon, clean: meWon && M.myFouls === 0 });
    if (got.length) { const bonus = got.reduce((t, x) => t + x.xp, 0); if (bonus) { const x2 = Store.addXp(bonus); xp.to = x2.to; xp.gained += bonus; } else Store.save(); achHtml = got.map((x) => `<div class="sub" style="color:var(--acc);margin-top:6px">Erfolg: <b>${esc(x.name)}</b>${x.xp ? ' (+' + x.xp + ')' : ''}</div>`).join(''); }
  } else if (M.kind === 'hotseat') { text = esc(M.names[winner]) + ' gewinnt'; }
  if (!text) text = meWon ? 'Du hast gewonnen!' : (M.kind === 'online' ? esc(M.names[1 - M.me]) + ' gewinnt' : 'Verloren');
  (meWon ? sfx.win() : sfx.lose());
  const lvl = xp && xp.to > xp.from ? `<div style="margin-top:10px;color:var(--acc);font-weight:700">Level ${xp.to} erreicht! Neues Zubehör freigeschaltet.</div>` : '';
  const m = $('#modal'); m.classList.remove('hidden');
  const rematch = '<button class="btn main" id="rm"><b>Revanche</b></button>';
  m.innerHTML = `<div class="box" style="text-align:center"><h3>${text}</h3><div class="sub">${sub}</div>${xp ? `<div class="sub" style="margin-top:8px">+${xp.gained} Erfahrung</div>` : ''}${lvl}${achHtml}<div class="acts">${rematch}<button class="btn" id="mn"><b>Menü</b></button></div></div>`;
  const kind = M.kind, mode = M.mode, level = M.level, names = M.names;
  const net = M.net;
  const rm = $('#rm', m); if (rm) rm.onclick = () => {
    if (net) { net.rematch(); rm.disabled = true; rm.innerHTML = '<b>Warte auf Gegner …</b>'; return; }
    m.classList.add('hidden'); startMatch({ kind, mode, level, names: kind === 'bot' ? [S.name, names[1]] : names });
  };
  $('#mn', m).onclick = () => { m.classList.add('hidden'); leaveGame(); };
}

function pauseMenu() {
  if (!M) return; const m = $('#modal'); m.classList.remove('hidden');
  const gl = S.set.guide >= 1 ? 'Lang' : S.set.guide > 0 ? 'Kurz' : 'Aus';
  m.innerHTML = `<div class="box"><h3>Pause</h3>
    <div class="grid" style="margin-top:8px">
      <button class="btn" id="pg"><b>Hilfslinie: ${gl}</b><span>Antippen zum Wechseln</span></button>
      <button class="btn" id="ps"><b>Ton: ${S.set.sound ? 'an' : 'aus'}</b><span>Geräusche des Spiels</span></button>
      <button class="btn" id="pe"><b>Einstellungen</b><span>Spielstand-Code …</span></button>
      <button class="btn" id="pq"><b>${M.kind === 'online' ? 'Aufgeben' : 'Spiel beenden'}</b><span>Zurück ins Menü</span></button>
    </div>${M.kind === 'online' ? '<div class="sub" style="margin-top:10px">Nachricht an den Gegner</div><div class="chips" id="em">' + M.net.phrases.map((t, i) => `<button class="btn sm" data-n="${i}"><b>${t}</b></button>`).join('') + '</div>' : ''}<div class="acts"><button class="btn main" id="pc"><b>Weiterspielen</b></button></div></div>`;
  m.querySelectorAll('#em button').forEach((b) => { b.onclick = () => { M.net.emote(+b.dataset.n); toast('Gesendet', '', 800); m.classList.add('hidden'); }; });
  $('#pc', m).onclick = () => m.classList.add('hidden');
  $('#pg', m).onclick = () => { S.set.guide = S.set.guide >= 1 ? 0.5 : S.set.guide > 0 ? 0 : 1; Store.save(); pauseMenu(); };
  $('#ps', m).onclick = () => { S.set.sound = !S.set.sound; sfx.on = S.set.sound; Store.save(); pauseMenu(); };
  $('#pe', m).onclick = () => { m.classList.add('hidden'); if (window.LGH && window.LGH.oeffnen) window.LGH.oeffnen(); };
  $('#pq', m).onclick = () => {
    if (M.kind === 'online' && !M.over) {
      m.innerHTML = '<div class="box" style="text-align:center"><h3>Wirklich aufgeben?</h3><div class="sub">Das Spiel zählt dann als verloren.</div><div class="acts"><button class="btn" id="n"><b>Weiterspielen</b></button><button class="btn main" id="y"><b>Aufgeben</b></button></div></div>';
      $('#n', m).onclick = () => m.classList.add('hidden'); $('#y', m).onclick = () => { m.classList.add('hidden'); M.net && M.net.forfeit(); };
      return;
    }
    m.classList.add('hidden');
    if (M.kind === 'bot' && !M.over && M.game.shots > 2) { Store.recordMatch({ mode: M.mode, kind: 'bot', level: M.level, win: false, pocketed: M.myPocketed, fouls: M.myFouls, opp: M.names[1] }); }
    showMenu();
  };
}

// ------------------------------------------------------------------ Eingabe
function powerGeom() {
  const t = $('#track').getBoundingClientRect(), portrait = window.innerHeight > window.innerWidth * 1.05;
  return { t, portrait };
}
function setPowerUi(v) {
  inp.power = v;
  const { portrait } = powerGeom(), f = $('#fill'), th = $('#thumb');
  if (portrait) { f.style.cssText = `left:${v * 100}%;right:0;top:0;bottom:0;border-radius:0 17px 17px 0`; th.style.cssText = `left:calc(${v * 100}% - ${v * 30}px);top:-4px;width:30px;height:42px`; }
  else { f.style.cssText = `top:${v * 100}%;bottom:0;left:0;right:0;border-radius:0 0 17px 17px`; th.style.cssText = `top:calc(${v * 100}% - ${v * 30}px);left:-5px;right:-5px;height:30px`; }
  $('#plabel').textContent = v > 0 ? Math.round(v * 100) : '';
}
function placePower() { setPowerUi(inp.power); }
function setSpinUi() { const r = 74 / 2 - 8; $('#spin i').style.transform = `translate(${inp.a * r}px,${-inp.b * r}px)`; }

function setupInput() {
  const cv = $('#gl'); let drag = null;
  const rect = () => cv.getBoundingClientRect();
  const wpos = (e) => { const r = rect(); return scene.screenToWorld(e.clientX - r.left, e.clientY - r.top); };
  const near = (p, x, y, d) => (p.x - x) ** 2 + (p.y - y) ** 2 < d * d;
  cv.addEventListener('pointerdown', (e) => {
    sfx.unlock();
    if (!M || !inp.on) return;
    cv.setPointerCapture(e.pointerId);
    const p = wpos(e), g = M.game, s = g.sim;
    // Tasche antippen (nur wenn die 8 das Ziel ist)
    if (g.eightIsTarget()) { let bi = -1, bd = 14; POCKET_MOUTH.forEach((m, i) => { const d = Math.sqrt((m.x - p.x) ** 2 + (m.y - p.y) ** 2); if (d < bd) { bd = d; bi = i; } }); if (bi >= 0) { inp.callManual = bi; sfx.click(); drag = { kind: 'none' }; return; } }
    if (g.inHand && near(p, s.x[0], s.y[0], 7)) { drag = { kind: 'place' }; return; }
    const a0 = Math.atan2(p.y - s.y[0], p.x - s.x[0]);
    drag = { kind: 'aim', a0, ang0: inp.ang, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || !M || !inp.on) return;
    const p = wpos(e), g = M.game, s = g.sim;
    if (drag.kind === 'place') { const q = g.nearestPlace(p.x, p.y); s.put(0, q.x, q.y); return; }
    if (drag.kind === 'aim') {
      drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
      const dx = p.x - s.x[0], dy = p.y - s.y[0]; if (dx * dx + dy * dy < 36) return;
      let d = Math.atan2(dy, dx) - drag.a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      inp.ang = drag.ang0 + d;
    }
  });
  const up = (e) => {
    if (drag && drag.kind === 'aim' && M && inp.on && M.game.inHand && drag.moved < 8 && performance.now() - drag.t < 400) {
      const p = wpos(e), q = M.game.nearestPlace(p.x, p.y); M.game.sim.put(0, q.x, q.y);
      if (M.game.inHand === 'break') inp.ang = 0;
    }
    drag = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { drag = null; });
  // Stärke
  const pw = $('#power'); let pd = null;
  pw.addEventListener('pointerdown', (e) => {
    sfx.unlock(); if (!M || !inp.on) return; const { t, portrait } = powerGeom();
    const th = $('#thumb').getBoundingClientRect(); const pad = 22;
    if (e.clientX < th.left - pad || e.clientX > th.right + pad || e.clientY < th.top - pad || e.clientY > th.bottom + pad) return;
    pw.setPointerCapture(e.pointerId); pd = { t, portrait };
  });
  pw.addEventListener('pointermove', (e) => {
    if (!pd) return; const { t, portrait } = pd;
    const v = portrait ? (e.clientX - t.left) / t.width : (e.clientY - t.top) / t.height;
    setPowerUi(Math.max(0, Math.min(1, v)));
  });
  const pe = () => { if (!pd) return; pd = null; if (inp.power >= 0.05) fire(); else setPowerUi(0); };
  pw.addEventListener('pointerup', pe); pw.addEventListener('pointercancel', () => { pd = null; setPowerUi(0); });
  // Treffpunkt
  const sp = $('#spin');
  const setSpin = (e) => {
    const r = sp.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2 - 8;
    let a = (e.clientX - cx) / rad, b = -(e.clientY - cy) / rad; const l = Math.sqrt(a * a + b * b); if (l > 1) { a /= l; b /= l; }
    if (Math.abs(a) < 0.08) a = 0; if (Math.abs(b) < 0.08) b = 0; inp.a = a; inp.b = b; setSpinUi();
  };
  let sd = false; sp.addEventListener('pointerdown', (e) => { sd = true; sp.setPointerCapture(e.pointerId); setSpin(e); });
  sp.addEventListener('pointermove', (e) => { if (sd) setSpin(e); }); sp.addEventListener('pointerup', () => { sd = false; }); sp.addEventListener('dblclick', () => { inp.a = 0; inp.b = 0; setSpinUi(); });
  // Feinzielen
  const hold = (id, dir) => {
    const b = $(id); let iv = null, n = 0;
    const step = () => { if (!M || !inp.on) return; n++; inp.ang += dir * (n < 12 ? 0.0006 : n < 30 ? 0.0016 : 0.004); };
    b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); n = 0; step(); clearInterval(iv); iv = setInterval(step, 30); });
    const stop = () => { clearInterval(iv); }; b.addEventListener('pointerup', stop); b.addEventListener('pointercancel', stop);
  };
  hold('#fl', -1); hold('#fr', 1);
  $('#bmenu').onclick = () => { sfx.click(); pauseMenu(); };
  window.addEventListener('keydown', (e) => {
    if (!M || !inp.on || e.target.tagName === 'INPUT') return;
    const k = e.key, f = e.shiftKey ? 0.02 : 0.0035;
    if (k === 'ArrowLeft') inp.ang -= f; else if (k === 'ArrowRight') inp.ang += f;
    else if (k === 'ArrowUp') setPowerUi(Math.max(0, inp.power - 0.05)); else if (k === 'ArrowDown') setPowerUi(Math.min(1, inp.power + 0.05));
    else if (k === ' ' || k === 'Enter') { if (inp.power < 0.05) setPowerUi(0.5); fire(); e.preventDefault(); }
  });
  cv.addEventListener('wheel', (e) => { if (M && inp.on) { inp.ang += Math.sign(e.deltaY) * 0.0012; e.preventDefault(); } }, { passive: false });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('gesturestart', (e) => e.preventDefault());
}

// ------------------------------------------------------------------ Hauptschleife
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!M) { scene.render(); return; }
  const g = M.game;
  if (anim.kind === 'cue') {
    const k = (now - anim.t0) / 1000, pullT = 0.26, strikeT = 0.09;
    const pull = k < pullT ? easeOut(k / pullT) * Math.max(0.15, anim.power) : Math.max(0, Math.max(0.15, anim.power) * (1 - (k - pullT) / strikeT));
    scene.setAim({ show: true, sim: preSim(anim), ang: anim.ang, info: aimInfo(preSim(anim), anim.ang), pull, spinA: anim.a, spinB: anim.b, guide: 0, cue: true });
    if (k >= pullT + strikeT) {
      sfx.cue(anim.power); scene.setAim(null);
      anim = Object.assign(anim, { kind: 'run', t: 0, ev: 0, idx: 0 }); scene.setBallCount(g.maxBall());
      // Startbild: Zustand vor dem Stoß
    }
  } else if (anim.kind === 'run') {
    const fr = anim.res.st.frames, ev = anim.res.st.events;
    // langsam auslaufende Bewegung beschleunigen
    // Das Auslaufen wird nur ganz sanft gerafft: die sichtbare Geschwindigkeit nimmt dabei immer weiter ab (nie wieder zu), kein Ruck
    let target = 1; const i0 = Math.min(fr.length - 2, Math.floor(anim.t / FRAME_DT));
    if (i0 >= 0 && anim.t > 0.8) { let mx = 0; const a = fr[i0], b = fr[i0 + 1]; for (let i = 0; i < 16; i++) if (a[i * 6 + 5]) mx = Math.max(mx, Math.abs(b[i * 6] - a[i * 6]) + Math.abs(b[i * 6 + 1] - a[i * 6 + 1])); const v = mx / FRAME_DT; target = v >= 90 ? 1 : Math.min(2.6, Math.sqrt(90 / Math.max(v, 1))); }
    anim.sp = anim.sp || 1; anim.sp += (target - anim.sp) * Math.min(1, dt * 2.5);
    const step = dt * anim.sp; anim.t += step;
    const tt = anim.t; let i = Math.floor(tt / FRAME_DT); const alpha = tt / FRAME_DT - i;
    while (anim.ev < ev.length && ev[anim.ev].t <= tt) { const e = ev[anim.ev++]; if (e.k === 'ball') sfx.ball(e.s); else if (e.k === 'rail') sfx.rail(e.s); else if (e.k === 'pocket') { sfx.pocket(); } }
    if (i >= fr.length - 1) { anim.kind = 'done'; finishShot(anim); }
    else scene.pose(fr[i], fr[i + 1], alpha, step, now / 1000);
  } else if (anim.kind === 'idle') {
    drawAim(now);
  }
  scene.render();
}
const easeOut = (x) => 1 - (1 - x) * (1 - x);
function preSim(a) {
  // Zustand der Kugeln vor dem Stoß = Startbild der Aufzeichnung
  if (!a.pre.sim) { const s = a.res.st.frames[0]; const o = { x: new Float64Array(16), y: new Float64Array(16), on: new Uint8Array(16) }; for (let i = 0; i < 16; i++) { o.x[i] = s[i * 6]; o.y[i] = s[i * 6 + 1]; o.on[i] = s[i * 6 + 5]; } a.pre.sim = o; }
  return a.pre.sim;
}
let predKey = '', predVal = null;
// Zielhilfe: Geometrie + echte Vorausberechnung des Stoßes (Mitnahme, Vor-/Rückdrall), damit die Linien dem Ergebnis entsprechen
function guideInfo(g, ang, a, b, power) {
  const s = g.sim, info = aimInfo(s, ang);
  if (info.hit > 0) {
    const pw = power > 0.08 ? Math.round(power * 10) / 10 : 0.4;
    const key = [ang.toFixed(4), a.toFixed(2), b.toFixed(2), pw, s.x[0].toFixed(1), s.y[0].toFixed(1), g.shots, g.rackNo].join();
    if (key !== predKey) { predKey = key; predVal = predictShot(s, ang, a, b, pw); }
    const p = predVal;
    if (p && p.obj === info.hit) Object.assign(info, { ox: p.ox, oy: p.oy, olen: p.olen, cx: p.cx, cy: p.cy, clen: p.clen });
  }
  return info;
}
function drawAim(now) {
  if (!M || M.over) { scene.setAim(null); return; }
  const g = M.game;
  if (botAim) {
    const k = Math.min(1, (now - botAim.t0) / botAim.dur), e = k * k * (3 - 2 * k);
    const ang = botAim.from + (botAim.to - botAim.from) * e;
    const pull = k > 0.7 ? Math.min(1, (k - 0.7) / 0.3) * botAim.power : 0;
    scene.setAim({ show: true, sim: g.sim, ang, info: aimInfo(g.sim, ang), pull, spinA: 0, spinB: 0, guide: 0, cue: true });
    if (k >= 1 && !botAim.fired) {
      botAim.fired = true; const b = botAim; botAim = null;
      const call = g.eightIsTarget() ? b.call : 0;
      runShot(g.turn, cueShot(b.to, b.power, 0, 0), call, { ang: b.to, power: b.power, a: 0, b: 0 });
    }
    return;
  }
  if (M.waiting) {
    const w = M.waiting; scene.setAim({ show: true, sim: g.sim, ang: w.ang, info: aimInfo(g.sim, w.ang), pull: w.power, spinA: w.a, spinB: w.b, guide: 0, cue: true });
    scene.setHandMark(false); return;
  }
  if (M.remoteAim && !seatIsMe(g.turn) && g.sim.on[0]) {
    const r = M.remoteAim; scene.setAim({ show: true, sim: g.sim, ang: r.ang, info: aimInfo(g.sim, r.ang), pull: r.pull || 0, spinA: r.a || 0, spinB: r.b || 0, guide: 0, cue: true });
    return;
  }
  if (inp.on) {
    const s = g.sim, info = guideInfo(g, inp.ang, inp.a, inp.b, inp.power);
    scene.setAim({ show: true, sim: s, ang: inp.ang, info, pull: inp.power, spinA: inp.a, spinB: inp.b, guide: S.set.guide, cue: true });
    const hand = g.inHand;
    scene.setHandMark(!!hand, s.x[0], s.y[0], hand ? g.canPlace(s.x[0], s.y[0]) : true);
    if (g.eightIsTarget()) scene.setPocketMarks(effectiveCall(), true); else scene.setPocketMarks(-1, false);
    if (M.net && hand && M.net.sendPlace) { const k = s.x[0].toFixed(1) + ',' + s.y[0].toFixed(1); if (k !== M.lastPlaceSend && now - (M.lastPlaceT || 0) > 100) { M.lastPlaceSend = k; M.lastPlaceT = now; M.net.sendPlace(s.x[0], s.y[0]); } }
    if (M.net && now - (M.lastAimSend || 0) > 120 && M.net.sendAim) { M.lastAimSend = now; M.net.sendAim({ ang: inp.ang, pull: inp.power, a: inp.a, b: inp.b }); }
  } else { scene.setAim(null); scene.setHandMark(false); }
}

// ------------------------------------------------------------------ Online
const busy = () => !!M && (anim.kind === 'cue' || anim.kind === 'run');
function applyGame(snap) { if (!M) return; M.game = Game.fromJSON(snap); M.waiting = null; scene.showSim(M.game.sim); updateHud(); }
function onRemoteShot(m) {
  if (!M || M.over) return;
  const g = M.game; stopTimer(); inp.on = false;
  M.waiting = null; M.remoteAim = null;
  if (g.inHand && m.cue) g.sim.put(0, m.cue.x, m.cue.y);
  M.pendingSnap = m.snap; M.pendingHash = m.hash;
  runShot(m.seat, m.shot, m.call, { ang: m.ang, power: m.pw, a: m.a, b: m.b });
}
function netCtx(extra) { return Object.assign({ S, sfx, startMatch, showMenu, toast, setScreen, hideScreen, esc, getM: () => M, runShot, endMatch, startTurn, updateHud, scene, inp, busy, applyGame, onRemoteShot, reopenInput: startTurn }, extra); }
function startOnline(kind) { Online.start(kind, netCtx()); }
function askCode() { Online.askCode({ S, joinRoom }); }
function joinRoom(code) { Online.start('join', netCtx({ code })); }

window.__scene = () => scene;
window.__bil = () => ({ anim: anim.kind, turn: M && M.game.turn, over: M && M.over, inp: inp.on, power: inp.power, st: anim.res && anim.res.st.time, fouls: M && M.game.fouls, hash: M && M.game.sim.hash(), me: M && M.me, shots: M && M.game.shots, kind: M && M.kind, waiting: !!(M && M.waiting) });
boot();
