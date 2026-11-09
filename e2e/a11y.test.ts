/**
 * Accessibility checks for the main Study Hub routes.
 * Runs axe-core with the WCAG 2.1 A/AA rule set and fails on serious or
 * critical findings. Moderate and minor findings stay visible in the report
 * so they can be triaged without blocking the suite.
 */

import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE_URL = 'http://127.0.0.1:5173';
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING = new Set(['serious', 'critical']);

const AI_ON = {
  enabled: true,
  baseUrl: 'http://localhost:11434',
  model: 'qwen3:8b',
  numCtx: 8192,
};

const SEED = {
  schemaVersion: 1,
  programs: [
    { id: 'program-emvs', name: 'EMVs', code: 'EMVs', accent: '#4f46e5', order: 0 },
    { id: 'program-bm', name: 'BM', code: 'BM', accent: '#0f766e', order: 1 },
  ],
  modules: [
    {
      id: 'mod-1',
      programId: 'program-emvs',
      code: 'M294',
      title: 'Datenbanken',
      accent: '#4f46e5',
      order: 0,
      attachments: [],
      overviewNoteId: 'note-1',
    },
  ],
  topics: [],
  notes: [
    {
      id: 'note-1',
      moduleId: 'mod-1',
      topicId: null,
      title: 'Überblick Datenbanken',
      body: 'Kurzüberblick über das Modul.',
      type: 'summary',
      attachments: [],
    },
    {
      id: 'note-2',
      moduleId: 'mod-1',
      topicId: null,
      title: 'SQL Joins',
      body: 'INNER JOIN verbindet Tabellen.',
      type: 'note',
      attachments: [],
    },
  ],
  homework: [
    {
      id: 'hw-1',
      moduleId: 'mod-1',
      topicId: null,
      title: 'Aufgabe 3 lösen',
      dueDate: '2026-11-10',
      done: false,
      recurrence: null,
    },
  ],
  exams: [
    {
      id: 'exam-1',
      moduleId: 'mod-1',
      topicIds: [],
      title: 'Prüfung M294',
      date: '2026-11-20',
      notes: 'Kapitel 1–4',
      grade: null,
      gradeNote: '',
    },
  ],
  links: [
    {
      id: 'link-1',
      moduleId: 'mod-1',
      label: 'Moodle',
      url: 'https://example.com',
      kind: 'website',
      order: 0,
    },
  ],
  lessons: [],
  checklistItems: [{ id: 'studied', text: 'studiert heute', kind: 'studied', order: 0 }],
  checklist: { date: null, checked: {} },
  tombstones: [],
  settings: {
    theme: 'light',
    navCollapsed: false,
    email: '',
    emailReminders: false,
    lastExportAt: null,
    changeCount: 0,
    currentProgramId: 'program-emvs',
    updatedAt: 0,
  },
};

async function seed(page: Page, aiOn = false) {
  await page.addInitScript(
    ({ state, settings }) => {
      localStorage.setItem('studyhub_v1', JSON.stringify(state));
      if (settings) localStorage.setItem('studyhub_ai_v1', JSON.stringify(settings));
    },
    { state: SEED, settings: aiOn ? AI_ON : null },
  );
}

async function expectAccessible(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const blocking = results.violations
    .filter((violation) => BLOCKING.has(violation.impact ?? ''))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target.join(' ')),
      details: violation.nodes.map((node) => node.failureSummary),
    }));
  expect(blocking, `${label} has serious or critical accessibility violations`).toEqual([]);
}

const ROUTES = [
  ['Heute', '/'],
  ['Hausaufgaben', '/homework'],
  ['Module', '/modules'],
  ['Notizen', '/notes'],
  ['Prüfungen', '/exams'],
  ['Kalender', '/calendar'],
  ['Links', '/links'],
  ['Fokus', '/focus'],
  ['Einstellungen', '/settings'],
];

test.describe('Study Hub v2.1 — accessibility', () => {
  for (const [label, route] of ROUTES) {
    test(`${label} has no serious or critical WCAG 2.1 A/AA violations`, async ({ page }) => {
      await seed(page);
      await page.goto(`${BASE_URL}/#${route}`);
      await expect(page.locator('main')).toBeVisible();
      await page.waitForTimeout(250);
      await expectAccessible(page, label);
    });
  }

  test('Moduldetail has no serious or critical WCAG 2.1 A/AA violations', async ({ page }) => {
    await seed(page);
    await page.goto(`${BASE_URL}/#/module/mod-1`);
    await expect(page.getByRole('heading', { name: 'Datenbanken', exact: true })).toBeVisible();
    await page.waitForTimeout(250);
    await expectAccessible(page, 'Moduldetail');
  });

  test('Notizdetail has no serious or critical WCAG 2.1 A/AA violations', async ({ page }) => {
    await seed(page);
    await page.goto(`${BASE_URL}/#/notes/note-2`);
    await expect(page.getByLabel('Notiztext')).toBeVisible();
    await page.waitForTimeout(250);
    await expectAccessible(page, 'Notizdetail');
  });

  test('Assistent with AI off has no serious or critical WCAG 2.1 A/AA violations', async ({
    page,
  }) => {
    await seed(page);
    await page.goto(`${BASE_URL}/#/assistant`);
    await expect(page.getByText('Lokale KI ist aus.')).toBeVisible();
    await page.waitForTimeout(250);
    await expectAccessible(page, 'Assistent (KI aus)');
  });

  test('Assistent with AI on has no serious or critical WCAG 2.1 A/AA violations', async ({
    page,
  }) => {
    await seed(page, true);
    await page.route('http://localhost:11434/api/tags', (route) =>
      route.fulfill({ json: { models: [{ name: 'qwen3:8b' }] } }),
    );
    await page.route('http://localhost:11434/api/chat', async (route) => {
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
    await expect(page.getByText('Ollama verbunden')).toBeVisible();
    await page.waitForTimeout(250);
    await expectAccessible(page, 'Assistent (KI an)');

    const box = page.getByLabel('Frage an den Assistenten');
    await box.fill('@notizen Was ist wichtig?');
    await box.press('Enter');
    await expect(page.getByText('Ruhige Antwort. Fertig.')).toBeVisible();
    await expectAccessible(page, 'Assistent mit Unterhaltung');
  });

  test('Notizdetail with AI actions has no serious or critical WCAG 2.1 A/AA violations', async ({
    page,
  }) => {
    await seed(page, true);
    await page.route('http://localhost:11434/api/tags', (route) =>
      route.fulfill({ json: { models: [{ name: 'qwen3:8b' }] } }),
    );
    await page.goto(`${BASE_URL}/#/notes/note-2`);
    await expect(page.getByLabel('Notiztext')).toBeVisible();
    await page.waitForTimeout(250);
    await expectAccessible(page, 'Notizdetail (KI an)');
  });

  test('AI actions are keyboard operable and return focus', async ({ page }) => {
    await seed(page, true);
    await page.route('http://localhost:11434/api/tags', (route) =>
      route.fulfill({ json: { models: [{ name: 'qwen3:8b' }] } }),
    );
    await page.route('http://localhost:11434/api/chat', async (route) => {
      const body =
        `${JSON.stringify({ message: { content: 'Ruhige Antwort.' }, done: false })}\n` +
        `${JSON.stringify({ message: { content: ' Fertig.' }, done: true })}\n`;
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
        body,
      });
    });

    await page.goto(`${BASE_URL}/#/notes/note-2`);
    // The notes split view also has a list-level summarise action.
    // In the detail pane "Zusammenfassen" sits in the overflow menu.
    await page.locator('.detail-pane').getByLabel('Weitere KI-Aktionen').click();
    const summarize = page.locator('.detail-pane').getByRole('button', { name: 'Zusammenfassen' });
    await summarize.focus();
    await page.keyboard.press('Enter');

    const box = page.getByLabel('Frage an den Assistenten');
    await expect(box).toBeFocused();
    await expect(box).toHaveValue('Fasse diese Notiz in 5 Punkten zusammen.');

    await page.keyboard.press('Enter');
    await expect(page.getByText('Ruhige Antwort. Fertig.')).toBeVisible();

    const neu = page.getByRole('button', { name: 'Neu', exact: true });
    await neu.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.msg')).toHaveCount(0);

    await page.goto(`${BASE_URL}/#/module/mod-1`);
    const draft = page.getByRole('button', { name: 'Überblick entwerfen' });
    await draft.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Überblick entwerfen' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(draft).toBeFocused();
  });
});
