import { readFile } from 'node:fs/promises';
import { Page } from '@playwright/test';
import { api, expect, openProjectTab, test } from './fixtures';

async function download(page: Page, button: string): Promise<{ name: string; body: Buffer }> {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button }).click(),
  ]);
  return { name: file.suggestedFilename(), body: await readFile(await file.path()) };
}

test('each export button downloads its file', async ({ page, request }) => {
  const project = await api.createProject(request, 'Jacaranda Close Export');
  const category = await api.createCategory(request, project.id, 'Foundation');
  await api.createBudgetItem(request, category.id, 'Blocks', 500_000_00);
  await api.createExpense(request, project.id, {
    description: 'Cement',
    amount: 76_500_00,
    category_id: category.id,
  });
  await openProjectTab(page, project.id, 'Project Settings');

  const workbook = await download(page, 'Export Workbook');
  expect(workbook.name).toMatch(/^setout-jacaranda-close-export-\d{8}\.xlsx$/);
  expect(workbook.body.subarray(0, 2).toString()).toBe('PK');

  const budget = await download(page, 'Export Budget (CSV)');
  expect(budget.name).toMatch(/-budget-\d{8}\.csv$/);
  expect([...budget.body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(budget.body.subarray(3).toString('utf8')).toMatch(/^Cost Code,Description,/);

  const expenses = await download(page, 'Export Expenses (CSV)');
  expect(expenses.name).toMatch(/-expenses-\d{8}\.csv$/);
  expect(expenses.body.toString('utf8')).toContain('Cement');

  const report = await download(page, 'Export Report (PDF)');
  expect(report.name).toMatch(/-report-\d{8}\.pdf$/);
  expect(report.body.subarray(0, 4).toString()).toBe('%PDF');
});
