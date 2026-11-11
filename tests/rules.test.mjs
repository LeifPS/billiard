import { Game, rng } from '../public/js/rules.js';
import { botShot, botPlace } from '../public/js/bot.js';
import { cueShot } from '../public/js/physics.js';
let fail=0; const ok=(c,m)=>{ if(!c){console.log('FEHLER',m);fail++;} };
function play(mode,seed,levels){
  const g=new Game({mode,seed}); const rand=rng(seed*31+7); let n=0, fouls=0; const t0=performance.now();
  while(g.phase!=='over' && n<200){
    if(g.inHand){ const p=botPlace(g,rand); ok(g.place(p.x,p.y),'Platzieren '+JSON.stringify(p)+' '+g.inHand); }
    const L=levels[g.turn]; const b=botShot(g,L,rand);
    const sh=cueShot(b.ang,b.power,b.a,b.b); const r=g.shoot(sh,b.call,false); ok(r,'Stoß'); n++; if(r.out.foul)fouls++;
    if(!g.sim.on[0] && g.phase!=='over') ok(g.inHand,'Weiße weg ohne Hand');
  }
  return {n,fouls,w:g.winner,reason:g.reason,ms:performance.now()-t0};
}
for(const mode of ['8ball','9ball']) for(let seed=1;seed<=4;seed++){
  const r=play(mode,seed,['mittel','schwer']); console.log(mode,seed,JSON.stringify(r));
  ok(r.n<200,'Spiel endet nicht');
}
// Regeltests mit Hand gesetzten Lagen
{ const g=new Game({mode:'8ball',seed:3}); g.phase='play'; g.inHand=false; g.sim.on.fill(0);
  g.sim.put(0,-50,0); g.sim.put(8,0,0); g.sim.put(1,30,40); g.groups=['solid','stripe']; g.turn=0;
  // Weiße trifft die 8 zu früh (Spieler hat noch Volle)
  const r=g.shoot(cueShot(0,0.3,0,0),0,false); ok(r.out.foul && g.turn===1 && g.inHand==='any','8 zu früh = Foul '+JSON.stringify(r.out)); }
console.log(fail?'FEHLER: '+fail:'Alles in Ordnung');
process.exit(fail?1:0);
