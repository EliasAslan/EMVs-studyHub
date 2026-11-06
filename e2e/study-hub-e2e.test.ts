/**
 * Playwright e2e tests for Study Hub v2.
 * Covers core user flows from the Definition of Done.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Study Hub v2 — Core Flows', () => {
  test('Heute answers "what now?" with one clear start action', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Study Hub/);
    await expect(page.locator('text=Als Nächstes')).toBeVisible();
    await expect(page.locator('#checklist-title')).toBeVisible();
  });

  test('Navigation: all primary routes render without errors', async ({ page }) => {
    await page.goto(BASE_URL);
    const routes = [
      '/homework', '/modules', '/notes', '/exams',
      '/calendar', '/links', '/focus', '/settings', '/tokens',
    ];
    for (const route of routes) {
      await page.goto(`${BASE_URL}/#${route}`);
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('Legacy /pomodoro bookmark opens Focus', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/pomodoro`);
    await expect(page.locator('text=Fokus starten')).toBeVisible();
    await expect(page.locator('#pomodoro-stats-title')).toBeVisible();
  });

  test('Create note via Erfassen', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByRole('button', { name: 'Erfassen', exact: true }).click();
    await page.getByRole('tab', { name: 'Notiz' }).click();
    await page.getByPlaceholder('Kurz und klar').fill('SQL Joins');
    await page.getByPlaceholder('Was möchtest du festhalten?').fill('INNER JOIN verbindet Tabellen.');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('text=SQL Joins')).toBeVisible();
  });

  test('Create homework from the homework view', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/homework`);
    await page.getByLabel('Titel der Hausaufgabe').fill('Test Hausaufgabe');
    await page.getByLabel('Fällig am').fill('2026-11-12');
    await page.locator('form.add').getByRole('button', { name: 'Erfassen' }).click();
    await expect(page.locator('text=Test Hausaufgabe')).toBeVisible();
  });

  test('Create exam with Swiss grade 1–6 in .5 steps', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/exams`);
    await page.getByRole('button', { name: 'Prüfung', exact: true }).click();
    await page.getByPlaceholder('z. B. Prüfung M294').fill('Prüfung M294');
    await page.getByLabel('Datum').fill('2026-11-12');
    await page.getByLabel('Note (1–6, halbe Schritte)').fill('5.5');
    await page.getByLabel('Notiz zur Note').fill('gut');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.locator('text=Prüfung M294')).toBeVisible();
  });

  test('Checklist renders and toggles', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('#checklist-title')).toBeVisible();
    const chips = page.locator('.chip');
    if ((await chips.count()) > 0) {
      await chips.first().click();
    }
  });

  test('Focus timer starts and pauses', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/focus`);
    await expect(page.locator('text=Fokus starten')).toBeVisible();
    await expect(page.locator('#pomodoro-stats-title')).toBeVisible();
    await page.getByRole('button', { name: 'Fokus starten' }).click();
    await expect(page.locator('text=Läuft. Kein Druck.')).toBeVisible();
    await page.getByRole('button', { name: 'Pausieren' }).click();
    await expect(page.locator('text=Pausiert. Du entscheidest, wann es weitergeht.')).toBeVisible();
  });

  test('Settings: cloud section renders', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/settings`);
    await expect(page.locator('#sync-title')).toHaveText('Cloud');
    await expect(page.locator('text=Gerät ist die Wahrheit')).toBeVisible();
  });
});

test.describe('Study Hub v2 — mobile shell', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('drawer opens from the header, closes on Escape and route change', async ({ page }) => {
    await page.goto(BASE_URL);
    const aside = page.locator('#app-sidebar');
    await expect(aside).not.toHaveClass(/\bopen\b/);

    await page.getByRole('button', { name: 'Navigation öffnen' }).click();
    await expect(aside).toHaveClass(/\bopen\b/);
    await expect(page.getByRole('link', { name: 'Prüfungen' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(aside).not.toHaveClass(/\bopen\b/);

    await page.getByRole('button', { name: 'Navigation öffnen' }).click();
    await aside.getByRole('link', { name: 'Kalender' }).click();
    await expect(page).toHaveURL(/#\/calendar$/);
    await expect(aside).not.toHaveClass(/\bopen\b/);
  });

  test('bottom "Mehr" tab opens the same drawer', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByRole('button', { name: 'Mehr' }).click();
    await expect(page.locator('#app-sidebar')).toHaveClass(/\bopen\b/);
    await expect(page.getByRole('button', { name: 'Mehr' })).toHaveAttribute('aria-expanded', 'true');
  });
});
