import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ProjectRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { ProjectService } from './project.service';
import { ProjectsComponent } from './projects.component';

function project(overrides: Partial<ProjectRead> = {}): ProjectRead {
  return {
    id: 'p1',
    name: 'Jacaranda Close, Ewuru',
    currency_code: 'NGN',
    currency_exponent: 2,
    status: 'active',
    land_id: null,
    land_name: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    budgeted_amount: 0,
    spent_amount: 0,
    archived_at: null,
    ...overrides,
  };
}

describe('ProjectsComponent', () => {
  let archived: string[];
  let updates: unknown[];

  function render(projects: ProjectRead[], openNew = '') {
    archived = [];
    updates = [];
    const service = {
      projects: () => projects,
      currencies: () => [],
      summary: () => null,
      hasProjects: () => projects.length > 0,
      hasMore: () => false,
      total: () => projects.length,
      loading: () => false,
      error: () => null,
      load: async () => undefined,
      loadMore: async () => undefined,
      loadCurrencies: async () => undefined,
      create: async () => project(),
      update: async (...args: unknown[]) => void updates.push(args),
      archive: async (id: string) => void archived.push(id),
      restore: async () => undefined,
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectsComponent],
      providers: [
        provideRouter([]),
        { provide: ProjectService, useValue: service },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(ProjectsComponent);
    fixture.componentRef.setInput('add', openNew);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('asks for confirmation before closing', () => {
    const component = render([project()]);
    component.requestConfirmation('p1', 'close');
    expect(component.isPending('p1', 'close')).toBe(true);
    expect(component.isPending('p1', 'archive')).toBe(false);
  });

  it('clears the confirmation when cancelled', () => {
    const component = render([project()]);
    component.requestConfirmation('p1', 'archive');
    component.cancelPending();
    expect(component.isPending('p1', 'close')).toBe(false);
  });

  it('closes only after the confirmation', async () => {
    const component = render([project()]);
    component.requestConfirmation('p1', 'close');
    await component.close('p1');
    expect(updates[0]).toEqual(['p1', { status: 'closed' }]);
    expect(component.isPending('p1', 'close')).toBe(false);
  });

  it('reopens a closed project', async () => {
    const component = render([project({ status: 'closed' })]);
    await component.reopen('p1');
    expect(updates[0]).toEqual(['p1', { status: 'active' }]);
  });

  it('clears a pending confirmation when the archived toggle changes', async () => {
    const component = render([project()]);
    component.requestConfirmation('p1', 'archive');
    await component.setIncludeArchived(true);
    expect(component.isPending('p1', 'archive')).toBe(false);
    expect(component.includeArchived()).toBe(true);
  });

  it('reads initials from the first two words', () => {
    const component = render([project()]);
    expect(component.initials('Jacaranda Close, Ewuru')).toBe('JC');
    expect(component.initials('Owode')).toBe('O');
  });

  it('labels the variance Remaining while under budget', () => {
    const component = render([project()]);
    expect(component.varianceLabel(project())).toBe('Remaining');
  });

  it('shows the budgeted amount once it is set', () => {
    const component = render([project({ budgeted_amount: 215000000 })]);
    expect(component.budgetedLabel(project({ budgeted_amount: 215000000 }))).toContain('2,150,000');
  });

  it('shows Not set when there is no budget', () => {
    const component = render([project()]);
    expect(component.budgetedLabel(project())).toBe('Not set');
    expect(component.statusLine(project())).toContain('No budget set yet');
  });

  it('shows the spent amount', () => {
    const component = render([project()]);
    expect(component.spentLabel(project({ spent_amount: 232630000 }))).toContain('2,326,300');
  });

  it('shows the remaining amount while under budget', () => {
    const component = render([project()]);
    const row = project({ budgeted_amount: 1000_00, spent_amount: 400_00 });
    expect(component.varianceLabel(row)).toBe('Remaining');
    expect(component.isOverBudget(row)).toBe(false);
    expect(component.variance(row)).toContain('600');
  });

  it('shows the amount over budget once spent exceeds budgeted', () => {
    const component = render([project()]);
    const row = project({ budgeted_amount: 215000000, spent_amount: 232630000 });
    expect(component.varianceLabel(row)).toBe('Over budget by');
    expect(component.isOverBudget(row)).toBe(true);
    expect(component.variance(row)).toContain('176,300');
  });

  it('shows no variance when no budget is set', () => {
    const component = render([project()]);
    const row = project({ budgeted_amount: 0, spent_amount: 50_000 });
    expect(component.variance(row)).toBe('—');
    expect(component.isOverBudget(row)).toBe(false);
  });

  it('fills the meter in proportion and caps it at full', () => {
    const component = render([project()]);
    expect(component.usedPercent(project({ budgeted_amount: 1000, spent_amount: 250 }))).toBe(25);
    expect(component.usedPercent(project({ budgeted_amount: 1000, spent_amount: 5000 }))).toBe(100);
    expect(component.usedPercent(project({ budgeted_amount: 0, spent_amount: 500 }))).toBe(0);
  });

  it('shows the overspend as a separate meter segment', () => {
    const component = render([project()]);
    expect(
      component.overBudgetPercent(project({ budgeted_amount: 1000, spent_amount: 1200 })),
    ).toBe(0);
    expect(component.overBudgetPercent(project({ budgeted_amount: 1000, spent_amount: 900 }))).toBe(
      0,
    );
  });
  it('opens the new project form when the add input is set', () => {
    expect(render([project()]).showForm()).toBe(false);
    expect(render([project()], '1').showForm()).toBe(true);
  });
});

describe('ProjectsComponent navigation', () => {
  let navigations: unknown[][];

  function render() {
    navigations = [];
    const service = {
      projects: () => [project()],
      currencies: () => [],
      summary: () => null,
      hasProjects: () => true,
      hasMore: () => false,
      total: () => 1,
      loading: () => false,
      error: () => null,
      load: async () => undefined,
      loadMore: async () => undefined,
      loadCurrencies: async () => undefined,
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectsComponent],
      providers: [
        { provide: Router, useValue: { navigate: (...args: unknown[]) => navigations.push(args) } },
        { provide: ProjectService, useValue: service },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(ProjectsComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('opens a project on its default tab', () => {
    render().open('p1');
    expect(navigations[0][0]).toEqual(['/projects', 'p1']);
    expect(navigations[0][1]).toBeUndefined();
  });

  it('opens a project on the expenses tab', () => {
    render().addExpense('p1');
    expect(navigations[0][0]).toEqual(['/projects', 'p1', 'expense']);
  });

  it('opens the import page with no project selected', () => {
    render().importWorkbook();
    expect(navigations[0][0]).toEqual(['/import']);
  });
});
