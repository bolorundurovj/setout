import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import type { ProjectRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { ExpenseService } from '../expenses/expense.service';
import { ItemService } from '../items/item.service';
import { PersonService } from '../people/person.service';
import { ToastService } from '../toast.service';
import { VendorService } from '../vendors/vendor.service';
import { ProjectDetailComponent } from './project-detail.component';
import { ProjectService } from './project.service';

const project: ProjectRead = {
  id: 'p1',
  name: 'Jacaranda Close, Ewuru',
  currency_code: 'NGN',
  currency_exponent: 2,
  land_id: null,
  land_name: null,
  budgeted_amount: 0,
  spent_amount: 0,
  status: 'active',
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  archived_at: null,
};

describe('ProjectDetailComponent', () => {
  let fixture: ComponentFixture<ProjectDetailComponent>;

  function render(tab?: string) {
    const projects = { get: async () => project, error: () => null };
    const expenses = {
      expenses: () => [],
      summary: () => null,
      total: () => 0,
      page: () => 1,
      months: () => null,
      byMonth: () => ({}),
      byCategory: () => ({}),
      saving: () => false,
      error: () => null,
      load: async () => undefined,
      goTo: async () => undefined,
      loadSummary: async () => undefined,
      loadMonths: async () => undefined,
      loadForMonth: async () => undefined,
      loadForCategory: async () => undefined,
      add: async () => null,
      archive: async () => undefined,
    };
    const budget = {
      categories: () => [],
      items: () => ({}),
      presetNames: () => [],
      budgetedTotal: () => 0,
      error: () => null,
      loading: () => false,
      load: async () => undefined,
      loadItems: async () => undefined,
      loadPresets: async () => undefined,
    };

    const emptyList = {
      items: () => [],
      vendors: () => [],
      people: () => [],
      choices: () => [],
      loadChoices: async () => undefined,
      total: () => 0,
      page: () => 1,
      loading: () => false,
      saving: () => false,
      error: () => null,
      load: async () => undefined,
      add: async () => null,
      lastPrice: async () => null,
      prices: async () => null,
      expenseSummary: async () => null,
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ProjectService, useValue: projects },
        { provide: ExpenseService, useValue: expenses },
        { provide: BudgetService, useValue: budget },
        { provide: ItemService, useValue: emptyList },
        { provide: VendorService, useValue: emptyList },
        { provide: PersonService, useValue: emptyList },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    fixture = TestBed.createComponent(ProjectDetailComponent);
    fixture.componentRef.setInput('id', 'p1');
    if (tab !== undefined) {
      fixture.componentRef.setInput('tab', tab);
    }
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('reads the expense filters from the URL', () => {
    const component = render('expense');
    fixture.componentRef.setInput('q', 'cement');
    fixture.componentRef.setInput('vendor', 'v1');
    fixture.componentRef.setInput('from', '2026-03-01');
    fixture.componentRef.setInput('sort', 'largest');
    fixture.detectChanges();

    expect(component.expenseFilters()).toEqual({
      search: 'cement',
      vendorId: 'v1',
      paidById: '',
      itemId: '',
      from: '2026-03-01',
      to: '',
      sort: 'largest',
    });
  });

  it('sorts by most recent when the URL has no sort', () => {
    const component = render('expense');
    expect(component.expenseFilters().sort).toBe('recent');
  });

  it('opens the dashboard tab by default', () => {
    expect(render().activeTab()).toBe('dashboard');
  });

  it('opens the tab named in the URL', () => {
    expect(render('expense').activeTab()).toBe('expense');
  });

  it('opens the deliveries tab', () => {
    expect(render('deliveries').activeTab()).toBe('deliveries');
  });

  it('falls back to the dashboard tab for an unknown tab name', () => {
    expect(render('nonsense').activeTab()).toBe('dashboard');
  });

  it('includes the expenses tab', () => {
    const component = render();
    expect(component.tabs.some((tab) => tab.key === 'expense')).toBe(true);
  });

  it('names the open tab', () => {
    expect(render('expense').activeTabName()).toBe('Expenses');
  });

  async function body(tab?: string): Promise<HTMLElement> {
    const component = render(tab);
    await component.load();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders only the open tab', async () => {
    const months = await body('months');
    expect(months.querySelectorAll('.page > *').length).toBe(1);
    expect(months.querySelector('app-months')).toBeTruthy();
    expect(months.querySelector('app-project-dashboard')).toBeNull();

    const dashboard = await body();
    expect(dashboard.querySelectorAll('.page > *').length).toBe(1);
    expect(dashboard.querySelector('app-project-dashboard')).toBeTruthy();
  });

  it('writes the selected tab to the URL', () => {
    const component = render();
    const router = TestBed.inject(Router);
    const navigations: unknown[][] = [];
    router.navigate = async (commands: unknown[]) => {
      navigations.push(commands);
      return true;
    };

    component.selectTab('table');

    expect(component.activeTab()).toBe('table');
    expect(navigations[0]).toEqual(['/projects', 'p1', 'table']);
  });

  it('navigates to the dashboard tab path explicitly', () => {
    const component = render('table');
    const router = TestBed.inject(Router);
    const navigations: unknown[][] = [];
    router.navigate = async (commands: unknown[]) => {
      navigations.push(commands);
      return true;
    };

    component.selectTab('dashboard');

    expect(navigations[0]).toEqual(['/projects', 'p1', 'dashboard']);
  });

  it('shows the project and open tab in the page title', async () => {
    const component = render('table');
    await component.load();
    fixture.detectChanges();

    expect(TestBed.inject(Title).getTitle()).toBe(
      'Jacaranda Close, Ewuru · Budget vs Spent · Setout',
    );
  });

  it('updates the page title when the tab changes', async () => {
    const component = render();
    await component.load();
    fixture.detectChanges();
    const title = TestBed.inject(Title);
    expect(title.getTitle()).toBe('Jacaranda Close, Ewuru · Dashboard · Setout');

    // Stub navigate so only the title effect runs.
    TestBed.inject(Router).navigate = async () => true;
    component.selectTab('agreements');
    fixture.detectChanges();
    expect(title.getTitle()).toBe('Jacaranda Close, Ewuru · Agreements · Setout');
  });

  it('opens the selected category in the Budget vs Spent tab', () => {
    const component = render();
    const router = TestBed.inject(Router);
    const navigations: unknown[][] = [];
    router.navigate = async (commands: unknown[], extras?: unknown) => {
      navigations.push([commands, extras]);
      return true;
    };

    component.openCategory('s1');

    expect(component.activeTab()).toBe('table');
    expect(navigations[0][0]).toEqual(['/projects', 'p1', 'table']);
    expect(navigations[0][1]).toEqual({ queryParams: { category: 's1' } });
  });
});
