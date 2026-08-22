import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Api } from '@setout/api-client';
import type { ProjectRead, ScopeRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { ToastService } from '../toast.service';
import { ProjectSettingsComponent } from './project-settings.component';
import { ProjectService } from './project.service';

const project: ProjectRead = {
  id: 'p1',
  name: 'Jacaranda Close, Ewuru',
  currency_code: 'NGN',
  currency_exponent: 2,
  status: 'active',
  notes: 'A three bedroom build, part way up.',
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

describe('ProjectSettingsComponent', () => {
  let navigations: unknown[][];
  let saved: unknown[];
  let renamed: unknown[];
  let removed: string[];
  let putBack: string[];
  let toasts: { message: string; type?: string }[];
  let changes: number;
  let saveResult: ProjectRead | null;
  let scopeResult: boolean;

  function render(scopes: ScopeRead[] = [], budgetError: string | null = null) {
    navigations = [];
    saved = [];
    renamed = [];
    removed = [];
    putBack = [];
    toasts = [];
    changes = 0;
    saveResult = project;
    scopeResult = true;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectSettingsComponent],
      providers: [
        { provide: Router, useValue: { navigate: (...args: unknown[]) => navigations.push(args) } },
        { provide: Api, useValue: { rootUrl: '' } },
        {
          provide: ProjectService,
          useValue: {
            error: () => 'Could not save that project.',
            update: async (id: string, body: unknown) => {
              saved.push({ id, body });
              return saveResult;
            },
          },
        },
        {
          provide: BudgetService,
          useValue: {
            scopes: () => scopes,
            error: () => budgetError,
            load: async () => undefined,
            renameScope: async (_p: string, id: string, name: string) => {
              renamed.push({ id, name });
              return scopeResult;
            },
            removeScope: async (_p: string, id: string) => {
              removed.push(id);
              return scopeResult;
            },
            putScopeBack: async (_p: string, id: string) => {
              putBack.push(id);
              return scopeResult;
            },
          },
        },
        {
          provide: ToastService,
          useValue: {
            show: (message: string, type?: string) => void toasts.push({ message, type }),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ProjectSettingsComponent);
    fixture.componentRef.setInput('project', project);
    fixture.componentInstance.changed.subscribe(() => (changes += 1));
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  async function ready(scopes: ScopeRead[] = [], budgetError: string | null = null) {
    const component = render(scopes, budgetError);
    await Promise.resolve();
    return component;
  }

  it('points the export at this project alone', async () => {
    expect((await ready()).exportUrl()).toBe('/api/projects/p1/export');
  });

  it('sends the import screen the project it was opened from', async () => {
    (await ready()).importSheet();
    expect(navigations[0][0]).toEqual(['/import']);
    expect(navigations[0][1]).toEqual({ queryParams: { project: 'p1' } });
  });

  it('starts on what the project already says', async () => {
    const component = await ready();
    expect(component.name()).toBe('Jacaranda Close, Ewuru');
    expect(component.status()).toBe('active');
    expect(component.notes()).toBe('A three bedroom build, part way up.');
    expect(component.dirty()).toBe(false);
    expect(component.canSave()).toBe(false);
  });

  it('will not save until something changed', async () => {
    const component = await ready();
    component.name.set('Jacaranda Close');
    expect(component.dirty()).toBe(true);
    expect(component.canSave()).toBe(true);
  });

  it('refuses to save a project with no name', async () => {
    const component = await ready();
    component.name.set('   ');
    expect(component.canSave()).toBe(false);
  });

  it('sends the name, the status and the notes, trimmed', async () => {
    const component = await ready();
    component.name.set('  Jacaranda Close  ');
    component.status.set('completed');
    component.notes.set('  Roof on  ');

    await component.save();

    expect(saved).toEqual([
      {
        id: 'p1',
        body: { name: 'Jacaranda Close', status: 'completed', notes: 'Roof on' },
      },
    ]);
    expect(changes).toBe(1);
    expect(toasts[0].message).toBe('Project saved.');
  });

  it('sends nothing rather than an empty string when the notes are cleared', async () => {
    const component = await ready();
    component.notes.set('');

    await component.save();

    expect((saved[0] as { body: { notes: string | null } }).body.notes).toBeNull();
  });

  it('says so and stays put when the save is refused', async () => {
    const component = await ready();
    saveResult = null;
    component.name.set('Something else');

    await component.save();

    expect(changes).toBe(0);
    expect(toasts[0]).toEqual({ message: 'Could not save that project.', type: 'error' });
  });

  it('reads the shape of the currency off the formatter that prints it', async () => {
    const component = await ready();
    expect(component.shape().decimals).toBe('2');
    expect(component.shape().position).toBe('before');
    expect(component.shape().separators).toBe(',   .');
    expect(component.preview()).toContain('48,893.00');
  });

  it('counts what was spent against each scope', async () => {
    const component = await ready();
    expect(component.countLabel(scope({ expense_count: 0 }))).toBe('no expenses');
    expect(component.countLabel(scope({ expense_count: 1 }))).toBe('1 expense');
    expect(component.countLabel(scope({ expense_count: 4 }))).toBe('4 expenses');
  });

  it('only offers to remove a scope that nothing was spent on', async () => {
    const component = await ready();
    expect(component.canRemove(scope({ expense_count: 0 }))).toBe(true);
    expect(component.canRemove(scope({ expense_count: 1 }))).toBe(false);
  });

  it('gives each branch its own tint, and a child the tint of its parent', async () => {
    const component = await ready([
      scope({ id: 'a' }),
      scope({ id: 'b', sort_order: 1 }),
      scope({ id: 'b1', parent_id: 'b' }),
    ]);
    expect(component.tint(scope({ id: 'a' }))).toBe('tint-1');
    expect(component.tint(scope({ id: 'b' }))).toBe('tint-2');
    expect(component.tint(scope({ id: 'b1', parent_id: 'b' }))).toBe('tint-2');
  });

  it('renames a scope and closes the box', async () => {
    const component = await ready([scope({ id: 'a', name: 'Interior work' })]);
    component.startRename(scope({ id: 'a', name: 'Interior work' }));
    expect(component.newName()).toBe('Interior work');

    component.newName.set('Inside work');
    await component.rename(scope({ id: 'a', name: 'Interior work' }));

    expect(renamed).toEqual([{ id: 'a', name: 'Inside work' }]);
    expect(component.renaming()).toBeNull();
  });

  it('does not go to the server for a name that did not change', async () => {
    const component = await ready();
    component.startRename(scope({ name: 'Interior work' }));
    await component.rename(scope({ name: 'Interior work' }));

    expect(renamed).toEqual([]);
    expect(component.renaming()).toBeNull();
  });

  it('passes on why the server would not take the rename', async () => {
    const component = await ready([], 'A scope with that name already exists');
    scopeResult = false;
    component.newName.set('Interior work');

    await component.rename(scope({ name: 'Concrete foundation' }));

    expect(toasts[0]).toEqual({
      message: 'A scope with that name already exists',
      type: 'error',
    });
  });

  it('asks before removing a scope, and one at a time', async () => {
    const component = await ready();
    component.ask(scope({ id: 'a' }));
    expect(component.removing()).toBe('a');

    component.startRename(scope({ id: 'b' }));
    expect(component.removing()).toBeNull();
    expect(component.renaming()).toBe('b');

    component.ask(scope({ id: 'a' }));
    expect(component.renaming()).toBeNull();
  });

  it('removes a scope once asked', async () => {
    const component = await ready();
    component.ask(scope({ id: 'a' }));

    await component.remove(scope({ id: 'a', name: 'Landscaping' }));

    expect(removed).toEqual(['a']);
    expect(component.removing()).toBeNull();
    expect(toasts[0].message).toBe('Landscaping removed.');
  });

  it('passes on the reason a scope with expenses cannot go', async () => {
    const component = await ready([], 'A scope with expenses cannot be deleted, only renamed');
    scopeResult = false;

    await component.remove(scope({ name: 'Interior work' }));

    expect(toasts[0]).toEqual({
      message: 'A scope with expenses cannot be deleted, only renamed',
      type: 'error',
    });
  });
});
