import type { Algorithm, Move, MoveBase } from './types';

export class CubeParseError extends Error {
  readonly token: string;
  readonly index: number;
  constructor(message: string, token: string, index: number) {
    super(message);
    this.name = 'CubeParseError';
    this.token = token;
    this.index = index;
  }
}

const WIDE_LOWER: Record<string, MoveBase> = {
  u: 'Uw', d: 'Dw', l: 'Lw', r: 'Rw', f: 'Fw', b: 'Bw',
};
const CANONICAL = new Set<string>([
  'U', 'D', 'L', 'R', 'F', 'B', 'M', 'E', 'S', 'x', 'y', 'z',
  'Uw', 'Dw', 'Lw', 'Rw', 'Fw', 'Bw',
]);

const TOKEN = /^([A-Za-z]w?)(2'?|')?$/;

function parseToken(token: string, index: number): Move {
  const fail = (why: string): never => {
    throw new CubeParseError(`Ungültiger Zug "${token}" (Token ${index}): ${why}`, token, index);
  };
  const m = TOKEN.exec(token);
  if (!m) return fail("erwartet Zugbuchstabe mit optionalem 2 oder '");
  const name = m[1] as string;
  const suffix = m[2] ?? '';
  let base: MoveBase;
  if (CANONICAL.has(name)) base = name as MoveBase;
  else if (name in WIDE_LOWER) base = WIDE_LOWER[name] as MoveBase;
  else return fail('unbekannter Zug');
  const turns = suffix === "'" ? 3 : suffix === '' ? 1 : 2;
  return { base, turns };
}

/** Parst eine durch Leerraum getrennte Zugfolge. Wirft CubeParseError bei ungültigen Tokens. */
export function parseAlgorithm(text: string): Move[] {
  return text
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t, i) => parseToken(t, i));
}

export function parseMove(text: string): Move {
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length !== 1) {
    throw new CubeParseError(`Erwartet genau einen Zug, erhalten: ${tokens.length}`, text, 0);
  }
  return parseToken(tokens[0] as string, 0);
}

export function formatMove(move: Move): string {
  return move.base + (move.turns === 1 ? '' : move.turns === 2 ? '2' : "'");
}

export function formatAlgorithm(alg: Algorithm): string {
  return alg.map(formatMove).join(' ');
}

/** Fügt Zugfolgen (Algorithmen oder Strings) zusammen. */
export function concatAlgorithms(...parts: Array<Algorithm | string>): Move[] {
  return parts.flatMap((p) => (typeof p === 'string' ? parseAlgorithm(p) : [...p]));
}
