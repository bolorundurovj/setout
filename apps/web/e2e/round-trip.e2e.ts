import { readFile } from 'node:fs/promises';
import { api, expect, openProjectTab, test, uniqueName } from './fixtures';

test('a workbook exported and imported as a new project has the same totals', async ({
  page,
  request,
}) => {
  const project = await api.createProject(request);
  const category = await api.createCategory(request, project.id, 'Foundation');
  await api.createBudgetItem(request, category.id, 'Blocks', 500_000_00);
  await api.createExpense(request, project.id, {
    description: 'Cement',
    amount: 76_500_00,
    spent_on: '2026-08-14',
    category_id: category.id,
  });
  await api.createExpense(request, project.id, {
    description: 'Sand',
    amount: 12_000_00,
    spent_on: '2026-08-20',
  });
  await openProjectTab(page, project.id, 'Project Settings');

  const [exported] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export Workbook' }).click(),
  ]);
  const workbook = await readFile(await exported.path());

  const name = uniqueName('Round trip');
  await page.goto('/import');
  await page.getByPlaceholder('Jacaranda Close, Ewuru').fill(name);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'export.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: workbook,
  });
  await page.getByRole('button', { name: 'Preview Import' }).click();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();

  const projects = (await (await request.get('/api/projects?limit=100')).json()) as {
    items: { id: string; name: string }[];
  };
  const imported = projects.items.find((row) => row.name === name);
  expect(imported).toBeDefined();
  const summary = async (id: string) =>
    (await (await request.get(`/api/projects/${id}/expense-summary`)).json()) as {
      budgeted_amount: number;
      spent_amount: number;
    };
  const before = await summary(project.id);
  const after = await summary(imported!.id);
  expect(after.budgeted_amount).toBe(before.budgeted_amount);
  expect(after.spent_amount).toBe(before.spent_amount);
  expect(before.spent_amount).toBe(88_500_00);
});
