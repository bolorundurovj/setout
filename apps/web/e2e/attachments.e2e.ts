import { join } from 'node:path';
import { api, expect, openProjectTab, test, uniqueName } from './fixtures';

const RECEIPT = join(__dirname, 'files', 'receipt.pdf');

test('an attachment uploaded in the expense drawer is listed, archived and restored', async ({
  page,
  request,
}) => {
  const project = await api.createProject(request);
  await api.createExpense(request, project.id, { description: 'Cement', amount: 76_500_00 });
  await openProjectTab(page, project.id, 'Expenses');

  await page.getByRole('button', { name: 'Edit Cement' }).click();
  const drawer = page.getByRole('dialog', { name: 'Edit Expense' });
  await drawer.locator('input[type="file"]').setInputFiles(RECEIPT);
  await expect(drawer.getByText('receipt.pdf', { exact: true })).toBeVisible();

  await drawer.getByRole('button', { name: 'Archive Attachment' }).click();
  await expect(drawer.getByText('receipt.pdf was archived.')).toBeVisible();
  await drawer.getByRole('button', { name: 'Undo' }).click();
  await expect(drawer.getByText('receipt.pdf', { exact: true })).toBeVisible();
});

test('an attachment uploaded in the agreement edit form is listed there', async ({
  page,
  request,
}) => {
  const project = await api.createProject(request);
  const vendor = await api.createVendor(request, uniqueName('Adebayo Blocks'));
  await api.createAgreement(request, project.id, {
    vendor_id: vendor.id,
    description: 'Block work',
    agreed_amount: 300_000_00,
  });
  await openProjectTab(page, project.id, 'Agreements');

  await page.getByRole('button', { name: `Edit the agreement with ${vendor['name']}` }).click();
  const attachments = page.locator('app-attachments');
  await attachments.locator('input[type="file"]').setInputFiles(RECEIPT);
  await expect(attachments.getByText('receipt.pdf', { exact: true })).toBeVisible();
});

test('an attachment uploaded on Project Settings is listed there', async ({ page, request }) => {
  const project = await api.createProject(request);
  await openProjectTab(page, project.id, 'Project Settings');

  const attachments = page.locator('app-attachments');
  await expect(attachments.getByText('No attachments')).toBeVisible();
  await attachments.locator('input[type="file"]').setInputFiles(RECEIPT);
  await expect(attachments.getByText('receipt.pdf', { exact: true })).toBeVisible();
});
