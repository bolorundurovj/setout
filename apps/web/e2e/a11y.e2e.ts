import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { api, expect, openProjectTab, test, uniqueName } from './fixtures';

const LABEL_RULES = ['label', 'select-name', 'aria-input-field-name', 'aria-toggle-field-name'];
const RECEIPT = 'e2e/files/receipt.pdf';

async function expectNoLabelViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withRules(LABEL_RULES).analyze();
  const found = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`),
  );
  expect(found).toEqual([]);
}

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the sign-in form has labelled inputs', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Passphrase')).toBeVisible();
    await expectNoLabelViolations(page);
  });
});

test('bulk category assignment has labelled inputs', async ({ page, request }) => {
  const project = await api.createProject(request);
  await api.createCategory(request, project.id, 'Foundation');
  await api.createExpense(request, project.id, { description: 'Cement', amount: 100_00 });
  await openProjectTab(page, project.id, 'Expenses');

  await page.getByRole('button', { name: 'Assign Categories' }).click();
  await expect(page.getByLabel('Select Cement')).toBeVisible();
  await expectNoLabelViolations(page);
});

test('an expanded budget category has labelled inputs', async ({ page, request }) => {
  const project = await api.createProject(request);
  await api.createCategory(request, project.id, 'Foundation');
  await openProjectTab(page, project.id, 'Budget');

  await page.getByRole('button', { name: 'Foundation', exact: true }).click();
  await expect(page.getByLabel('Budget item description')).toBeVisible();
  await expectNoLabelViolations(page);
});

test('editing a land document has labelled inputs', async ({ page, request }) => {
  const land = await request.post('/api/lands', { data: { name: uniqueName('Land') } });
  expect(land.status(), await land.text()).toBe(201);
  const { id } = (await land.json()) as { id: string };
  const upload = await request.post(`/api/lands/${id}/documents`, {
    multipart: {
      file: { name: 'deed.pdf', mimeType: 'application/pdf', buffer: readFileSync(RECEIPT) },
      kind: 'other',
    },
  });
  expect(upload.status(), await upload.text()).toBe(201);
  await page.goto(`/lands/${id}`);

  await page.locator('.document').getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByLabel('Document notes')).toBeVisible();
  await expectNoLabelViolations(page);
});
