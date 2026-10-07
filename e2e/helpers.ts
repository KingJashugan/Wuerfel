import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const SHOT_DIR = 'test-results/screenshots';

/**
 * Anteil farbiger Pixel im Wuerfelbereich (Screenshot, im Browser ausgewertet).
 * Als farbig zaehlt ein Pixel, wenn max(R,G,B) - min(R,G,B) > 60: Das schliesst Weiss (Hintergrund,
 * weisse Wuerfelseite), Grau (Rahmen) und Schwarz aus; rot, gruen, blau und gelb liegen deutlich darueber.
 * Herleitung der Schwelle: Der Wuerfel fuellt in den Screenshots grob 40 % der Flaeche, davon sind rund
 * die Haelfte farbige Sticker, also ca. 15-20 %. Schwelle 5 % liegt gut darunter, aber weit ueber 0 %
 * eines leeren (weissen/grauen) Frames.
 */
export async function coloredShare(page: Page): Promise<number> {
  const png = (await page.getByTestId('cube').screenshot()).toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) return 0;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let colored = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] ?? 255;
      const g = d[i + 1] ?? 255;
      const b = d[i + 2] ?? 255;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 60) colored++;
    }
    return colored / (d.length / 4);
  }, png);
}

export const MIN_COLORED_SHARE = 0.05;

export async function waitRendered(page: Page): Promise<void> {
  await expect.poll(() => coloredShare(page), { message: 'Wuerfel wurde nicht gerendert' }).toBeGreaterThan(MIN_COLORED_SHARE);
}

/** Wartet n Animationsframes (stabiles Signal statt fester Wartezeit). */
export async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const tick = (left: number): void => (left <= 0 ? resolve() : void requestAnimationFrame(() => tick(left - 1)));
        tick(count);
      }),
    n,
  );
}

/** Algorithmischer Fall mit 8 Zuegen: R U R' U R U2 R' U (Phase 5, Sune plus AUF). */
export const CASE_PATH = '/#/phase/5/k-3120';
export const CASE_MOVES = 8;
/** Intuitives Beispiel mit einem einzigen Zug (F2). */
export const SHORT_PATH = '/#/phase/1/kante-oben';
/** Sehr langer Fall (Phase 7): Die Animation kann nicht zwischen zwei Klicks enden. */
export const LONG_PATH = '/#/phase/7/vier-ecken-abwechselnd';

/** Oeffnet eine Seite mit Player und wartet, bis er geladen und gerendert ist. */
export async function openPlayer(page: Page, path = CASE_PATH, total: number | null = CASE_MOVES): Promise<void> {
  await page.goto(path);
  await expect(page.locator('section.player[data-ready="true"]')).toBeVisible();
  await expect(page.getByTestId('counter')).toHaveText(total === null ? /^Zug 0 \/ \d+$/ : `Zug 0 / ${total}`);
  await waitRendered(page);
}

export const BUTTON_IDS = ['to-start', 'step-back', 'play-pause', 'step-forward', 'to-end'];

export async function shot(page: Page, name: string, projectName: string): Promise<void> {
  await page.screenshot({ path: `${SHOT_DIR}/${projectName}-${name}.png` });
}

export interface PageErrors {
  list: string[];
}

/** Sammelt unbehandelte Seitenfehler und console.error (fuer "keine Fehler"-Pruefungen). */
export function collectErrors(page: Page): PageErrors {
  const errors: PageErrors = { list: [] };
  page.on('pageerror', (e) => errors.list.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.list.push(`console.error: ${m.text()}`);
  });
  return errors;
}

export async function noHorizontalScroll(page: Page): Promise<void> {
  const m = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    bw: document.body.scrollWidth,
    iw: window.innerWidth,
  }));
  expect(m.sw).toBeLessThanOrEqual(m.iw);
  expect(m.bw).toBeLessThanOrEqual(m.iw);
}
