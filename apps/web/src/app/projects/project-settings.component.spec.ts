import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Api } from '@setout/api-client';
import type { ProjectRead, CategoryRead } from '@setout/api-client';
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
  land_id: null,
  land_name: null,
  notes: 'A three bedroom build, part way up.',
  budgeted_amount: 0,
  spent_amount: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  archived_at: null,
};

function category(overrides: Partial<CategoryRead> = {}): CategoryRead {
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
    ...overrides,
  };
}

describe('ProjectSettingsComponent', () => {
  let navigations: unknown[][];
  let saved: unknown[];
  let renamed: unknown[];
  let archived: string[];
  let restored: string[];
  let toasts: { message: string; type?: string }[];
  let changes: number;
  let saveResult: ProjectRead | null;
  let categoryResult: boolean;

  function render(categories: CategoryRead[] = [], budgetError: string | null = null) {
    navigations = [];
    saved = [];
    renamed = [];
    archived = [];
    restored = [];
    toasts = [];
    changes = 0;
    saveResult = project;
    categoryResult = true;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProjectSettingsComponent],
      providers: [
        { provide: Router, useValue: { navigate: (...args: unknown[]) => navigations.push(args) } },
        { provide: Api, useValue: { rootUrl: '' } },
        {
          provide: ProjectService,
          useValue: {
            error: () => 'Could not save the project.',
            update: async (id: string, body: unknown) => {
              saved.push({ id, body });
              return saveResult;
            },
          },
        },
        {
          provide: BudgetService,
          useValue: {
            categories: () => categories,
            error: () => budgetError,
            load: async () => undefined,
            renameCategory: async (_p: string, id: string, name: string) => {
              renamed.push({ id, name });
              return categoryResult;
            },
            archiveCategory: async (_p: string, id: string) => {
              archived.push(id);
              return categoryResult;
            },
            restoreCategory: async (_p: string, id: string) => {
              restored.push(id);
              return categoryResult;
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

  async function ready(categories: CategoryRead[] = [], budgetError: string | null = null) {
    const component = render(categories, budgetError);
    await Promise.resolve();
    return component;
  }

  it('builds the export URL for this project', async () => {
    expect((await ready()).exportUrl()).toBe('/api/projects/p1/export');
  });

  it('opens the import page with this project selected', async () => {
    (await ready()).importWorkbook();
    expect(navigations[0][0]).toEqual(['/import']);
    expect(navigations[0][1]).toEqual({ queryParams: { project: 'p1' } });
  });

  it('initialises the fields from the project', async () => {
    const component = await ready();
    expect(component.name()).toBe('Jacaranda Close, Ewuru');
    expect(component.status()).toBe('active');
    expect(component.notes()).toBe('A three bedroom build, part way up.');
    expect(component.dirty()).toBe(false);
    expect(component.canSave()).toBe(false);
  });

  it('does not allow saving until a field changes', async () => {
    const component = await ready();
    component.name.set('Jacaranda Close');
    expect(component.dirty()).toBe(true);
    expect(component.canSave()).toBe(true);
  });

  it('does not allow saving a project with no name', async () => {
    const component = await ready();
    component.name.set('   ');
    expect(component.canSave()).toBe(false);
  });

  it('sends the trimmed name, status and notes', async () => {
    const component = await ready();
    component.name.set('  Jacaranda Close  ');
    component.status.set('completed');
    component.notes.set('  Roof on  ');

    await component.save();

    expect(saved).toEqual([
      {
        id: 'p1',
        body: { name: 'Jacaranda Close', status: 'completed', land_id: null, notes: 'Roof on' },
      },
    ]);
    expect(changes).toBe(1);
    expect(toasts[0].message).toBe('Project saved.');
  });

  it('sends null for notes when they are cleared', async () => {
    const component = await ready();
    component.notes.set('');

    await component.save();

    expect((saved[0] as { body: { notes: string | null } }).body.notes).toBeNull();
  });

  it('shows the error and does not emit when the save fails', async () => {
    const component = await ready();
    saveResult = null;
    component.name.set('Something else');

    await component.save();

    expect(changes).toBe(0);
    expect(toasts[0]).toEqual({ message: 'Could not save the project.', type: 'error' });
  });

  it('derives the currency format from the money formatter', async () => {
    const component = await ready();
    expect(component.currencyFormat().decimals).toBe('2');
    expect(component.currencyFormat().position).toBe('before');
    expect(component.currencyFormat().separators).toBe(',   .');
    expect(component.preview()).toContain('48,893.00');
  });

  it('counts the expenses in each category', async () => {
    const component = await ready();
    expect(component.countLabel(category({ expense_count: 0 }))).toBe('no expenses');
    expect(component.countLabel(category({ expense_count: 1 }))).toBe('1 expense');
    expect(component.countLabel(category({ expense_count: 4 }))).toBe('4 expenses');
  });

  it('offers archive only for a category with no expenses', async () => {
    const component = await ready();
    expect(component.canArchive(category({ expense_count: 0 }))).toBe(true);
    expect(component.canArchive(category({ expense_count: 1 }))).toBe(false);
  });

  it('gives each top-level category its own tint and a child its parent tint', async () => {
    const component = await ready([
      category({ id: 'a' }),
      category({ id: 'b', sort_order: 1 }),
      category({ id: 'b1', parent_id: 'b' }),
    ]);
    expect(component.tint(category({ id: 'a' }))).toBe('tint-1');
    expect(component.tint(category({ id: 'b' }))).toBe('tint-2');
    expect(component.tint(category({ id: 'b1', parent_id: 'b' }))).toBe('tint-2');
  });

  it('renames a category and closes the rename field', async () => {
    const component = await ready([category({ id: 'a', name: 'Interior work' })]);
    component.startRename(category({ id: 'a', name: 'Interior work' }));
    expect(component.newName()).toBe('Interior work');

    component.newName.set('Inside work');
    await component.rename(category({ id: 'a', name: 'Interior work' }));

    expect(renamed).toEqual([{ id: 'a', name: 'Inside work' }]);
    expect(component.renaming()).toBeNull();
  });

  it('skips the request when the name is unchanged', async () => {
    const component = await ready();
    component.startRename(category({ name: 'Interior work' }));
    await component.rename(category({ name: 'Interior work' }));

    expect(renamed).toEqual([]);
    expect(component.renaming()).toBeNull();
  });

  it('shows the API error when the rename fails', async () => {
    const component = await ready([], 'A category with that name already exists');
    categoryResult = false;
    component.newName.set('Interior work');

    await component.rename(category({ name: 'Concrete foundation' }));

    expect(toasts[0]).toEqual({
      message: 'A category with that name already exists',
      type: 'error',
    });
  });

  it('confirms before archiving a category, one category at a time', async () => {
    const component = await ready();
    component.confirmArchive(category({ id: 'a' }));
    expect(component.archiving()).toBe('a');

    component.startRename(category({ id: 'b' }));
    expect(component.archiving()).toBeNull();
    expect(component.renaming()).toBe('b');

    component.confirmArchive(category({ id: 'a' }));
    expect(component.renaming()).toBeNull();
  });

  it('archives a category after confirmation', async () => {
    const component = await ready();
    component.confirmArchive(category({ id: 'a' }));

    await component.archive(category({ id: 'a', name: 'Landscaping' }));

    expect(archived).toEqual(['a']);
    expect(component.archiving()).toBeNull();
    expect(toasts[0].message).toBe('Landscaping archived.');
  });

  it('shows why a category with expenses cannot be archived', async () => {
    const component = await ready([], 'A category with expenses cannot be archived, only renamed');
    categoryResult = false;

    await component.archive(category({ name: 'Interior work' }));

    expect(toasts[0]).toEqual({
      message: 'A category with expenses cannot be archived, only renamed',
      type: 'error',
    });
  });

  it('restores the last archived category', async () => {
    const component = await ready();
    await component.archive(category({ id: 'a', name: 'Landscaping' }));
    expect(component.lastArchived()?.id).toBe('a');

    await component.restoreLastArchived();

    expect(restored).toEqual(['a']);
    expect(component.lastArchived()).toBeNull();
  });
});
