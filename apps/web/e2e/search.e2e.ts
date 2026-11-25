import { api, expect, test, uniqueName } from './fixtures';

test('global search finds lands, vendors, and expenses and navigates to each', async ({
  page,
  request,
}) => {
  const token = uniqueName('FindMe');
  const project = await api.createProject(request, `${token} Project`);
  const land = await api.createLand(request, `${token} Plot`);
  const vendor = await api.createVendor(request, `${token} Vendor`);
  await api.createExpense(request, project.id, {
    description: `${token} Cement`,
    amount: 12_500_00,
    vendor_id: vendor.id,
  });

  await page.goto('/');
  const searchBox = page.getByLabel('Search Setout');
  await searchBox.fill(token);
  await searchBox.press('Enter');

  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(page.getByRole('button', { name: new RegExp(`^${token} Plot`) })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`^${token} Vendor`) })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`^${token} Cement`) })).toBeVisible();

  // Clicking a land hit opens the land record.
  await page.getByRole('button', { name: new RegExp(`^${token} Plot`) }).click();
  await expect(page).toHaveURL(new RegExp(`/lands/${land.id}$`));
  await expect(page.getByRole('heading', { name: `${token} Plot` })).toBeVisible();

  // Searching again and clicking an expense opens the expense edit drawer.
  await searchBox.fill(token);
  await searchBox.press('Enter');
  await page.getByRole('button', { name: new RegExp(`^${token} Cement`) }).click();
  await expect(page.getByRole('dialog', { name: 'Edit Expense' })).toBeVisible();
});
