/** Hash-Routing (funktioniert unter Unterpfad und ohne Server-Rewrite). */

export type Route =
  | { kind: 'home' }
  | { kind: 'phase'; nr: number }
  | { kind: 'case'; nr: number; id: string }
  | { kind: 'quiz'; nr: number | null }
  | { kind: 'notfound' };

/** Parst `location.hash`: "#/", "#/phase/5", "#/phase/5/k-3120". Leerer Hash = Startseite. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  const parts = path.split('/').filter((p) => p !== '');
  if (parts.length === 0) return { kind: 'home' };
  if (parts[0] === 'quiz') {
    if (parts.length === 1) return { kind: 'quiz', nr: null };
    if (parts.length === 2 && /^[1-9][0-9]*$/.test(parts[1] ?? '')) return { kind: 'quiz', nr: Number(parts[1]) };
    return { kind: 'notfound' };
  }
  if (parts[0] !== 'phase' || parts.length > 3 || parts.length < 2) return { kind: 'notfound' };
  const nrText = parts[1] ?? '';
  if (!/^[1-9][0-9]*$/.test(nrText)) return { kind: 'notfound' };
  const nr = Number(nrText);
  const rawId = parts[2];
  if (rawId === undefined) return { kind: 'phase', nr };
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    return { kind: 'notfound' };
  }
  return { kind: 'case', nr, id };
}

export const homeHref = (): string => '#/';
export const phaseHref = (nr: number): string => `#/phase/${nr}`;
export const quizHref = (nr?: number): string => (nr === undefined ? '#/quiz' : `#/quiz/${nr}`);
export const caseHref =(nr: number, id: string): string => `#/phase/${nr}/${encodeURIComponent(id)}`;
