import { api, expect, openProjectTab, test } from './fixtures';

test('New Expense saves, the drawer closes from Close, and Edit saves a new amount', async ({
  page,
  request,
}) => {
  const project = await api.createProject(request);
  await api.createCategory(request, project.id, 'Foundation');
  await openProjectTab(page, project.id, 'Expenses');

  await page.locator('app-expenses').getByRole('button', { name: 'New Expense' }).first().click();
  const form = page.getByRole('dialog', { name: 'New Expense' });
  await form.getByPlaceholder('What was purchased').fill('17 bags of cement');
  await form.getByRole('textbox', { name: 'Amount spent' }).fill('76500');
  await form
    .getByRole('group', { name: 'Category' })
    .getByRole('button', { name: 'Foundation' })
    .click();
  await form.getByRole('button', { name: 'Save Expense' }).click();

  const edit = page.getByRole('button', { name: 'Edit 17 bags of cement' });
  await expect(edit).toBeVisible();

  await edit.click();
  const drawer = page.getByRole('dialog', { name: 'Edit Expense' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('button', { name: 'Close' }).click();
  await expect(drawer).toBeHidden();

  await edit.click();
  await drawer.getByRole('textbox', { name: 'Amount spent' }).fill('80000');
  await drawer.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.locator('app-expenses')).toContainText('80,000');
});
