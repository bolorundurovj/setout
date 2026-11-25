import { api, expect, test, uniqueName } from './fixtures';

const TABS = [
  'Dashboard',
  'Expenses',
  'Budget vs Spent',
  'Expenses by Month',
  'Budget',
  'Agreements and Advances',
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

test('switching project IDs refreshes the current tab', async ({ page, request }) => {
  const first = await api.createProject(request);
  const second = await api.createProject(request);
  const firstCategory = uniqueName('First budget');
  const secondCategory = uniqueName('Second budget');
  await api.createCategory(request, first.id, firstCategory);
  await api.createCategory(request, second.id, secondCategory);
  await page.goto(`/projects/${first.id}/budget`);
  await expect(page.getByText(firstCategory, { exact: true }).first()).toBeVisible();
  await page.evaluate((url) => {
    history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/projects/${second.id}/budget`);
  await expect(page.getByRole('heading', { name: String(second['name']) })).toBeVisible();
  await expect(page.getByText(secondCategory, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(firstCategory, { exact: true })).toHaveCount(0);
});
