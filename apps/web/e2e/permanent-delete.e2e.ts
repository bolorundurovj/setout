import { api, expect, test, uniqueName } from './fixtures';

test('archiving and permanently deleting a vendor requires DELETE confirmation', async ({
  page,
  request,
}) => {
  const name = uniqueName('Disposable Vendor');
  const vendor = await api.createVendor(request, name);

  await page.goto(`/vendors/${vendor.id}`);
  await expect(page.getByRole('heading', { name })).toBeVisible();

  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm archive', exact: true }).click();
  await expect(page.getByText('This vendor is archived.')).toBeVisible();

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const deleteButton = page.getByRole('button', { name: 'Delete', exact: true });
  await expect(deleteButton).toBeDisabled();

  // Lowercase "delete" is accepted because the input displays uppercase.
  await page.getByLabel('Type DELETE to confirm').fill('delete');
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();

  await expect(page).toHaveURL(/\/vendors$/);
  await page.getByRole('switch', { name: /Show archived/i }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});
