import { api, expect, openProjectTab, test } from './fixtures';

test('adding a category and a budget item updates the Budgeted Total', async ({
  page,
  request,
}) => {
  const project = await api.createProject(request);
  await openProjectTab(page, project.id, 'Budget');

  await page.locator('app-combobox input').fill('Foundation');
  await page.getByRole('button', { name: 'Save Category' }).click();
  await page.getByRole('button', { name: 'Foundation' }).click();

  await page.getByPlaceholder('Item description').fill('Blocks');
  await page.getByLabel('Budgeted amount for this item').fill('50000');
  await page.getByRole('button', { name: '+ Budget Item' }).click();

  await expect(page.getByText('Blocks')).toBeVisible();
  await expect(page.locator('.total-figure')).toContainText('50,000');
});

test('editing one of two budget items updates only its amount', async ({ page, request }) => {
  const project = await api.createProject(request);
  await openProjectTab(page, project.id, 'Budget');
  await page.locator('app-combobox input').fill('Materials');
  await page.getByRole('button', { name: 'Save Category' }).click();
  await page.getByRole('button', { name: 'Materials', exact: true }).click();
  for (const name of ['Blocks', 'Sand']) {
    await page.getByPlaceholder('Item description').fill(name);
    await page.getByLabel('Budgeted amount for this item').fill('100');
    await page.getByRole('button', { name: '+ Budget Item' }).click();
    await expect(page.locator('.item').filter({ hasText: name })).toBeVisible();
  }
  const blocks = page.locator('.item').filter({ hasText: 'Blocks' });
  await blocks.getByRole('button', { name: 'Edit' }).click();
  await blocks.getByLabel('Budgeted amount').fill('250');
  await blocks.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(blocks).toContainText('250');
  await expect(page.locator('.item').filter({ hasText: 'Sand' })).toContainText('100');
  await expect(page.locator('.total-figure')).toContainText('350');
});
