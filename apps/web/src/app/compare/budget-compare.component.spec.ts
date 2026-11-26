import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { ExpenseRead, ProjectRead, CategoryRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { ExpenseService } from '../expenses/expense.service';
import type { RequestStatus } from '../ui/request-status';
import { BudgetCompareComponent, type CompareRow } from './budget-compare.component';
import { Router } from '@angular/router';

const project: ProjectRead = {
  id: 'p1',
  name: 'Jacaranda Close, Ewuru',
  currency_code: 'NGN',
  currency_exponent: 2,
  land_id: null,
  land_name: null,
  status: 'active',
  notes: null,
  budgeted_amount: 0,
  spent_amount: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  archived_at: null,
};

function category(over: Partial<CategoryRead> = {}): CategoryRead {
  return {
    id: 's1',
    project_id: 'p1',
    code: null,
    name: 'Concrete foundation',
    parent_id: null,
    sort_order: 0,
    is_group: false,
    budgeted_amount: 0,
    own_budgeted_amount: 0,
    spent_amount: 0,
    own_spent_amount: 0,
    expense_count: 0,
    own_expense_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    ...over,
  };
}

function row(over: Partial<CompareRow> = {}): CompareRow {
  return {
    id: 's1',
    name: 'Concrete foundation',
    budgeted: 0,
    spent: 0,
    count: 0,
    isUncategorised: false,
    ...over,
  };
}

describe('BudgetCompareComponent', () => {
  const pageRevision = signal(0);
  const budgetStatus = signal<RequestStatus>('ready');
  const expenseStatus = signal<RequestStatus>('ready');
  let categoryStatuses: Record<string, RequestStatus>;
  let loaded: string[];
  let fixture: ComponentFixture<BudgetCompareComponent>;

  function render(
    categories: CategoryRead[] = [],
    summary: Record<string, unknown> | null = null,
    byCategory: Record<string, ExpenseRead[]> = {},
    expenseCount = 0,
    openCategory = '',
  ) {
    loaded = [];
    categoryStatuses = {};
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [BudgetCompareComponent],
      providers: [
        {
          provide: BudgetService,
          useValue: {
            categories: () => categories,
            status: budgetStatus,
            load: async () => undefined,
          },
        },
        {
          provide: ExpenseService,
          useValue: {
            summary: () => summary,
            total: () => expenseCount,
            status: expenseStatus,
            categoryStatus: (_p: string, id: string) => categoryStatuses[id] ?? 'ready',
            categoryPage: (_p: string, id: string) => {
              pageRevision();
              return byCategory[id];
            },
            load: async () => undefined,
            loadForCategory: async (_p: string, categoryId: string) => {
              loaded.push(categoryId);
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(BudgetCompareComponent);
    fixture.componentRef.setInput('project', project);
    fixture.componentRef.setInput('openCategory', openCategory);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const summary = (budgeted: number, spent: number, uncategorised = 0, uncategorisedCount = 0) => ({
    budgeted_amount: budgeted,
    spent_amount: spent,
    uncategorised_amount: uncategorised,
    uncategorised_count: uncategorisedCount,
    variance_percent: null,
  });

  it('keeps the user selection when the deep-linked category finishes loading', () => {
    const component = render([], null, {}, 0, 'first');
    expect(component.expanded()).toBe('first');
    component.toggle(row({ id: 'second' }));
    pageRevision.update((revision) => revision + 1);
    TestBed.tick();
    expect(component.expanded()).toBe('second');
    expect(loaded).toEqual(['first', 'second']);
  });

  it('opens a clicked expense in the Expenses tab', () => {
    const c = render();
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    c.openExpense({ id: 'x1' } as ExpenseRead);

    expect(navigate).toHaveBeenCalledWith(['/projects', 'p1', 'expenses'], {
      queryParams: { expense: 'x1' },
    });
  });

  it('lists every category in budget order', () => {
    const c = render(
      [
        category({ id: 'a', name: 'Groundwork' }),
        category({ id: 'b', name: 'Roof' }),
        category({ id: 'c', name: 'Untouched' }),
      ],
      summary(1000, 500),
    );
    expect(c.rows().map((r) => r.name)).toEqual(['Groundwork', 'Roof', 'Untouched']);
  });

  it('adds an Uncategorised row only when uncategorised expenses exist', () => {
    const withUncategorised = render([category()], summary(1000, 500, 6_100_000));
    const last = withUncategorised.rows()[withUncategorised.rows().length - 1];
    expect(last.isUncategorised).toBe(true);
    expect(last.spent).toBe(6_100_000);

    expect(
      render([category()], summary(1000, 500))
        .rows()
        .some((r) => r.isUncategorised),
    ).toBe(false);
  });

  it('shows a dash for a category without a budget', () => {
    const c = render([], summary(0, 500));
    expect(c.budgetedCell(row({ budgeted: 0, spent: 5000 }))).toBe('—');
    expect(c.remaining(row({ budgeted: 0, spent: 5000 }))).toBe('—');
    expect(c.used(row({ budgeted: 0, spent: 5000 }))).toBe('—');
    expect(c.isOverBudget(row({ budgeted: 0, spent: 5000 }))).toBe(false);
  });

  it('computes a negative remaining amount when over budget', () => {
    const c = render([], summary(1000, 500));
    expect(c.remaining(row({ budgeted: 100_000, spent: 40_000 }))).toBe('600');
    expect(c.remaining(row({ budgeted: 100_000, spent: 140_000 }))).toBe('-400');
    expect(c.isOverBudget(row({ budgeted: 100_000, spent: 140_000 }))).toBe(true);
  });

  it('computes the percentage of the budget used', () => {
    const c = render([], summary(1000, 500));
    expect(c.used(row({ budgeted: 1000, spent: 250 }))).toBe('25%');
    expect(c.used(row({ budgeted: 1000, spent: 1500 }))).toBe('150%');
  });

  it('takes totals from the project summary, not the visible rows', () => {
    const c = render(
      [category({ budgeted_amount: 100 })],
      summary(215_000_000, 232_630_000),
      {},
      15,
    );
    expect(c.totalOverBudget()).toBe(true);
    expect(c.totalRemaining()).toBe(-17_630_000);
    expect(c.totalUsed()).toBe('108%');
    expect(c.countLabel()).toBe('15 expenses');
  });

  it('shows no total variance without a budget', () => {
    const c = render([], summary(0, 500_000), {}, 1);
    expect(c.totalOverBudget()).toBe(false);
    expect(c.totalUsed()).toBe('—');
    expect(c.countLabel()).toBe('1 expense');
  });

  it('loads category expenses on first open only', async () => {
    const c = render([category({ id: 'a' })], summary(1000, 500));
    c.toggle(row({ id: 'a' }));
    expect(c.isOpen(row({ id: 'a' }))).toBe(true);
    expect(loaded).toEqual(['a']);

    c.toggle(row({ id: 'a' }));
    expect(c.isOpen(row({ id: 'a' }))).toBe(false);
    expect(loaded).toEqual(['a']);
  });

  it('uses cached category expenses', () => {
    const c = render([category({ id: 'a' })], summary(1000, 500), { a: [] });
    c.toggle(row({ id: 'a' }));
    expect(loaded).toEqual([]);
  });

  it('opens one row at a time', () => {
    const c = render([category({ id: 'a' }), category({ id: 'b' })], summary(1000, 500));
    c.toggle(row({ id: 'a' }));
    c.toggle(row({ id: 'b' }));
    expect(c.isOpen(row({ id: 'a' }))).toBe(false);
    expect(c.isOpen(row({ id: 'b' }))).toBe(true);
  });

  it('distinguishes a loading row from an empty one', () => {
    const c = render([category({ id: 'a' })], summary(1000, 500), { a: [] });
    expect(c.rowExpenses(row({ id: 'a' }))).toEqual([]);
    expect(c.rowExpenses(row({ id: 'b' }))).toBeUndefined();
  });

  it('counts expenses per category', () => {
    const c = render([category({ id: 'a', expense_count: 4 })], summary(1000, 500));
    expect(c.rows()[0].count).toBe(4);
    expect(c.rowCount(row({ count: 4 }))).toBe('4 expenses');
  });

  it("shows 'no expenses' for a category with none", () => {
    const c = render([category({ id: 'a' })], summary(1000, 500));
    expect(c.rowCount(row({ count: 0 }))).toBe('no expenses');
    expect(c.rowCount(row({ count: 1 }))).toBe('1 expense');
  });

  it('counts uncategorised expenses on their own row', () => {
    const c = render([], summary(1000, 500, 6_100_000, 2));
    expect(c.rows()[0].count).toBe(2);
  });

  it('opens and loads the requested category', () => {
    const c = render(
      [category({ id: 's1', budgeted_amount: 1000 }), category({ id: 's2', name: 'Interior' })],
      summary(1000, 500),
      {},
      0,
      's2',
    );

    expect(c.isOpen(c.rows()[1])).toBe(true);
    expect(loaded).toContain('s2');
  });

  it('reports the archived expense count, and nothing when there are none', () => {
    expect(render([], { ...summary(1000, 500), archived_count: 2 }).archivedNote()).toBe(
      '2 archived expenses are excluded from the totals.',
    );
    expect(render([], { ...summary(1000, 500), archived_count: 1 }).archivedNote()).toContain(
      '1 archived expense is',
    );
    expect(render([], summary(1000, 500)).archivedNote()).toBe('');
  });

  it('tints each category and gives the Uncategorised row the warning tint', () => {
    const c = render([category({ id: 's1', budgeted_amount: 1000 })], summary(1000, 900, 400, 1));
    const [categorised, uncategorised] = c.rows();

    expect(c.tint(categorised)).toMatch(/^var[(]--tint-[1-5][)]$/);
    expect(c.tint(uncategorised)).toBe('var(--warn-surface)');
  });

  describe('load states', () => {
    afterEach(() => {
      budgetStatus.set('ready');
      expenseStatus.set('ready');
    });

    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';

    it('shows Loading instead of the empty state until both loads finish', () => {
      budgetStatus.set('ready');
      expenseStatus.set('loading');
      render();
      expect(text()).toContain('Loading…');
      expect(text()).not.toContain('No categories yet');

      expenseStatus.set('ready');
      fixture.detectChanges();
      expect(text()).toContain('No categories yet');
    });

    it('shows the load error instead of the empty state', () => {
      budgetStatus.set('error');
      render();
      const banner = (fixture.nativeElement as HTMLElement).querySelector('.banner.warn');
      expect(banner?.textContent).toContain('Could not load the budget.');
      expect(text()).not.toContain('No categories yet');
    });

    it('shows an expense load error', () => {
      expenseStatus.set('error');
      render();
      expect(text()).toContain('Could not load the expenses.');
    });

    it('shows an error for a category whose expenses failed to load', () => {
      const c = render([category({ id: 'a' })], summary(1000, 500));
      categoryStatuses['a'] = 'error';
      c.toggle(c.rows()[0]);
      fixture.detectChanges();
      expect(text()).toContain('Could not load the expenses for this category.');
      expect(text()).not.toContain('No expenses recorded');
    });
  });
});
