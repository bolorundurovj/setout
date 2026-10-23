import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ExpenseRead, ProjectRead, CategoryRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { ToastService } from '../toast.service';
import { ItemService } from '../items/item.service';
import { PersonService } from '../people/person.service';
import { VendorService } from '../vendors/vendor.service';
import { ExpenseService, UNCATEGORISED, type ExpenseFilters } from './expense.service';
import { ExpensesComponent } from './expenses.component';

function expense(id: string, overrides: Partial<ExpenseRead> = {}): ExpenseRead {
  return {
    id,
    project_id: 'p1',
    category_id: null,
    item_id: null,
    vendor_id: null,
    agreement_id: null,
    paid_by_id: null,
    spent_on: '2026-08-01',
    description: 'Cement',
    quantity: null,
    unit_rate: null,
    amount: 10_000_00,
    attachment_count: 0,
    cost_type: 'material',
    notes: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    archived_at: null,
    ...overrides,
  };
}

function category(id: string, name: string, isGroup = false): CategoryRead {
  return {
    id,
    project_id: 'p1',
    code: null,
    name,
    parent_id: null,
    sort_order: 0,
    is_group: isGroup,
    budgeted_amount: 0,
    own_budgeted_amount: 0,
    spent_amount: 0,
    own_spent_amount: 0,
    expense_count: 0,
    own_expense_count: 0,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    archived_at: null,
  };
}

describe('ExpensesComponent', () => {
  const project: ProjectRead = {
    id: 'p1',
    name: 'Jacaranda Close',
    currency_code: 'NGN',
    currency_exponent: 2,
    land_id: null,
    land_name: null,
    notes: null,
    budgeted_amount: 0,
    spent_amount: 15_000_00,
    status: 'active',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    archived_at: null,
  };

  let expenses: ExpenseRead[];
  let uncategorised: ExpenseRead[];
  let categories: CategoryRead[];
  let assigned: { projectId: string; body: { expense_ids: string[]; category_id: string } } | null;
  let loaded: string[];
  let uncategorisedPages: number[];
  let toasts: { message: string; type: string }[];
  let assignResult: number | null;
  let includeArchivedRequests: boolean[];

  function renderFixture(filters: ExpenseFilters = {}) {
    expenses = [expense('e1'), expense('e2', { description: 'Sand' })];
    uncategorised = [...expenses];
    categories = [category('s1', 'Concrete foundation')];
    assigned = null;
    loaded = [];
    uncategorisedPages = [];
    toasts = [];
    assignResult = 2;
    includeArchivedRequests = [];

    const expenseService = {
      expenses: () => expenses,
      total: () => expenses.length,
      page: () => 1,
      byCategory: () => ({
        [UNCATEGORISED]: {
          rows: uncategorised,
          total: uncategorised.length,
          page: uncategorisedPages.at(-1) ?? 1,
        },
      }),
      summary: () => ({
        project_id: 'p1',
        currency_code: 'NGN',
        currency_exponent: 2,
        budgeted_amount: 0,
        spent_amount: 15_000_00,
        uncategorised_amount: 15_000_00,
        uncategorised_count: 2,
        archived_count: 0,
        variance_percent: null,
      }),
      saving: () => false,
      error: () => null,
      load: async (projectId: string, filters: { includeArchived?: boolean } = {}) => {
        loaded.push(projectId);
        includeArchivedRequests.push(filters.includeArchived ?? false);
      },
      goTo: async (projectId: string) => void loaded.push(projectId),
      loadForCategory: async (projectId: string, categoryId: string, page = 1) => {
        loaded.push(projectId);
        uncategorisedPages.push(page);
      },
      categorise: async (
        projectId: string,
        body: { expense_ids: string[]; category_id: string },
      ) => {
        assigned = { projectId, body };
        return assignResult;
      },
      archive: async () => undefined,
      restore: async () => undefined,
    };

    const budgetService = {
      categories: () => categories,
      load: async () => undefined,
    };

    const choices = { choices: () => [], loadChoices: async () => undefined };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ExpensesComponent],
      providers: [
        provideRouter([]),
        { provide: ExpenseService, useValue: expenseService },
        { provide: BudgetService, useValue: budgetService },
        { provide: VendorService, useValue: choices },
        { provide: PersonService, useValue: choices },
        { provide: ItemService, useValue: choices },
        {
          provide: ToastService,
          useValue: { show: (message: string, type = 'success') => toasts.push({ message, type }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(ExpensesComponent);
    fixture.componentRef.setInput('project', project);
    fixture.componentRef.setInput('filters', filters);
    fixture.detectChanges();
    return fixture;
  }

  function render(filters: ExpenseFilters = {}) {
    return renderFixture(filters).componentInstance;
  }

  it('loads expenses and budget for the project', async () => {
    render();
    await Promise.resolve();
    expect(loaded).toContain('p1');
  });

  it('reloads with archived expenses when Show archived is on', async () => {
    const component = render();
    component.startAssigning();

    await component.setIncludeArchived(true);

    expect(component.includeArchived()).toBe(true);
    expect(component.archivedLabel()).toBe('Hide archived');
    expect(includeArchivedRequests).toContain(true);
    // Bulk assignment applies only to active rows, so it closes when archived rows are shown.
    expect(component.assigning()).toBe(false);
  });

  it('starts bulk assignment and loads the uncategorised list', async () => {
    const component = render();
    component.startAssigning();

    expect(component.assigning()).toBe(true);
    expect(loaded).toContain('p1');
    expect(uncategorisedPages).toContain(1);
  });

  it('selects and deselects individual expenses', () => {
    const component = render();
    component.startAssigning();

    component.toggleOne('e1');
    expect(component.selected().has('e1')).toBe(true);
    expect(component.selectedCount()).toBe(1);

    component.toggleOne('e1');
    expect(component.selected().has('e1')).toBe(false);
  });

  it('selects all visible uncategorised expenses', () => {
    const component = render();
    component.startAssigning();

    component.toggleAll();
    expect(component.allSelected()).toBe(true);
    expect(component.selectedCount()).toBe(2);

    component.toggleAll();
    expect(component.allSelected()).toBe(false);
    expect(component.selectedCount()).toBe(0);
  });

  it('assigns selected expenses to the chosen category', async () => {
    const component = render();
    component.startAssigning();
    component.toggleOne('e1');
    component.bulkCategoryId.set('s1');

    await component.assignSelected();

    expect(assigned?.body).toEqual({ expense_ids: ['e1'], category_id: 's1' });
    expect(toasts[0].type).toBe('success');
  });

  it('does not assign when no category is chosen', async () => {
    const component = render();
    component.startAssigning();
    component.toggleOne('e1');

    await component.assignSelected();

    expect(assigned).toBeNull();
  });

  it('shows an error when bulk assignment fails', async () => {
    const component = render();
    assignResult = null;
    component.startAssigning();
    component.toggleOne('e1');
    component.bulkCategoryId.set('s1');

    await component.assignSelected();

    expect(assigned?.body).toEqual({ expense_ids: ['e1'], category_id: 's1' });
    expect(toasts[0].type).toBe('error');
  });

  it('stops assigning when no uncategorised expenses remain', async () => {
    const component = render();
    uncategorised = [];
    component.startAssigning();
    component.toggleOne('e1');
    component.bulkCategoryId.set('s1');

    await component.assignSelected();

    expect(component.assigning()).toBe(false);
  });

  it('offers only leaf categories in the bulk assignment picker', () => {
    const component = render();
    categories = [category('s1', 'Structure', true), category('s2', 'Blockwork')];

    expect(component.assignableCategories().map((s) => s.id)).toEqual(['s2']);
  });
});
