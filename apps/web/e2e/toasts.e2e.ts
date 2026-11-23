import { api, expect, openProjectTab, test } from './fixtures';

test('a toast raised inside an open drawer shows above it and can be dismissed', async ({
  page,
  request,
}) => {
  const project = await api.createProject(request);
  await openProjectTab(page, project.id, 'Expenses');
  await page.route(`**/api/projects/${project.id}/expenses`, (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({ status: 500, json: { detail: 'Could not save that expense.' } })
      : route.continue(),
  );

  await page.locator('app-expenses').getByRole('button', { name: 'New Expense' }).first().click();
  const form = page.getByRole('dialog', { name: 'New Expense' });
  await form.getByPlaceholder('Cement or blockwork labour').fill('17 bags of cement');
  await form.getByRole('textbox', { name: 'Amount spent' }).fill('76500');
  await form.getByRole('button', { name: 'Save Expense' }).click();

  const toast = page.getByRole('alert').filter({ hasText: 'Could not save that expense.' });
  await expect(toast).toBeVisible();
  await expect(form).toBeVisible();

  // A click lands only on the element drawn on top, so this fails if the drawer covers the toast.
  await toast.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast).toBeHidden();
  await expect(form).toBeVisible();
});
