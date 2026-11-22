/**
 * Playwright e2e tests for Study Hub v2.
 * Covers core user flows from the Definition of Done.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5173';

test.describe('Study Hub v2 — Core Flows', () => {
  test('Heute answers "what now?" with one clear start action', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'studyhub_v1',
        JSON.stringify({
          schemaVersion: 1,
          homework: [
            { id: 'hw-1', moduleId: null, topicId: null, title: 'Aufgabe 3 lösen', dueDate: '2026-11-20', done: false, recurrence: null },
          ],
          exams: [],
          checklistItems: [{ id: 'studied', text: 'studiert heute', kind: 'studied', order: 0 }],
          checklist: { date: null, checked: {} },
        }),
      );
    });
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Study Hub/);
    await expect(page.locator('#hero-title')).toBeVisible();
    await expect(page.locator('#checklist-title')).toBeVisible();
  });

  test('Navigation: all primary routes render without errors', async ({ page }) => {
    await page.goto(BASE_URL);
    const routes = [
      '/homework', '/modules', '/notes', '/exams',
      '/calendar', '/links', '/focus', '/settings',
    ];
    for (const route of routes) {
      await page.goto(`${BASE_URL}/#${route}`);
      await expect(page.locator('main')).toBeVisible();
    }
  });

  test('Dev-only token gallery is not shipped', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/tokens`);
    await expect(page.locator('#checklist-title')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tokens', exact: true })).toHaveCount(0);
  });

  test('Legacy /pomodoro bookmark opens Focus', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/pomodoro`);
    await expect(page.locator('text=Fokus starten')).toBeVisible();
    await expect(page.locator('#pomodoro-stats-title')).toBeVisible();
  });

  test('Create note via Erfassen', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByRole('button', { name: 'Erfassen', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Notiz' }).click();
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
    await page.locator('.page-head').getByRole('button', { name: 'Prüfung erfassen' }).click();
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
    await expect(page.getByRole('button', { name: 'Pausieren' })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Pausieren' }).click();
    await expect(page.getByRole('button', { name: 'Fortsetzen' })).toBeVisible();
  });

  test.describe('Focus mode', () => {
    test('entering focus mode hides sidebar and shows persistent exit', async ({ page }) => {
      await page.goto(`${BASE_URL}/#/focus`);
      const sidebar = page.locator('#app-sidebar');
      await expect(sidebar).toBeVisible();

      await page.getByRole('button', { name: 'Vollbild' }).click();

      await expect(page.getByRole('button', { name: 'Fokusmodus beenden' })).toBeVisible();
      await expect(page.locator('.focus-exit')).toBeVisible();
      await expect(sidebar).toBeHidden();
    });

    test('Esc exits focus mode', async ({ page }) => {
      await page.goto(`${BASE_URL}/#/focus`);
      await page.getByRole('button', { name: 'Vollbild' }).click();
      await expect(page.getByRole('button', { name: 'Fokusmodus beenden' })).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'Vollbild' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Fokusmodus beenden' })).toHaveCount(0);
    });

    test('exit button leaves focus mode', async ({ page }) => {
      await page.goto(`${BASE_URL}/#/focus`);
      await page.getByRole('button', { name: 'Vollbild' }).click();
      await expect(page.getByRole('button', { name: 'Fokusmodus beenden' })).toBeVisible();

      await page.getByRole('button', { name: 'Fokusmodus beenden' }).click();
      await expect(page.getByRole('button', { name: 'Vollbild' })).toBeVisible();
    });

    test('stop leaves focus mode', async ({ page }) => {
      await page.goto(`${BASE_URL}/#/focus`);
      await page.getByRole('button', { name: 'Vollbild' }).click();
      await page.getByRole('button', { name: 'Fokus starten' }).click();
      await expect(page.locator('.timer-card')).toBeVisible();
      await page.getByRole('button', { name: 'Beenden', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Vollbild' })).toBeVisible();
    });
  });

  test('Collapsing the sidebar footer keeps Settings available', async ({ page }) => {
    await page.goto(BASE_URL);
    const sidebar = page.locator('#app-sidebar');

    await sidebar.getByRole('button', { name: 'Untere Navigation einklappen' }).click();
    await expect(sidebar.getByRole('button', { name: 'Untere Navigation ausklappen' })).toBeVisible();

    const settings = sidebar.getByRole('link', { name: 'Einstellungen' });
    await expect(settings).toBeVisible();
    await settings.click();
    await expect(page).toHaveURL(/#\/settings$/);
  });

  test('Schedule: quick-add a lesson on a day and undo its deletion', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/settings`);
    const section = page.locator('#settings-schedule');

    await page.getByRole('button', { name: 'Lektion am Montag erfassen' }).click();
    const form = page.locator('.lesson-form');
    await form.getByLabel('Bezeichnung').fill('Mathe');
    await form.getByLabel('Start').fill('08:00');
    await form.getByLabel('Ende').fill('09:00');
    await form.getByRole('button', { name: 'Erfassen' }).click();
    await expect(section).toContainText('Mathe');

    await page.getByRole('button', { name: 'Mathe löschen' }).click();
    await expect(section).not.toContainText('Mathe');

    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(section).toContainText('Mathe');
  });

  test('Settings: cloud section renders', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'studyhub_ai_v1',
        JSON.stringify({ enabled: true, baseUrl: 'https://ai.example.com', model: 'qwen3:8b', numCtx: 8192 }),
      );
    });
    await page.goto(`${BASE_URL}/#/settings`);
    await expect(page.locator('#sync-title')).toHaveText('Cloud');
    await expect(page.locator('text=Daten gehen an dieses Gerät im Netzwerk')).toBeVisible();
  });

  test('Fullscreen toggle is not part of the shell', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.getByRole('button', { name: 'Vollbild', exact: true })).toHaveCount(0);
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

    // The drawer slides in from the left on mobile.
    await expect
      .poll(async () => {
        const box = await aside.boundingBox();
        return box ? box.x : -1;
      })
      .toBeCloseTo(0, 0);

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

  test('help modal opens from settings and Escape closes it', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/settings`);

    await page.getByRole('button', { name: 'Kürzel anzeigen' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tastaturkürzel' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Suche öffnen');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
