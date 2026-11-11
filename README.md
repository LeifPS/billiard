# Billiard

8-Ball und 9-Ball für den Leif Game Hub (3D von oben, three.js). Läuft als statische Seite auf einem Cloudflare Worker (`wrangler.jsonc`, Ordner `public/`).

- `public/js/physics.js`: deterministische Physik (Gleiten/Rollen, Vor-/Rückdrall, Seiteneffet, Banden, Taschen). Dieselbe Datei läuft später im Server.
- `public/js/rules.js`: Regeln 8-Ball (Gruppen, Ansage der 8) und 9-Ball (niedrigste Kugel), Foul = Weiße in die Hand.
- `public/js/bot.js`: Computergegner (leicht, mittel, schwer).
- `public/js/render.js`: 3D-Tisch, Kugeln, Queue, Zielhilfe.
- `public/js/main.js`: Ablauf, Bedienung (Zielen per Ziehen, Feinzielen, Stärke-Regler, Treffpunkt), Menüs.
- `public/js/cosmetics.js`, `store.js`: Freischaltbares und lokaler Spielstand (localStorage).
- `public/lgh-*.js`: Anbindung an den Hub (Spielstand-Code, Lautstärke), eingebaut mit `tools/lgh-einbauen.py` aus dem Hub-Repo.

Tests: `npm test` (Regeln und Computergegner im Testspiel).
