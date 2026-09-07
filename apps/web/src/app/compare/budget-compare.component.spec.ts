import { TestBed } from '@angular/core/testing';
import type { ExpenseRead, ProjectRead, CategoryRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { ExpenseService } from '../expenses/expense.service';
import { BudgetCompareComponent, type CompareRow } from './budget-compare.component';

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
  deleted_at: null,
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
    deleted_at: null,
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
    isUncategorized: false,
    ...over,
  };
}

describe('BudgetCompareComponent', () => {
  let loaded: string[];

  function render(
    categories: CategoryRead[] = [],
    spend: Record<string, unknown> | null = null,
    byCategory: Record<string, ExpenseRead[]> = {},
    expenseCount = 0,
    asked = '',
  ) {
    loaded = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [BudgetCompareComponent],
      providers: [
        {
          provide: BudgetService,
          useValue: { categories: () => categories, load: async () => undefined },
        },
        {
          provide: ExpenseService,
          useValue: {
            spend: () => spend,
            total: () => expenseCount,
            byCategory: () => byCategory,
            load: async () => undefined,
            loadForCategory: async (_p: string, categoryId: string) => {
              loaded.push(categoryId);
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(BudgetCompareComponent);
    fixture.componentRef.setInput('project', project);
    fixture.componentRef.setInput('openCategory', asked);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const spend = (budgeted: number, spent: number, uncategorized = 0, uncategorizedCount = 0) => ({
    budgeted_amount: budgeted,
    spent_amount: spent,
    uncategorized_amount: uncategorized,
    uncategorized_count: uncategorizedCount,
    variance_percent: null,
  });

  it('keeps every category, in the order the budget puts them', () => {
    const c = render(
      [
        category({ id: 'a', name: 'Groundwork' }),
        category({ id: 'b', name: 'Roof' }),
        category({ id: 'c', name: 'Untouched' }),
      ],
      spend(1000, 500),
    );
    expect(c.rows().map((r) => r.name)).toEqual(['Groundwork', 'Roof', 'Untouched']);
  });

  it('adds a line for spend that reached no category, and only when there is some', () => {
    const withUncategorized = render([category()], spend(1000, 500, 6_100_000));
    const last = withUncategorized.rows()[withUncategorized.rows().length - 1];
    expect(last.isUncategorized).toBe(true);
    expect(last.spent).toBe(6_100_000);

    expect(
      render([category()], spend(1000, 500))
        .rows()
        .some((r) => r.isUncategorized),
    ).toBe(false);
  });

  it('shows a dash rather than a figure where no budget was set', () => {
    const c = render([], spend(0, 500));
    expect(c.budgetCell(row({ budgeted: 0, spent: 5000 }))).toBe('—');
    expect(c.left(row({ budgeted: 0, spent: 5000 }))).toBe('—');
    expect(c.used(row({ budgeted: 0, spent: 5000 }))).toBe('—');
    expect(c.over(row({ budgeted: 0, spent: 5000 }))).toBe(false);
  });

  it('works out what is left, and lets it go negative when overspent', () => {
    const c = render([], spend(1000, 500));
    expect(c.left(row({ budgeted: 100_000, spent: 40_000 }))).toBe('600');
    expect(c.left(row({ budgeted: 100_000, spent: 140_000 }))).toBe('-400');
    expect(c.over(row({ budgeted: 100_000, spent: 140_000 }))).toBe(true);
  });

  it('reports the share of a budget used', () => {
    const c = render([], spend(1000, 500));
    expect(c.used(row({ budgeted: 1000, spent: 250 }))).toBe('25%');
    expect(c.used(row({ budgeted: 1000, spent: 1500 }))).toBe('150%');
  });

  it('totals from the project figures, not from the visible rows', () => {
    const c = render([category({ budgeted_amount: 100 })], spend(215_000_000, 232_630_000), {}, 15);
    expect(c.totalOver()).toBe(true);
    expect(c.totalLeft()).toBe(-17_630_000);
    expect(c.totalUsed()).toBe('108%');
    expect(c.countLabel()).toBe('15 expenses');
  });

  it('will not claim a total variance without a budget', () => {
    const c = render([], spend(0, 500_000), {}, 1);
    expect(c.totalOver()).toBe(false);
    expect(c.totalUsed()).toBe('—');
    expect(c.countLabel()).toBe('1 expense');
  });

  it('fetches a row on first open, and not again on reopen', async () => {
    const c = render([category({ id: 'a' })], spend(1000, 500));
    c.toggle(row({ id: 'a' }));
    expect(c.isOpen(row({ id: 'a' }))).toBe(true);
    expect(loaded).toEqual(['a']);

    c.toggle(row({ id: 'a' }));
    expect(c.isOpen(row({ id: 'a' }))).toBe(false);
    expect(loaded).toEqual(['a']);
  });

  it('does not refetch a row it already holds', () => {
    const c = render([category({ id: 'a' })], spend(1000, 500), { a: [] });
    c.toggle(row({ id: 'a' }));
    expect(loaded).toEqual([]);
  });

  it('opens one row at a time', () => {
    const c = render([category({ id: 'a' }), category({ id: 'b' })], spend(1000, 500));
    c.toggle(row({ id: 'a' }));
    c.toggle(row({ id: 'b' }));
    expect(c.isOpen(row({ id: 'a' }))).toBe(false);
    expect(c.isOpen(row({ id: 'b' }))).toBe(true);
  });

  it('tells a row that is still loading apart from one with nothing in it', () => {
    const c = render([category({ id: 'a' })], spend(1000, 500), { a: [] });
    expect(c.rowExpenses(row({ id: 'a' }))).toEqual([]);
    expect(c.rowExpenses(row({ id: 'b' }))).toBeUndefined();
  });

  it('carries the count of expenses filed to each category', () => {
    const c = render([category({ id: 'a', expense_count: 4 })], spend(1000, 500));
    expect(c.rows()[0].count).toBe(4);
    expect(c.rowCount(row({ count: 4 }))).toBe('4 expenses');
  });

  it('says so plainly when a category has none, rather than showing a nought', () => {
    const c = render([category({ id: 'a' })], spend(1000, 500));
    expect(c.rowCount(row({ count: 0 }))).toBe('no expenses');
    expect(c.rowCount(row({ count: 1 }))).toBe('1 expense');
  });

  it('counts the uncategorized spend on its own line', () => {
    const c = render([], spend(1000, 500, 6_100_000, 2));
    expect(c.rows()[0].count).toBe(2);
  });

  it('opens the category it was sent to, and reads what is filed to it', () => {
    const c = render(
      [category({ id: 's1', budgeted_amount: 1000 }), category({ id: 's2', name: 'Interior' })],
      spend(1000, 500),
      {},
      0,
      's2',
    );

    expect(c.isOpen(c.rows()[1])).toBe(true);
    expect(loaded).toContain('s2');
  });

  it('says how many expenses were taken off the record, and nothing when none were', () => {
    expect(render([], { ...spend(1000, 500), removed_count: 2 }).removedNote()).toBe(
      '2 expenses removed from this project and not counted.',
    );
    expect(render([], { ...spend(1000, 500), removed_count: 1 }).removedNote()).toContain(
      '1 expense removed',
    );
    expect(render([], spend(1000, 500)).removedNote()).toBe('');
  });

  it('gives each category its own colour and the uncategorized line a warning one', () => {
    const c = render([category({ id: 's1', budgeted_amount: 1000 })], spend(1000, 900, 400, 1));
    const [filed, uncategorized] = c.rows();

    expect(c.tint(filed)).toMatch(/^#[0-9a-f]{6}$/);
    expect(c.tint(uncategorized)).toBe('var(--warn-surface)');
  });
});
