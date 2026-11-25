import { readFileSync } from 'node:fs';
import { ADMIN, SESSION_FILE, api, expect, test, uniqueName } from './fixtures';

test('settings supports backup export, restore, and passphrase change', async ({
  page,
  request,
  context,
}) => {
  await page.goto('/settings');

  // 1. Export a backup after re-entering the passphrase.
  const backupPassphrase = page.getByLabel(/^Passphrase/);
  await backupPassphrase.fill(ADMIN.passphrase);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Backup' }).click(),
  ]);
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();
  const parsed = JSON.parse(readFileSync(backupPath as string, 'utf8')) as {
    format?: string;
    tables?: Record<string, unknown[]>;
  };
  expect(parsed.tables).toBeTruthy();

  // 2. Create a post-backup marker project, then restore the backup and verify it disappears.
  const markerName = uniqueName('AfterBackup');
  await api.createProject(request, markerName);

  await page
    .locator('section:has-text("Server and Backup") input[type="file"]')
    .setInputFiles(backupPath as string);
  await backupPassphrase.fill(ADMIN.passphrase);
  await expect(page.getByRole('button', { name: 'Restore Backup' })).toBeEnabled();
  await page.getByRole('button', { name: 'Restore Backup' }).click();

  await expect(page).toHaveURL(/\/login$/);

  // Sign back in after restore.
  await page.getByPlaceholder('••••••••••').fill(ADMIN.passphrase);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/projects');
  await expect(page.getByText(markerName)).toHaveCount(0);

  // 3. Change the passphrase, verify sign-in with the new passphrase, then restore the original.
  const rotated = 'updated e2e passphrase 2026';
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await page.getByLabel('Current Passphrase').fill(ADMIN.passphrase);
  await page.getByLabel('New Passphrase', { exact: true }).fill(rotated);
  await page.getByLabel('Confirm New Passphrase').fill(rotated);
  await page.getByRole('button', { name: 'Change Passphrase' }).click();
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign Out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByPlaceholder('••••••••••').fill(rotated);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/$/);

  // Restore ADMIN.passphrase so subsequent E2E specs stay authenticated.
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Change', exact: true }).click();
  await page.getByLabel('Current Passphrase').fill(rotated);
  await page.getByLabel('New Passphrase', { exact: true }).fill(ADMIN.passphrase);
  await page.getByLabel('Confirm New Passphrase').fill(ADMIN.passphrase);
  await page.getByRole('button', { name: 'Change Passphrase' }).click();
  await expect(page.getByRole('button', { name: 'Change', exact: true })).toBeVisible();

  await context.storageState({ path: SESSION_FILE });
});
