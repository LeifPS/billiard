// Online-Teil (Etappe 2) – vorerst nur Platzhalter.
export const Online = {
  start(kind, ctx) { const m = document.querySelector('#modal'); m.classList.remove('hidden'); m.innerHTML = '<div class="box"><h3>Online</h3><div class="sub">Kommt gleich.</div><div class="acts"><button class="btn" id="ok"><b>OK</b></button></div></div>'; m.querySelector('#ok').onclick = () => m.classList.add('hidden'); },
  askCode() { this.start(); },
};
