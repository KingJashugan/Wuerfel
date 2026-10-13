/**
 * Lernfortschritt im Browser (localStorage). Alle Zugriffe sind abgesichert: Ist der Speicher nicht
 * verfuegbar (privates Fenster, gesperrt), arbeitet die App nur im Arbeitsspeicher weiter.
 */

const STORAGE_KEY = 'cube-trainer:progress:v1';

export interface QuizStat {
  richtig: number;
  falsch: number;
}

interface Stored {
  gelernt: string[];
  quiz: Record<string, QuizStat>;
}

/** Schluessel eines Falls, z. B. "5/k-3120". */
export const caseKey = (nr: number, id: string): string => `${nr}/${id}`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isStat(v: unknown): v is QuizStat {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return Number.isInteger(s['richtig']) && Number.isInteger(s['falsch']) && (s['richtig'] as number) >= 0 && (s['falsch'] as number) >= 0;
}

function parse(raw: string | null): Stored {
  const empty: Stored = { gelernt: [], quiz: {} };
  if (raw === null) return empty;
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return empty;
    const d = data as Record<string, unknown>;
    const gelernt = Array.isArray(d['gelernt']) ? d['gelernt'].filter((k): k is string => typeof k === 'string') : [];
    const quiz: Record<string, QuizStat> = {};
    if (typeof d['quiz'] === 'object' && d['quiz'] !== null) {
      for (const [k, v] of Object.entries(d['quiz'])) if (isStat(v)) quiz[k] = { richtig: v.richtig, falsch: v.falsch };
    }
    return { gelernt: [...new Set(gelernt)], quiz };
  } catch {
    return empty;
  }
}

export interface Progress {
  isLearned(key: string): boolean;
  setLearned(key: string, learned: boolean): void;
  /** Anzahl der als gelernt markierten Faelle unter `keys`. */
  learnedCount(keys: readonly string[]): number;
  recordQuiz(key: string, correct: boolean): void;
  stat(key: string): QuizStat;
  /** Setzt den gesamten Fortschritt zurueck. */
  reset(): void;
}

/** Erzeugt den Fortschrittsspeicher. `storage` ist fuer Tests austauschbar. */
export function createProgress(storage: StorageLike | null = defaultStorage()): Progress {
  let data: Stored;
  try {
    data = parse(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    data = { gelernt: [], quiz: {} };
  }
  const save = (): void => {
    try {
      storage?.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Speicher voll oder gesperrt: Fortschritt gilt nur fuer diese Sitzung.
    }
  };
  return {
    isLearned: (key) => data.gelernt.includes(key),
    setLearned(key, learned) {
      const has = data.gelernt.includes(key);
      if (learned && !has) data.gelernt.push(key);
      else if (!learned && has) data.gelernt = data.gelernt.filter((k) => k !== key);
      else return;
      save();
    },
    learnedCount: (keys) => keys.filter((k) => data.gelernt.includes(k)).length,
    recordQuiz(key, correct) {
      const s = data.quiz[key] ?? { richtig: 0, falsch: 0 };
      if (correct) s.richtig += 1;
      else s.falsch += 1;
      data.quiz[key] = s;
      save();
    },
    stat: (key) => ({ ...(data.quiz[key] ?? { richtig: 0, falsch: 0 }) }),
    reset() {
      data = { gelernt: [], quiz: {} };
      save();
    },
  };
}

/** Prozess-weit geteilter Speicher der App. */
export const progress: Progress = createProgress();

/**
 * Waehlt die naechste Quizfrage. Faelle mit mehr Fehlern, ohne Quizversuch oder noch nicht als
 * gelernt markiert werden haeufiger gezogen; der zuletzt gefragte Fall wird vermieden.
 * `random` liefert Werte in [0, 1) und ist fuer Tests austauschbar.
 */
export function pickQuestion(
  keys: readonly string[],
  p: Pick<Progress, 'isLearned' | 'stat'>,
  last: string | null,
  random: () => number = Math.random,
): string | null {
  const pool = keys.length > 1 ? keys.filter((k) => k !== last) : [...keys];
  if (pool.length === 0) return null;
  const weights = pool.map((k) => {
    const s = p.stat(k);
    const w = 1 + 2 * s.falsch + (s.richtig + s.falsch === 0 ? 2 : 0) + (p.isLearned(k) ? 0 : 1) - Math.min(s.richtig, 3) * 0.5;
    return Math.max(w, 0.5);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return pool[i] ?? null;
  }
  return pool[pool.length - 1] ?? null;
}

/** Mischt `all` und gibt bis zu `count` Elemente zurueck, die `must` enthalten. */
export function pickOptions<T>(all: readonly T[], must: T, count: number, random: () => number = Math.random): T[] {
  const others = all.filter((x) => x !== must);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [others[i], others[j]] = [others[j] as T, others[i] as T];
  }
  const chosen = [must, ...others.slice(0, Math.max(count - 1, 0))];
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j] as T, chosen[i] as T];
  }
  return chosen;
}
