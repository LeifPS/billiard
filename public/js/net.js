// Online: Warteschlange, Räume und Spiel über den Server (Schiedsrichter). Die Physik läuft bei allen identisch, der Server entscheidet.
import { Game } from './rules.js';

const wsUrl = (p) => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + p;
const PHRASES = ['Gut gespielt!', 'Pech!', 'Danke', 'Nochmal?', 'Puh!', 'Hoppla', 'Schöner Stoß', 'Los geht’s'];
const hubStatus = (code) => { try { if (window.parent !== window) window.parent.postMessage({ lgh: 'status', spiel: 'billiard', raum: code || null }, '*'); } catch (e) { /* kein Hub */ } };

function socket(path, onMsg, onClose, onOpen) {
  const ws = new WebSocket(wsUrl(path)); let hb = null;
  ws.onopen = () => { onOpen && onOpen(ws); hb = setInterval(() => { try { ws.send('{"t":"ping"}'); } catch (e) { /* weg */ } }, 20000); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } if (m.t !== 'pong') onMsg(m); };
  ws.onclose = () => { clearInterval(hb); onClose && onClose(); };
  ws.onerror = () => { };
  return ws;
}

const KEY = 'billiard.match';
const saved = () => { try { const o = JSON.parse(localStorage.getItem(KEY)); return o && Date.now() - o.t < 20 * 60000 ? o : null; } catch (e) { return null; } };
const keep = (o) => { try { o ? localStorage.setItem(KEY, JSON.stringify(Object.assign({ t: Date.now() }, o))) : localStorage.removeItem(KEY); } catch (e) { /* ohne Speicher */ } };

export const Online = {
  // Nach Neuladen (z. B. wenn iOS die Seite beendet hat) zurück in das laufende Spiel
  resume(ctx) { const o = saved(); if (o) openMatch(o, ctx, true); },

  askCode(ctx) {
    const m = document.querySelector('#modal'); m.classList.remove('hidden');
    m.innerHTML = '<div class="box"><h3>Raum beitreten</h3><div class="sub">Gib den Code deines Freundes ein.</div><input class="in" id="cd" maxlength="4" autocomplete="off" autocapitalize="characters" style="margin-top:12px"><div class="acts"><button class="btn" id="x"><b>Zurück</b></button><button class="btn main" id="go"><b>Beitreten</b></button></div></div>';
    const inp = m.querySelector('#cd'); setTimeout(() => inp.focus(), 50);
    m.querySelector('#x').onclick = () => m.classList.add('hidden');
    const go = () => { const c = inp.value.trim(); if (c.length >= 4) { m.classList.add('hidden'); ctx.joinRoom(c); } };
    m.querySelector('#go').onclick = go; inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  },

  start(kind, ctx) {
    const { S } = ctx, m = document.querySelector('#modal');
    let lob = null, done = false, t0 = Date.now(), tick = null, code = '';
    const close = () => { done = true; clearInterval(tick); try { lob && lob.close(); } catch (e) { /* weg */ } hubStatus(null); m.classList.add('hidden'); };
    const show = (html) => { m.classList.remove('hidden'); m.innerHTML = '<div class="box" style="text-align:center">' + html + '</div>'; };
    const fail = (msg) => { clearInterval(tick); show(`<h3>Online</h3><div class="sub">${ctx.esc(msg)}</div><div class="acts"><button class="btn" id="ok"><b>OK</b></button></div>`); m.querySelector('#ok').onclick = () => { m.classList.add('hidden'); }; };
    const base = { pid: S.pid, name: S.name, mode: S.set.mode, rating: S.rating };
    const onMsg = (msg) => {
      if (msg.t === 'match') { done = true; clearInterval(tick); try { lob.close(); } catch (e) { /* weg */ } openMatch(msg, ctx); }
      else if (msg.t === 'room') { code = msg.code; hubStatus(code); showRoom(); }
      else if (msg.t === 'err') fail(msg.m);
      else if (msg.t === 'nomatch') { const b = m.querySelector('#bot'); if (b) b.classList.remove('hidden'); const h = m.querySelector('#nm'); if (h) h.textContent = 'Gerade ist niemand online. Du kannst weiter warten oder gegen den Computer spielen.'; }
    };
    const showRoom = () => {
      show(`<h3>Raum erstellt</h3><div class="sub">Sag deinem Freund diesen Code (er steht auch im Hub bei dir):</div><div class="code">${code}</div><div class="sub">${S.set.mode === '9ball' ? '9-Ball' : '8-Ball'} · Warten auf Mitspieler …</div><div class="acts"><button class="btn" id="cp"><b>Code kopieren</b></button><button class="btn" id="x"><b>Abbrechen</b></button></div>`);
      m.querySelector('#cp').onclick = () => { try { navigator.clipboard.writeText(code); ctx.toast('Code kopiert', 'good', 1200); } catch (e) { /* ohne Zwischenablage */ } };
      m.querySelector('#x').onclick = () => { close(); };
    };
    const connect = () => {
      lob = socket('/ws/lobby', onMsg, () => { if (!done) fail('Verbindung zum Server fehlgeschlagen. Ist das Internet an?'); }, (w) => {
        const send = (o) => w.send(JSON.stringify(o));
        if (kind === 'queue') send(Object.assign({ t: 'queue' }, base));
        else if (kind === 'create') send(Object.assign({ t: 'create' }, base));
        else if (kind === 'join') send(Object.assign({ t: 'join', code: ctx.code }, base));
      });
    };
    if (kind === 'queue') {
      show(`<h3>Gegner wird gesucht …</h3><div class="sub" id="nm">${S.set.mode === '9ball' ? '9-Ball' : '8-Ball'} · Wertung ${S.rating}</div><div class="spinner" style="margin:16px auto"></div><div id="el" class="sub">0 s</div><div class="acts"><button class="btn hidden" id="bot"><b>Gegen Computer spielen</b></button><button class="btn" id="x"><b>Abbrechen</b></button></div>`);
      tick = setInterval(() => { const e = m.querySelector('#el'); if (e) e.textContent = Math.round((Date.now() - t0) / 1000) + ' s'; }, 500);
      m.querySelector('#x').onclick = close;
      m.querySelector('#bot').onclick = () => { close(); ctx.startMatch({ kind: 'bot', mode: S.set.mode, level: S.set.level }); };
    } else if (kind === 'create') show('<h3>Raum wird erstellt …</h3><div class="spinner" style="margin:16px auto"></div>');
    else show('<h3>Verbinde …</h3><div class="spinner" style="margin:16px auto"></div>');
    connect();
  },
};

function openMatch(info, ctx, silent) {
  const { S } = ctx; let ws = null, closed = false, tries = 0, over = false, got = !silent;
  keep({ matchId: info.matchId, mode: info.mode, ranked: info.ranked, room: info.room });
  if (silent) setTimeout(() => { if (!got) { closed = true; keep(null); try { ws && ws.close(); } catch (e) { /* weg */ } } }, 5000);
  const send = (o) => { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) { /* weg */ } };
  const net = {
    localAuth: false,
    sendShot: (o) => send({ t: 'shot', shot: o.shot, call: o.call, cue: o.cue, ang: o.ang, pw: o.pw, a: o.a, b: o.b }),
    sendAim: (o) => send({ t: 'aim', ang: o.ang, pull: o.pull, a: o.a, b: o.b }),
    sendPlace: (x, y) => send({ t: 'place', x, y }),
    forfeit: () => send({ t: 'forfeit' }),
    rematch: () => send({ t: 'rematch' }),
    emote: (n) => send({ t: 'emote', n }),
    phrases: PHRASES,
    verify() { },
    leave() { closed = true; keep(null); hubStatus(null); try { ws && ws.close(); } catch (e) { /* weg */ } },
  };
  const hello = () => send({ t: 'hello', pid: S.pid, name: S.name, mode: info.mode, ranked: info.ranked, rating: S.rating, cue: S.cos.cue });
  const onMsg = (m) => {
    got = true;
    const M = ctx.getM();
    switch (m.t) {
      case 'start':
        document.querySelector('#modal').classList.add('hidden'); over = false;
        ctx.startMatch({ kind: 'online', mode: m.mode, seed: m.seed, first: m.first, me: m.seat, names: m.names, cues: m.cues, ranked: m.ranked, ratings: m.ratings, timer: m.timer, net });
        if (info.room) hubStatus(info.room);
        break;
      case 'resume':
        document.querySelector('#modal').classList.add('hidden');
        if (!M || M.net !== net) ctx.startMatch({ kind: 'online', mode: m.mode, gameJSON: m.snap, me: m.seat, names: m.names, cues: m.cues, ranked: m.ranked, ratings: m.ratings, timer: m.timer, net });
        else if (!ctx.busy()) { ctx.applyGame(m.snap); ctx.startTurn(); }
        if (m.phase === 'over') setTimeout(() => ctx.endMatch({ winner: m.winner, reason: m.reason }), 50);
        break;
      case 'shot': if (M) { ctx.onRemoteShot(m); } break;
      case 'aim': if (M) M.remoteAim = { ang: m.ang, pull: m.pull, a: m.a, b: m.b, t: performance.now() }; break;
      case 'place': if (M && !ctx.busy()) { M.game.sim.put(0, m.x, m.y); ctx.scene.showSim(M.game.sim); } break;
      case 'timeout': if (M) { ctx.applyGame(m.snap); ctx.toast((M.names[m.seat] || '') + ': Zeit abgelaufen – Foul', 'foul', 2800); ctx.startTurn(); } break;
      case 'opp': ctx.toast(m.away ? 'Gegner hat die Verbindung verloren – ' + (m.secs || 45) + ' s Wartezeit' : 'Gegner ist wieder da', m.away ? 'foul' : 'good', m.away ? 4000 : 2000); break;
      case 'emote': ctx.toast((M ? M.names[m.seat] : 'Gegner') + ': ' + PHRASES[m.n], '', 2200); break;
      case 'rematch': ctx.toast('Dein Gegner möchte eine Revanche', 'good', 3000); break;
      case 'reject': if (M && M.waiting) { M.waiting = null; ctx.reopenInput(); ctx.toast(m.m, 'foul', 2200); } break;
      case 'end': over = true; keep(null); if (M) { if (ctx.busy()) M.pendingEnd = { winner: m.winner, reason: m.reason }; else ctx.endMatch({ winner: m.winner, reason: m.reason }); } break;
      case 'err': ctx.toast(m.m, 'foul', 3000); break;
    }
  };
  const connect = () => {
    ws = socket('/ws/match/' + info.matchId, onMsg, () => {
      if (closed || over) return;
      tries++; if (tries > 40) { ctx.toast('Verbindung verloren', 'foul', 4000); return; }
      if (tries === 1) ctx.toast('Verbindung weg – verbinde neu …', 'foul', 3000);
      setTimeout(() => { if (!closed && !over) connect(); }, Math.min(5000, 600 * tries));
    }, () => { tries = 0; hello(); });
  };
  connect();
}
