import { TestBed } from '@angular/core/testing';
import type { ProjectRead, CategoryRead } from '@setout/api-client';
import { AgreementService } from '../agreements/agreement.service';
import { BudgetService } from '../budget/budget.service';
import { DeliveryService } from '../deliveries/delivery.service';
import { ExpenseService } from '../expenses/expense.service';
import { ProjectDashboardComponent } from './project-dashboard.component';

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

describe('ProjectDashboardComponent', () => {
  function render(
    summary: Record<string, unknown> | null,
    categories: CategoryRead[] = [],
    expenseCount = 0,
    agreements: unknown[] = [],
    balances: unknown[] = [],
    outstanding: { description: string; vendor_name: string | null; amount: number }[] = [],
  ) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectDashboardComponent],
      providers: [
        {
          provide: AgreementService,
          useValue: {
            agreements: () => agreements,
            balances: () => balances,
            load: async () => undefined,
            loadBalances: async () => undefined,
          },
        },
        {
          provide: DeliveryService,
          useValue: {
            outstanding: () => ({
              rows: outstanding,
              total: outstanding.length,
              outstandingAmount: outstanding.reduce((sum, row) => sum + row.amount, 0),
            }),
            loadOutstanding: async () => undefined,
          },
        },
        {
          provide: BudgetService,
          useValue: { categories: () => categories, load: async () => undefined },
        },
        {
          provide: ExpenseService,
          useValue: {
            summary: () => summary,
            total: () => expenseCount,
            load: async () => undefined,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectDashboardComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const summary = (
    budgeted: number,
    spent: number,
    uncategorised = 0,
    variance: number | null = null,
  ) => ({
    budgeted_amount: budgeted,
    spent_amount: spent,
    uncategorised_amount: uncategorised,
    variance_percent: variance,
  });

  it('shows Remaining when under budget', () => {
    const c = render(summary(215_000_000, 100_000_000, 0, -53.49));
    expect(c.isOverBudget()).toBe(false);
    expect(c.varianceLabel()).toBe('Remaining');
    expect(c.varianceAmount()).toBe(115_000_000);
  });

  it('shows Over budget by and the variance when over budget', () => {
    const c = render(summary(215_000_000, 232_630_000, 6_100_000, 8.2));
    expect(c.isOverBudget()).toBe(true);
    expect(c.varianceLabel()).toBe('Over budget by');
    expect(c.varianceAmount()).toBe(17_630_000);
    expect(c.varianceNote()).toContain('8.2% over budget');
  });

  it('shows no variance without a budget', () => {
    const c = render(summary(0, 50_000_000));
    expect(c.varianceAmount()).toBeNull();
    expect(c.isOverBudget()).toBe(false);
    expect(c.usedLabel()).toBe('—');
    expect(c.varianceNote()).toContain('No budget set');
  });

  it('fills the meter proportionally, capped at 100', () => {
    expect(render(summary(1000, 250)).usedPercent()).toBe(25);
    expect(render(summary(1000, 5000)).usedPercent()).toBe(100);
    expect(render(summary(0, 500)).usedPercent()).toBe(0);
  });

  it('counts expenses and notes the uncategorised amount', () => {
    const c = render(summary(1000, 500, 200), [], 3);
    expect(c.spentNote()).toContain('3 expenses');
    expect(c.spentNote()).toContain('uncategorised');
  });

  it('omits categories with nothing budgeted or spent', () => {
    const c = render(summary(1000, 500), [
      category({ id: 's1', budgeted_amount: 1000 }),
      category({ id: 's2', name: 'Untouched' }),
    ]);
    expect(c.rows().map((s) => s.id)).toEqual(['s1']);
  });

  it('sorts the largest overspend first', () => {
    const c = render(summary(1000, 900), [
      category({ id: 'under', budgeted_amount: 500, spent_amount: 100 }),
      category({ id: 'over', budgeted_amount: 100, spent_amount: 800 }),
    ]);
    expect(c.rows()[0].id).toBe('over');
  });

  it('flags a category that is over budget', () => {
    const c = render(summary(1000, 500));
    expect(c.categoryIsOverBudget(category({ budgeted_amount: 100, spent_amount: 800 }))).toBe(
      true,
    );
    expect(c.categoryIsOverBudget(category({ budgeted_amount: 800, spent_amount: 100 }))).toBe(
      false,
    );
    expect(c.categoryIsOverBudget(category({ budgeted_amount: 0, spent_amount: 800 }))).toBe(false);
  });

  it('shows spent against budgeted per category, or No budget set', () => {
    const c = render(summary(1000, 500));
    expect(c.categoryNote(category({ budgeted_amount: 100_000, spent_amount: 50_000 }))).toBe(
      '500 / 1,000',
    );
    expect(c.categoryNote(category({ budgeted_amount: 0, spent_amount: 50_000 }))).toBe(
      'No budget set',
    );
  });

  it('shows no alerts when nothing needs attention', () => {
    expect(render(summary(1000, 500)).alerts()).toEqual([]);
  });

  it('flags uncategorised expenses', () => {
    const alerts = render(summary(1000, 500, 5_300_000)).alerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0].title).toBe('Uncategorised expenses');
    expect(alerts[0].amount).toBe('53,000');
    expect(alerts[0].urgent).toBe(true);
  });

  it('flags agreement balances and ignores settled agreements', () => {
    const alerts = render(summary(1000, 500), [], 0, [
      {
        id: 'a1',
        vendor_name: 'Kunle Bricklaying',
        description: 'Block work',
        balance_amount: 3_500_000,
      },
      { id: 'a2', vendor_name: 'Paid Up Co', description: 'Roofing', balance_amount: 0 },
    ]).alerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0].title).toBe('Agreement balance');
    expect(alerts[0].detail).toBe('Kunle Bricklaying · block work');
    expect(alerts[0].amount).toBe('35,000');
  });

  it('flags a negative person balance and ignores a positive one', () => {
    const alerts = render(
      summary(1000, 500),
      [],
      0,
      [],
      [
        { person_id: 'pe1', person_name: 'Aunty Ngozi', balance_amount: -3_250_000 },
        { person_id: 'pe2', person_name: 'Holder', balance_amount: 5_000 },
      ],
    ).alerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0].title).toBe('Owed to Aunty Ngozi');
    expect(alerts[0].amount).toBe('32,500');
  });

  it('names the single outstanding delivery', () => {
    const alerts = render(
      summary(1000, 500),
      [],
      0,
      [],
      [],
      [{ description: '17 bags of cement', vendor_name: 'Corner Depot Cement', amount: 7_650_000 }],
    ).alerts();

    const outstanding = alerts.find((a) => a.title === 'Outstanding deliveries');
    expect(outstanding?.detail).toBe('17 bags of cement · Corner Depot Cement');
    expect(outstanding?.amount).toBe('76,500');
    expect(outstanding?.urgent).toBe(false);
  });

  it('counts outstanding deliveries when there are several', () => {
    const alerts = render(
      summary(1000, 500),
      [],
      0,
      [],
      [],
      [
        { description: '17 bags of cement', vendor_name: 'Corner Depot', amount: 7_650_000 },
        { description: 'Roofing sheets', vendor_name: 'Bright Star', amount: 2_350_000 },
      ],
    ).alerts();

    const outstanding = alerts.find((a) => a.title === 'Outstanding deliveries');
    expect(outstanding?.detail).toBe('2 paid items outstanding');
    expect(outstanding?.amount).toBe('100,000');
  });

  it('notes a missing vendor on an outstanding delivery', () => {
    const alerts = render(
      summary(1000, 500),
      [],
      0,
      [],
      [],
      [{ description: '17 bags of cement', vendor_name: null, amount: 7_650_000 }],
    ).alerts();

    expect(alerts[0].detail).toBe('17 bags of cement · vendor not recorded');
  });

  it('shows no delivery alert when none are outstanding', () => {
    const alerts = render(summary(1000, 500)).alerts();
    expect(alerts.some((a) => a.title === 'Outstanding deliveries')).toBe(false);
  });

  it('routes each alert to its tab', () => {
    const alerts = render(
      summary(1000, 500, 5_300_000),
      [],
      0,
      [
        {
          id: 'a1',
          vendor_name: 'Kunle Bricklaying',
          description: 'Block work',
          balance_amount: 3_500_000,
        },
      ],
      [{ person_id: 'pe1', person_name: 'Aunty Ngozi', balance_amount: -3_250_000 }],
      [{ description: '17 bags of cement', vendor_name: 'Corner Depot', amount: 7_650_000 }],
    ).alerts();

    const tabFor = (title: string) => alerts.find((a) => a.title.startsWith(title))?.tab;
    expect(tabFor('Uncategorised expenses')).toBe('table');
    expect(tabFor('Agreement balance')).toBe('agreements');
    expect(tabFor('Outstanding deliveries')).toBe('deliveries');
    expect(tabFor('Owed to')).toBe('agreements');
  });

  it('draws every bar to a shared scale', () => {
    const c = render(summary(3000, 1500), [
      category({ id: 'big', budgeted_amount: 2000, spent_amount: 1000 }),
      category({ id: 'small', budgeted_amount: 500, spent_amount: 500 }),
    ]);

    const big = c.rows().find((row) => row.id === 'big')!;
    const small = c.rows().find((row) => row.id === 'small')!;

    expect(c.scale()).toBe(2000);
    expect(c.fillPercent(big)).toBe(50);
    expect(c.fillPercent(small)).toBe(25);
  });

  it('positions the budget mark and the over-budget segment', () => {
    const c = render(summary(1000, 1500), [
      category({ id: 's1', budgeted_amount: 1000, spent_amount: 1500 }),
    ]);
    const row = c.rows()[0];

    expect(c.budgetMarkPercent(row)).toBe(66.66666666666666);
    expect(c.fillPercent(row)).toBe(66.66666666666666);
    expect(c.categoryOverPercent(row)).toBe(33.33333333333333);
  });

  it('omits the budget mark without a budget', () => {
    const c = render(summary(0, 500), [category({ id: 's1', spent_amount: 500 })]);
    const row = c.rows()[0];

    expect(c.budgetMarkPercent(row)).toBeNull();
    expect(c.fillPercent(row)).toBe(100);
    expect(c.categoryOverPercent(row)).toBe(0);
  });

  it('tints a category consistently', () => {
    const c = render(summary(1000, 500), [category({ id: 's1', budgeted_amount: 1000 })]);
    const row = c.rows()[0];

    expect(c.tint(row)).toBe(c.tint(row));
    expect(c.tint(row)).toMatch(/^#[0-9a-f]{6}$/);
    expect(c.tintEdge(row)).not.toBe(c.tint(row));
  });

  it('emits openCategory with the category id', () => {
    const c = render(summary(1000, 500), [category({ id: 's1', budgeted_amount: 1000 })]);
    const emitted: string[] = [];
    c.openCategory.subscribe((id: string) => emitted.push(id));

    c.openCategory.emit('s1');

    expect(emitted).toEqual(['s1']);
  });
});
