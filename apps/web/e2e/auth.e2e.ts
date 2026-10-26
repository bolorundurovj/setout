import { ADMIN, expect, test } from './fixtures';

test.use({ storageState: { cookies: [], origins: [] } });

test('signing in with the passphrase reaches Home and signing out returns to sign in', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByPlaceholder('••••••••••').fill(ADMIN.passphrase);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('a wrong passphrase shows an error and stays on sign in', async ({ page }) => {
  await page.goto('/login');

  await page.getByPlaceholder('••••••••••').fill('not the passphrase');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.locator('.error-msg')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
