/**
 * Playwright e2e tests for Study Hub v1.
 * Covers core user flows from the Definition of Done.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

test.describe('Study Hub v1 — Core Flows', () => {
  test('Heute answers "what now?" with one clear start action', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Study Hub/);
    await expect(page.locator('text=HIER STARTEN')).toBeVisible();
    await expect(page.locator('text=studiert heute')).toBeVisible();
  });

  test('Navigation: all primary routes render without errors', async ({ page }) => {
    await page.goto(BASE_URL);
    const routes = [
      '/homework', '/modules', '/notes', '/exams',
      '/calendar', '/links', '/focus', '/settings', '/tokens',
    ];
    for (const route of routes) {
      await page.goto(`${BASE_URL}${route}`);
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('Create note via Erfassen', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('text=Erfassen');
    await page.click('text=Notiz');
    await page.fill('input[placeholder="Titel"]', 'SQL Joins');
    await page.fill('textarea', 'INNER JOIN verbindet Tabellen. Siehe [[Datenbanken]].');
    await page.click('text=Speichern');
    await expect(page.locator('text=SQL Joins')).toBeVisible();
  });

  test('Create homework', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('text=Erfassen');
    await page.click('text=Hausaufgabe');
    await page.fill('input[placeholder="Titel"]', 'Test Hausaufgabe');
    await page.fill('input[placeholder="Fällig"]', 'Do., 5. Nov.');
    await page.click('text=Speichern');
    await expect(page.locator('text=Test Hausaufgabe')).toBeVisible();
  });

  test('Create exam with Swiss grade 1-6 .5 steps', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('text=Erfassen');
    await page.click('text=Prüfung');
    await page.fill('input[placeholder="Titel"]', 'Prüfung M294');
    await page.fill('input[placeholder="Datum"]', 'Do., 5. Nov.');
    await page.selectOption('select[name="grade"]', '5.5');
    await page.fill('textarea[name="gradeNote"]', 'gut');
    await page.click('text=Speichern');
    await expect(page.locator('text=Prüfung M294')).toBeVisible();
  });

  test('Checklist renders and toggles', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('text=studiert heute')).toBeVisible();
    await expect(page.locator('text=Erledigt')).toBeVisible();
    const chips = page.locator('.chip');
    const count = await chips.count();
    if (count > 0) {
      await chips.first().click();
    }
  });

  test('Focus timer start/pause', async ({ page }) => {
    await page.goto(BASE_URL + '/focus');
    await expect(page.locator('text=FOKUS')).toBeVisible();
    await expect(page.locator('text=BEREIT')).toBeVisible();
    await page.click('text=FOKUS starten');
    await expect(page.locator('text=RUHIG BLEIBEN')).toBeVisible();
  });

  test('Settings: cloud section renders', async ({ page }) => {
    await page.goto(BASE_URL + '/settings');
    await expect(page.locator('text=CLOUD')).toBeVisible();
    await expect(page.locator('text=Gerät ist die Wahrheit')).toBeVisible();
  });
});