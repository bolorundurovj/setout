import { APIRequestContext, Page, expect, test as base } from '@playwright/test';

export const ADMIN = { name: 'E2E Admin', passphrase: 'correct horse battery staple' };
export const SESSION_FILE = 'e2e/.auth/admin.json';

let counter = 0;

export function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix} ${Date.now().toString(36)}${counter}`;
}

async function post<T>(request: APIRequestContext, path: string, body: object): Promise<T> {
  const response = await request.post(`/api${path}`, { data: body });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()) as T;
}

export interface Seeded {
  id: string;
  [field: string]: unknown;
}

export const api = {
  createProject: (request: APIRequestContext, name = uniqueName('Project')) =>
    post<Seeded>(request, '/projects', { name, currency_code: 'NGN' }),
  createCategory: (request: APIRequestContext, projectId: string, name: string) =>
    post<Seeded>(request, `/projects/${projectId}/categories`, { name }),
  createBudgetItem: (
    request: APIRequestContext,
    categoryId: string,
    description: string,
    budgetedAmount: number,
  ) =>
    post<Seeded>(request, `/categories/${categoryId}/budget-items`, {
      description,
      budgeted_amount: budgetedAmount,
    }),
  createVendor: (request: APIRequestContext, name = uniqueName('Vendor')) =>
    post<Seeded>(request, '/vendors', { name }),
  createExpense: (request: APIRequestContext, projectId: string, body: object) =>
    post<Seeded>(request, `/projects/${projectId}/expenses`, body),
  createAgreement: (request: APIRequestContext, projectId: string, body: object) =>
    post<Seeded>(request, `/projects/${projectId}/agreements`, body),
};

export async function openProjectTab(page: Page, projectId: string, tab: string): Promise<void> {
  await page.goto(`/projects/${projectId}`);
  await page.getByRole('tab', { name: tab, exact: true }).click();
  await expect(page.getByRole('tab', { name: tab, exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
}

export const test = base;
export { expect };
