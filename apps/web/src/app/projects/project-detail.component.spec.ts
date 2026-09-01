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
  planned_amount: 0,
  spent_amount: 0,
  status: 'active',
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

describe('ProjectDetailComponent', () => {
  let fixture: ComponentFixture<ProjectDetailComponent>;

  function render(tab?: string) {
    const projects = { get: async () => project, error: () => null };
    const expenses = {
      expenses: () => [],
      spend: () => null,
      total: () => 0,
      page: () => 1,
      months: () => null,
      byMonth: () => ({}),
      byScope: () => ({}),
      saving: () => false,
      error: () => null,
      load: async () => undefined,
      goTo: async () => undefined,
      loadMonths: async () => undefined,
      loadForMonth: async () => undefined,
      loadForScope: async () => undefined,
      add: async () => null,
      remove: async () => undefined,
    };
    const budget = {
      scopes: () => [],
      items: () => ({}),
      presetNames: () => [],
      plannedTotal: () => 0,
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
      spend: async () => null,
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

  it('opens on the dashboard by default', () => {
    expect(render().activeTab()).toBe('dashboard');
  });

  it('opens straight onto the tab named in the address', () => {
    expect(render('expense').activeTab()).toBe('expense');
  });

  it('opens the deliveries tab now that it is built', () => {
    expect(render('deliveries').activeTab()).toBe('deliveries');
  });

  it('ignores a tab name that means nothing', () => {
    expect(render('nonsense').activeTab()).toBe('dashboard');
  });

  it('has the expense tab enabled', () => {
    const component = render();
    expect(component.tabs.find((tab) => tab.key === 'expense')?.ready).toBe(true);
  });

  it('names the tab that is open', () => {
    expect(render('expense').activeTabName()).toBe('Expenses');
  });

  async function body(tab?: string): Promise<HTMLElement> {
    const component = render(tab);
    await component.load();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows one tab at a time, and no placeholder beneath it', async () => {
    const months = await body('months');
    expect(months.querySelectorAll('.page > *').length).toBe(1);
    expect(months.querySelector('app-months')).toBeTruthy();
    expect(months.querySelector('app-project-dashboard')).toBeNull();

    const dashboard = await body();
    expect(dashboard.querySelectorAll('.page > *').length).toBe(1);
    expect(dashboard.querySelector('app-project-dashboard')).toBeTruthy();
  });

  it('puts the chosen tab in the address, so a refresh lands back on it', () => {
    const component = render();
    const router = TestBed.inject(Router);
    const went: unknown[][] = [];
    router.navigate = async (commands: unknown[]) => {
      went.push(commands);
      return true;
    };

    component.selectTab('table');

    expect(component.activeTab()).toBe('table');
    expect(went[0]).toEqual(['/projects', 'p1', 'table']);
  });

  it('sends the dashboard to its own address rather than a bare one', () => {
    const component = render('table');
    const router = TestBed.inject(Router);
    const went: unknown[][] = [];
    router.navigate = async (commands: unknown[]) => {
      went.push(commands);
      return true;
    };

    component.selectTab('dashboard');

    expect(went[0]).toEqual(['/projects', 'p1', 'dashboard']);
  });

  it('names the project and the open tab in the page title', async () => {
    const component = render('table');
    await component.load();
    fixture.detectChanges();

    expect(TestBed.inject(Title).getTitle()).toBe(
      'Jacaranda Close, Ewuru · Budget vs Spend · Setout',
    );
  });

  it('follows the tab as it changes', async () => {
    const component = render();
    await component.load();
    fixture.detectChanges();
    const title = TestBed.inject(Title);
    expect(title.getTitle()).toBe('Jacaranda Close, Ewuru · Dashboard · Setout');

    // Where the address goes is covered above. This is only about the title.
    TestBed.inject(Router).navigate = async () => true;
    component.selectTab('agreements');
    fixture.detectChanges();
    expect(title.getTitle()).toBe('Jacaranda Close, Ewuru · Agreements · Setout');
  });

  it('sends a pressed scope to the table, naming it in the address', () => {
    const component = render();
    const router = TestBed.inject(Router);
    const went: unknown[][] = [];
    router.navigate = async (commands: unknown[], extras?: unknown) => {
      went.push([commands, extras]);
      return true;
    };

    component.openScope('s1');

    expect(component.activeTab()).toBe('table');
    expect(went[0][0]).toEqual(['/projects', 'p1', 'table']);
    expect(went[0][1]).toEqual({ queryParams: { scope: 's1' } });
  });
});
