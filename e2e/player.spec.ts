import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const SHOT_DIR = 'test-results/screenshots';

/**
 * Anteil farbiger Pixel im Wuerfelbereich (Screenshot, im Browser ausgewertet).
 * Als farbig zaehlt ein Pixel, wenn max(R,G,B) - min(R,G,B) > 60: Das schliesst Weiss (Hintergrund,
 * weisse Wuerfelseite), Grau (Rahmen) und Schwarz aus; rot, gruen, blau und gelb liegen deutlich darueber.
 * Herleitung der Schwelle: Der Wuerfel fuellt in den Screenshots grob 40 % der Flaeche, davon sind rund
 * die Haelfte farbige Sticker, also ca. 15-20 %. Schwelle 5 % liegt gut darunter, aber weit ueber 0 %
 * eines leeren (weissen/grauen) Frames.
 */
async function coloredShare(page: Page): Promise<number> {
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

const MIN_COLORED_SHARE = 0.05;

async function waitRendered(page: Page): Promise<void> {
  await expect.poll(() => coloredShare(page), { message: 'Wuerfel wurde nicht gerendert' }).toBeGreaterThan(MIN_COLORED_SHARE);
}

/** Wartet n Animationsframes (stabiles Signal statt fester Wartezeit). */
async function frames(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        const tick = (left: number): void => (left <= 0 ? resolve() : void requestAnimationFrame(() => tick(left - 1)));
        tick(count);
      }),
    n,
  );
}

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('main.player[data-ready="true"]')).toBeVisible();
  await expect(page.getByTestId('counter')).toHaveText('Zug 0 / 4');
  await waitRendered(page);
}

const BUTTON_IDS = ['to-start', 'step-back', 'play-pause', 'step-forward', 'to-end'];

async function shot(page: Page, name: string, projectName: string): Promise<void> {
  await waitRendered(page);
  await page.screenshot({ path: `${SHOT_DIR}/${projectName}-${name}.png` });
}

test.describe('Player', () => {
  test('laedt mit Startzustand', async ({ page }, info) => {
    await open(page);
    await expect(page.getByTestId('alg')).toHaveText("RUR'U'");
    await expect(page.getByTestId('step-back')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('step-forward')).toHaveAttribute('aria-disabled', 'false');
    await shot(page, 'start', info.project.name);
  });

  test('Schritt vor und zurueck', async ({ page }, info) => {
    await open(page);
    await page.getByTestId('step-forward').click();
    await expect(page.getByTestId('counter')).toHaveText('Zug 1 / 4');
    await expect(page.getByTestId('current-move')).toContainText('R');
    await expect(page.locator('.alg-move.active')).toHaveText('R');
    await page.getByTestId('step-forward').click();
    await expect(page.getByTestId('counter')).toHaveText('Zug 2 / 4');
    await expect(page.locator('.alg-move.active')).toHaveText('U');
    await shot(page, 'step2', info.project.name);
    await page.getByTestId('step-back').click();
    await expect(page.getByTestId('counter')).toHaveText('Zug 1 / 4');
    await page.getByTestId('step-back').click();
    await expect(page.getByTestId('counter')).toHaveText('Zug 0 / 4');
    await expect(page.getByTestId('step-back')).toHaveAttribute('aria-disabled', 'true');
  });

  test('Sprung zu Index 3 per Slider, Start und Ende', async ({ page }, info) => {
    await open(page);
    await page.getByTestId('slider').fill('3');
    await expect(page.getByTestId('counter')).toHaveText('Zug 3 / 4');
    await expect(page.locator('.alg-move.active')).toHaveText("R'");
    await shot(page, 'jump3', info.project.name);
    await page.getByTestId('to-end').click();
    await expect(page.getByTestId('counter')).toHaveText('Zug 4 / 4');
    await expect(page.getByTestId('step-forward')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('to-start').click();
    await expect(page.getByTestId('counter')).toHaveText('Zug 0 / 4');
    await expect(page.getByTestId('slider')).toHaveValue('0');
  });

  test('Play bis Ende und Pause', async ({ page }, info) => {
    await open(page);
    const play = page.getByTestId('play-pause');
    await play.click();
    await expect(play).toHaveAttribute('data-playing', 'true');
    await expect(page.getByTestId('counter')).toHaveText('Zug 4 / 4', { timeout: 20_000 });
    await expect(play).toHaveAttribute('data-playing', 'false');
    await shot(page, 'end', info.project.name);

    await page.getByTestId('to-start').click();
    await play.click();
    await expect(play).toHaveAttribute('data-playing', 'true');
    await play.click();
    await expect(play).toHaveAttribute('data-playing', 'false');
    // Animation ausgelaufen (Schritt-Buttons wieder frei), danach darf sich nichts mehr aendern.
    await expect(page.getByTestId('step-forward')).toHaveAttribute('aria-disabled', 'false');
    const settled = await page.getByTestId('counter').textContent();
    await frames(page, 90);
    await expect(page.getByTestId('counter')).toHaveText(settled ?? '');
    expect(settled).not.toBe('Zug 4 / 4');
  });
});

test.describe('Mobil-Kriterien', () => {
  for (const [w, h] of [
    [360, 640],
    [390, 844],
    [768, 1024],
  ] as const) {
    test(`keine horizontale Scrollbar bei ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await open(page);
      const m = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        bw: document.body.scrollWidth,
        iw: window.innerWidth,
      }));
      expect(m.sw).toBeLessThanOrEqual(m.iw);
      expect(m.bw).toBeLessThanOrEqual(m.iw);
    });
  }

  test('Viewport-Meta vorhanden', async ({ page }) => {
    await open(page);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);
  });

  async function checkLayout(page: Page): Promise<void> {
    const boxes = [];
    for (const id of BUTTON_IDS) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      if (box) boxes.push(box);
    }
    for (const b of boxes) {
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    for (let i = 1; i < boxes.length; i++) {
      const prev = boxes[i - 1];
      const cur = boxes[i];
      if (!prev || !cur) continue;
      const sameRow = Math.abs(prev.y - cur.y) < 4;
      const gap = sameRow ? cur.x - (prev.x + prev.width) : cur.y - (prev.y + prev.height);
      expect(gap).toBeGreaterThanOrEqual(8 - 0.5);
    }
    const sliderBox = await page.getByTestId('slider').boundingBox();
    expect(sliderBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    const vp = page.viewportSize();
    const cube = await page.getByTestId('cube').boundingBox();
    expect(cube).not.toBeNull();
    if (cube && vp) {
      expect(cube.width).toBeGreaterThanOrEqual(280);
      expect(cube.height).toBeGreaterThanOrEqual(280);
      // vollstaendig im Viewport sichtbar
      expect(cube.x).toBeGreaterThanOrEqual(0);
      expect(cube.y).toBeGreaterThanOrEqual(0);
      expect(cube.x + cube.width).toBeLessThanOrEqual(vp.width + 0.5);
      expect(cube.y + cube.height).toBeLessThanOrEqual(vp.height + 0.5);
    }
    const fontSize = await page.getByTestId('counter').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
    const fontSize2 = await page.getByTestId('current-move').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(fontSize2).toBeGreaterThanOrEqual(16);
  }

  test('Buttons, Abstaende und Wuerfelbereich im Hochformat', async ({ page }, info) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page);
    await checkLayout(page);
    await shot(page, 'portrait-360', info.project.name);
  });

  test('Standard-Viewport des Profils', async ({ page }) => {
    await open(page);
    const vp = page.viewportSize();
    expect(vp).not.toBeNull();
    await checkLayout(page);
  });

  test('Querformat 640x360', async ({ page }, info) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await open(page);
    const m = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    expect(m.sw).toBeLessThanOrEqual(m.iw);
    await checkLayout(page);
    await shot(page, 'landscape-640x360', info.project.name);
  });
});

test('Hinweistext ohne WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (orig as (t: string, ...r: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('WebGL');
});

test('Player fuellt den Wuerfelbereich und rendert nicht leer', async ({ page }, info) => {
  await open(page);
  const areaBox = await page.getByTestId('cube').boundingBox();
  const playerBox = await page.getByTestId('cube').locator('> *').first().boundingBox();
  expect(areaBox).not.toBeNull();
  expect(playerBox).not.toBeNull();
  if (areaBox && playerBox) {
    expect(Math.abs(playerBox.height - areaBox.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(playerBox.width - areaBox.width)).toBeLessThanOrEqual(2);
  }
  await page.getByTestId('cube').screenshot({ path: `${SHOT_DIR}/${info.project.name}-cube-only.png` });
  expect(await coloredShare(page)).toBeGreaterThan(MIN_COLORED_SHARE);
});

test('alle Tap-Ziele (button, input) sind mindestens 44x44 px gross', async ({ page }) => {
  await open(page);
  const boxes = await page.locator('button, input').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.getAttribute('data-testid') ?? e.tagName, w: r.width, h: r.height };
    }),
  );
  expect(boxes.length).toBeGreaterThanOrEqual(6);
  for (const b of boxes) {
    expect(b.w, b.id).toBeGreaterThanOrEqual(44);
    expect(b.h, b.id).toBeGreaterThanOrEqual(44);
  }
});

test('Steuerleiste per Touch-Tap bedienbar', async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, 'nur Profile mit Touch');
  await open(page);
  const tap = async (id: string): Promise<void> => {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };
  await tap('step-forward');
  await expect(page.getByTestId('counter')).toHaveText('Zug 1 / 4');
  await tap('to-end');
  await expect(page.getByTestId('counter')).toHaveText('Zug 4 / 4');
  await tap('to-start');
  await expect(page.getByTestId('counter')).toHaveText('Zug 0 / 4');
  await tap('play-pause');
  await expect(page.getByTestId('play-pause')).toHaveAttribute('data-playing', 'true');
  await tap('play-pause');
  await expect(page.getByTestId('play-pause')).toHaveAttribute('data-playing', 'false');
});

