import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  BUTTON_IDS,
  CASE_MOVES,
  CASE_PATH,
  LONG_PATH,
  MIN_COLORED_SHARE,
  SHORT_PATH,
  SHOT_DIR,
  coloredShare,
  frames,
  noHorizontalScroll,
  openPlayer,
  shot,
} from './helpers';

const N = CASE_MOVES;

test.describe('Player auf der Fallseite', () => {
  test('laedt mit Startzustand', async ({ page }, info) => {
    await openPlayer(page);
    await expect(page.getByTestId('alg')).toHaveText("RUR'URU2R'U");
    await expect(page.getByTestId('step-back')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('step-forward')).toHaveAttribute('aria-disabled', 'false');
    await shot(page, 'case-start', info.project.name);
  });

  test('Schritt vor und zurueck', async ({ page }, info) => {
    await openPlayer(page);
    await page.getByTestId('step-forward').click();
    await expect(page.getByTestId('counter')).toHaveText(`Zug 1 / ${N}`);
    await expect(page.getByTestId('current-move')).toContainText('R');
    await expect(page.locator('.alg-move.active')).toHaveText('R');
    // Waehrend der Animation ist Schritt vor gesperrt (aria-disabled); erst danach wieder frei.
    await expect(page.getByTestId('step-forward')).toHaveAttribute('aria-disabled', 'false');
    await page.getByTestId('step-forward').click();
    await expect(page.getByTestId('counter')).toHaveText(`Zug 2 / ${N}`);
    await expect(page.locator('.alg-move.active')).toHaveText('U');
    await shot(page, 'case-step2', info.project.name);
    await expect(page.getByTestId('step-back')).toHaveAttribute('aria-disabled', 'false');
    await page.getByTestId('step-back').click();
    await expect(page.getByTestId('counter')).toHaveText(`Zug 1 / ${N}`);
    await expect(page.getByTestId('step-back')).toHaveAttribute('aria-disabled', 'false');
    await page.getByTestId('step-back').click();
    await expect(page.getByTestId('counter')).toHaveText(`Zug 0 / ${N}`);
    await expect(page.getByTestId('step-back')).toHaveAttribute('aria-disabled', 'true');
  });

  test('Sprung zu Index 3 per Slider, Start und Ende', async ({ page }, info) => {
    await openPlayer(page);
    await page.getByTestId('slider').fill('3');
    await expect(page.getByTestId('counter')).toHaveText(`Zug 3 / ${N}`);
    await expect(page.locator('.alg-move.active')).toHaveText("R'");
    await shot(page, 'case-jump3', info.project.name);
    await page.getByTestId('to-end').click();
    await expect(page.getByTestId('counter')).toHaveText(`Zug ${N} / ${N}`);
    await expect(page.getByTestId('step-forward')).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('to-start').click();
    await expect(page.getByTestId('counter')).toHaveText(`Zug 0 / ${N}`);
    await expect(page.getByTestId('slider')).toHaveValue('0');
  });

  test('Play laeuft bis zum Ende durch', async ({ page }, info) => {
    // Kurzes Beispiel (ein Zug), damit die Animation sicher zu Ende laeuft.
    await openPlayer(page, SHORT_PATH, 1);
    const play = page.getByTestId('play-pause');
    await play.click();
    await expect(page.getByTestId('counter')).toHaveText('Zug 1 / 1', { timeout: 20_000 });
    await expect(play).toHaveAttribute('data-playing', 'false');
    await expect(page.getByTestId('step-forward')).toHaveAttribute('aria-disabled', 'true');
    await shot(page, 'short-end', info.project.name);
  });

  /**
   * Stabilisiert (frueher instabil). Der alte Test pausierte auf einem Fall mit 4 Zuegen, dessen
   * Animation rund 4,5 s dauert, und erwartete danach "Schritt vor" frei (aria-disabled="false") und
   * data-playing="false". Liegt unter Last (parallele Worker, Software-WebGL) zwischen "Play"- und
   * "Pause"-Klick mehr Zeit als die Animation dauert, ist der Ablauf schon am Ende: "Schritt vor" ist
   * dort zu Recht gesperrt ("true" statt "false"), und ein weiterer Klick startet erneut. Das ist ein
   * Wettlauf des Tests gegen die Animationsdauer, kein Zustandsfehler im UI/Adapter. Hier laeuft ein
   * Fall mit sehr vielen Zuegen (viele Sekunden Animation); zusaetzlich wird geprueft, dass beim
   * Pausieren der Index noch nicht am Ende steht.
   */
  test('Pause mitten in einem langen Ablauf', async ({ page }) => {
    await openPlayer(page, LONG_PATH, null);
    const play = page.getByTestId('play-pause');
    const counter = page.getByTestId('counter');
    await play.click();
    await expect(play).toHaveAttribute('data-playing', 'true');
    await expect(counter).not.toHaveText(/^Zug 0 \//);
    await play.click();
    await expect(play).toHaveAttribute('data-playing', 'false');
    await expect(page.getByTestId('step-forward')).toHaveAttribute('aria-disabled', 'false');
    const settled = (await counter.textContent()) ?? '';
    const m = /^Zug (\d+) \/ (\d+)$/.exec(settled);
    expect(m, settled).not.toBeNull();
    expect(Number(m?.[1])).toBeLessThan(Number(m?.[2]));
    // Nach der Pause aendert sich nichts mehr.
    await frames(page, 90);
    await expect(counter).toHaveText(settled);
    // Erneut abspielen und pausieren.
    await play.click();
    await expect(play).toHaveAttribute('data-playing', 'true');
    await play.click();
    await expect(play).toHaveAttribute('data-playing', 'false');
    await expect(page.getByTestId('step-forward')).toHaveAttribute('aria-disabled', 'false');
  });
});

test.describe('Mobil-Kriterien (Fallseite)', () => {
  for (const [w, h] of [
    [360, 640],
    [390, 844],
    [768, 1024],
  ] as const) {
    test(`keine horizontale Scrollbar bei ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await openPlayer(page);
      await noHorizontalScroll(page);
    });
  }

  test('Viewport-Meta vorhanden', async ({ page }) => {
    await openPlayer(page);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);
  });

  async function checkLayout(page: Page, cubeInViewport: boolean): Promise<void> {
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
      expect(cube.x).toBeGreaterThanOrEqual(0);
      expect(cube.x + cube.width).toBeLessThanOrEqual(vp.width + 0.5);
      if (cubeInViewport) {
        // Im Hochformat steht der Wuerfel vollstaendig im ersten Bildschirm (ohne Scrollen sichtbar).
        expect(cube.y).toBeGreaterThanOrEqual(0);
        expect(cube.y + cube.height).toBeLessThanOrEqual(vp.height + 0.5);
      }
    }
    const fontSize = await page.getByTestId('counter').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(16);
    const fontSize2 = await page.getByTestId('current-move').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(fontSize2).toBeGreaterThanOrEqual(16);
  }

  test('Buttons, Abstaende und Wuerfelbereich im Hochformat', async ({ page }, info) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await openPlayer(page);
    await checkLayout(page, true);
    await shot(page, 'case-portrait-360', info.project.name);
  });

  test('Standard-Viewport des Profils', async ({ page }) => {
    await openPlayer(page);
    const vp = page.viewportSize();
    expect(vp).not.toBeNull();
    // Nur Profile in Hochformat bzw. mit genug Hoehe (Desktop 1280x720: Wuerfel 420 px + Kopf) pruefen die Sichtbarkeit.
    await checkLayout(page, (vp?.height ?? 0) >= 700);
  });

  test('Querformat 640x360', async ({ page }, info) => {
    await page.setViewportSize({ width: 640, height: 360 });
    await openPlayer(page);
    await noHorizontalScroll(page);
    // Auf dem niedrigen Querformat scrollt die Seite senkrecht; der Wuerfel muss nicht komplett sichtbar sein.
    await checkLayout(page, false);
    await shot(page, 'case-landscape-640x360', info.project.name);
  });
});

test('Player fuellt den Wuerfelbereich und rendert nicht leer', async ({ page }, info) => {
  await openPlayer(page);
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

test('alle Tap-Ziele (button, input, a) sind mindestens 44x44 px gross', async ({ page }) => {
  await openPlayer(page);
  const boxes = await page.locator('button, input, a').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.getAttribute('data-testid') ?? e.textContent ?? e.tagName, w: r.width, h: r.height };
    }),
  );
  expect(boxes.length).toBeGreaterThanOrEqual(9);
  for (const b of boxes) {
    expect(b.w, b.id).toBeGreaterThanOrEqual(44);
    expect(b.h, b.id).toBeGreaterThanOrEqual(44);
  }
});

test('Steuerleiste per Touch-Tap bedienbar', async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, 'nur Profile mit Touch');
  await openPlayer(page);
  const tap = async (id: string): Promise<void> => {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    if (box) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };
  await tap('step-forward');
  await expect(page.getByTestId('counter')).toHaveText(`Zug 1 / ${N}`);
  await tap('to-end');
  await expect(page.getByTestId('counter')).toHaveText(`Zug ${N} / ${N}`);
  await tap('to-start');
  await expect(page.getByTestId('counter')).toHaveText(`Zug 0 / ${N}`);
  await tap('play-pause');
  await expect(page.getByTestId('play-pause')).toHaveAttribute('data-playing', 'true');
  await tap('play-pause');
  await expect(page.getByTestId('play-pause')).toHaveAttribute('data-playing', 'false');
});

test('Hinweistext ohne WebGL, Seite bleibt lesbar', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (orig as (t: string, ...r: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof orig;
  });
  await page.goto(CASE_PATH);
  await expect(page.getByRole('alert')).toContainText('WebGL');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vorne und links vertauscht');
  await expect(page.getByTestId('ablauf')).toBeVisible();
  await expect(page.getByTestId('cube')).toHaveCount(0);
});
