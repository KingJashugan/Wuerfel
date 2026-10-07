# Cube Trainer – Anfängermethode

Lern-App für den 3x3-Zauberwürfel: die Anfängermethode (Layer-by-Layer) in sieben Phasen,
jeweils mit Erklärung, Algorithmus, Fällen und einem animierten 3D-Würfel (Schritt vor/zurück,
Abspielen, Zugliste). Weiß unten, Grün vorne, Notation nach Singmaster. Mobil und am Desktop
bedienbar (ab 360 px Breite). Reine statische Seite (Vite, TypeScript, [cubing.js](https://js.cubing.net/cubing/)),
kein Server nötig.

## Lokal starten

Voraussetzung: Node.js 22 oder neuer.

```
npm ci
npm run dev
```

Dann die angezeigte Adresse öffnen (Standard: http://localhost:5173). Zum Ausprobieren am Handy im
selben WLAN `npm run dev -- --host` starten und die Netzwerk-Adresse aufrufen.

## Bauen und testen

```
npm run typecheck   # TypeScript (strict)
npm test            # Vitest: Inhalte, Algorithmen, Schema, Adapter
npm run build       # Typprüfung + Produktions-Build nach dist/
npm run preview     # gebaute Seite lokal ansehen
npm run test:e2e    # Playwright (einmalig: npx playwright install chromium webkit)
```

## GitHub Pages

1. Repository auf GitHub anlegen und den Code nach `main` (oder `master`) pushen.
2. Im Repository: Settings → Pages → Source: **GitHub Actions**.
3. Der Workflow `.github/workflows/pages.yml` prüft (Typecheck, Tests), baut und veröffentlicht
   bei jedem Push; er lässt sich auch manuell starten (Actions → Run workflow).

Erwartete Adresse: `https://<benutzername>.github.io/<repository>/`

Die Seiten sind per Hash adressiert (`#/`, `#/phase/5`, `#/phase/5/k-3120`), daher braucht es keine
Server-Weiterleitungen. `vite.config.ts` setzt `base: './'`, alle Dateien (auch die von cubing
nachgeladenen Teile) werden relativ zur Seite geladen, die App läuft unter jedem Unterpfad.

## Aufbau

- `content/` – Lerninhalte als JSON (Schema und Loader dort)
- `src/cube/adapter.ts` – einzige Datei, die `cubing` importiert
- `src/ui/` – Lernansicht (Routing, Seiten, Player)
- `e2e/`, `tests/` – Playwright- und Vitest-Tests
