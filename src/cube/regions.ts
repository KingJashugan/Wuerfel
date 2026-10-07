/**
 * Bereiche des Wuerfels fuer die Anfaengermethode (Weiss unten, Gruen vorne). Reine Daten ohne
 * cubing-Import, damit auch content/schema.ts sie nutzen kann. Die Bereiche bilden eine Kette:
 * jeder Bereich schliesst alle Bedingungen des vorherigen ein (die Reihenfolge unten ist die
 * Reihenfolge der Phasen).
 *
 * - kreuz-unten:              die vier unteren Kanten (Weisses Kreuz) an Platz und richtig orientiert
 * - erste-schicht:            kreuz-unten + die vier unteren Ecken
 * - zweite-schicht:           erste-schicht + die vier mittleren Kanten
 * - gelbes-kreuz:             zweite-schicht + die vier oberen Kanten richtig orientiert (Gelb oben)
 * - gelbe-kanten-position:    zweite-schicht + die vier oberen Kanten komplett richtig (schliesst gelbes-kreuz ein)
 * - gelbe-ecken-position:     gelbe-kanten-position + die oberen Ecken am richtigen Platz (Orientierung egal)
 * - geloest:                  alles geloest (obere Ecken auch orientiert)
 */
export const CUBE_REGIONS = [
  'kreuz-unten',
  'erste-schicht',
  'zweite-schicht',
  'gelbes-kreuz',
  'gelbe-kanten-position',
  'gelbe-ecken-position',
  'geloest',
] as const;

export type CubeRegion = (typeof CUBE_REGIONS)[number];

/** Orientierung, in der die Methode arbeitet: Weiss unten, Gruen vorne (Rotation z2 aus der Standardlage). */
export const ORIENTATION_SETUP = 'z2';

/** Plaetze im kpuzzle 3x3x3 (cubing 0.63.8). Kanten: UF UR UB UL DF DR DB DL FR FL BR BL. */
export interface RegionSlots {
  /** Kantenplaetze, an denen Teil und Orientierung stimmen muessen. */
  edges: readonly number[];
  /** Kantenplaetze, an denen nur die Orientierung stimmen muss. */
  edgeOrientation: readonly number[];
  /** Eckenplaetze (UFR URB UBL ULF DRF DFL DLB DBR), an denen Teil und Orientierung stimmen muessen. */
  corners: readonly number[];
  /** Eckenplaetze, an denen nur das richtige Teil sitzen muss. */
  cornerPosition: readonly number[];
}

// Plaetze je Schicht (Slot-Indizes des kpuzzle): untere/mittlere/obere Kanten und Ecken.
const E_DOWN = [4, 5, 6, 7];
const E_MID = [8, 9, 10, 11];
const E_UP = [0, 1, 2, 3];
const C_DOWN = [4, 5, 6, 7];
const C_UP = [0, 1, 2, 3];

export const REGION_SLOTS: Readonly<Record<CubeRegion, RegionSlots>> = {
  'kreuz-unten': { edges: E_DOWN, edgeOrientation: [], corners: [], cornerPosition: [] },
  'erste-schicht': { edges: E_DOWN, edgeOrientation: [], corners: C_DOWN, cornerPosition: [] },
  'zweite-schicht': { edges: [...E_DOWN, ...E_MID], edgeOrientation: [], corners: C_DOWN, cornerPosition: [] },
  'gelbes-kreuz': { edges: [...E_DOWN, ...E_MID], edgeOrientation: E_UP, corners: C_DOWN, cornerPosition: [] },
  'gelbe-kanten-position': { edges: [...E_DOWN, ...E_MID, ...E_UP], edgeOrientation: [], corners: C_DOWN, cornerPosition: [] },
  'gelbe-ecken-position': {
    edges: [...E_DOWN, ...E_MID, ...E_UP],
    edgeOrientation: [],
    corners: C_DOWN,
    cornerPosition: C_UP,
  },
  geloest: { edges: [...E_DOWN, ...E_MID, ...E_UP], edgeOrientation: [], corners: [...C_DOWN, ...C_UP], cornerPosition: [] },
};
