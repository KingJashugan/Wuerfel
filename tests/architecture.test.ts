import { describe, expect, it } from 'vitest';

const ALLOWED = '../src/cube/adapter.ts';

/** Findet Imports von `cubing` (inkl. Unterpfade) und vom verbotenen Fork `@vscubing/cubing`. */
const IMPORT_RE = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*['"`](?:@vscubing\/)?cubing(?:\/[^'"`]*)?['"`]/;

// Alle Quelldateien als Rohtext (Vite-Feature, kein Node-Dateizugriff noetig).
const sources = import.meta.glob('../{src,tests}/**/*.{ts,tsx,js,jsx,mjs,vue,svelte}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('Import-Regel: nur adapter.ts importiert cubing', () => {
  it('Erkennungsmuster funktioniert (Selbsttest)', () => {
    const q = "'";
    for (const spec of ['cubing', 'cubing/alg', 'cubing/twisty', '@vscubing/cubing']) {
      expect(IMPORT_RE.test(`import { X } from ${q}${spec}${q};`)).toBe(true);
      expect(IMPORT_RE.test(`const m = await import(${q}${spec}${q});`)).toBe(true);
      expect(IMPORT_RE.test(`import ${q}${spec}${q};`)).toBe(true);
    }
    expect(IMPORT_RE.test(`import { X } from ${q}./cubing-helper${q};`)).toBe(false);
    expect(IMPORT_RE.test(`import { X } from ${q}../src/cube/adapter${q};`)).toBe(false);
  });

  it('Suche erfasst Dateien aus src/ und tests/', () => {
    const keys = Object.keys(sources);
    expect(keys).toContain(ALLOWED);
    expect(keys).toContain('./adapter.test.ts'); // die Testdatei selbst schliesst Vite aus dem Glob aus
    expect(keys.some((k) => k.startsWith('../src/cube/'))).toBe(true);
  });

  it('keine andere Datei unter src/ oder tests/ importiert cubing', () => {
    const offenders = Object.entries(sources)
      .filter(([path]) => path !== ALLOWED)
      .filter(([, text]) => IMPORT_RE.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });

  it('adapter.ts importiert cubing und nicht den GPL-Fork', () => {
    const src = sources[ALLOWED] ?? '';
    expect(IMPORT_RE.test(src)).toBe(true);
    expect(src).not.toContain('@vscubing');
  });
});
