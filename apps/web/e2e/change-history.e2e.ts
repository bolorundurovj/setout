import { ADMIN, api, expect, openProjectTab, test } from './fixtures';

test('edits show in the expense drawer, the budget item dialog and the project tab', async ({
  page,
  request,
}) => {
  const project = await api.createProject(request);
  const category = await api.createCategory(request, project.id, 'Foundation');
  const item = await api.createBudgetItem(request, category.id, 'Blocks', 500_000_00);
  await api.createExpense(request, project.id, { description: 'Cement', amount: 100_00 });

  await openProjectTab(page, project.id, 'Expenses');
  await page.getByRole('button', { name: 'Edit Cement' }).click();
  const drawer = page.getByRole('dialog', { name: 'Edit Expense' });
  await drawer.getByRole('textbox', { name: 'Amount spent' }).fill('150');
  await drawer.getByRole('button', { name: 'Save Changes' }).click();
  await expect(drawer).toBeHidden();

  await page.getByRole('button', { name: 'Edit Cement' }).click();
  const history = drawer.locator('app-change-history');
  await expect(history.locator('.change').first()).toContainText('Updated');
  await expect(history.locator('.change').first()).toContainText(ADMIN.name);
  await expect(history.locator('.change').first()).toContainText('100.00 → 150.00');
  await drawer.getByRole('button', { name: 'Close' }).click();

  const patched = await request.patch(`/api/budget-items/${item.id}`, {
    data: { budgeted_amount: 650_000_00 },
  });
  expect(patched.status()).toBe(200);

  await page.getByRole('tab', { name: 'Budget', exact: true }).click();
  await page.getByRole('button', { name: 'Foundation' }).click();
  await page.getByRole('button', { name: 'Change History' }).click();
  const dialog = page.getByRole('dialog', { name: 'Change History' });
  await expect(dialog.locator('.change').first()).toContainText('Budgeted');
  await expect(dialog.locator('.change').first()).toContainText('500,000.00 → 650,000.00');
  await dialog.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('tab', { name: 'Change History', exact: true }).click();
  const rows = page.locator('app-change-history .change');
  await expect(rows.first()).toContainText('Budget item: Blocks');
  await expect(rows.nth(1)).toContainText('Expense: Cement');
});
