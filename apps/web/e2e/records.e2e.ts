import { expect, test, uniqueName } from './fixtures';

test('creating and editing a vendor, a person with phone, and an item', async ({ page }) => {
  const vendorName = uniqueName('Apex Quarry');
  const personName = uniqueName('Bola Ade');
  const itemName = uniqueName('Granite');
  const updatedItemName = `${itemName} 20mm`;

  // Vendors: create and view detail
  await page.goto('/vendors');
  await page.getByRole('button', { name: 'New Vendor' }).click();
  await page.getByLabel('Name (required)').fill(vendorName);
  await page.getByLabel('Trade').fill('Aggregates');
  await page.getByLabel('Phone').fill('+234 801 111 2222');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('heading', { name: vendorName })).toBeVisible();
  await expect(page.getByText('+234 801 111 2222')).toBeVisible();

  // People: create with phone and verify phone displays on detail
  await page.goto('/people');
  await page.getByRole('button', { name: 'New Person' }).click();
  await page.getByLabel('Name (required)').fill(personName);
  await page.getByLabel('Role').fill('Site supervisor');
  await page.getByLabel('Phone').fill('+234 802 333 4444');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('heading', { name: personName })).toBeVisible();
  await expect(page.getByText('+234 802 333 4444')).toBeVisible();

  // Items: create, open detail, edit name & unit
  await page.goto('/items');
  await page.getByRole('button', { name: 'New Item' }).click();
  await page.getByLabel('Name (required)').fill(itemName);
  await page.getByLabel('Unit').fill('tonne');
  await page.getByRole('button', { name: 'Save' }).click();

  await page.locator('button.name-cell', { hasText: itemName }).click();
  await expect(page).toHaveURL(/\/items\/[^/]+$/);
  await expect(page.getByRole('heading', { name: itemName })).toBeVisible();

  await page.getByRole('button', { name: 'Edit Item' }).click();
  await page.getByLabel('Name (required)').fill(updatedItemName);
  await page.getByLabel('Unit').fill('truck');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('heading', { name: updatedItemName })).toBeVisible();
  await expect(page.getByText('per truck')).toBeVisible();
});
