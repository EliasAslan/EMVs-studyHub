/**
 * Playwright e2e tests for Study Hub v2.1: local AI, recurring homework and
 * the module overview note.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5173';

const AI_ON = {
  enabled: true,
  baseUrl: 'http://localhost:11434',
  model: 'qwen3:8b',
  numCtx: 8192,
};

test.describe('Study Hub v2.1 — local AI', () => {
  test('AI is off by default and stays hidden', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.getByRole('link', { name: 'Assistent' })).toHaveCount(0);

    await page.goto(`${BASE_URL}/#/assistant`);
    await expect(page.getByText('Lokale KI ist aus.')).toBeVisible();
    await expect(page.getByLabel('Frage an den Assistenten')).toHaveCount(0);
  });

  test('assistant streams an answer and sends the @ mention context', async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('studyhub_ai_v1', JSON.stringify(settings));
    }, AI_ON);

    await page.route('http://localhost:11434/api/tags', (route) =>
      route.fulfill({ json: { models: [{ name: 'qwen3:8b' }] } }),
    );

    let posted: Record<string, unknown> | null = null;
    await page.route('http://localhost:11434/api/chat', async (route) => {
      posted = route.request().postDataJSON();
      const body =
        `${JSON.stringify({ message: { content: 'Ruhige Antwort.' }, done: false })}\n` +
        `${JSON.stringify({ message: { content: ' Fertig.' }, done: true })}\n`;
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
        body,
      });
    });

    await page.goto(`${BASE_URL}/#/assistant`);
    await expect(page.getByRole('link', { name: 'Assistent' })).toBeVisible();
    await expect(page.getByText('Ollama verbunden')).toBeVisible();

    const box = page.getByLabel('Frage an den Assistenten');
    await box.fill('@pr');
    const option = page.getByRole('option', { name: /@prüfungen/ });
    await expect(option).toBeVisible();
    await box.press('Enter');
    await expect(box).toHaveValue('@prüfungen ');
    await box.pressSequentially('Welche Prüfung ist wichtig?');

    await expect(page.locator('.tray .chip').filter({ hasText: 'Prüfungen' })).toBeVisible();
    await box.press('Enter');

    await expect(page.getByText('Ruhige Antwort. Fertig.')).toBeVisible();
    await expect(page.locator('.msg.user .ref')).toHaveText('prüfungen');

    expect(posted).not.toBeNull();
    const body = posted as { messages: Array<{ role: string; content: string }> };
    const userMessage = body.messages.at(-1);
    expect(userMessage?.content).toContain('<context>');
    expect(userMessage?.content).toContain('## Prüfungen');
    expect(userMessage?.content).toContain('Welche Prüfung ist wichtig?');
  });

  test('AI actions appear on notes when enabled', async ({ page }) => {
    await page.addInitScript((settings) => {
      localStorage.setItem('studyhub_ai_v1', JSON.stringify(settings));
    }, AI_ON);
    await page.route('http://localhost:11434/api/tags', (route) =>
      route.fulfill({ json: { models: [] } }),
    );

    await page.goto(BASE_URL);
    await page.getByRole('button', { name: 'Erfassen', exact: true }).click();
    await page.getByRole('tab', { name: 'Notiz' }).click();
    await page.getByPlaceholder('Kurz und klar').fill('AI Notiz');
    await page.getByPlaceholder('Was möchtest du festhalten?').fill('Ein kurzer Text.');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await page.locator('text=AI Notiz').first().click();

    await expect(page.getByRole('button', { name: 'Zusammenfassen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'KI fragen' })).toBeVisible();
  });
});

test.describe('Study Hub v2.1 — recurring homework', () => {
  test('completing a recurring item materializes the next instance once', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/homework`);

    await page.getByLabel('Titel der Hausaufgabe').fill('Wöchentlich Test');
    await page.getByLabel('Fällig am').fill('2026-11-10');
    await page.getByLabel('Wiederholen').selectOption('weekly');
    await page.locator('form.add').getByRole('button', { name: 'Erfassen' }).click();

    await expect(page.locator('text=↻ wöchentlich')).toBeVisible();
    await page.getByRole('button', { name: 'Offen: Wöchentlich Test' }).click();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const raw = localStorage.getItem('studyhub_v1');
          if (!raw) return null;
          const state = JSON.parse(raw);
          return (state.homework || []).filter((h: { title: string }) => h.title === 'Wöchentlich Test');
        }),
      )
      .toHaveLength(2);

    const items = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('studyhub_v1') as string);
      return (state.homework || [])
        .filter((h: { title: string }) => h.title === 'Wöchentlich Test')
        .map((h: { dueDate: string; done: boolean }) => ({ dueDate: h.dueDate, done: h.done }))
        .sort((a: { dueDate: string }, b: { dueDate: string }) => a.dueDate.localeCompare(b.dueDate));
    });
    expect(items).toEqual([
      { dueDate: '2026-11-10', done: true },
      { dueDate: '2026-11-17', done: false },
    ]);
  });
});

test.describe('Study Hub v2.1 — module overview', () => {
  test('creates one overview note and shows it on the module page', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/modules`);
    await page.getByRole('button', { name: 'Modul', exact: true }).click();
    await page.getByPlaceholder('z. B. M294').fill('M999');
    await page.getByPlaceholder('z. B. Datenbanken').fill('Testmodul');
    await page.getByRole('button', { name: 'Erstellen', exact: true }).click();

    await page.locator('.module-link').filter({ hasText: 'Testmodul' }).click();
    await expect(page.getByRole('heading', { name: 'Testmodul' })).toBeVisible();

    await page.getByRole('button', { name: 'Überblick erstellen' }).click();
    await expect(page).toHaveURL(/#\/notes\//);
    await expect(page.locator('.type')).toHaveText('Zusammenfassung');

    await page.getByLabel('Notiztext').fill('Kurzüberblick über das Modul.');
    await expect(page.locator('.saved')).toContainText('gespeichert');

    await page.getByRole('link', { name: 'M999', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Testmodul' })).toBeVisible();
    await expect(page.locator('.overview-body')).toContainText('Kurzüberblick über das Modul.');
  });
});
