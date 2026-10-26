import { api, expect, openProjectTab, test } from './fixtures';

test('an expense saved with Outstanding Delivery is on the Deliveries tab with its attachments and Change History', async ({
  page,
  request,
}) => {
  const project = await api.createProject(request);
  await openProjectTab(page, project.id, 'Expenses');

  await page.locator('app-expenses').getByRole('button', { name: 'New Expense' }).first().click();
  const form = page.getByRole('dialog', { name: 'New Expense' });
  await form.getByPlaceholder('What was purchased').fill('Roofing sheets');
  await form.getByRole('textbox', { name: 'Amount spent' }).fill('120000');
  await form.getByText('Outstanding Delivery').click();
  await form.getByRole('button', { name: 'Save Expense' }).click();
  await expect(form).toBeHidden();

  await page.getByRole('tab', { name: 'Deliveries', exact: true }).click();
  await expect(page.locator('app-deliveries')).toContainText('Roofing sheets');
  await page.locator('app-deliveries').getByRole('button', { name: 'Edit' }).click();

  await expect(page.locator('app-deliveries app-attachments')).toContainText('No attachments');
  await expect(page.locator('app-deliveries app-change-history')).toContainText('Created');
});
