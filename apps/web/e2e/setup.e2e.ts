import { ADMIN, SESSION_FILE, expect, test } from './fixtures';

test('first-run setup creates the account and signs in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);

  await page.getByPlaceholder('Your name').fill(ADMIN.name);
  const passphrases = page.getByPlaceholder('••••••••••');
  await passphrases.nth(0).fill(ADMIN.passphrase);
  await passphrases.nth(1).fill(ADMIN.passphrase);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.context().storageState({ path: SESSION_FILE });
});
