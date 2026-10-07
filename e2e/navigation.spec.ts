import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import phase5Json from '../content/phase-5.json' with { type: 'json' };
import { CASE_MOVES, collectErrors, noHorizontalScroll, openPlayer, shot, waitRendered } from './helpers';

interface FallJson {
  id: string;
  gruppe?: string;
}
/** Phase 5 direkt aus der Inhaltsdatei, damit Gruppen und Reihenfolge nicht doppelt gepflegt werden. */
const phase5: { faelle: FallJson[] } = phase5Json;

const PHASE_TITLES = [
  'Weißes Kreuz',
  'Weiße Ecken',
  'Mittlere Kanten',
  'Gelbes Kreuz',
  'Gelbe Kanten positionieren',
  'Gelbe Ecken positionieren',
  'Gelbe Ecken orientieren',
];

const hash = (page: Page): Promise<string> => page.evaluate(() => location.hash);

test.describe('Startseite', () => {
  test('zeigt Titel, Einfuehrung und sieben Phasen', async ({ page }, info) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cube Trainer – Anfängermethode');
    await expect(page.getByText('Weiß unten, Grün vorne')).toBeVisible();
    await expect(page.getByText('Singmaster')).toBeVisible();
    const links = page.getByTestId('phase-list').getByRole('link');
    await expect(links).toHaveCount(7);
    for (let i = 0; i < 7; i++) await expect(links.nth(i)).toContainText(PHASE_TITLES[i] ?? '');
    await shot(page, 'home', info.project.name);
  });

  test('Phase antippen oeffnet die Phasenseite', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('phase-link-3').click();
    await expect(page).toHaveURL(/#\/phase\/3$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Phase 3: Mittlere Kanten');
  });
});

test.describe('Phasenseiten', () => {
  test('Phase 5: Algorithmus und Faelle nach Gruppen', async ({ page }, info) => {
    await page.goto('/#/phase/5');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Phase 5: Gelbe Kanten positionieren');
    await expect(page.getByTestId('algorithmus')).toContainText('Sune');
    await expect(page.getByTestId('algorithmus')).toContainText("R U R' U R U2 R'");
    await expect(page.getByTestId('algorithmus')).toContainText('Sune-Anfang');
    const groups = [...new Set(phase5.faelle.map((f) => f.gruppe))];
    const groupBoxes = page.getByTestId('case-group');
    await expect(groupBoxes).toHaveCount(groups.length);
    // Reihenfolge wie in der Datei.
    const headings = await groupBoxes.locator('h3').allTextContents();
    expect(headings).toEqual(groups);
    await expect(page.locator('[data-testid^="case-link-"]')).toHaveCount(phase5.faelle.length);
    await expect(page.getByTestId('case-link-k-3120')).toContainText('Vorne und links vertauscht');
    await expect(page.getByTestId('case-link-k-3120')).toContainText('Kanten vorne und links sind vertauscht');
    await shot(page, 'phase5', info.project.name);
  });

  test('Phase 1 (intuitiv): Prinzip in Absaetzen und Beispiele', async ({ page }) => {
    await page.goto('/#/phase/1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Phase 1: Weißes Kreuz');
    await expect(page.getByRole('heading', { name: 'Prinzip' })).toBeVisible();
    // Das Prinzip besteht aus mehreren Absaetzen (\n\n im JSON).
    const principle = page.locator('section.block', { has: page.getByRole('heading', { name: 'Prinzip' }) });
    expect(await principle.locator('p').count()).toBeGreaterThanOrEqual(3);
    await expect(page.getByTestId('example-list').getByRole('link').first()).toBeVisible();
    await expect(page.getByTestId('algorithmus')).toHaveCount(0);
  });

  test('alle sieben Phasen lassen sich oeffnen', async ({ page }) => {
    const errors = collectErrors(page);
    for (let nr = 1; nr <= 7; nr++) {
      await page.goto(`/#/phase/${nr}`);
      await expect(page.getByRole('heading', { level: 1 })).toContainText(`Phase ${nr}: ${PHASE_TITLES[nr - 1]}`);
      await expect(page.getByRole('heading', { name: 'Ziel' })).toBeVisible();
    }
    expect(errors.list).toEqual([]);
  });
});

test.describe('Fallseiten', () => {
  test('Fall oeffnen laedt Player mit Zugzaehler und Ablauf', async ({ page }, info) => {
    await page.goto('/#/phase/5');
    await page.getByTestId('case-link-k-3120').click();
    await expect(page).toHaveURL(/#\/phase\/5\/k-3120$/);
    await expect(page.locator('section.player[data-ready="true"]')).toBeVisible();
    await expect(page.getByTestId('counter')).toHaveText(`Zug 0 / ${CASE_MOVES}`);
    await waitRendered(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vorne und links vertauscht');
    await expect(page.getByRole('heading', { name: 'Erkennung' })).toBeVisible();
    const ablauf = page.getByTestId('ablauf');
    await expect(ablauf).toContainText('Sune');
    await expect(ablauf).toContainText("R U R' U R U2 R'");
    await expect(ablauf).toContainText('Nachbereitung');
    await expect(page.getByRole('link', { name: /Phase 5/ })).toHaveAttribute('href', '#/phase/5');
    await page.getByTestId('step-forward').click();
    await expect(page.getByTestId('counter')).toHaveText(`Zug 1 / ${CASE_MOVES}`);
    await shot(page, 'case', info.project.name);
  });

  test('Ablauf mit mehreren Durchgaengen und Vorbereitung', async ({ page }) => {
    await page.goto('/#/phase/5/k-0132');
    const ablauf = page.getByTestId('ablauf');
    await expect(ablauf).toContainText('Vorbereitung');
    await expect(ablauf).toContainText('Nachbereitung');
    await page.goto('/#/phase/7/vier-ecken-abwechselnd');
    await expect(page.getByTestId('ablauf')).toContainText('nacheinander');
  });

  test('Vor und Zurueck per Hash-Navigation und Browser-Verlauf', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await page.getByTestId('phase-link-5').click();
    await page.getByTestId('case-link-k-3120').click();
    await expect(page.locator('section.player[data-ready="true"]')).toBeVisible();
    await page.getByTestId('next-case').click();
    await expect(page).toHaveURL(/#\/phase\/5\/k-0132$/);
    await expect(page.locator('section.player[data-ready="true"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hinten und links vertauscht');
    await page.getByTestId('prev-case').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vorne und links vertauscht');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hinten und links vertauscht');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vorne und links vertauscht');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Phase 5: Gelbe Kanten positionieren');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cube Trainer – Anfängermethode');
    await page.goForward();
    expect(await hash(page)).toBe('#/phase/5');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Phase 5: Gelbe Kanten positionieren');
    expect(errors.list).toEqual([]);
  });

  test('erster Fall hat kein "Vorheriger", letzter kein "Naechster"', async ({ page }) => {
    const first = phase5.faelle[0];
    const last = phase5.faelle[phase5.faelle.length - 1];
    await page.goto(`/#/phase/5/${first?.id}`);
    await expect(page.getByTestId('prev-case')).toHaveCount(0);
    await expect(page.getByTestId('next-case')).toHaveCount(1);
    await page.goto(`/#/phase/5/${last?.id}`);
    await expect(page.getByTestId('next-case')).toHaveCount(0);
    await expect(page.getByTestId('prev-case')).toHaveCount(1);
  });

  test('intuitives Beispiel: Player, Beschreibung und Schritt-Hervorhebung', async ({ page }, info) => {
    await page.goto('/#/phase/1/kurze-zugfolge');
    await expect(page.locator('section.player[data-ready="true"]')).toBeVisible();
    await expect(page.getByTestId('counter')).toHaveText('Zug 0 / 3');
    await expect(page.getByTestId('schritte')).toBeVisible();
    const steps = page.locator('[data-testid="schritte"] li');
    expect(await steps.count()).toBe(3);
    await expect(page.locator('[data-testid="schritte"] li.active')).toHaveCount(0);
    await page.getByTestId('step-forward').click();
    await expect(page.getByTestId('counter')).toHaveText('Zug 1 / 3');
    await expect(page.locator('[data-testid="schritte"] li.active')).toHaveCount(1);
    await expect(steps.first()).toHaveClass(/active/);
    // Ans Ende springen: der letzte Schritt ist aktiv.
    await page.getByTestId('to-end').click();
    await expect(page.getByTestId('counter')).toHaveText('Zug 3 / 3');
    await expect(steps.last()).toHaveClass(/active/);
    await expect(steps.first()).not.toHaveClass(/active/);
    await shot(page, 'example', info.project.name);
  });

  test('unbekannte Route zeigt Hinweis statt weisser Seite', async ({ page }) => {
    await page.goto('/#/phase/99');
    await expect(page.getByRole('alert')).toContainText('gibt es nicht');
    await page.goto('/#/phase/5/gibt-es-nicht');
    await expect(page.getByRole('alert')).toContainText('gibt es nicht');
    await page.goto('/#/quatsch');
    await expect(page.getByRole('alert')).toContainText('gibt es nicht');
    await page.getByRole('link', { name: /Startseite/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cube Trainer – Anfängermethode');
  });

  test('Seitenwechsel raeumt den Player auf (kein Leck, auch bei schnellem Wechsel)', async ({ page }) => {
    const errors = collectErrors(page);
    await openPlayer(page);
    await expect(page.locator('twisty-player')).toHaveCount(1);
    await page.evaluate(() => {
      location.hash = '#/phase/5';
    });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Phase 5: Gelbe Kanten positionieren');
    await expect(page.locator('twisty-player')).toHaveCount(0);
    // Sehr schneller Wechsel zwischen mehreren Faellen, ohne zu warten, bis der Player fertig ist.
    const ids = phase5.faelle.slice(0, 6).map((f) => f.id);
    await page.evaluate(async (list) => {
      const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5));
      for (const id of list) {
        location.hash = `#/phase/5/${id}`;
        await tick();
      }
      location.hash = '#/phase/1/kurze-zugfolge';
    }, ids);
    await expect(page).toHaveURL(/#\/phase\/1\/kurze-zugfolge$/);
    await expect(page.locator('section.player[data-ready="true"]')).toBeVisible();
    await expect(page.locator('twisty-player')).toHaveCount(1);
    await waitRendered(page);
    // Nach dem Verlassen ebenfalls kein Player mehr.
    await page.getByTestId('brand').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cube Trainer – Anfängermethode');
    await expect(page.locator('twisty-player')).toHaveCount(0);
    expect(errors.list).toEqual([]);
  });
});

test.describe('Mobil-Kriterien (Navigation)', () => {
  const PAGES = ['/', '/#/phase/5', '/#/phase/1', '/#/phase/7', '/#/phase/5/k-3120', '/#/phase/2/weiss-rechts'];
  for (const [w, h] of [
    [360, 640],
    [390, 844],
    [768, 1024],
  ] as const) {
    test(`keine horizontale Scrollbar bei ${w}px auf allen Seitenarten`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      for (const p of PAGES) {
        await page.goto(p);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        if (/#\/phase\/\d+\/./.test(p)) await expect(page.locator('section.player[data-ready="true"]')).toBeVisible();
        await noHorizontalScroll(page);
      }
    });
  }

  test('Links haben Tap-Ziele von mindestens 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    for (const p of ['/', '/#/phase/5', '/#/phase/1', '/#/phase/5/k-3120']) {
      await page.goto(p);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const boxes = await page.locator('a').evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { id: e.textContent ?? '', w: r.width, h: r.height };
        }),
      );
      expect(boxes.length).toBeGreaterThan(0);
      for (const b of boxes) {
        expect(b.h, `${p}: ${b.id}`).toBeGreaterThanOrEqual(44);
        expect(b.w, `${p}: ${b.id}`).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('Handy 360 px: Start, Phase und Fall (Screenshots)', async ({ page }, info) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto('/');
    await expect(page.getByTestId('phase-list')).toBeVisible();
    await shot(page, 'm360-home', info.project.name);
    await page.goto('/#/phase/5');
    await expect(page.getByTestId('algorithmus')).toBeVisible();
    await shot(page, 'm360-phase5', info.project.name);
    await openPlayer(page);
    await shot(page, 'm360-case', info.project.name);
  });
});
