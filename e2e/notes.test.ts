/**
 * Notes v3: inline creation, wiki links and optional templates.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5173';

test.describe('Study Hub — notes', () => {
  test('creates a note inline and saves without a modal', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/notes/new`);
    await page.getByLabel('Titel').fill('Joins');
    await page.getByLabel('Notiztext').fill('INNER JOIN verbindet Tabellen. Siehe [[SQL Basics]].');

    await expect(page).toHaveURL(/#\/notes\/(?!new)/);
    await expect(page.locator('.saved')).toContainText('gespeichert');

    await page.getByRole('button', { name: 'Lesen' }).click();
    await expect(page.locator('.read-title')).toHaveText('Joins');
    await expect(page.locator('.md .wiki.unresolved')).toHaveText('SQL Basics');
  });

  test('creates a note from an unresolved wiki link', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/notes/new`);
    await page.getByLabel('Titel').fill('Joins');
    await page.getByLabel('Notiztext').fill('Siehe [[SQL Basics]].');
    await expect(page).toHaveURL(/#\/notes\/(?!new)/);

    await page.getByRole('button', { name: 'Lesen' }).click();
    await page.locator('.md .wiki.unresolved').click();

    await expect(page.getByLabel('Titel')).toHaveValue('SQL Basics');
    await page.getByLabel('Notiztext').fill('Grundlagen zu Tabellen.');
    await expect(page.locator('.saved')).toContainText('gespeichert');

    await page.goto(`${BASE_URL}/#/notes`);
    await expect(page.locator('.list-pane')).toContainText('Joins');
    await expect(page.locator('.list-pane')).toContainText('SQL Basics');
  });

  test('offers optional templates only while the body is empty', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/notes/new`);

    const templates = page.locator('.templates');
    await expect(templates).toBeVisible();
    await expect(templates).toContainText('optional');

    await templates.locator('summary').click();
    await templates.getByRole('button', { name: 'Fehler' }).click();

    await expect(page.getByLabel('Notiztext')).toHaveValue(/## Was ist passiert/);
    await expect(page.locator('.type')).toHaveText('Fehler');
    await expect(templates).toHaveCount(0);
  });

  test('opens the note quick switcher with Ctrl+O', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/notes`);
    await page.keyboard.press('Control+o');
    await expect(page.getByRole('dialog', { name: 'Notiz öffnen' })).toBeVisible();
  });
});
