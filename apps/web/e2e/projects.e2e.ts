import { expect, test, uniqueName } from './fixtures';

const TABS = [
  'Dashboard',
  'Expenses',
  'Budget vs Spent',
  'Month by Month',
  'Budget',
  'Agreements',
  'Deliveries',
  'Change History',
  'Project Settings',
];

test('New Project creates a project and every tab renders without console errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const name = uniqueName('Jacaranda Close');

  await page.goto('/projects');
  await page.getByRole('button', { name: 'New Project' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create Project' }).click();

  const card = page.locator('article.project-card', { hasText: name });
  await card.getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+/);

  for (const tab of TABS) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.waitForLoadState('networkidle');
  }
  expect(errors).toEqual([]);
});
