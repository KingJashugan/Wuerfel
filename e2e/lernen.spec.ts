import { expect, test } from '@playwright/test';
import { CASE_PATH, collectErrors, noHorizontalScroll, shot, waitRendered } from './helpers';

test.describe('Lernfortschritt', () => {
  test('Fall als gelernt markieren, in Phase und Startseite sichtbar, nach Neuladen erhalten', async ({ page }) => {
    await page.goto(CASE_PATH);
    const toggle = page.getByTestId('learned-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await expect(page.getByTestId('learned-toggle')).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/#/phase/5');
    await expect(page.getByTestId('case-link-k-3120')).toContainText('Gelernt');
    await expect(page.getByTestId('progress-phase')).toContainText(/1 von \d+ gelernt/);

    await page.goto('/');
    await expect(page.getByTestId('phase-progress-5')).toContainText(/^1 von \d+ gelernt$/);
    await expect(page.getByTestId('progress-total')).toContainText(/1 von \d+ gelernt/);

    await page.goto(CASE_PATH);
    await page.getByTestId('learned-toggle').click();
    await expect(page.getByTestId('learned-toggle')).toHaveAttribute('aria-pressed', 'false');
  });

  test('intuitives Beispiel kann ebenfalls markiert werden', async ({ page }) => {
    await page.goto('/#/phase/1/kante-oben');
    const toggle = page.getByTestId('learned-toggle');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Quiz', () => {
  test('Frage beantworten, Rueckmeldung, naechste Frage, Punktestand', async ({ page }, info) => {
    const errors = collectErrors(page);
    await page.goto('/#/quiz/5');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quiz: Phase 5');
    const options = page.locator('[data-testid^="quiz-option-"]');
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(4);
    await waitRendered(page);

    await options.first().click();
    await expect(page.getByTestId('quiz-feedback')).toContainText('Lösung:');
    await expect(page.locator('.option.correct')).toHaveCount(1);
    for (let i = 0; i < count; i++) await expect(options.nth(i)).toBeDisabled();
    await expect(page.getByTestId('quiz-score')).toContainText(/^Richtig: [01] von 1$/);
    await shot(page, 'quiz-answered', info.project.name);
    await noHorizontalScroll(page);

    await page.getByTestId('quiz-next').click();
    await expect(page.getByTestId('quiz-feedback')).toBeEmpty();
    await expect(page.locator('.option:not([disabled])').first()).toBeVisible();
    expect(errors.list).toEqual([]);
  });

  test('Startseite und Phase verlinken das Quiz; unbekannte Phase ergibt Hinweis', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('quiz-link').click();
    await expect(page).toHaveURL(/#\/quiz$/);
    await page.goto('/#/phase/5');
    await page.getByTestId('quiz-link').click();
    await expect(page).toHaveURL(/#\/quiz\/5$/);
    await page.goto('/#/quiz/1');
    await expect(page.getByRole('alert')).toContainText('Diese Seite gibt es nicht');
  });
});
