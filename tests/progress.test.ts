import { describe, expect, it } from 'vitest';
import { caseKey, createProgress, pickOptions, pickQuestion } from '../src/ui/progress';

function fakeStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string): string | null => data[k] ?? null,
    setItem: (k: string, v: string): void => {
      data[k] = v;
    },
  };
}

describe('createProgress', () => {
  it('markiert Faelle als gelernt und zaehlt sie', () => {
    const p = createProgress(fakeStorage());
    const a = caseKey(5, 'k-3120');
    const b = caseKey(5, 'andere');
    expect(p.isLearned(a)).toBe(false);
    p.setLearned(a, true);
    p.setLearned(a, true);
    expect(p.isLearned(a)).toBe(true);
    expect(p.learnedCount([a, b])).toBe(1);
    p.setLearned(a, false);
    expect(p.learnedCount([a, b])).toBe(0);
  });

  it('speichert und laedt den Fortschritt', () => {
    const st = fakeStorage();
    const p = createProgress(st);
    p.setLearned('3/x', true);
    p.recordQuiz('3/x', true);
    p.recordQuiz('3/x', false);
    p.recordQuiz('3/x', false);
    const q = createProgress(st);
    expect(q.isLearned('3/x')).toBe(true);
    expect(q.stat('3/x')).toEqual({ richtig: 1, falsch: 2 });
    expect(q.stat('unbekannt')).toEqual({ richtig: 0, falsch: 0 });
  });

  it('ignoriert beschaedigte oder fremde Daten', () => {
    for (const raw of ['{kaputt', 'null', '42', '{"gelernt":"x","quiz":{"a":{"richtig":-1,"falsch":0}}}']) {
      const p = createProgress(fakeStorage({ 'cube-trainer:progress:v1': raw }));
      expect(p.learnedCount(['a'])).toBe(0);
      expect(p.stat('a')).toEqual({ richtig: 0, falsch: 0 });
    }
  });

  it('funktioniert ohne Speicher und bei Schreibfehlern', () => {
    const none = createProgress(null);
    none.setLearned('a', true);
    expect(none.isLearned('a')).toBe(true);
    const broken = createProgress({
      getItem: () => {
        throw new Error('gesperrt');
      },
      setItem: () => {
        throw new Error('voll');
      },
    });
    broken.recordQuiz('a', true);
    expect(broken.stat('a').richtig).toBe(1);
  });

  it('reset loescht alles', () => {
    const p = createProgress(fakeStorage());
    p.setLearned('a', true);
    p.recordQuiz('a', false);
    p.reset();
    expect(p.isLearned('a')).toBe(false);
    expect(p.stat('a').falsch).toBe(0);
  });
});

describe('pickQuestion', () => {
  const none = { isLearned: () => false, stat: () => ({ richtig: 0, falsch: 0 }) };
  it('vermeidet die letzte Frage', () => {
    for (let i = 0; i < 20; i++) expect(pickQuestion(['a', 'b'], none, 'a', Math.random)).toBe('b');
  });
  it('gibt bei einem einzigen Fall diesen zurueck, bei keinem null', () => {
    expect(pickQuestion(['a'], none, 'a')).toBe('a');
    expect(pickQuestion([], none, null)).toBeNull();
  });
  it('bevorzugt Faelle mit Fehlern', () => {
    const p = {
      isLearned: () => true,
      stat: (k: string) => (k === 'schwer' ? { richtig: 0, falsch: 5 } : { richtig: 5, falsch: 0 }),
    };
    let hard = 0;
    for (let i = 0; i < 1000; i++) if (pickQuestion(['schwer', 'a', 'b'], p, null) === 'schwer') hard++;
    expect(hard).toBeGreaterThan(600);
  });
  it('liefert bei jedem Zufallswert einen gueltigen Fall', () => {
    for (const r of [0, 0.5, 0.999999]) expect(['a', 'b', 'c']).toContain(pickQuestion(['a', 'b', 'c'], none, null, () => r));
  });
});

describe('pickOptions', () => {
  it('enthaelt die richtige Antwort genau einmal und hoechstens count Elemente', () => {
    const all = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let i = 0; i < 50; i++) {
      const o = pickOptions(all, 'c', 4);
      expect(o).toHaveLength(4);
      expect(o.filter((x) => x === 'c')).toHaveLength(1);
      expect(new Set(o).size).toBe(4);
    }
  });
  it('liefert bei wenigen Faellen alle', () => {
    expect(pickOptions(['a', 'b'], 'a', 4).sort()).toEqual(['a', 'b']);
  });
});
