import { api, expect, openProjectTab, test } from './fixtures';

test('Settings identifies the Home currency and keeps backup exclusions visible', async ({
  page,
}) => {
  await page.goto('/settings');
  await expect(page.getByText('Home Currency', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Attachments and land documents are not included.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('This server', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Default Currency', { exact: true })).toHaveCount(0);
});

test('an attachment failure keeps the saved expense open for retry without duplication', async ({
  page,
  request,
}) => {
  const project = await api.createProject(request);
  await openProjectTab(page, project.id, 'Expenses');
  await page.locator('app-expenses').getByRole('button', { name: 'New Expense' }).first().click();
  const form = page.getByRole('dialog', { name: 'New Expense' });
  await form.getByPlaceholder('Cement or blockwork labour').fill('Cement attachment retry');
  await form.getByRole('textbox', { name: 'Amount spent' }).fill('500');
  await form.locator('input[type="file"]').setInputFiles({
    name: 'cement.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  });
  await expect(form.getByText('cement.jpg', { exact: false })).toBeVisible();
  await expect(form.getByText('stored on your server', { exact: false })).toHaveCount(0);
  const upload = '**/api/projects/*/expenses/*/attachments';
  await page.route(upload, (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Storage unavailable' }),
    }),
  );
  await form.getByRole('button', { name: 'Save Expense', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText(
    'Expense saved. Attachment could not be uploaded.',
  );
  await expect(form).toBeVisible();
  await page.unroute(upload);
  await form.getByRole('button', { name: 'Retry Save' }).click();
  await expect(form).toBeHidden();
  const response = await request.get(`/api/projects/${project.id}/expenses`);
  expect(response.status()).toBe(200);
  expect((await response.json()).total).toBe(1);
});
