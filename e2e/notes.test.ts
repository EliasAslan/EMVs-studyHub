/**
 * Notes v3: inline creation, wiki links and optional templates.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://127.0.0.1:5173';

/** State with a note that can link to every other kind of entity. */
const LINK_SEED = {
  schemaVersion: 1,
  programs: [{ id: 'program-emvs', name: 'EMVs', code: 'EMVs', accent: '#4f46e5', order: 0 }],
  modules: [
    {
      id: 'm1',
      programId: 'program-emvs',
      code: 'M294',
      title: 'Datenbanken',
      accent: '#4f46e5',
      order: 0,
      attachments: [],
    },
  ],
  topics: [{ id: 't1', moduleId: 'm1', name: 'Normalisierung', order: 0 }],
  notes: [
    {
      id: 'n1',
      moduleId: 'm1',
      topicId: null,
      title: 'Lernplan',
      body: 'Siehe [[Aufgabe 3 lösen]], [[Datenbanken]], [[M294|DB]], [[Normalisierung]], [[Moodle]] und [[Prüfung M294]].',
      type: 'note',
      attachments: [],
    },
  ],
  homework: [
    { id: 'h1', moduleId: 'm1', title: 'Aufgabe 3 lösen', dueDate: null, done: false, recurrence: null },
  ],
  exams: [
    { id: 'e1', moduleId: 'm1', topicIds: [], title: 'Prüfung M294', date: '2026-11-20', notes: '', grade: null },
  ],
  links: [
    { id: 'l1', moduleId: 'm1', label: 'Moodle', url: 'https://example.com', kind: 'website', order: 0 },
  ],
  lessons: [],
  checklistItems: [],
  checklist: { date: null, checked: {} },
  tombstones: [],
  settings: { theme: 'light' },
};

function seedLinks(page: import('@playwright/test').Page) {
  return page.addInitScript((state) => {
    localStorage.setItem('studyhub_v1', JSON.stringify(state));
  }, LINK_SEED);
}

test.describe('Study Hub — notes', () => {
  test('creates a note inline and saves without a modal', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/notes/new`);
    await page.getByLabel('Titel').fill('Joins');
    await page.getByLabel('Notiztext').fill('INNER JOIN verbindet Tabellen. Siehe [[SQL Basics]].');

    await expect(page).toHaveURL(/#\/notes\/(?!new)/);
    await expect(page.locator('.saved')).toContainText('gespeichert');

    await page.getByRole('button', { name: 'Lesen' }).click();
    await expect(page.locator('.read-title')).toHaveText('Joins');
    // Unresolved links carry a "+" create affordance.
    await expect(page.locator('.md .wiki.unresolved')).toHaveText('+SQL Basics');
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

  test('autocomplete links modules, homework, exams, links and topics', async ({ page }) => {
    await seedLinks(page);
    await page.goto(`${BASE_URL}/#/notes/n1`);

    await page.locator('.detail-pane').getByRole('button', { name: 'Schreiben' }).click();
    await page.getByLabel('Notiztext').fill('Neue Links: [[');
    const suggest = page.locator('.detail-pane .suggest');
    await expect(suggest).toBeVisible();
    await expect(suggest).toContainText('Datenbanken');
    await expect(suggest).toContainText('Modul');
    await expect(suggest).toContainText('Aufgabe 3 lösen');
    await expect(suggest).toContainText('Hausaufgabe');
    await expect(suggest).toContainText('Prüfung M294');
    await expect(suggest).toContainText('Moodle');
    await expect(suggest).toContainText('Link');
    await expect(suggest).toContainText('Normalisierung');
    await expect(suggest).toContainText('Thema');
  });

  test('uses focused writing below 1920px and the split view only on huge screens', async ({ page }) => {
    await seedLinks(page);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/#/notes`);

    await expect(page.locator('.list-pane')).toBeVisible();
    await expect(page.locator('.detail-pane')).toHaveCount(0);

    await page.locator('.list-pane .row', { hasText: 'Lernplan' }).click();
    await expect(page).toHaveURL(/#\/notes\/n1/);
    await expect(page.locator('.detail-pane')).toBeVisible();
    await expect(page.locator('.list-pane')).toHaveCount(0);

    await page.setViewportSize({ width: 2000, height: 1100 });
    await expect(page.locator('.list-pane')).toBeVisible();
    await expect(page.locator('.detail-pane')).toBeVisible();
  });

  test('read mode shows entity connections and navigates to their views', async ({ page }) => {
    await seedLinks(page);
    await page.goto(`${BASE_URL}/#/notes/n1`);

    const detail = page.locator('.detail-pane');
    await detail.getByRole('button', { name: 'Lesen' }).click();

    await expect(detail.locator('.reading')).toContainText('Siehe Aufgabe 3 lösen');
    await expect(detail.locator('.reading .wiki', { hasText: 'DB' })).toBeVisible();

    const connections = detail.locator('.connections');
    for (const label of ['Hausaufgabe', 'Modul', 'Thema', 'Link', 'Prüfung']) {
      await expect(connections).toContainText(label);
    }

    await connections.locator('.conn-chip', { hasText: 'Datenbanken' }).click();
    await expect(page).toHaveURL(/#\/module\/m1/);

    await page.goto(`${BASE_URL}/#/notes/n1`);
    await page.locator('.detail-pane').getByRole('button', { name: 'Lesen' }).click();
    await page.locator('.detail-pane .conn-chip', { hasText: 'Moodle' }).click();
    await expect(page).toHaveURL(/#\/links/);
  });
});
