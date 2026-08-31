import { TestBed } from '@angular/core/testing';
import type { ProjectRead, ScopeRead } from '@setout/api-client';
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
  planned_amount: 0,
  spent_amount: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

function scope(over: Partial<ScopeRead> = {}): ScopeRead {
  return {
    id: 's1',
    project_id: 'p1',
    code: null,
    name: 'Concrete foundation',
    parent_id: null,
    sort_order: 0,
    is_group: false,
    planned_amount: 0,
    own_planned_amount: 0,
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

describe('ProjectDashboardComponent', () => {
  function render(
    spend: Record<string, unknown> | null,
    scopes: ScopeRead[] = [],
    expenseCount = 0,
    agreements: unknown[] = [],
    balances: unknown[] = [],
    owed: { description: string; vendor_name: string | null; amount: number }[] = [],
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
            waiting: () => ({
              rows: owed,
              total: owed.length,
              owed: owed.reduce((sum, row) => sum + row.amount, 0),
            }),
            loadWaiting: async () => undefined,
          },
        },
        {
          provide: BudgetService,
          useValue: { scopes: () => scopes, load: async () => undefined },
        },
        {
          provide: ExpenseService,
          useValue: {
            spend: () => spend,
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

  const spend = (planned: number, spent: number, unfiled = 0, variance: number | null = null) => ({
    planned_amount: planned,
    spent_amount: spent,
    unfiled_amount: unfiled,
    variance_percent: variance,
  });

  it('says what is left while under the plan', () => {
    const c = render(spend(215_000_000, 100_000_000, 0, -53.49));
    expect(c.isOver()).toBe(false);
    expect(c.varianceLabel()).toBe('Left');
    expect(c.varianceAmount()).toBe(115_000_000);
  });

  it('says how far over once the plan is passed', () => {
    // The seeded project: planned 2,150,000, spent 2,326,300.
    const c = render(spend(215_000_000, 232_630_000, 6_100_000, 8.2));
    expect(c.isOver()).toBe(true);
    expect(c.varianceLabel()).toBe('Over by');
    expect(c.varianceAmount()).toBe(17_630_000);
    expect(c.varianceNote()).toContain('8.2% past the plan');
  });

  it('will not claim a variance without a budget', () => {
    const c = render(spend(0, 50_000_000));
    expect(c.varianceAmount()).toBeNull();
    expect(c.isOver()).toBe(false);
    expect(c.usedLabel()).toBe('—');
    expect(c.varianceNote()).toContain('No budget set');
  });

  it('fills the meter in proportion and never past full', () => {
    expect(render(spend(1000, 250)).usedPercent()).toBe(25);
    expect(render(spend(1000, 5000)).usedPercent()).toBe(100);
    expect(render(spend(0, 500)).usedPercent()).toBe(0);
  });

  it('counts the expenses and names the unfiled spend', () => {
    const c = render(spend(1000, 500, 200), [], 3);
    expect(c.spentNote()).toContain('3 expenses');
    expect(c.spentNote()).toContain('unfiled');
  });

  it('leaves out scopes with nothing planned and nothing spent', () => {
    const c = render(spend(1000, 500), [
      scope({ id: 's1', planned_amount: 1000 }),
      scope({ id: 's2', name: 'Untouched' }),
    ]);
    expect(c.rows().map((s) => s.id)).toEqual(['s1']);
  });

  it('puts the worst overspend first', () => {
    const c = render(spend(1000, 900), [
      scope({ id: 'under', planned_amount: 500, spent_amount: 100 }),
      scope({ id: 'over', planned_amount: 100, spent_amount: 800 }),
    ]);
    expect(c.rows()[0].id).toBe('over');
  });

  it('marks a scope that has gone past its budget', () => {
    const c = render(spend(1000, 500));
    expect(c.scopeOver(scope({ planned_amount: 100, spent_amount: 800 }))).toBe(true);
    expect(c.scopeOver(scope({ planned_amount: 800, spent_amount: 100 }))).toBe(false);
    expect(c.scopeOver(scope({ planned_amount: 0, spent_amount: 800 }))).toBe(false);
  });

  it('shows spend against budget on a scope, and says when there is none', () => {
    const c = render(spend(1000, 500));
    expect(c.scopeNote(scope({ planned_amount: 100_000, spent_amount: 50_000 }))).toBe(
      '500 / 1,000',
    );
    expect(c.scopeNote(scope({ planned_amount: 0, spent_amount: 50_000 }))).toBe('No budget set');
  });

  it('says nothing needs attention when nothing does', () => {
    expect(render(spend(1000, 500)).alerts()).toEqual([]);
  });

  it('flags spend that is filed to no scope', () => {
    const alerts = render(spend(1000, 500, 5_300_000)).alerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0].title).toBe('Spend with nothing recorded');
    expect(alerts[0].amount).toBe('53,000');
    expect(alerts[0].urgent).toBe(true);
  });

  it('flags what is left on an agreement, and ignores settled ones', () => {
    const alerts = render(spend(1000, 500), [], 0, [
      {
        id: 'a1',
        vendor_name: 'Kunle Bricklaying',
        description: 'Block work',
        balance_amount: 3_500_000,
      },
      { id: 'a2', vendor_name: 'Paid Up Co', description: 'Roofing', balance_amount: 0 },
    ]).alerts();
    expect(alerts.length).toBe(1);
    expect(alerts[0].title).toBe('Left on an agreement');
    expect(alerts[0].detail).toBe('Kunle Bricklaying · block work');
    expect(alerts[0].amount).toBe('35,000');
  });

  it('flags someone who is out of pocket, not someone holding money', () => {
    const alerts = render(
      spend(1000, 500),
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

  it('names the one thing a vendor still owes', () => {
    const alerts = render(
      spend(1000, 500),
      [],
      0,
      [],
      [],
      [{ description: '17 bags of cement', vendor_name: 'Corner Depot Cement', amount: 7_650_000 }],
    ).alerts();

    const owed = alerts.find((a) => a.title === 'Paid for, not delivered');
    expect(owed?.detail).toBe('17 bags of cement · Corner Depot Cement');
    expect(owed?.amount).toBe('76,500');
    expect(owed?.urgent).toBe(false);
  });

  it('counts them once there is more than one', () => {
    const alerts = render(
      spend(1000, 500),
      [],
      0,
      [],
      [],
      [
        { description: '17 bags of cement', vendor_name: 'Corner Depot', amount: 7_650_000 },
        { description: 'Roofing sheets', vendor_name: 'Bright Star', amount: 2_350_000 },
      ],
    ).alerts();

    const owed = alerts.find((a) => a.title === 'Paid for, not delivered');
    expect(owed?.detail).toBe('2 things owed by vendors');
    expect(owed?.amount).toBe('100,000');
  });

  it('says so when nobody recorded who owes it', () => {
    const alerts = render(
      spend(1000, 500),
      [],
      0,
      [],
      [],
      [{ description: '17 bags of cement', vendor_name: null, amount: 7_650_000 }],
    ).alerts();

    expect(alerts[0].detail).toBe('17 bags of cement · vendor not recorded');
  });

  it('says nothing about deliveries when none are waiting', () => {
    const alerts = render(spend(1000, 500)).alerts();
    expect(alerts.some((a) => a.title === 'Paid for, not delivered')).toBe(false);
  });

  it('points each alert at the tab that answers it', () => {
    const alerts = render(
      spend(1000, 500, 5_300_000),
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
    expect(tabFor('Spend with nothing')).toBe('table');
    expect(tabFor('Left on an agreement')).toBe('agreements');
    expect(tabFor('Paid for, not delivered')).toBe('deliveries');
    expect(tabFor('Owed to')).toBe('agreements');
  });

  it('draws every bar to one scale, so two scopes can be compared', () => {
    const c = render(spend(3000, 1500), [
      scope({ id: 'big', planned_amount: 2000, spent_amount: 1000 }),
      scope({ id: 'small', planned_amount: 500, spent_amount: 500 }),
    ]);

    const big = c.rows().find((row) => row.id === 'big')!;
    const small = c.rows().find((row) => row.id === 'small')!;

    expect(c.scale()).toBe(2000);
    expect(c.fillPercent(big)).toBe(50);
    expect(c.fillPercent(small)).toBe(25);
  });

  it('marks where the budget sits and draws the overspend past it', () => {
    const c = render(spend(1000, 1500), [
      scope({ id: 's1', planned_amount: 1000, spent_amount: 1500 }),
    ]);
    const row = c.rows()[0];

    expect(c.budgetMarkPercent(row)).toBe(66.66666666666666);
    expect(c.fillPercent(row)).toBe(66.66666666666666);
    expect(c.scopeOverPercent(row)).toBe(33.33333333333333);
  });

  it('has no budget mark where no budget was set', () => {
    const c = render(spend(0, 500), [scope({ id: 's1', spent_amount: 500 })]);
    const row = c.rows()[0];

    expect(c.budgetMarkPercent(row)).toBeNull();
    expect(c.fillPercent(row)).toBe(100);
    expect(c.scopeOverPercent(row)).toBe(0);
  });

  it('gives a scope the same colour wherever it is drawn', () => {
    const c = render(spend(1000, 500), [scope({ id: 's1', planned_amount: 1000 })]);
    const row = c.rows()[0];

    expect(c.tint(row)).toBe(c.tint(row));
    expect(c.tint(row)).toMatch(/^#[0-9a-f]{6}$/);
    expect(c.tintEdge(row)).not.toBe(c.tint(row));
  });

  it('sends a pressed scope to the table rather than just the tab', () => {
    const c = render(spend(1000, 500), [scope({ id: 's1', planned_amount: 1000 })]);
    const asked: string[] = [];
    c.openScope.subscribe((id: string) => asked.push(id));

    c.openScope.emit('s1');

    expect(asked).toEqual(['s1']);
  });
});
