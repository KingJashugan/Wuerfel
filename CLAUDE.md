# Cube Trainer – Projektregeln

## Ziel
Web-App zum Lernen von Zauberwürfel-Algorithmen (3x3). 3D-Darstellung,
schrittweise Animation, Erklärung jedes Algorithmus. Start: Anfängermethode,
später CFOP (F2L, OLL, PLL).

## Stack
Vite, TypeScript (strict), Three.js, Vitest, Playwright.

## Architektur
- src/cube/      – reine Logik: Zustandsmodell, Züge, Parser. KEINE UI-Abhängigkeiten.
- src/render/    – 3D-Darstellung, liest nur den Zustand aus src/cube/.
- src/ui/        – Bedienoberfläche.
- data/algorithms/ – Algorithmen als JSON (Schema in data/schema.ts).

## Notation (verbindlich)
Singmaster. Drehrichtung im Uhrzeigersinn mit Blick auf die jeweilige Fläche.
M folgt der Richtung von L, E der von D, S der von F. Weitwinkel: Rw = r.

## Qualitätsregeln
- Jeder Algorithmus in data/algorithms/ MUSS einen automatisierten Test haben,
  der prüft, dass er seinen Fall löst.
- Keine Änderung an src/cube/ ohne grüne Tests (npm test).
- Arbeitsablauf: Plan → Umsetzung → cube-verifier → code-reviewer → Korrektur.
