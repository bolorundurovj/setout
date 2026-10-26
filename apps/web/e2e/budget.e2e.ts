import { api, expect, openProjectTab, test } from './fixtures';

test('adding a category and a budget item updates the Budgeted Total', async ({
  page,
  request,
}) => {
  const project = await api.createProject(request);
  await openProjectTab(page, project.id, 'Budget');

  await page.locator('app-combobox input').fill('Foundation');
  await page.getByRole('button', { name: 'Add Category' }).click();
  await page.getByRole('button', { name: 'Foundation' }).click();

  await page.getByPlaceholder('Item description').fill('Blocks');
  await page.getByLabel('Budgeted amount for this item').fill('50000');
  await page.getByRole('button', { name: '+ Budget Item' }).click();

  await expect(page.getByText('Blocks')).toBeVisible();
  await expect(page.locator('.total-figure')).toContainText('50,000');
});
