/** Hash-Routing (funktioniert unter Unterpfad und ohne Server-Rewrite). */

export type Route =
  | { kind: 'home' }
  | { kind: 'phase'; nr: number }
  | { kind: 'case'; nr: number; id: string }
  | { kind: 'notfound' };

/** Parst `location.hash`: "#/", "#/phase/5", "#/phase/5/k-3120". Leerer Hash = Startseite. */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '').split('?')[0] ?? '';
  const parts = path.split('/').filter((p) => p !== '');
  if (parts.length === 0) return { kind: 'home' };
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
export const caseHref = (nr: number, id: string): string => `#/phase/${nr}/${encodeURIComponent(id)}`;
