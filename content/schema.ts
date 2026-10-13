/**
 * Schema der Lerninhalte (content/*.json) mit eigenem Validator (kein zod, keine Abhaengigkeit).
 * Kein cubing-Import; es werden nur der reine Datentyp/die Liste der Bereiche aus
 * src/cube/regions.ts verwendet (die auch der Adapter re-exportiert).
 *
 * Konvention: Weiss unten, Gruen vorne (Rotation z2 aus der Standardlage); Notation Singmaster.
 * Zugfolgen sind Strings in dieser Notation. Ob sie wirklich parsen und das Behauptete leisten,
 * pruefen die Tests (tests/content.test.ts), nicht der Validator.
 */
import { CUBE_REGIONS, type CubeRegion } from '../src/cube/regions';

export type { CubeRegion };

/** Was der Algorithmus bewirkt. `erhalten` bleibt bestehen, `erreicht` gilt danach neu. */
export interface Zielzustand {
  text: string;
  erhalten: CubeRegion[];
  erreicht: CubeRegion[];
  /** Ein abschliessendes U, U2 oder U' (AUF) ist zum Erreichen erlaubt. */
  aufTolerant: boolean;
  /**
   * Bereiche, die der Ausgangszustand JEDES Falls vor der Loesung erfuellen muss (strikt, vom Test
   * geprueft). Ohne Angabe leitet der Test sie aus der Phase ab (`voraussetzungVon`).
   */
  voraussetzung?: CubeRegion[];
}

/** Voraussetzung je algorithmischer Phase, wenn `ziel.voraussetzung` fehlt: der Stand der Vorphase. */
const VORAUSSETZUNG_DER_PHASE: Readonly<Record<number, readonly CubeRegion[]>> = {
  3: ['erste-schicht'],
  4: ['zweite-schicht'],
  5: ['gelbes-kreuz'],
  6: ['gelbe-kanten-position'],
  7: ['gelbe-ecken-position'],
};

export function voraussetzungVon(e: AlgorithmischerEintrag): CubeRegion[] {
  return [...(e.ziel.voraussetzung ?? VORAUSSETZUNG_DER_PHASE[e.phase] ?? [])];
}

export const TEIL_ARTEN = ['vorbereitung', 'algorithmus', 'variante', 'zwischen', 'nachbereitung'] as const;
export type TeilArt = (typeof TEIL_ARTEN)[number];

/**
 * Ein Abschnitt der Loesung. Verkettung aller Teile (Durchgaenge ausgeschrieben) ergibt nach
 * kanonischer Zusammenfassung an den Teilgrenzen (U + U -> U2, U U' -> nichts) genau `loesung`.
 * art 'algorithmus' = `algorithmus.zuege`, art 'variante' = die Variante mit dem Namen `variante`;
 * `durchgaenge` (Standard 1) wiederholt sie. Bei den anderen Arten stehen die Zuege frei in `zuege`.
 */
export interface Teil {
  art: TeilArt;
  zuege: string;
  /** Pflicht bei art 'variante': Name der Variante. */
  variante?: string;
  /** Nur bei 'algorithmus' und 'variante': Anzahl Durchgaenge, 1..12. */
  durchgaenge?: number;
}

export const VOLLSTAENDIGKEIT = [
  'kantenpermutation-oben',
  'eckenpermutation-oben-gerade',
  'gelbe-lagen',
  'eckenorientierung-oben',
] as const;
/**
 * Welche Vollstaendigkeit die Faelle eines Eintrags haben muessen (vom Test geprueft, ueber die
 * Ausgangszustaende der Faelle):
 * - kantenpermutation-oben: alle 23 Nicht-Identitaets-Permutationen der vier oberen Kanten (Phase 5)
 * - eckenpermutation-oben-gerade: alle 11 geraden Nicht-Identitaets-Permutationen der vier oberen Ecken (Phase 6)
 * - gelbe-lagen: alle 7 Nicht-Kreuz-Muster der gelben Kantenaufkleber oben: Punkt, 2 Linien, 4 Winkel (Phase 4)
 * - eckenorientierung-oben: alle 7 Nicht-Identitaets-Muster der Eckendrehung oben bis auf Drehung der oberen
 *   Schicht (U); die Ecken stehen dabei am richtigen Platz (Phase 7)
 */
export type Vollstaendigkeit = (typeof VOLLSTAENDIGKEIT)[number];

export interface Trigger {
  name: string;
  zuege: string;
  erklaerung: string;
}

/** Erklaerung zu den Zuegen [von, bis) des Gesamtalgorithmus (halboffen, Zaehlung ab 0). */
export interface Schritt {
  bereich: { von: number; bis: number };
  text: string;
}

export interface Fall {
  id: string;
  name: string;
  /** Woran man den Fall erkennt. */
  erkennung: string;
  /** Kurzer Zusatzhinweis, getrennt von `erkennung` anzeigbar. */
  hinweis?: string;
  /**
   * Vorbereitungszuege (z. B. "U2"), getrennt vom Algorithmus anzeigbar. Muss der Anfang von
   * `loesung` sein (Test). Die Tests pruefen immer die vollstaendige `loesung`.
   */
  vorbereitung?: string;
  /** Gegenstueck zu `vorbereitung`: Zuege am Ende von `loesung` (z. B. abschliessendes U). Muss das Ende der `loesung` sein (Test). */
  nachbereitung?: string;
  /** Kurzes Label (nicht leer, hoechstens 30 Zeichen) zur Gruppierung der Faelle in der Oberflaeche, z. B. "Tausch". */
  gruppe?: string;
  /**
   * Strukturierte Loesung (siehe `Teil`). Pflicht, wenn die Loesung mehr ist als
   * [vorbereitung] + ein Algorithmus-/Variantendurchgang + [nachbereitung], also bei mehreren
   * Durchgaengen oder Zwischenzuegen (Test meldet die Fall-ID). Wenn vorhanden, stimmen
   * `vorbereitung`/`nachbereitung` mit dem ersten bzw. letzten Teil ueberein.
   */
  teile?: Teil[];
  /**
   * Vollstaendige Zugfolge, die den Fall loest. Sie muss `algorithmus.zuege` (oder eine
   * deklarierte Variante) als zusammenhaengende Teilfolge enthalten. Wiederholungen werden mit
   * Gruppensyntax geschrieben, z. B. "(R' D' R D)2 U" (parseMoves expandiert Gruppen); ein
   * eigenes Wiederholungsfeld gibt es bewusst nicht.
   */
  loesung: string;
  /**
   * Optional: eigener Aufbau des Falls (beginnt mit z2 oder bekommt es vorangestellt). Standard:
   * z2 + Inverses von `loesung`. Zweck: realistische Faelle, in denen spaetere Phasen noch offen
   * sind. Regel im Inhaltstest: bei Teilzielen (`ziel.erreicht` ohne 'geloest') mindestens ein
   * Fall mit `setup`, nach dessen Loesung der Wuerfel noch nicht geloest ist.
   */
  setup?: string;
}

/** Gleichwertige Variante des Algorithmus (z. B. gespiegelt fuer links). Mindestens ein Fall muss sie nutzen. */
export interface Variante {
  name: string;
  zuege: string;
  /** Wie am Algorithmus; Trigger muessen zusammengesetzt die Zuege der Variante ergeben. */
  trigger?: Trigger[];
  /** Wie am Algorithmus; muessen bei der Zuganzahl der Variante enden. */
  schritte?: Schritt[];
}

export interface Algorithmus {
  name: string;
  zuege: string;
  trigger: Trigger[];
  schritte: Schritt[];
  /**
   * Anzahl Durchgaenge, nach denen die geschuetzten Bereiche (`ziel.erhalten`) sicher wieder
   * heil sind; Standard 1. Beispiel: R' D' R D zerstoert die untere Schicht zwischendurch und
   * stellt sie erst nach 6 Durchgaengen sicher wieder her (periode 6).
   */
  periode?: number;
  varianten?: Variante[];
}

export interface AlgorithmischerEintrag {
  typ: 'algorithmisch';
  id: string;
  /** 3..7 */
  phase: number;
  titel: string;
  ziel: Zielzustand;
  algorithmus: Algorithmus;
  faelle: Fall[];
  vollstaendigkeit?: Vollstaendigkeit;
}

export const ABLAUF_PRAEFIX = 'Ablauf:';

/**
 * Ablauftext aus `teile`, z. B. "Ablauf: U' – Sune – U2." (Algorithmus/Variante mit Namen, bei
 * mehreren Durchgaengen "2× Sune"). null ohne `teile`. Die Oberflaeche erzeugt den Text daraus;
 * ein handgeschriebener `hinweis` darf nur dann mit "Ablauf:" beginnen, wenn er genau diesem Text
 * entspricht (sonst gilt er als doppelte, abweichende Quelle und der Test meldet ihn).
 */
export function hinweisAusTeilen(fall: Fall, algorithmus: Algorithmus): string | null {
  if (!fall.teile || fall.teile.length === 0) return null;
  const label = (t: Teil, name: string): string => ((t.durchgaenge ?? 1) > 1 ? `${t.durchgaenge}× ${name}` : name);
  const parts = fall.teile.map((t) => {
    if (t.art === 'algorithmus') return label(t, algorithmus.name);
    if (t.art === 'variante') return label(t, t.variante ?? 'Variante');
    return t.zuege.trim();
  });
  return `${ABLAUF_PRAEFIX} ${parts.join(' – ')}.`;
}

export interface Beispiel {
  id: string;
  beschreibung: string;
  setup: string;
  loesung: string;
  schritte?: Schritt[];
}

export interface IntuitiverEintrag {
  typ: 'intuitiv';
  id: string;
  /** 1..2 */
  phase: number;
  titel: string;
  ziel: Zielzustand;
  prinzip: string;
  beispiele: Beispiel[];
}

export type Eintrag = AlgorithmischerEintrag | IntuitiverEintrag;

export interface MethodenPhase {
  nr: number;
  id: string;
  titel: string;
  typ: 'algorithmisch' | 'intuitiv';
  /** Pfad der Eintragsdatei relativ zu content/. */
  datei: string;
}

export interface Methode {
  id: string;
  orientierung: string;
  phasen: MethodenPhase[];
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; fehler: string[] };

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;

const MAX_GRUPPE = 30;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FILE_RE = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.json$/;

class Ctx {
  readonly fehler: string[] = [];
  err(path: string, msg: string): void {
    this.fehler.push(`${path}: ${msg}`);
  }
}

function isObj(x: unknown): x is Obj {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function obj(c: Ctx, x: unknown, path: string, allowed: readonly string[], required: readonly string[]): Obj | null {
  if (!isObj(x)) {
    c.err(path, 'Objekt erwartet');
    return null;
  }
  for (const k of Object.keys(x)) if (!allowed.includes(k)) c.err(`${path}.${k}`, 'unbekanntes Feld');
  for (const k of required) if (!(k in x)) c.err(`${path}.${k}`, 'Pflichtfeld fehlt');
  return x;
}

function str(c: Ctx, x: unknown, path: string): string | null {
  if (typeof x !== 'string' || x.trim() === '') {
    c.err(path, 'nicht leerer Text erwartet');
    return null;
  }
  return x;
}

function id(c: Ctx, x: unknown, path: string): string | null {
  const s = str(c, x, path);
  if (s !== null && !ID_RE.test(s)) {
    c.err(path, `ungueltige id "${s}" (nur a-z, 0-9 und einzelne Bindestriche)`);
    return null;
  }
  return s;
}

function int(c: Ctx, x: unknown, path: string, min: number, max: number): number | null {
  if (typeof x !== 'number' || !Number.isInteger(x) || x < min || x > max) {
    c.err(path, `ganze Zahl ${min}..${max} erwartet`);
    return null;
  }
  return x;
}

function arr(c: Ctx, x: unknown, path: string, minLen: number): unknown[] | null {
  if (!Array.isArray(x)) {
    c.err(path, 'Liste erwartet');
    return null;
  }
  if (x.length < minLen) c.err(path, `mindestens ${minLen} Eintrag/Eintraege erwartet`);
  return x;
}

function uniqueIds(c: Ctx, ids: Array<string | null>, path: string): void {
  const seen = new Set<string>();
  for (const i of ids) {
    if (i === null) continue;
    if (seen.has(i)) c.err(path, `id "${i}" doppelt`);
    seen.add(i);
  }
}

function regions(c: Ctx, x: unknown, path: string, minLen = 0): void {
  const list = arr(c, x, path, minLen);
  list?.forEach((r, i) => {
    if (typeof r !== 'string' || !(CUBE_REGIONS as readonly string[]).includes(r)) {
      c.err(`${path}[${i}]`, `unbekannter Bereich ${JSON.stringify(r)}`);
    }
  });
}

function ziel(c: Ctx, x: unknown, path: string): void {
  const o = obj(
    c,
    x,
    path,
    ['text', 'erhalten', 'erreicht', 'aufTolerant', 'voraussetzung'],
    ['text', 'erhalten', 'erreicht', 'aufTolerant'],
  );
  if (!o) return;
  str(c, o['text'], `${path}.text`);
  if ('voraussetzung' in o) regions(c, o['voraussetzung'], `${path}.voraussetzung`, 1);
  regions(c, o['erhalten'], `${path}.erhalten`);
  regions(c, o['erreicht'], `${path}.erreicht`, 1);
  if (typeof o['aufTolerant'] !== 'boolean') c.err(`${path}.aufTolerant`, 'true oder false erwartet');
}

/** Schritte: halboffene Bereiche, aufsteigend, lueckenlos ab 0. Die Gesamtlaenge prueft der Inhaltstest. */
function schritte(c: Ctx, x: unknown, path: string, minLen: number): void {
  const list = arr(c, x, path, minLen);
  if (!list) return;
  let expectedVon = 0;
  list.forEach((s, i) => {
    const p = `${path}[${i}]`;
    const o = obj(c, s, p, ['bereich', 'text'], ['bereich', 'text']);
    if (!o) return;
    str(c, o['text'], `${p}.text`);
    const b = obj(c, o['bereich'], `${p}.bereich`, ['von', 'bis'], ['von', 'bis']);
    if (!b) return;
    const von = int(c, b['von'], `${p}.bereich.von`, 0, 100000);
    const bis = int(c, b['bis'], `${p}.bereich.bis`, 1, 100000);
    if (von === null || bis === null) {
      expectedVon = -1;
      return;
    }
    if (bis <= von) c.err(`${p}.bereich`, `bis (${bis}) muss groesser als von (${von}) sein`);
    if (expectedVon >= 0 && von !== expectedVon) c.err(`${p}.bereich.von`, `erwartet ${expectedVon} (lueckenlos, ohne Ueberlappung)`);
    expectedVon = bis;
  });
}

function triggerListe(c: Ctx, x: unknown, path: string): void {
  arr(c, x, path, 0)?.forEach((t, i) => {
    const p = `${path}[${i}]`;
    const to = obj(c, t, p, ['name', 'zuege', 'erklaerung'], ['name', 'zuege', 'erklaerung']);
    if (!to) return;
    str(c, to['name'], `${p}.name`);
    str(c, to['zuege'], `${p}.zuege`);
    str(c, to['erklaerung'], `${p}.erklaerung`);
  });
}

function teileListe(c: Ctx, x: unknown, path: string): void {
  arr(c, x, path, 1)?.forEach((t, i) => {
    const p = `${path}[${i}]`;
    const to = obj(c, t, p, ['art', 'zuege', 'variante', 'durchgaenge'], ['art', 'zuege']);
    if (!to) return;
    const art = to['art'];
    if (typeof art !== 'string' || !(TEIL_ARTEN as readonly string[]).includes(art)) {
      c.err(`${p}.art`, `unbekannte art ${JSON.stringify(art)} (erlaubt: ${TEIL_ARTEN.join(', ')})`);
    }
    str(c, to['zuege'], `${p}.zuege`);
    if ('durchgaenge' in to) {
      if (art !== 'algorithmus' && art !== 'variante') c.err(`${p}.durchgaenge`, 'nur bei art algorithmus oder variante erlaubt');
      int(c, to['durchgaenge'], `${p}.durchgaenge`, 1, 12);
    }
    if ('variante' in to) {
      if (art !== 'variante') c.err(`${p}.variante`, 'nur bei art variante erlaubt');
      str(c, to['variante'], `${p}.variante`);
    } else if (art === 'variante') {
      c.err(`${p}.variante`, 'Pflichtfeld bei art variante fehlt');
    }
  });
}

function algorithmisch(c: Ctx, o: Obj): void {
  if ('vollstaendigkeit' in o && !(VOLLSTAENDIGKEIT as readonly unknown[]).includes(o['vollstaendigkeit'])) {
    c.err('vollstaendigkeit', `unbekannter Wert (erlaubt: ${VOLLSTAENDIGKEIT.join(', ')})`);
  }
  int(c, o['phase'], 'phase', 3, 7);
  ziel(c, o['ziel'], 'ziel');
  const a = obj(
    c,
    o['algorithmus'],
    'algorithmus',
    ['name', 'zuege', 'trigger', 'schritte', 'periode', 'varianten'],
    ['name', 'zuege', 'trigger', 'schritte'],
  );
  if (a) {
    str(c, a['name'], 'algorithmus.name');
    str(c, a['zuege'], 'algorithmus.zuege');
    if ('periode' in a) int(c, a['periode'], 'algorithmus.periode', 1, 12);
    if ('varianten' in a) {
      arr(c, a['varianten'], 'algorithmus.varianten', 1)?.forEach((v, i) => {
        const p = `algorithmus.varianten[${i}]`;
        const vo = obj(c, v, p, ['name', 'zuege', 'trigger', 'schritte'], ['name', 'zuege']);
        if (!vo) return;
        str(c, vo['name'], `${p}.name`);
        str(c, vo['zuege'], `${p}.zuege`);
        if ('trigger' in vo) triggerListe(c, vo['trigger'], `${p}.trigger`);
        if ('schritte' in vo) schritte(c, vo['schritte'], `${p}.schritte`, 1);
      });
    }
    triggerListe(c, a['trigger'], 'algorithmus.trigger');
    schritte(c, a['schritte'], 'algorithmus.schritte', 1);
  }
  const ids: Array<string | null> = [];
  arr(c, o['faelle'], 'faelle', 1)?.forEach((f, i) => {
    const p = `faelle[${i}]`;
    const fo = obj(
      c,
      f,
      p,
      ['id', 'name', 'erkennung', 'hinweis', 'vorbereitung', 'nachbereitung', 'gruppe', 'teile', 'loesung', 'setup'],
      ['id', 'name', 'erkennung', 'loesung'],
    );
    if (!fo) return;
    ids.push(id(c, fo['id'], `${p}.id`));
    str(c, fo['name'], `${p}.name`);
    str(c, fo['erkennung'], `${p}.erkennung`);
    str(c, fo['loesung'], `${p}.loesung`);
    for (const k of ['hinweis', 'vorbereitung', 'nachbereitung', 'setup']) if (k in fo) str(c, fo[k], `${p}.${k}`);
    if ('teile' in fo) teileListe(c, fo['teile'], `${p}.teile`);
    if ('gruppe' in fo) {
      const g = str(c, fo['gruppe'], `${p}.gruppe`);
      if (g !== null && g.length > MAX_GRUPPE) c.err(`${p}.gruppe`, `hoechstens ${MAX_GRUPPE} Zeichen erlaubt`);
    }
  });
  uniqueIds(c, ids, 'faelle');
}

function intuitiv(c: Ctx, o: Obj): void {
  int(c, o['phase'], 'phase', 1, 2);
  ziel(c, o['ziel'], 'ziel');
  str(c, o['prinzip'], 'prinzip');
  const ids: Array<string | null> = [];
  arr(c, o['beispiele'], 'beispiele', 1)?.forEach((b, i) => {
    const p = `beispiele[${i}]`;
    const bo = obj(c, b, p, ['id', 'beschreibung', 'setup', 'loesung', 'schritte'], ['id', 'beschreibung', 'setup', 'loesung']);
    if (!bo) return;
    ids.push(id(c, bo['id'], `${p}.id`));
    str(c, bo['beschreibung'], `${p}.beschreibung`);
    str(c, bo['setup'], `${p}.setup`);
    str(c, bo['loesung'], `${p}.loesung`);
    if ('schritte' in bo) schritte(c, bo['schritte'], `${p}.schritte`, 1);
  });
  uniqueIds(c, ids, 'beispiele');
}

/** Prueft einen Inhaltseintrag (algorithmisch oder intuitiv). */
export function validateEntry(x: unknown): ValidationResult<Eintrag> {
  const c = new Ctx();
  if (!isObj(x)) return { ok: false, fehler: ['Eintrag: Objekt erwartet'] };
  if (x['typ'] === 'algorithmisch') {
    const o = obj(c, x, 'eintrag', ['typ', 'id', 'phase', 'titel', 'ziel', 'algorithmus', 'faelle', 'vollstaendigkeit'], ['typ', 'id', 'phase', 'titel', 'ziel', 'algorithmus', 'faelle']);
    if (o) {
      id(c, o['id'], 'id');
      str(c, o['titel'], 'titel');
      algorithmisch(c, o);
    }
  } else if (x['typ'] === 'intuitiv') {
    const o = obj(c, x, 'eintrag', ['typ', 'id', 'phase', 'titel', 'ziel', 'prinzip', 'beispiele'], ['typ', 'id', 'phase', 'titel', 'ziel', 'prinzip', 'beispiele']);
    if (o) {
      id(c, o['id'], 'id');
      str(c, o['titel'], 'titel');
      intuitiv(c, o);
    }
  } else {
    c.err('typ', 'algorithmisch oder intuitiv erwartet');
  }
  return c.fehler.length === 0 ? { ok: true, value: x as unknown as Eintrag } : { ok: false, fehler: c.fehler };
}

/** Prueft die Methodendatei (Liste der Phasen). Lueckenlosigkeit 1..7 prueft der Inhaltstest. */
export function validateMethode(x: unknown): ValidationResult<Methode> {
  const c = new Ctx();
  const o = obj(c, x, 'methode', ['id', 'orientierung', 'phasen'], ['id', 'orientierung', 'phasen']);
  if (o) {
    id(c, o['id'], 'id');
    str(c, o['orientierung'], 'orientierung');
    const nrs: number[] = [];
    const ids: Array<string | null> = [];
    arr(c, o['phasen'], 'phasen', 1)?.forEach((ph, i) => {
      const p = `phasen[${i}]`;
      const po = obj(c, ph, p, ['nr', 'id', 'titel', 'typ', 'datei'], ['nr', 'id', 'titel', 'typ', 'datei']);
      if (!po) return;
      const nr = int(c, po['nr'], `${p}.nr`, 1, 7);
      if (nr !== null) {
        if (nrs.includes(nr)) c.err(`${p}.nr`, `nr ${nr} doppelt`);
        nrs.push(nr);
      }
      ids.push(id(c, po['id'], `${p}.id`));
      str(c, po['titel'], `${p}.titel`);
      if (po['typ'] !== 'algorithmisch' && po['typ'] !== 'intuitiv') c.err(`${p}.typ`, 'algorithmisch oder intuitiv erwartet');
      const d = str(c, po['datei'], `${p}.datei`);
      if (d !== null && !FILE_RE.test(d)) c.err(`${p}.datei`, 'relativer Pfad auf eine .json-Datei erwartet');
    });
    uniqueIds(c, ids, 'phasen');
  }
  return c.fehler.length === 0 ? { ok: true, value: x as Methode } : { ok: false, fehler: c.fehler };
}
