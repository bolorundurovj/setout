import { TestBed } from '@angular/core/testing';
import type { ExpenseRead, ProjectMonths, ProjectRead, CategoryRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { ExpenseService } from '../expenses/expense.service';
import { MonthsComponent, type MonthRow } from './months.component';

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

function expense(over: Partial<ExpenseRead> = {}): ExpenseRead {
  return {
    id: 'e1',
    project_id: 'p1',
    category_id: null,
    item_id: null,
    vendor_id: null,
    agreement_id: null,
    paid_by_id: null,
    spent_on: '2026-06-11',
    description: '1 truck of sand',
    quantity: null,
    unit_rate: null,
    amount: 5_000_000,
    attachment_count: 0,
    cost_type: null,
    notes: null,
    created_at: '2026-06-11T00:00:00Z',
    updated_at: '2026-06-11T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

function months(over: Partial<ProjectMonths> = {}): ProjectMonths {
  return {
    project_id: 'p1',
    currency_code: 'NGN',
    currency_exponent: 2,
    total_amount: 0,
    months: [],
    busiest_month: null,
    ...over,
  };
}

const row = (over: Partial<MonthRow> = {}): MonthRow => ({
  month: '2026-06',
  label: 'Jun 2026',
  amount: 0,
  count: 0,
  barWidth: '0%',
  parts: [],
  ...over,
});

describe('MonthsComponent', () => {
  let loaded: string[];

  function render(
    payload: ProjectMonths | null = null,
    categories: CategoryRead[] = [],
    byMonth: Record<string, ExpenseRead[]> = {},
    error: string | null = null,
  ) {
    loaded = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MonthsComponent],
      providers: [
        {
          provide: BudgetService,
          useValue: { categories: () => categories, load: async () => undefined },
        },
        {
          provide: ExpenseService,
          useValue: {
            months: () => payload,
            byMonth: () => byMonth,
            error: () => error,
            loadMonths: async () => undefined,
            loadForMonth: async (_p: string, month: string) => {
              loaded.push(month);
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(MonthsComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('has no rows before anything is loaded', () => {
    const c = render(null);
    expect(c.rows()).toEqual([]);
    expect(c.total()).toBe(0);
  });

  it('names a month by its short month and year', () => {
    expect(render().label('2026-06')).toBe('Jun 2026');
    expect(render().label('2027-01')).toBe('Jan 2027');
  });

  it('draws the heaviest month full width and the rest against it', () => {
    const c = render(
      months({
        months: [
          { month: '2026-06', amount: 1_000_000, expense_count: 1, categories: [] },
          { month: '2026-07', amount: 4_000_000, expense_count: 2, categories: [] },
        ],
        total_amount: 5_000_000,
      }),
    );
    expect(c.rows().map((r) => r.barWidth)).toEqual(['25%', '100%']);
    expect(c.total()).toBe(5_000_000);
  });

  it('sizes each segment against its own month, not the whole project', () => {
    const c = render(
      months({
        months: [
          {
            month: '2026-06',
            amount: 1_000_000,
            expense_count: 2,
            categories: [
              { category_id: 'a', name: 'Groundwork', amount: 750_000 },
              { category_id: null, name: 'Uncategorized', amount: 250_000 },
            ],
          },
          { month: '2026-07', amount: 4_000_000, expense_count: 1, categories: [] },
        ],
      }),
      [category({ id: 'a', name: 'Groundwork' })],
    );
    expect(c.rows()[0].parts.map((p) => p.width)).toEqual(['75%', '25%']);
  });

  it('hands out a tint per top level category, in budget order', () => {
    const c = render(
      months({
        months: [
          {
            month: '2026-06',
            amount: 300,
            expense_count: 3,
            categories: [
              { category_id: 'a', name: 'Groundwork', amount: 100 },
              { category_id: 'b', name: 'Roof', amount: 100 },
              { category_id: null, name: 'Uncategorized', amount: 100 },
            ],
          },
        ],
      }),
      [category({ id: 'a' }), category({ id: 'b', sort_order: 1 })],
    );
    expect(c.rows()[0].parts.map((p) => p.tint)).toEqual([
      'tint-1',
      'tint-2',
      'tint-uncategorized',
    ]);
  });

  it('gives a category it has never heard of the uncategorized tint rather than nothing', () => {
    const c = render(
      months({
        months: [
          {
            month: '2026-06',
            amount: 100,
            expense_count: 1,
            categories: [{ category_id: 'gone', name: 'Vanished', amount: 100 }],
          },
        ],
      }),
    );
    expect(c.rows()[0].parts[0].tint).toBe('tint-uncategorized');
  });

  it('counts the expenses in a month, singular when there is one', () => {
    const c = render();
    expect(c.countLabel(row({ count: 4 }))).toBe('4 expenses');
    expect(c.countLabel(row({ count: 1 }))).toBe('1 expense');
    expect(c.countLabel(row({ count: 0 }))).toBe('0 expenses');
  });

  it('names the heaviest month in the note', () => {
    const c = render(
      months({
        months: [
          { month: '2026-06', amount: 1_000_000, expense_count: 1, categories: [] },
          { month: '2026-07', amount: 4_000_000, expense_count: 1, categories: [] },
        ],
        busiest_month: '2026-07',
      }),
    );
    expect(c.note()).toContain('Highest month: Jul 2026');
    expect(c.note()).toContain('40,000');
  });

  it('says nothing is recorded rather than naming a month that is not there', () => {
    expect(render().note()).toContain('Nothing recorded yet');
  });

  it('fetches a month on first open, and not again on reopen', () => {
    const c = render(
      months({ months: [{ month: '2026-06', amount: 100, expense_count: 1, categories: [] }] }),
    );
    c.toggle(row());
    expect(c.isOpen(row())).toBe(true);
    expect(loaded).toEqual(['2026-06']);

    c.toggle(row());
    expect(c.isOpen(row())).toBe(false);
    expect(loaded).toEqual(['2026-06']);
  });

  it('does not refetch a month it already holds', () => {
    const c = render(months(), [], { '2026-06': [] });
    c.toggle(row());
    expect(loaded).toEqual([]);
  });

  it('opens one month at a time', () => {
    const c = render();
    c.toggle(row({ month: '2026-06' }));
    c.toggle(row({ month: '2026-07' }));
    expect(c.isOpen(row({ month: '2026-06' }))).toBe(false);
    expect(c.isOpen(row({ month: '2026-07' }))).toBe(true);
  });

  it('tells a month that is still loading apart from an empty one', () => {
    const c = render(months(), [], { '2026-06': [] });
    expect(c.monthExpenses(row({ month: '2026-06' }))).toEqual([]);
    expect(c.monthExpenses(row({ month: '2026-07' }))).toBeUndefined();
  });

  it('names the category an expense was filed to, and says so when it was not', () => {
    const c = render(months(), [category({ id: 'a', name: 'Groundwork' })]);
    expect(c.categoryName(expense({ category_id: 'a' }))).toBe('Groundwork');
    expect(c.categoryName(expense({ category_id: null }))).toBe('Uncategorized');
    expect(c.categoryName(expense({ category_id: 'gone' }))).toBe('Uncategorized');
  });

  it('drops the symbol from figures in the table and keeps it in the note', () => {
    const c = render();
    expect(c.bare(2_326_300)).toBe('23,263');
    expect(c.money(2_326_300)).toContain('23,263');
  });
});
