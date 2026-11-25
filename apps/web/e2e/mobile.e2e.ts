import { api, expect, openProjectTab, test } from './fixtures';

test.use({ viewport: { width: 360, height: 800 } });

test('core screens and navigation work at a 360 px mobile viewport without horizontal overflow', async ({
  page,
  request,
}) => {
  const project = await api.createProject(request);
  const category = await api.createCategory(request, project.id, 'Structure');
  await api.createBudgetItem(request, category.id, 'Blocks', 50_000_00);
  await api.createExpense(request, project.id, {
    description: 'Mobile Cement',
    amount: 20_000_00,
    category_id: category.id,
  });

  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible();

  // Open the mobile navigation drawer and navigate to Projects.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('link', { name: /^Projects/ }).click();
  await expect(page).toHaveURL(/\/projects$/);

  for (const tab of ['Expenses', 'Budget', 'Deliveries']) {
    await openProjectTab(page, project.id, tab);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on ${tab}`).toBeLessThanOrEqual(1);
  }
});
