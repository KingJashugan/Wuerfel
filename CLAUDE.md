# Cube Trainer – Projektregeln

## Ziel
Lehr-App für den 3x3-Zauberwürfel, Desktop und Mobil gleichwertig.
Start mit der Anfängermethode (Layer-by-Layer, 7 Phasen), später erweiterbar
um CFOP. Kein Solver, keine Kamera-Eingabe.

## Stack
Vite, TypeScript (strict), cubing.js (npm-Paket `cubing`, Version exakt gepinnt),
Vitest, Playwright. UI-Framework: Entscheidung durch architect nach Prototyp.

## Abhängigkeiten
- NUR das Paket `cubing` verwenden, NICHT `@vscubing/cubing` (GPL-Fork).
- cubing.js nicht modifizieren oder patchen (MPL-Pflichten).
- Neue Abhängigkeiten nur nach Rückfrage beim Nutzer.

## Architektur
- src/cube/adapter.ts – EINZIGE Datei, die cubing.js importiert.
- src/ui/            – Oberfläche, nutzt nur den Adapter.
- content/           – Lerninhalte als JSON, Schema in content/schema.ts.
- Übergang: Die frühere eigene Logik in src/cube/ (types, moves, notation,
  state) bleibt vorerst als Zwischenstand und mögliches unabhängiges
  Prüfwerkzeug; über ihr Schicksal wird nach dem Prototyp entschieden.

## Lernmodell
Zwei Inhaltstypen:
1. "algorithmisch": Fall-Erkennung, Algorithmus, Trigger-Zerlegung,
   Schritt-für-Schritt-Erklärung.
2. "intuitiv" (Phasen 1–2): Zielzustand, Prinzip, mehrere Beispielfälle
   mit Lösungszügen.

## Konventionen
- Notation: Singmaster. Weiß unten, Grün vorne (in content/ festhalten).
- Sprache der Inhalte: Deutsch, Fachbegriffe beim ersten Auftreten erklärt.
- Mobile first: jede Ansicht muss ab 360 px Breite bedienbar sein.

## Qualitätsregeln
- Jeder Algorithmus in content/ hat einen automatisierten Test
  (Fall erzeugen per inversem Algorithmus, Lösung prüfen).
- Arbeitsablauf: Plan → Umsetzung → cube-verifier → code-reviewer
  → mobile-tester (bei UI-Änderungen) → Korrektur.
  Maximal 3 Korrekturrunden, dann Rückmeldung an den Nutzer.
