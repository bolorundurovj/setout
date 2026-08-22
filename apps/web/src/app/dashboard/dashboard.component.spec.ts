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
    projects: 2,
    currencies: [{ currency_code: 'NGN', currency_exponent: 2, projects: 2 }],
    currency_code: 'NGN',
    currency_exponent: 2,
    currency_projects: 2,
    planned_amount: 592_830_000,
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
    busiest_month: null,
    ...over,
  };
}

function project(over: Partial<HomeProject> = {}): HomeProject {
  return {
    id: 'p1',
    name: 'Jacaranda Close, Ewuru',
    currency_code: 'NGN',
    currency_exponent: 2,
    planned_amount: 100_000_00,
    spent_amount: 40_000_00,
    expense_count: 9,
    ...over,
  };
}

describe('DashboardComponent', () => {
  let navigations: unknown[][];
  let shown: string[];

  function render(
    found: {
      summary?: HomeSummary | null;
      months?: HomeMonths;
      projects?: HomeProjects;
      latest?: HomeLatest;
    } = {},
  ) {
    navigations = [];
    shown = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        {
          provide: HomeService,
          useValue: {
            summary: () => (found.summary === undefined ? summary() : found.summary),
            months: () => found.months ?? months(),
            projects: () => found.projects ?? { rows: [] },
            latest: () => found.latest ?? { rows: [] },
            currency: () => 'NGN',
            loading: () => false,
            error: () => null,
            load: async () => undefined,
            show: async (code: string) => void shown.push(code),
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

  it('greets whoever is signed in', () => {
    expect(render().greeting()).toBe('Welcome back, Vee');
  });

  it('says what is open and what is wrong in one line', () => {
    const component = render({
      summary: summary({
        alerts: [
          {
            kind: 'unfiled',
            title: 'Spend with no scope',
            detail: '1 receipt across 2 projects',
            amount: 53_000_00,
            urgent: true,
          },
        ],
      }),
    });

    expect(component.standing()).toBe('2 projects open. 1 receipt across 2 projects.');
  });

  it('says so plainly when nothing is wrong', () => {
    expect(render().standing()).toBe('2 projects open. Nothing needs attention.');
  });

  it('works out what is left and how much of the plan is used', () => {
    const component = render();

    expect(component.left()).toBe(55_900_000);
    expect(component.over()).toBe(false);
    expect(component.leftLabel()).toBe('Left');
    expect(component.usedLabel()).toBe('91%');
  });

  it('says over by rather than left once the plan is passed', () => {
    const component = render({ summary: summary({ planned_amount: 100, spent_amount: 150 }) });

    expect(component.over()).toBe(true);
    expect(component.leftLabel()).toBe('Over by');
    expect(component.left()).toBe(50);
  });

  it('says the figures are totalled straight when one currency is in use', () => {
    const component = render();

    expect(component.split()).toBe(false);
    expect(component.currencyNote()).toBe('2 projects, all in NGN — totalled straight');
  });

  it('offers a pill per currency and says the figures stay apart', () => {
    const component = render({
      summary: summary({
        projects: 3,
        currency_projects: 2,
        currencies: [
          { currency_code: 'NGN', currency_exponent: 2, projects: 2 },
          { currency_code: 'USD', currency_exponent: 2, projects: 1 },
        ],
      }),
    });

    expect(component.split()).toBe(true);
    expect(component.choices().map((choice) => component.pillLabel(choice))).toEqual([
      'NGN 2',
      'USD 1',
    ]);
    expect(component.showingPill(component.choices()[0])).toBe(true);
    expect(component.showingPill(component.choices()[1])).toBe(false);
    expect(component.currencyNote()).toContain('never added together');
  });

  it('asks for the currency whose pill was pressed', () => {
    const component = render();

    component.showCurrency({ currency_code: 'USD', currency_exponent: 2, projects: 1 });

    expect(shown).toEqual(['USD']);
  });

  it('scales every bar against the tallest month and marks the heaviest', () => {
    const component = render({
      months: months({
        months: [
          { month: '2026-06', amount: 40_200_000 },
          { month: '2026-07', amount: 117_500_000 },
          { month: '2026-08', amount: 39_400_000 },
        ],
        busiest_month: '2026-07',
      }),
    });

    const bars = component.bars();
    expect(bars.map((bar) => bar.label)).toEqual(['JUN', 'JUL', 'AUG']);
    expect(bars[1].height).toBe(100);
    expect(bars[1].busiest).toBe(true);
    expect(bars[0].height).toBe(34);
    expect(component.heaviest()).toContain('Heaviest month was Jul');
    expect(component.heaviest()).toContain('kept in NGN');
  });

  it('gives a month with nothing in it a sliver rather than no bar at all', () => {
    const component = render({
      months: months({
        months: [
          { month: '2026-07', amount: 100_000 },
          { month: '2026-08', amount: 0 },
        ],
        busiest_month: '2026-07',
      }),
    });

    expect(component.bars()[1].height).toBe(2);
  });

  it('reads each project in its own currency', () => {
    const component = render();
    const row = project({ currency_code: 'USD', currency_exponent: 2, spent_amount: 1_500_00 });

    expect(component.rowMoney(row, row.spent_amount)).toContain('1,500');
  });

  it('says how a project stands against its own budget', () => {
    const component = render();

    expect(component.rowStanding(project())).toBe('₦60,000.00 left');
    expect(component.rowStanding(project({ spent_amount: 150_000_00 }))).toContain('Over by');
    expect(component.rowStanding(project({ planned_amount: 0 }))).toBe('No budget set');
  });

  it('fills a project bar to the spend and marks the overspend past it', () => {
    const component = render();
    const over = project({ planned_amount: 100, spent_amount: 150 });

    expect(component.rowFill(project())).toBe(40);
    expect(component.rowFill(over)).toBe(100);
    expect(component.rowOverFill(over)).toBe(0);
    expect(component.rowOverFill(project())).toBe(0);
  });

  it('names the scope a recent expense was filed to, or says it was not', () => {
    const component = render();
    const row = {
      id: 'e1',
      project_id: 'p1',
      project_name: 'Jacaranda Close',
      currency_code: 'NGN',
      currency_exponent: 2,
      scope_name: 'Foundation',
      description: 'Cement',
      amount: 100,
      spent_on: '2026-08-14',
    };

    expect(component.where(row)).toBe('Jacaranda Close · Foundation');
    expect(component.where({ ...row, scope_name: null })).toBe('Jacaranda Close · Unfiled');
  });

  it('opens a project, its expense tab, and the whole list', () => {
    const component = render();

    component.open(project());
    component.addExpense(project());
    component.allProjects();

    expect(navigations.map((call) => call[0])).toEqual([
      ['/projects', 'p1'],
      ['/projects', 'p1', 'expense'],
      ['/projects'],
    ]);
  });

  it('sends each alert to the tab that answers it', () => {
    const component = render({ projects: { rows: [project()] } });

    component.openAlert({ kind: 'unfiled', title: '', detail: '', amount: 0, urgent: true });
    component.openAlert({ kind: 'deliveries', title: '', detail: '', amount: 0, urgent: false });

    expect(navigations.map((call) => call[0])).toEqual([
      ['/projects', 'p1', 'table'],
      ['/projects', 'p1', 'deliveries'],
    ]);
  });

  it('shows no figure on an alert that cannot carry one', () => {
    const component = render();

    expect(
      component.alertMoney({ kind: 'unfiled', title: '', detail: '', amount: 0, urgent: true }),
    ).toBe('');
  });

  it('says what to do first when there are no projects', () => {
    const component = render({
      summary: summary({ projects: 0, currencies: [], currency_code: null, planned_amount: 0 }),
    });

    expect(component.standing()).toContain('No projects yet');
    expect(component.currencyNote()).toBe('');
  });
});
