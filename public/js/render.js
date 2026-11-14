// 3D-Darstellung (three.js): Tisch von oben, Kugeln, Queue, Zielhilfe. Weltkoordinaten: Simulation (x,y) -> three (x, 0, y).
import * as THREE from '../vendor/three.module.min.js';
import { R, HX, HY, POCKET_MOUTH, POCKETS, CUSHIONS } from './physics.js';
import { BALL_SETS, find } from './cosmetics.js';

const F = 11;               // Breite von Bande + Holzrahmen
const TOP = 3.3;            // Höhe der Rahmenoberkante
const LH = R + 0.25;        // Höhe der Hilfslinien
export const TABLE_W = 2 * (HX + F), TABLE_H = 2 * (HY + F);

function ballTexture(n, set) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const striped = n >= 9, solid = n >= 1 && n <= 8;
  const col = n === 0 ? set.cue : n === 8 ? set.eight : set.cols[(n - 1) % 7];
  g.fillStyle = striped ? set.bg : col; g.fillRect(0, 0, 512, 256);
  if (striped) { g.fillStyle = col; g.fillRect(0, 56, 512, 144); }
  if (n === 0) {
    g.fillStyle = '#c0392b';
    for (const u of [0.25, 0.75]) { g.beginPath(); g.arc(u * 512, 128, 9, 0, 7); g.fill(); }
    g.fillStyle = '#2d6cdf'; g.beginPath(); g.arc(0, 128, 8, 0, 7); g.fill(); g.beginPath(); g.arc(512, 128, 8, 0, 7); g.fill();
  } else {
    for (const u of [0.25, 0.75]) {
      g.fillStyle = set.dark ? '#f4f4ff' : '#fbfbf6'; g.beginPath(); g.arc(u * 512, 128, 50, 0, 7); g.fill();
      g.fillStyle = set.dark ? '#111' : '#141414'; g.font = '800 62px "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), u * 512, 132);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function clothTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
  const d = g.getImageData(0, 0, 256, 256); let s = 12345;
  for (let i = 0; i < d.data.length; i += 4) { s = (s * 1664525 + 1013904223) >>> 0; const v = 232 + (s >>> 24) % 24; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; }
  g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(26, 13); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.05;
    this.renderer.setClearColor(0x0c0f14, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 20, 1500);
    this.portrait = false; this.w = 1; this.h = 1; this.margins = { l: 0, r: 0, t: 0, b: 0 };
    this.mode = 'top'; // 'top' | 'tilt'
    const hemi = new THREE.HemisphereLight(0xffffff, 0x303844, 0.85); this.scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xfff4e0, 1.0); dir.position.set(-60, 220, 80); this.scene.add(dir);
    const lamp = new THREE.PointLight(0xfff0d8, 1.35, 0, 0); lamp.position.set(0, 190, 0); this.scene.add(lamp);
    this.shTex = shadowTexture();
    this.balls = []; this.fall = new Array(16).fill(null); this.lastOn = new Array(16).fill(1);
    this.set = BALL_SETS.klassik; this.setId = '';
    this.tableGroup = new THREE.Group(); this.scene.add(this.tableGroup);
    this.ballGroup = new THREE.Group(); this.scene.add(this.ballGroup);
    this.buildBalls(16);
    this.buildGuides(); this.buildCue(); this.buildCueFx();
    this.cos = null;
    this.trail = { items: [], n: 0, geo: new THREE.CircleGeometry(1.5, 14).rotateX(-Math.PI / 2), last: 0 };
    for (let i = 0; i < 90; i++) { const m = new THREE.Mesh(this.trail.geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; m.position.y = R * 2 + 0.3; this.scene.add(m); this.trail.items.push({ m, t0: -9, vx: 0, vz: 0 }); }
    this.setCosmetics({ cloth: 'gruen', frame: 'nuss', balls: 'klassik', cue: 'ahorn', trail: 'keine' });
  }

  // ---------------------------------------------------------------- Aufbau
  setCosmetics(c) {
    const prev = this.cos || {};
    this.cos = Object.assign({}, prev, c);
    if (prev.cloth !== this.cos.cloth || prev.frame !== this.cos.frame) this.buildTable();
    if (prev.balls !== this.cos.balls) this.applyBallSet(this.cos.balls);
    if (prev.cue !== this.cos.cue) this.applyCue(this.cos.cue);
  }
  clearTrail() { for (const p of this.trail.items) { p.t0 = -9; p.m.visible = false; } }
  emitTrail(x, y, tNow) {
    const c = find('trail', this.cos.trail); if (!c || !c.col) return;
    const T = this.trail; if (tNow - T.last < 0.012) return; T.last = tNow;
    const p = T.items[T.n++ % T.items.length];
    p.t0 = tNow; p.m.position.set(x + (Math.random() - 0.5) * 1.2, R * 2 + 0.3, y + (Math.random() - 0.5) * 1.2);
    p.vx = (Math.random() - 0.5) * 6; p.vz = (Math.random() - 0.5) * 6;
    p.m.material.color.set(c.col === 'rainbow' ? new THREE.Color().setHSL((tNow * 0.9) % 1, 0.9, 0.62) : c.col);
    p.m.visible = true; p.life = c.id === 'funke' ? 0.55 : 0.9;
  }
  updateTrail(tNow) {
    for (const p of this.trail.items) {
      if (!p.m.visible) continue; const k = (tNow - p.t0) / (p.life || 0.8);
      if (k >= 1) { p.m.visible = false; continue; }
      p.m.material.opacity = 0.9 * (1 - k); p.m.scale.setScalar(1.3 - 0.8 * k); p.m.position.x += p.vx * 0.016; p.m.position.z += p.vz * 0.016;
    }
  }
  setOpponentCue(id) { this.applyCue(id || this.cos.cue); }

  buildTable() {
    const g = this.tableGroup; while (g.children.length) { const o = g.children.pop(); o.traverse && o.traverse((m) => { m.geometry && m.geometry.dispose(); }); }
    const cl = find('cloth', this.cos.cloth), fr = find('frame', this.cos.frame);
    const clothMat = new THREE.MeshStandardMaterial({ color: cl.c, roughness: 0.95, map: this.clothTex || (this.clothTex = clothTexture()) });
    const cushMat = new THREE.MeshStandardMaterial({ color: cl.d, roughness: 0.85, side: THREE.DoubleSide });
    const woodMat = new THREE.MeshStandardMaterial({ color: fr.c, roughness: 0.45, metalness: 0.05 });
    const inlay = new THREE.MeshStandardMaterial({ color: fr.a, roughness: 0.35, metalness: 0.25 });
    const dark = new THREE.MeshBasicMaterial({ color: 0x050506 });
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX + 14, 2 * HY + 14).rotateX(-Math.PI / 2), clothMat); cloth.position.y = 0; g.add(cloth);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 700).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 1 })); floor.position.y = -40; g.add(floor);
    // Banden: Draufsicht-Polygon aus der Physik (Nase + schräge Enden zur Tasche), Nase leicht abgeschrägt (Gummi läuft nach unten aus)
    const loft = (c) => {
      const H = 2.3, sl = 1.1, ix = -c.o.x * sl, iy = -c.o.y * sl; // Fuß der Nase liegt etwas weiter im Spielfeld
      const top = [c.A, c.B, c.B2, c.A2].map((p) => [p.x, H, p.y]);
      const bot = [[c.A.x + ix, 0, c.A.y + iy], [c.B.x + ix, 0, c.B.y + iy], [c.B2.x, 0, c.B2.y], [c.A2.x, 0, c.A2.y]];
      const pos = [], quad = (a, b, cc, d) => { pos.push(...a, ...b, ...cc, ...a, ...cc, ...d); };
      quad(top[0], top[1], top[2], top[3]); // Oberseite
      for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; quad(bot[k], bot[k2], top[k2], top[k]); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
      geo.computeVertexNormals(); return geo;
    };
    for (const c of CUSHIONS) g.add(new THREE.Mesh(loft(c), cushMat));
    // Taschenmäuler: dunkle Platte zwischen den Bandenenden (statt Filz), wie die Metallecken am echten Tisch
    const plateMat = new THREE.MeshBasicMaterial({ color: 0x15171b });
    const plate = (pts) => { const sh = new THREE.Shape(); pts.forEach((p, k) => (k ? sh.lineTo(p.x, -p.y) : sh.moveTo(p.x, -p.y))); const m = new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), plateMat); m.position.y = 0.05; g.add(m); };
    for (const sy of [-1, 1]) {
      const l = CUSHIONS[(sy > 0 ? 2 : 0) + 1], r = CUSHIONS[(sy > 0 ? 2 : 0)]; // rechte/linke lange Bande dieser Seite
      plate([l.A, l.A2, { x: -l.A2.x, y: l.A2.y }, { x: -l.A.x, y: l.A.y }]);
      for (const sx of [-1, 1]) {
        const lo = CUSHIONS[(sy > 0 ? 2 : 0) + (sx > 0 ? 1 : 0)], sh = CUSHIONS[4 + (sx > 0 ? 1 : 0)], se = sy > 0 ? [sh.B, sh.B2] : [sh.A, sh.A2];
        plate([lo.B, lo.B2, { x: sx * (HX + 5), y: sy * (HY + 5) }, se[1], se[0]]);
      }
    }
    // Rahmen
    const wood = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, TOP, d), woodMat); m.position.set(x, TOP / 2, z); g.add(m); };
    const inner = 5; // Holz beginnt hinter der Bande
    wood(2 * (HX + F), F - inner, 0, HY + inner + (F - inner) / 2); wood(2 * (HX + F), F - inner, 0, -(HY + inner + (F - inner) / 2));
    wood(F - inner, 2 * (HY + inner), HX + inner + (F - inner) / 2, 0); wood(F - inner, 2 * (HY + inner), -(HX + inner + (F - inner) / 2), 0);
    // schmale Zierleiste außen und Auflage unter den Banden
    for (const sz of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(2 * (HX + F) - 1, 0.4, 0.8), inlay); m.position.set(0, TOP + 0.2, sz * (HY + F - 1.2)); g.add(m); }
    for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 2 * (HY + F) - 1), inlay); m.position.set(sx * (HX + F - 1.2), TOP + 0.2, 0); g.add(m); }
    // Raute-Markierungen
    const dia = new THREE.CircleGeometry(0.62, 16).rotateX(-Math.PI / 2);
    for (const k of [1, 2, 3]) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const m = new THREE.Mesh(dia, inlay); m.position.set(sx * HX * k / 4, TOP + 0.45, sz * (HY + inner + (F - inner) / 2)); g.add(m); }
    }
    for (const k of [-1, 0, 1]) for (const sx of [-1, 1]) { const m = new THREE.Mesh(dia, inlay); m.position.set(sx * (HX + inner + (F - inner) / 2), TOP + 0.45, k * HY / 2); g.add(m); }
    // Taschen
    const disc = (r, x, z) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2), dark); m.position.set(x, TOP + 0.05, z); g.add(m); };
    for (const P of POCKETS) disc(P.c ? 7.2 : 5.8, P.x * 0.98, P.y * 0.98);
    // Zielzeichen (Fuß- und Kopfpunkt)
    const dot = (x, z) => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 })); m.position.set(x, 0.02, z); g.add(m); };
    dot(HX / 2, 0); dot(-HX / 2, 0); dot(0, 0);
    const hl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 2 * (HY - 6)).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })); hl.position.set(-HX / 2, 0.02, 0); g.add(hl);
  }

  buildBalls(n) {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0.02 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), mat);
      mesh.quaternion.setFromEuler(new THREE.Euler(((i * 53) % 7) * 0.9, ((i * 37) % 11) * 0.57, Math.PI / 2 + i)); // Zahl nach oben
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(R * 3.4, R * 3.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: this.shTex, transparent: true, depthWrite: false }));
      sh.position.y = 0.04;
      this.ballGroup.add(mesh); this.ballGroup.add(sh);
      this.balls.push({ mesh, sh, mat, wx: 0, wy: 0, wz: 0 });
    }
  }
  applyBallSet(id) {
    this.setId = id; this.set = BALL_SETS[id] || BALL_SETS.klassik;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i]; if (b.mat.map) b.mat.map.dispose();
      b.mat.map = ballTexture(i, this.set); b.mat.needsUpdate = true;
    }
  }
  // Im 9-Ball sind 10..15 nicht im Spiel
  setBallCount(max) { for (let i = 0; i < 16; i++) { const v = i <= max; this.balls[i].mesh.visible = v && this.lastOn[i]; this.balls[i].sh.visible = this.balls[i].mesh.visible; } this.maxBall = max; }

  buildGuides() {
    const mk = (col, op) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false })); m.visible = false; m.renderOrder = 5; this.scene.add(m); return m; };
    this.gAim = mk(0xffffff, 0.8); this.gObj = mk(0xffe36b, 0.9); this.gCue = mk(0xffffff, 0.55); this.gRebound = mk(0xffffff, 0.35);
    const ring = new THREE.Mesh(new THREE.RingGeometry(R - 0.14, R, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    ring.visible = false; ring.renderOrder = 5; this.scene.add(ring); this.gGhost = ring;
    this.pocketRings = POCKET_MOUTH.map((m, i) => {
      const r = new THREE.Mesh(new THREE.RingGeometry(POCKETS[i].r - 1.0, POCKETS[i].r, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.0, depthWrite: false }));
      r.position.set(POCKETS[i].x * 0.98, TOP + 0.12, POCKETS[i].y * 0.98); r.renderOrder = 6; this.scene.add(r); return r;
    });
    const hand = new THREE.Mesh(new THREE.RingGeometry(R + 0.5, R + 1.1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5dff9a, transparent: true, opacity: 0.9, depthWrite: false }));
    hand.visible = false; hand.renderOrder = 5; this.scene.add(hand); this.gHand = hand;
    this.targetMark = new THREE.Mesh(new THREE.RingGeometry(R + 0.4, R + 0.8, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd24a, transparent: true, opacity: 0.0, depthWrite: false }));
    this.targetMark.renderOrder = 5; this.scene.add(this.targetMark);
  }
  strip(mesh, x0, y0, x1, y1, w) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.sqrt(dx * dx + dy * dy);
    mesh.visible = l > 0.05; if (!mesh.visible) return;
    mesh.position.set((x0 + x1) / 2, LH, (y0 + y1) / 2); mesh.rotation.set(0, -Math.atan2(dy, dx), 0); mesh.scale.set(l, 1, w);
  }

  buildCue() {
    const g = new THREE.Group(); this.cueGroup = g; g.visible = false;
    const L = 150;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.5, L * 0.62, 20).rotateZ(Math.PI / 2).translate(L * 0.31 + 2, 0, 0), new THREE.MeshStandardMaterial({ color: 0xe8c98f, roughness: 0.4 }));
    const butt = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.0, L * 0.38, 20).rotateZ(Math.PI / 2).translate(L * 0.62 + 2 + L * 0.19, 0, 0), new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.4 }));
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 16).rotateZ(Math.PI / 2).translate(0.7, 0, 0), new THREE.MeshStandardMaterial({ color: 0x3a7bd5, roughness: 0.8 }));
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 16).rotateZ(Math.PI / 2).translate(2.1, 0, 0), new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3, metalness: 0.6 }));
    g.add(shaft, butt, tip, ring); this.cueParts = { shaft, butt, tip };
    this.scene.add(g);
  }
  applyCue(id) {
    const c = find('cue', id), p = this.cueParts;
    p.shaft.material.color.set(c.a); p.butt.material.color.set(c.b); p.tip.material.color.set(c.t);
    this.cueRainbow = !!c.rainbow;
    const F = this.fx; F.type = c.fx || null; if (c.glow) F.col.set(c.glow);
    for (const m of [p.shaft, p.butt, p.tip]) { m.material.emissive.set(0x000000); m.material.emissiveIntensity = 1; }
    F.tipGlow.visible = !!F.type; F.tipGlow.material.color.set(c.glow || '#ffffff'); F.aura.visible = !!F.type; F.aura.material.color.set(c.glow || '#ffffff');
    if (!F.type) for (const q of F.items) { q.on = false; q.m.visible = false; }
  }
  // Leuchten und Funken der besonderen Stäbe
  buildCueFx() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const x = cv.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const map = new THREE.CanvasTexture(cv);
    const mk = () => new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
    const F = this.fx = { type: null, col: new THREE.Color('#ffffff'), items: [], acc: 0, tPrev: 0, tipGlow: mk() };
    for (let i = 0; i < 80; i++) { const m = mk(); m.visible = false; m.renderOrder = 9; this.scene.add(m); F.items.push({ m, on: false, t0: 0, life: 1, vx: 0, vy: 0, vz: 0, s: 1, tw: 0, base: 1 }); }
    // Lichtschein entlang des Stabs (breiter als der Stab selbst, damit man den Effekt von oben sieht)
    const ac = document.createElement('canvas'); ac.width = 128; ac.height = 64; const ax = ac.getContext('2d');
    const ag = ax.createLinearGradient(0, 0, 0, 64); ag.addColorStop(0, 'rgba(255,255,255,0)'); ag.addColorStop(0.5, 'rgba(255,255,255,0.95)'); ag.addColorStop(1, 'rgba(255,255,255,0)'); ax.fillStyle = ag; ax.fillRect(0, 0, 128, 64);
    ax.globalCompositeOperation = 'destination-in'; const hg = ax.createLinearGradient(0, 0, 128, 0); hg.addColorStop(0, 'rgba(0,0,0,1)'); hg.addColorStop(1, 'rgba(0,0,0,0.08)'); ax.fillStyle = hg; ax.fillRect(0, 0, 128, 64);
    F.aura = new THREE.Mesh(new THREE.PlaneGeometry(105, 6.5).rotateX(-Math.PI / 2).translate(52.5, -1.2, 0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(ac), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    F.aura.visible = false; F.aura.renderOrder = 8; this.cueGroup.add(F.aura);
    F.tipGlow.position.set(0.3, 0, 0); F.tipGlow.visible = false; F.tipGlow.renderOrder = 9; this.cueGroup.add(F.tipGlow);
  }
  spawnFx(t) {
    const F = this.fx, ty = F.type, g = this.cueGroup, a = this.cueAng || 0;
    const q = F.items.find((i) => !i.on); if (!q) return;
    const R_ = Math.random, dx = -Math.cos(a), dz = -Math.sin(a);
    const span = ty === 'glut' ? 45 : ty === 'blitz' ? 35 : ty === 'frost' ? 100 : 120;
    const u = R_() * span, px = g.position.x + dx * u, pz = g.position.z + dz * u, py = g.position.y + u * 0.07 + (R_() - 0.3) * 1.2;
    q.on = true; q.t0 = t; q.m.visible = true; q.m.position.set(px, py, pz);
    const c = q.m.material.color;
    if (ty === 'glut') { q.life = 0.6 + R_() * 0.6; q.vx = (R_() - 0.5) * 6; q.vz = (R_() - 0.5) * 6; q.vy = 5 + R_() * 8; q.base = 1.4 + R_() * 1.4; c.setHSL(0.02 + R_() * 0.08, 1, 0.55 + R_() * 0.2); }
    else if (ty === 'frost') { q.life = 1 + R_() * 0.7; q.vx = (R_() - 0.5) * 3; q.vz = (R_() - 0.5) * 3; q.vy = -(1 + R_() * 2); q.base = 1.3 + R_() * 1.2; q.tw = R_() * 6; c.setHSL(0.53 + R_() * 0.05, 0.8, 0.8); }
    else if (ty === 'blitz') { q.life = 0.07 + R_() * 0.13; q.vx = (R_() - 0.5) * 70; q.vz = (R_() - 0.5) * 70; q.vy = (R_() - 0.3) * 40; q.base = 1.6 + R_() * 1.8; c.setHSL(0.14 + R_() * 0.03, 1, 0.75 + R_() * 0.2); }
    else { q.life = 1.2 + R_() * 0.9; q.vx = (R_() - 0.5) * 1.5; q.vz = (R_() - 0.5) * 1.5; q.vy = (R_() - 0.5) * 1.5; q.base = 1.2 + R_() * 1.2; q.tw = R_() * 6; const pal = ['#ffffff', '#b48cff', '#7fb5ff', '#ff9be6']; c.set(pal[(R_() * 4) | 0]); }
  }
  updateCueFx(t) {
    const F = this.fx, dt = Math.min(0.05, Math.max(0, t - F.tPrev)); F.tPrev = t;
    const ty = F.type, p = this.cueParts, vis = this.cueGroup.visible && !!ty;
    if (vis) {
      const rate = { glut: 55, frost: 38, blitz: 34, galaxie: 24 }[ty] || 0; F.acc += rate * dt;
      while (F.acc >= 1) { F.acc -= 1; this.spawnFx(t); }
      // Leuchten am Stab und an der Spitze
      const pu = 0.5 + 0.5 * Math.sin(t * 3.2), fl = Math.random();
      let gi = 0.5, gs = 7;
      if (ty === 'glut') { p.shaft.material.emissive.set('#ff4a10'); p.shaft.material.emissiveIntensity = 0.25 + 0.25 * pu; p.tip.material.emissive.set('#ff7a2a'); gi = 0.55 + 0.3 * fl; gs = 6 + fl * 2; }
      else if (ty === 'frost') { p.shaft.material.emissive.set('#5ec8ff'); p.shaft.material.emissiveIntensity = 0.18 + 0.1 * pu; gi = 0.4 + 0.2 * pu; gs = 7; }
      else if (ty === 'neon') { const h = 0.46 + 0.36 * (0.5 + 0.5 * Math.sin(t * 1.3)); p.shaft.material.emissive.setHSL(h, 1, 0.5); p.shaft.material.emissiveIntensity = 0.55 + 0.35 * pu; p.butt.material.emissive.setHSL((h + 0.12) % 1, 1, 0.5); p.butt.material.emissiveIntensity = 0.4 + 0.3 * (1 - pu); F.tipGlow.material.color.setHSL(h, 1, 0.6); gi = 0.7 + 0.25 * pu; gs = 8 + 2 * pu; }
      else if (ty === 'blitz') { const on = fl > 0.55; p.shaft.material.emissive.set('#fff36b'); p.shaft.material.emissiveIntensity = on ? 0.6 : 0.08; gi = on ? 0.95 : 0.3; gs = on ? 9 : 5; }
      else if (ty === 'galaxie') { p.butt.material.emissive.set('#6a3cff'); p.butt.material.emissiveIntensity = 0.25 + 0.2 * pu; p.shaft.material.emissive.set('#3a2a9a'); p.shaft.material.emissiveIntensity = 0.2 + 0.15 * (1 - pu); gi = 0.45 + 0.2 * pu; gs = 6; }
      F.tipGlow.material.opacity = gi * 0.7; F.tipGlow.scale.setScalar(gs * 0.55); F.aura.material.opacity = ty === 'blitz' ? (gi > 0.6 ? 0.8 : 0.25) : ty === 'glut' ? 0.35 + 0.25 * pu + 0.1 * fl : ty === 'neon' ? 0.55 + 0.25 * pu : ty === 'frost' ? 0.4 + 0.15 * pu : 0.35 + 0.15 * pu; if (ty === 'neon') F.aura.material.color.copy(F.tipGlow.material.color);
    } else { F.tipGlow.material.opacity = 0; F.aura.material.opacity = 0; }
    for (const q of F.items) {
      if (!q.on) continue;
      const age = t - q.t0; if (age >= q.life) { q.on = false; q.m.visible = false; continue; }
      const k = age / q.life; q.m.position.x += q.vx * dt; q.m.position.y += q.vy * dt; q.m.position.z += q.vz * dt;
      let o = 1 - k;
      if (F.type === 'frost' || F.type === 'galaxie') o = Math.sin(Math.PI * k) * (0.55 + 0.45 * Math.sin(age * 9 + q.tw));
      else if (F.type === 'glut') o = (1 - k) * (0.7 + 0.3 * Math.random());
      q.m.material.opacity = Math.max(0, o) * 0.95; q.m.scale.setScalar(q.base * (F.type === 'glut' ? 1 - 0.6 * k : 1));
    }
  }

  // ---------------------------------------------------------------- Ansicht
  resize(w, h, margins) {
    this.w = w; this.h = h; if (margins) this.margins = margins;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.portrait = h > w * 1.05;
    this.fit(); this.camera.updateProjectionMatrix();
  }
  fit() {
    const { l, r, t, b } = this.margins, aw = Math.max(50, this.w - l - r), ah = Math.max(50, this.h - t - b);
    const tw = this.portrait ? TABLE_H : TABLE_W, th = this.portrait ? TABLE_W : TABLE_H;
    const ppc = Math.min(aw / tw, ah / th) * 0.985;
    const tanH = Math.tan(this.camera.fov * Math.PI / 360);
    const dist = this.h / (2 * tanH * ppc);
    this.ppc = ppc; this.dist = dist;
    // Tischmitte soll in der Mitte des freien Bereichs liegen
    const offX = (l - r) / 2, offY = (t - b) / 2; // Pixel, um die der Tisch aus der Bildmitte rückt (rechts/unten positiv)
    this.camera.up.set(this.portrait ? 1 : 0, 0, this.portrait ? 0 : -1);
    const right = this.portrait ? { x: 0, z: 1 } : { x: 1, z: 0 };   // Bildschirm-rechts in Weltrichtung
    const up = this.portrait ? { x: 1, z: 0 } : { x: 0, z: -1 };      // Bildschirm-oben
    const px = -(offX / ppc) * right.x + (offY / ppc) * up.x, pz = -(offX / ppc) * right.z + (offY / ppc) * up.z;
    this.camera.position.set(px, dist, pz);
    this.camera.lookAt(px, 0, pz);
    this.camera.updateMatrixWorld();
  }

  worldToScreen(x, y) {
    const v = new THREE.Vector3(x, R, y).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h };
  }
  screenToWorld(px, py) {
    const ndc = new THREE.Vector2((px / this.w) * 2 - 1, -(py / this.h) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const t = (R - ray.ray.origin.y) / ray.ray.direction.y;
    return { x: ray.ray.origin.x + ray.ray.direction.x * t, y: ray.ray.origin.z + ray.ray.direction.z * t };
  }
  pxPerCm() { const a = this.worldToScreen(0, 0), b = this.worldToScreen(10, 0), c = this.worldToScreen(0, 10); return Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.hypot(c.x - a.x, c.y - a.y)) / 10; }

  // ---------------------------------------------------------------- Kugeln
  showSim(sim) {
    for (let i = 0; i < 16; i++) {
      const b = this.balls[i], on = !!sim.on[i] && i <= (this.maxBall ?? 15);
      this.lastOn[i] = sim.on[i] ? 1 : 0; this.fall[i] = null; if (i === 0) this.clearTrail();
      b.mesh.visible = on; b.sh.visible = on; b.mesh.scale.setScalar(1);
      if (on) { b.mesh.position.set(sim.x[i], R, sim.y[i]); b.sh.position.set(sim.x[i] + 0.4, 0.04, sim.y[i] + 0.6); }
    }
  }
  // Bild aus der Aufzeichnung (f0 -> f1, alpha 0..1), dt = vergangene Zeit für die Drehung
  pose(f0, f1, alpha, dt, tNow) {
    const q = new THREE.Quaternion(), ax = new THREE.Vector3();
    for (let i = 0; i < 16; i++) {
      if (i > (this.maxBall ?? 15)) continue;
      const b = this.balls[i], o = i * 6;
      const on0 = f0[o + 5], on1 = f1[o + 5];
      if (!on0) { this.fallStep(i, tNow); continue; }
      if (!on1 && !this.fall[i]) {
        // gerade versenkt: in die Tasche fallen lassen
        let px = f0[o], py = f0[o + 1], best = 1e9, bp = POCKET_MOUTH[0];
        for (const m of POCKET_MOUTH) { const d = (m.x - px) ** 2 + (m.y - py) ** 2; if (d < best) { best = d; bp = m; } }
        this.fall[i] = { t0: tNow, x: px, y: py, tx: bp.x * 1.0, ty: bp.y * 1.0 };
        this.lastOn[i] = 0;
      }
      if (this.fall[i]) { this.fallStep(i, tNow); continue; }
      const x = f0[o] + (f1[o] - f0[o]) * alpha, y = f0[o + 1] + (f1[o + 1] - f0[o + 1]) * alpha;
      b.mesh.position.set(x, R, y); b.sh.position.set(x + 0.4, 0.04, y + 0.6); b.sh.visible = true; b.mesh.visible = true;
      if (i === 0 && (Math.abs(f1[o] - f0[o]) + Math.abs(f1[o + 1] - f0[o + 1])) > 0.02) this.emitTrail(x, y, tNow);
      // Drehung: Winkelgeschwindigkeit sim -> three: (-wx, -wz, -wy)
      const wx = -(f0[o + 2] + f1[o + 2]) / 2, wy = -(f0[o + 4] + f1[o + 4]) / 2, wz = -(f0[o + 3] + f1[o + 3]) / 2;
      const w = Math.sqrt(wx * wx + wy * wy + wz * wz);
      if (w > 1e-4 && dt > 0) { ax.set(wx / w, wy / w, wz / w); q.setFromAxisAngle(ax, w * dt); b.mesh.quaternion.premultiply(q); }
    }
  }
  fallStep(i, tNow) {
    const f = this.fall[i], b = this.balls[i]; if (!f) { b.mesh.visible = false; b.sh.visible = false; return; }
    const k = Math.min(1, (tNow - f.t0) / 0.28);
    b.mesh.position.set(f.x + (f.tx - f.x) * k, R - k * 6, f.y + (f.ty - f.y) * k); b.mesh.scale.setScalar(1 - 0.6 * k);
    b.sh.visible = false; b.mesh.visible = k < 1;
  }

  // ---------------------------------------------------------------- Zielhilfe und Queue
  setAim(a) {
    // a: { show, sim, ang, info, pull, spinA, spinB, guide(0..1), cueId, long }
    if (!a || !a.show) { for (const m of [this.gAim, this.gObj, this.gCue, this.gRebound, this.gGhost]) m.visible = false; this.cueGroup.visible = false; return; }
    const s = a.sim, cx = s.x[0], cy = s.y[0], i = a.info;
    const lenA = a.guide >= 1 ? i.t : Math.min(i.t, 55 + 120 * a.guide);
    this.strip(this.gAim, cx + i.dx * R, cy + i.dy * R, cx + i.dx * (lenA), cy + i.dy * (lenA), 0.32);
    if (i.hit > 0 && a.guide > 0) {
      this.gGhost.visible = true; this.gGhost.position.set(i.gx, LH, i.gy);
      const ol = i.olen != null ? Math.min(95, Math.max(8, i.olen)) : 26 * (0.6 + 0.4 * (i.cut || 0)) * 1.8;
      const cl = i.clen != null ? (i.clen < 2.5 ? 0 : Math.min(70, i.clen)) : 14 * (i.cut || 0) * 2;
      this.strip(this.gObj, s.x[i.hit], s.y[i.hit], s.x[i.hit] + i.ox * ol, s.y[i.hit] + i.oy * ol, 0.32);
      this.strip(this.gCue, i.gx, i.gy, i.gx + i.cx * cl, i.gy + i.cy * cl, 0.28);
      this.targetMark.position.set(s.x[i.hit], LH, s.y[i.hit]); this.targetMark.material.opacity = 0.9;
    } else {
      this.gGhost.visible = i.hit === -1 && false; this.gObj.visible = false; this.gCue.visible = false; this.targetMark.material.opacity = 0;
    }
    this.gRebound.visible = false;
    // Queue
    const g = this.cueGroup; g.visible = a.cue !== false;
    if (a.cueId) this.applyCue(a.cueId);
    const ang = a.ang, pull = a.pull || 0; this.cueAng = ang;
    const right = { x: -Math.sin(ang), y: Math.cos(ang) };
    const ox = (a.spinA || 0) * 0.5 * R * right.x, oy = (a.spinA || 0) * 0.5 * R * right.y;
    const back = R + 1.2 + pull * 28;
    g.position.set(cx - Math.cos(ang) * back + ox, R + (a.spinB || 0) * 0.5 * R + 0.6, cy - Math.sin(ang) * back + oy);
    g.rotation.set(0, Math.PI - ang, 0, 'YXZ'); g.rotateZ(0.07);
    if (this.cueRainbow) { const h = (performance.now() / 2000) % 1; this.cueParts.shaft.material.color.setHSL(h, 0.7, 0.65); this.cueParts.butt.material.color.setHSL((h + 0.5) % 1, 0.7, 0.45); }
  }
  setPocketMarks(sel, show) {
    for (let p = 0; p < 6; p++) { const m = this.pocketRings[p].material; m.opacity = show ? (p === sel ? 1 : 0.28) : 0; m.color.set(p === sel ? 0xffe27a : 0xffffff); }
  }
  setHandMark(on, x, y, ok) { this.gHand.visible = on; if (on) { this.gHand.position.set(x, LH, y); this.gHand.material.color.set(ok ? 0x5dff9a : 0xff5d5d); } }

  render() { const tn = performance.now() / 1000; this.updateCueFx(tn); this.updateTrail(tn); this.renderer.render(this.scene, this.camera); }
}
