import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type {
  HomeLatest,
  HomeMonths,
  HomeProject,
  HomeProjects,
  HomeSummary,
} from '@setout/api-client';
import { AuthService } from '../auth/auth.service';
import { DashboardComponent } from './dashboard.component';
import { HomeService } from './home.service';

function summary(over: Partial<HomeSummary> = {}): HomeSummary {
  return {
    project_count: 2,
    currencies: [{ currency_code: 'NGN', currency_exponent: 2, project_count: 2 }],
    currency_code: 'NGN',
    currency_exponent: 2,
    currency_project_count: 2,
    budgeted_amount: 592_830_000,
    spent_amount: 536_930_000,
    alerts: [],
    ...over,
  };
}

function months(over: Partial<HomeMonths> = {}): HomeMonths {
  return {
    currency_code: 'NGN',
    currency_exponent: 2,
    months: [],
    highest_month: null,
    ...over,
  };
}

function project(over: Partial<HomeProject> = {}): HomeProject {
  return {
    id: 'p1',
    name: 'Jacaranda Close, Ewuru',
    currency_code: 'NGN',
    currency_exponent: 2,
    budgeted_amount: 100_000_00,
    spent_amount: 40_000_00,
    expense_count: 9,
    ...over,
  };
}

describe('DashboardComponent', () => {
  let navigations: unknown[][];
  let selectedCurrencies: string[];

  function render(
    fixtures: {
      summary?: HomeSummary | null;
      months?: HomeMonths;
      projects?: HomeProjects;
      recent?: HomeLatest;
    } = {},
  ) {
    navigations = [];
    selectedCurrencies = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        {
          provide: HomeService,
          useValue: {
            summary: () => (fixtures.summary === undefined ? summary() : fixtures.summary),
            months: () => fixtures.months ?? months(),
            projects: () => fixtures.projects ?? { rows: [] },
            recent: () => fixtures.recent ?? { rows: [] },
            currency: () => 'NGN',
            loading: () => false,
            error: () => null,
            load: async () => undefined,
            selectCurrency: async (code: string) => void selectedCurrencies.push(code),
          },
        },
        { provide: AuthService, useValue: { user: () => ({ name: 'Vee' }) } },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigate = async (...args: unknown[]) => {
      navigations.push(args);
      return true;
    };
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('greets the signed-in account by name', () => {
    expect(render().greeting()).toBe('Welcome back, Vee');
  });

  it('summarises the project count and alerts in one line', () => {
    const component = render({
      summary: summary({
        alerts: [
          {
            kind: 'uncategorised',
            title: 'Uncategorised Expenses',
            detail: '1 expense across 2 projects',
            amount: 53_000_00,
            urgent: true,
          },
        ],
      }),
    });

    expect(component.summaryLine()).toBe('2 projects. 1 expense across 2 projects.');
  });

  it('states that nothing needs attention when there are no alerts', () => {
    expect(render().summaryLine()).toBe('2 projects. Nothing needs attention.');
  });

  it('computes the remaining amount and the share of budget used', () => {
    const component = render();

    expect(component.remaining()).toBe(55_900_000);
    expect(component.isOverBudget()).toBe(false);
    expect(component.remainingLabel()).toBe('Remaining');
    expect(component.usedLabel()).toBe('91%');
  });

  it('labels the figure Over budget by when spending exceeds the budget', () => {
    const component = render({ summary: summary({ budgeted_amount: 100, spent_amount: 150 }) });

    expect(component.isOverBudget()).toBe(true);
    expect(component.remainingLabel()).toBe('Over budget by');
    expect(component.remaining()).toBe(50);
  });

  it('notes a single currency when only one is in use', () => {
    const component = render();

    expect(component.hasMultipleCurrencies()).toBe(false);
    expect(component.currencyNote()).toBe('2 projects, all in NGN.');
  });

  it('shows a pill per currency and notes currencies are not combined', () => {
    const component = render({
      summary: summary({
        project_count: 3,
        currency_project_count: 2,
        currencies: [
          { currency_code: 'NGN', currency_exponent: 2, project_count: 2 },
          { currency_code: 'USD', currency_exponent: 2, project_count: 1 },
        ],
      }),
    });

    expect(component.hasMultipleCurrencies()).toBe(true);
    expect(component.currencies().map((choice) => component.pillLabel(choice))).toEqual([
      'NGN 2',
      'USD 1',
    ]);
    expect(component.isSelectedCurrency(component.currencies()[0])).toBe(true);
    expect(component.isSelectedCurrency(component.currencies()[1])).toBe(false);
    expect(component.currencyNote()).toContain('never combined');
  });

  it('selects the currency of the pressed pill', () => {
    const component = render();

    component.showCurrency({ currency_code: 'USD', currency_exponent: 2, project_count: 1 });

    expect(selectedCurrencies).toEqual(['USD']);
  });

  it('scales bars against the highest month and marks it', () => {
    const component = render({
      months: months({
        months: [
          { month: '2026-06', amount: 40_200_000 },
          { month: '2026-07', amount: 117_500_000 },
          { month: '2026-08', amount: 39_400_000 },
        ],
        highest_month: '2026-07',
      }),
    });

    const bars = component.bars();
    expect(bars.map((bar) => bar.label)).toEqual(['JUN', 'JUL', 'AUG']);
    expect(bars[1].height).toBe(100);
    expect(bars[1].highest).toBe(true);
    expect(bars[0].height).toBe(34);
    expect(component.highestMonthCaption()).toContain('Highest month: Jul');
    expect(component.highestMonthCaption()).toContain('include every project in NGN');
  });

  it('gives a zero month a minimum bar height', () => {
    const component = render({
      months: months({
        months: [
          { month: '2026-07', amount: 100_000 },
          { month: '2026-08', amount: 0 },
        ],
        highest_month: '2026-07',
      }),
    });

    expect(component.bars()[1].height).toBe(2);
  });

  it('formats each project in its own currency', () => {
    const component = render();
    const row = project({ currency_code: 'USD', currency_exponent: 2, spent_amount: 1_500_00 });

    expect(component.rowMoney(row, row.spent_amount)).toContain('1,500');
  });

  it('describes each project against its budget', () => {
    const component = render();

    expect(component.rowBudgetStatus(project())).toBe('₦60,000.00 remaining');
    expect(component.rowBudgetStatus(project({ spent_amount: 150_000_00 }))).toContain(
      'Over budget by',
    );
    expect(component.rowBudgetStatus(project({ budgeted_amount: 0 }))).toBe('No budget set');
  });

  it('fills a project bar to the spent share and caps the over-budget segment', () => {
    const component = render();
    const overBudget = project({ budgeted_amount: 100, spent_amount: 150 });

    expect(component.rowFill(project())).toBe(40);
    expect(component.rowFill(overBudget)).toBe(100);
    expect(component.rowOverBudgetPercent(overBudget)).toBe(0);
    expect(component.rowOverBudgetPercent(project())).toBe(0);
  });

  it('shows the category of a recent expense, or Uncategorised', () => {
    const component = render();
    const row = {
      id: 'e1',
      project_id: 'p1',
      project_name: 'Jacaranda Close',
      currency_code: 'NGN',
      currency_exponent: 2,
      category_name: 'Foundation',
      description: 'Cement',
      amount: 100,
      spent_on: '2026-08-14',
    };

    expect(component.expenseLocation(row)).toBe('Jacaranda Close · Foundation');
    expect(component.expenseLocation({ ...row, category_name: null })).toBe(
      'Jacaranda Close · Uncategorised',
    );
  });

  it('navigates to a project, its expenses tab and the project list', () => {
    const component = render();

    component.open(project());
    component.newExpense(project());
    component.openProjects();

    expect(navigations.map((call) => call[0])).toEqual([
      ['/projects', 'p1'],
      ['/projects', 'p1', 'expense'],
      ['/projects'],
    ]);
  });

  it('routes each alert to its tab', () => {
    const component = render({ projects: { rows: [project()] } });

    component.openAlert({ kind: 'uncategorised', title: '', detail: '', amount: 0, urgent: true });
    component.openAlert({ kind: 'deliveries', title: '', detail: '', amount: 0, urgent: false });

    expect(navigations.map((call) => call[0])).toEqual([
      ['/projects', 'p1', 'table'],
      ['/projects', 'p1', 'deliveries'],
    ]);
  });

  it('shows no amount on an alert with a zero amount', () => {
    const component = render();

    expect(
      component.alertMoney({
        kind: 'uncategorised',
        title: '',
        detail: '',
        amount: 0,
        urgent: true,
      }),
    ).toBe('');
  });

  it('prompts to create a project when there are none', () => {
    const component = render({
      summary: summary({
        project_count: 0,
        currencies: [],
        currency_code: null,
        budgeted_amount: 0,
      }),
    });

    expect(component.summaryLine()).toContain('No projects yet');
    expect(component.currencyNote()).toBe('');
  });
});
