import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { ProjectRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { ProjectService } from './project.service';
import { ProjectsComponent } from './projects.component';

function project(over: Partial<ProjectRead> = {}): ProjectRead {
  return {
    id: 'p1',
    name: 'Jacaranda Close, Ewuru',
    currency_code: 'NGN',
    currency_exponent: 2,
    status: 'active',
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    planned_amount: 0,
    spent_amount: 0,
    deleted_at: null,
    ...over,
  };
}

describe('ProjectsComponent', () => {
  let removed: string[];
  let updates: unknown[];

  function render(projects: ProjectRead[], openNew = '') {
    removed = [];
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
      remove: async (id: string) => void removed.push(id),
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

  it('asks before archiving', () => {
    const component = render([project()]);
    component.ask('p1', 'archive');
    expect(component.isPending('p1', 'archive')).toBe(true);
    expect(component.isPending('p1', 'delete')).toBe(false);
  });

  it('drops the prompt when cancelled', () => {
    const component = render([project()]);
    component.ask('p1', 'delete');
    component.cancelPending();
    expect(component.isPending('p1', 'delete')).toBe(false);
  });

  it('archives only after the prompt is confirmed', async () => {
    const component = render([project()]);
    component.ask('p1', 'archive');
    await component.archive('p1');
    expect(updates[0]).toEqual(['p1', { status: 'archived' }]);
    expect(component.isPending('p1', 'archive')).toBe(false);
  });

  it('puts an archived project back to active', async () => {
    const component = render([project({ status: 'archived' })]);
    await component.unarchive('p1');
    expect(updates[0]).toEqual(['p1', { status: 'active' }]);
  });

  it('clears a pending prompt when the deleted filter changes', async () => {
    const component = render([project()]);
    component.ask('p1', 'delete');
    await component.setIncludeDeleted(true);
    expect(component.isPending('p1', 'delete')).toBe(false);
    expect(component.includeDeleted()).toBe(true);
  });

  it('reads initials from the first two words', () => {
    const component = render([project()]);
    expect(component.initials('Jacaranda Close, Ewuru')).toBe('JC');
    expect(component.initials('Owode')).toBe('O');
  });

  it('says what is left rather than variance', () => {
    const component = render([project()]);
    expect(component.varianceLabel(project())).toBe('Left');
  });

  it('shows the planned budget once it is set', () => {
    const component = render([project({ planned_amount: 215000000 })]);
    expect(component.budget(project({ planned_amount: 215000000 }))).toContain('2,150,000');
  });

  it('says the budget is not set when there is none', () => {
    const component = render([project()]);
    expect(component.budget(project())).toBe('Not set');
    expect(component.statusLine(project())).toContain('No budget set yet');
  });

  it('shows what has been spent', () => {
    const c = render([project()]);
    expect(c.spent(project({ spent_amount: 232630000 }))).toContain('2,326,300');
  });

  it('says what is left while under budget', () => {
    const c = render([project()]);
    const p = project({ planned_amount: 1000_00, spent_amount: 400_00 });
    expect(c.varianceLabel(p)).toBe('Left');
    expect(c.isOver(p)).toBe(false);
    expect(c.variance(p)).toContain('600');
  });

  it('says how far over once spend passes the budget', () => {
    const c = render([project()]);
    const p = project({ planned_amount: 215000000, spent_amount: 232630000 });
    expect(c.varianceLabel(p)).toBe('Over by');
    expect(c.isOver(p)).toBe(true);
    expect(c.variance(p)).toContain('176,300');
  });

  it('will not claim anything is left when no budget is set', () => {
    const c = render([project()]);
    const p = project({ planned_amount: 0, spent_amount: 50_000 });
    expect(c.variance(p)).toBe('—');
    expect(c.isOver(p)).toBe(false);
  });

  it('fills the meter in proportion, and never past full', () => {
    const c = render([project()]);
    expect(c.usedPercent(project({ planned_amount: 1000, spent_amount: 250 }))).toBe(25);
    expect(c.usedPercent(project({ planned_amount: 1000, spent_amount: 5000 }))).toBe(100);
    expect(c.usedPercent(project({ planned_amount: 0, spent_amount: 500 }))).toBe(0);
  });

  it('shows the overspend as its own segment', () => {
    const c = render([project()]);
    expect(c.overPercent(project({ planned_amount: 1000, spent_amount: 1200 }))).toBe(0);
    expect(c.overPercent(project({ planned_amount: 1000, spent_amount: 900 }))).toBe(0);
  });
  it('opens the new project form when sent there to make one', () => {
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

  it('opens a project on its dashboard', () => {
    render().open('p1');
    expect(navigations[0][0]).toEqual(['/projects', 'p1']);
    expect(navigations[0][1]).toBeUndefined();
  });

  it('opens a project straight onto the expense tab', () => {
    render().addExpense('p1');
    expect(navigations[0][0]).toEqual(['/projects', 'p1', 'expense']);
  });

  it('goes to the import screen with no project chosen for it', () => {
    render().importSheet();
    expect(navigations[0][0]).toEqual(['/import']);
  });
});
