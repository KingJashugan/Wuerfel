import { describe, expect, it } from 'vitest';
import {
  ORIENTATION_SETUP,
  caseSetup,
  checkSolvesCase,
  invert,
  parseMoves,
  regionsSatisfied,
  stateKey,
  upperLayerInfo,
  withOrientation,
} from '../src/cube/adapter';
import { CUBE_REGIONS, type CubeRegion } from '../src/cube/regions';
import { CubeState, applyAlgorithm } from '../src/cube';

const SUNE = "R U R' U R U2 R'";
const SEXY = "R U R' U'";
const FRU = "F R U R' U' F'";
// Mittlere Kante nach rechts (Anfaengermethode): U R U' R' U' F' U F
const TWIST = "(R' D' R D)2 U (R' D' R D)4 U'";
const EDGE_RIGHT = "U R U' R' U' F' U F";

describe('Orientierung z2', () => {
  it('ORIENTATION_SETUP ist z2', () => {
    expect(ORIENTATION_SETUP).toBe('z2');
  });
  it('withOrientation stellt z2 genau einmal voran', () => {
    expect(withOrientation('')).toBe('z2');
    expect(withOrientation('R U')).toBe('z2 R U');
    expect(withOrientation('z2 R U')).toBe('z2 R U');
    expect(withOrientation(withOrientation("R U'"))).toBe("z2 R U'");
    expect(parseMoves(withOrientation('R U')).filter((m) => m === 'z2')).toHaveLength(1);
  });
  it('caseSetup = z2 + inverse Loesung, genau ein z2', () => {
    expect(caseSetup(SEXY)).toBe("z2 U R U' R'");
    expect(caseSetup('')).toBe('z2');
    expect(parseMoves(caseSetup(SUNE)).filter((m) => m === 'z2')).toHaveLength(1);
    expect(withOrientation(caseSetup(SUNE))).toBe(caseSetup(SUNE));
  });
});

describe('regionsSatisfied', () => {
  it('Startzustand (nur z2) erfuellt alle Bereiche', async () => {
    expect(await regionsSatisfied('z2', '', [...CUBE_REGIONS])).toEqual([]);
    expect(await regionsSatisfied('', '', [...CUBE_REGIONS])).toEqual([]);
  });
  it('ein U-Zug zerstoert nur Bereiche, die obere Teile betreffen', async () => {
    const v = await regionsSatisfied(caseSetup(''), 'U', [...CUBE_REGIONS]);
    expect(v.sort()).toEqual(
      ['gelbe-ecken-position', 'gelbe-kanten-position', 'geloest'].sort(),
    );
  });
  it('ein U-Zug laesst gelbes Kreuz, Schichten unten unberuehrt (obere Kanten alle orientiert)', async () => {
    expect(await regionsSatisfied('z2', 'U', ['kreuz-unten', 'erste-schicht', 'zweite-schicht', 'gelbes-kreuz'])).toEqual([]);
  });
  it('F zerstoert das Kreuz', async () => {
    expect(await regionsSatisfied('z2', 'F', ['kreuz-unten'])).toEqual(['kreuz-unten']);
  });
  it('gelbe-ecken-position: vertauschte Ecken verletzen, in Ruhe gedrehte Ecken nicht', async () => {
    // Inverse der Sune auf dem geloesten Wuerfel: Ecken dort vertauscht UND gedreht.
    expect(await regionsSatisfied(caseSetup(SUNE), '', ['gelbe-ecken-position'])).toEqual(['gelbe-ecken-position']);
    // Inverse des Phase-7-Falls: Ecken nur am Platz gedreht -> Position erfuellt, geloest nicht.
    const twisted = "z2 " + invert(TWIST);
    expect(await regionsSatisfied(twisted, '', ['gelbe-ecken-position'])).toEqual([]);
    expect(await regionsSatisfied(twisted, '', ['gelbe-kanten-position', 'zweite-schicht'])).toEqual([]);
    expect(await regionsSatisfied(twisted, '', ['geloest'])).toEqual(['geloest']);
  });
  it('Sune sechsmal angewendet ist wieder geloest', async () => {
    expect(await regionsSatisfied('z2', Array(6).fill(SUNE).join(' '), [...CUBE_REGIONS])).toEqual([]);
  });
  it('ist tolerant gegen Rotation des ganzen Wuerfels am Ende', async () => {
    expect(await regionsSatisfied('z2', 'y', [...CUBE_REGIONS])).toEqual([]);
    expect(await regionsSatisfied('z2', "x y'", [...CUBE_REGIONS])).toEqual([]);
    expect(await regionsSatisfied(caseSetup(SUNE), `${SUNE} x2 y`, [...CUBE_REGIONS])).toEqual([]);
  });
  it('Slice-Zuege: M M\' bleibt geloest, M allein ist gleich x R\' L', async () => {
    expect(await regionsSatisfied('z2', "M M'", [...CUBE_REGIONS])).toEqual([]);
    const a = await regionsSatisfied('z2', 'M', [...CUBE_REGIONS]);
    const b = await regionsSatisfied('z2', "x' R L'", [...CUBE_REGIONS]);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe('checkSolvesCase', () => {
  it('Sune loest den Sune-Fall (erhalten zweite Schicht, erreicht geloest)', async () => {
    const r = await checkSolvesCase({
      setup: caseSetup(SUNE),
      alg: SUNE,
      erhalten: ['zweite-schicht'],
      erreicht: ['geloest'],
      aufTolerant: false,
    });
    expect(r).toEqual({ ok: true, auf: '', verletzt: [], vorherSchonErreicht: false });
  });
  it('gekuerzter Algorithmus scheitert', async () => {
    const r = await checkSolvesCase({
      setup: caseSetup(SUNE),
      alg: "R U R' U R",
      erhalten: ['zweite-schicht'],
      erreicht: ['geloest'],
      aufTolerant: true,
    });
    expect(r.ok).toBe(false);
    expect(r.verletzt.length).toBeGreaterThan(0);
  });
  it('Algorithmus, der die ersten zwei Schichten zerstoert, scheitert', async () => {
    const r = await checkSolvesCase({
      setup: caseSetup(SUNE),
      alg: `${SUNE} R U R'`,
      erhalten: ['zweite-schicht'],
      erreicht: ['geloest'],
      aufTolerant: true,
    });
    expect(r.ok).toBe(false);
    expect(r.verletzt).toContain('zweite-schicht');
  });
  it('anderer Algorithmus fuer anderen Fall scheitert (Falsches Kreuz-Alg fuer Sune-Fall)', async () => {
    const r = await checkSolvesCase({
      setup: caseSetup(SUNE),
      alg: FRU,
      erhalten: ['zweite-schicht'],
      erreicht: ['geloest'],
      aufTolerant: true,
    });
    expect(r.ok).toBe(false);
  });
  it('vorherSchonErreicht: Ziel war bereits erfuellt', async () => {
    const r = await checkSolvesCase({
      setup: 'z2',
      alg: 'U',
      erhalten: ['zweite-schicht'],
      erreicht: ['gelbes-kreuz'],
      aufTolerant: false,
    });
    expect(r.vorherSchonErreicht).toBe(true);
    expect(r.ok).toBe(true);
  });
  it('AUF-Toleranz: Fall verlangt abschliessendes U', async () => {
    for (const auf of ['U', 'U2', "U'"] as const) {
      const setup = caseSetup(`${SUNE} ${auf}`);
      const withAuf = await checkSolvesCase({
        setup,
        alg: SUNE,
        erhalten: ['zweite-schicht'],
        erreicht: ['geloest'],
        aufTolerant: true,
      });
      expect(withAuf.ok, auf).toBe(true);
      expect(withAuf.auf, auf).toBe(auf);
      const noAuf = await checkSolvesCase({
        setup,
        alg: SUNE,
        erhalten: ['zweite-schicht'],
        erreicht: ['geloest'],
        aufTolerant: false,
      });
      expect(noAuf.ok, auf).toBe(false);
      expect(noAuf.auf).toBe('');
    }
  });
  it('mittlere Kante: Algorithmus fuer rechts loest Fall rechts (erhalten erste Schicht, erreicht zweite)', async () => {
    // Setup = z2 + Inverses der Loesung (mittlere Kante rechts wird aus dem Wuerfel gehoben).
    const setup = caseSetup(EDGE_RIGHT);
    const r = await checkSolvesCase({
      setup,
      alg: EDGE_RIGHT,
      erhalten: ['erste-schicht'],
      erreicht: ['zweite-schicht'],
      aufTolerant: false,
    });
    expect(r.ok).toBe(true);
    expect(r.vorherSchonErreicht).toBe(false);
    // Kuerzung scheitert
    const bad = await checkSolvesCase({
      setup,
      alg: "U R U' R' U' F' U",
      erhalten: ['erste-schicht'],
      erreicht: ['zweite-schicht'],
      aufTolerant: false,
    });
    expect(bad.ok).toBe(false);
  });
  it('Round-Trip: jeder bekannte U-Schicht-Algorithmus loest den aus seinem Inversen gebauten Fall', async () => {
    for (const alg of [SUNE, "L' U' L U' L' U2 L", FRU, "F U R U' R' F'", `${SEXY} ${SEXY}`]) {
      const r = await checkSolvesCase({
        setup: caseSetup(alg),
        alg,
        erhalten: ['erste-schicht'],
        erreicht: ['geloest'],
        aufTolerant: false,
      });
      expect(r.ok, alg).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Gegenprobe: gleiche Bereiche auf Facelets (eigene Logik src/cube/state.ts)
// ---------------------------------------------------------------------------

// Sticker-Indizes (Flaeche*9 + i), Flaechen U R F D L B = 0..5, zeilenweise von aussen gesehen.
const U = 0, R = 1, F = 2, D = 3, L = 4, B = 5;
type St = readonly [face: number, i: number];
const EDGE_STICKERS: Record<string, readonly [St, St]> = {
  UF: [[U, 7], [F, 1]], UR: [[U, 5], [R, 1]], UB: [[U, 1], [B, 1]], UL: [[U, 3], [L, 1]],
  DF: [[D, 1], [F, 7]], DR: [[D, 5], [R, 7]], DB: [[D, 7], [B, 7]], DL: [[D, 3], [L, 7]],
  FR: [[F, 5], [R, 3]], FL: [[F, 3], [L, 5]], BR: [[B, 3], [R, 5]], BL: [[B, 5], [L, 3]],
};
const CORNER_STICKERS: Record<string, readonly [St, St, St]> = {
  UFR: [[U, 8], [F, 2], [R, 0]], URB: [[U, 2], [R, 2], [B, 0]], UBL: [[U, 0], [B, 2], [L, 0]], ULF: [[U, 6], [L, 2], [F, 0]],
  DRF: [[D, 2], [R, 6], [F, 8]], DFL: [[D, 0], [F, 6], [L, 8]], DLB: [[D, 6], [L, 6], [B, 8]], DBR: [[D, 8], [B, 6], [R, 8]],
};
const E_DOWN = ['DF', 'DR', 'DB', 'DL'], E_MID = ['FR', 'FL', 'BR', 'BL'], E_UP = ['UF', 'UR', 'UB', 'UL'];
const C_DOWN = ['DRF', 'DFL', 'DLB', 'DBR'], C_UP = ['UFR', 'URB', 'UBL', 'ULF'];

function faceletRegion(s: CubeState, region: CubeRegion): boolean {
  const center = (face: number): number => s.stickers[face * 9 + 4] as number;
  const ok = (stickers: readonly St[]): boolean => stickers.every(([f, i]) => s.stickers[f * 9 + i] === center(f));
  const edges = (names: string[]): boolean => names.every((n) => ok(EDGE_STICKERS[n] as readonly St[]));
  const corners = (names: string[]): boolean => names.every((n) => ok(CORNER_STICKERS[n] as readonly St[]));
  // Kantenorientierung oben: Sticker auf der U-Flaeche hat die Farbe der U-Mitte.
  const upOriented = (): boolean => E_UP.every((n) => s.stickers[U * 9 + ((EDGE_STICKERS[n] as readonly [St, St])[0] as St)[1]] === center(U));
  // Eckenposition oben: die drei Sticker der Ecke gehoeren zu den drei Mitten der Nachbarflaechen (in beliebiger Drehung).
  const upCornerPlace = (): boolean =>
    C_UP.every((n) => {
      const st = CORNER_STICKERS[n] as readonly St[];
      const colors = st.map(([f, i]) => s.stickers[f * 9 + i] as number).sort();
      const want = st.map(([f]) => center(f)).sort();
      return colors.every((c, k) => c === want[k]);
    });
  const first = edges(E_DOWN) && corners(C_DOWN);
  switch (region) {
    case 'kreuz-unten': return edges(E_DOWN);
    case 'erste-schicht': return first;
    case 'zweite-schicht': return first && edges(E_MID);
    case 'gelbes-kreuz': return first && edges(E_MID) && upOriented();
    case 'gelbe-kanten-position': return first && edges(E_MID) && edges(E_UP);
    case 'gelbe-ecken-position': return first && edges(E_MID) && edges(E_UP) && upCornerPlace();
    case 'geloest': return first && edges(E_MID) && edges(E_UP) && corners(C_UP);
  }
}

describe('Gegenprobe: kpuzzle-Bereiche gegen Facelets (state.ts)', () => {
  // Bausteine, die die ersten zwei Schichten erhalten, und solche, die sie zerstoeren.
  const KEEP = ['U', "U'", 'U2', SUNE, "L' U' L U' L' U2 L", FRU, "F U R U' R' F'", "R U R' U R U2 R'", "R' U' R U' R' U2 R"];
  const BREAK = ['R', "F'", 'D', "R U R' U'", 'L2', 'B', EDGE_RIGHT, "R' D' R D"];
  let seed = 12345;
  const rnd = (n: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const makeAlg = (): string => {
    const len = rnd(6);
    const parts: string[] = [];
    for (let k = 0; k < len; k++) parts.push(rnd(4) === 0 ? (BREAK[rnd(BREAK.length)] as string) : (KEEP[rnd(KEEP.length)] as string));
    return parts.join(' ');
  };

  it('stimmt fuer 250 Zufallsfolgen in allen Bereichen ueberein', async () => {
    const seen = new Map<CubeRegion, [number, number]>();
    for (let t = 0; t < 250; t++) {
      const alg = makeAlg();
      const violated = await regionsSatisfied('z2', alg, [...CUBE_REGIONS]);
      const own = applyAlgorithm(applyAlgorithm(CubeState.solved(), 'z2'), alg);
      for (const region of CUBE_REGIONS) {
        const kp = !violated.includes(region);
        expect(kp, `alg="${alg}" region=${region}`).toBe(faceletRegion(own, region));
        const c = seen.get(region) ?? [0, 0];
        c[kp ? 0 : 1]++;
        seen.set(region, c);
      }
    }
    // Die Stichprobe muss beide Ausgaenge in jedem Bereich enthalten, sonst sagt der Test nichts.
    for (const region of CUBE_REGIONS) {
      const [yes, no] = seen.get(region) as [number, number];
      expect(yes, `${region} nie erfuellt`).toBeGreaterThan(0);
      expect(no, `${region} nie verletzt`).toBeGreaterThan(0);
    }
  });

  it('Facelet-Pruefung selbst: geloester Wuerfel erfuellt alles, F zerstoert Kreuz', () => {
    const solved = applyAlgorithm(CubeState.solved(), 'z2');
    for (const r of CUBE_REGIONS) expect(faceletRegion(solved, r)).toBe(true);
    expect(faceletRegion(applyAlgorithm(solved, 'F'), 'kreuz-unten')).toBe(false);
  });
});

describe('stateKey', () => {
  it('gleicher Zustand gleicher Schluessel, auch bei anderer Schreibweise und Rotation', async () => {
    expect(await stateKey('z2', 'R2')).toBe(await stateKey('z2', "R R"));
    expect(await stateKey('z2', 'U')).toBe(await stateKey('z2 U', ''));
    expect(await stateKey('z2', 'U y')).toBe(await stateKey('z2', 'U'));
    expect(await stateKey('z2', '')).toBe(await stateKey('', ''));
  });
  it('verschiedene Zustaende haben verschiedene Schluessel', async () => {
    expect(await stateKey('z2', 'U')).not.toBe(await stateKey('z2', ''));
    expect(await stateKey('z2', 'U')).not.toBe(await stateKey('z2', "U'"));
    expect(await stateKey('z2', SUNE)).not.toBe(await stateKey('z2', "U"));
  });
});

describe('upperLayerInfo', () => {
  it('geloester Wuerfel: Identitaet, alles orientiert', async () => {
    expect(await upperLayerInfo('z2')).toEqual({
      edgePermutation: [0, 1, 2, 3],
      edgeOrientation: [0, 0, 0, 0],
      cornerPermutation: [0, 1, 2, 3],
      cornerOrientation: [0, 0, 0, 0],
    });
  });
  it('U zyklisch: Kanten und Ecken um einen Platz verschoben', async () => {
    const u = await upperLayerInfo('z2', 'U');
    expect(u.edgePermutation).toEqual([1, 2, 3, 0]);
    expect(u.cornerPermutation).toEqual([1, 2, 3, 0]);
    const ui = await upperLayerInfo('z2', "U'");
    expect(ui.edgePermutation).toEqual([3, 0, 1, 2]);
    expect((await upperLayerInfo('z2', 'U2')).edgePermutation).toEqual([2, 3, 0, 1]);
  });
  it('untere Teile auf oberen Plaetzen werden mit -1 gemeldet', async () => {
    const f = await upperLayerInfo('z2', 'F');
    expect(f.edgePermutation).toContain(-1);
    expect(f.cornerPermutation).toContain(-1);
  });
  it('Sune dreht Ecken oben (Orientierung nicht alle 0, Summe durch 3 teilbar), Kanten bleiben orientiert', async () => {
    const s = await upperLayerInfo(caseSetup(SUNE));
    expect(s.cornerOrientation.some((o) => o !== 0)).toBe(true);
    expect(s.cornerOrientation.reduce((a, b) => a + b, 0) % 3).toBe(0);
    expect(s.edgeOrientation).toEqual([0, 0, 0, 0]);
    expect(s.edgePermutation).not.toEqual([0, 1, 2, 3]);
  });
  it('Kantenflip oben: Fall mit nicht orientierten Kanten (Gegenprobe zu FRU)', async () => {
    const f = await upperLayerInfo(caseSetup(FRU));
    expect(f.edgeOrientation.filter((o) => o !== 0)).toHaveLength(2);
  });
  it('ist rotationsfest (Wuerfeldrehung am Ende)', async () => {
    expect(await upperLayerInfo('z2', 'U x')).toEqual(await upperLayerInfo('z2', 'U'));
  });
});
