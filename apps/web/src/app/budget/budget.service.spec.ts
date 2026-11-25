import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { BudgetService } from './budget.service';

function category(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
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

describe('BudgetService', () => {
  let names: string[];
  let calls: Record<string, unknown>[];

  function configure(reply: (name: string, args: Record<string, unknown>) => unknown) {
    names = [];
    calls = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (fn: { name?: string }, args?: Record<string, unknown>) => {
        names.push(fn?.name ?? '');
        const entry = { call: fn?.name ?? '', ...(args ?? {}) };
        calls.push(entry);
        return reply(fn?.name ?? '', args ?? {});
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(BudgetService);
  }

  it('exposes the categories and the budgeted total', async () => {
    const service = configure(() => ({
      project_id: 'p1',
      currency_code: 'NGN',
      currency_exponent: 2,
      budgeted_amount: 215000000,
      categories: [category('s1', { budgeted_amount: 215000000 })],
    }));
    await service.load('p1');
    expect(service.categories().length).toBe(1);
    expect(service.budgetedTotal()).toBe(215000000);
  });

  it('sets an error when loading the budget fails', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });
    await service.load('p1');
    expect(service.error()).toBe('Could not load the budget.');
    expect(service.loading()).toBe(false);
  });

  it('excludes archived categories and items unless include_archived is set', async () => {
    const service = configure((name) =>
      name === 'getProjectBudget'
        ? {
            project_id: 'p1',
            currency_code: 'NGN',
            currency_exponent: 2,
            budgeted_amount: 0,
            categories: [],
          }
        : { items: [], total: 0, limit: 100, offset: 0 },
    );

    await service.load('p1');
    await service.loadItems('s1');
    expect(calls[0]['include_archived']).toBe(false);
    expect(calls[1]['include_archived']).toBe(false);

    await service.load('p1', true);
    await service.loadItems('s1', true);
    expect(calls[2]['include_archived']).toBe(true);
    expect(calls[3]['include_archived']).toBe(true);
  });

  it('reloads the items and the budget after restoring an item', async () => {
    const service = configure((name) =>
      name === 'getProjectBudget'
        ? {
            project_id: 'p1',
            currency_code: 'NGN',
            currency_exponent: 2,
            budgeted_amount: 0,
            categories: [],
          }
        : { items: [], total: 0, limit: 100, offset: 0 },
    );

    expect(await service.restoreItem('p1', 's1', 'i1')).toBe(true);

    expect(names).toContain('restoreBudgetItem');
    expect(names).toContain('listBudgetItems');
    expect(names).toContain('getProjectBudget');
  });

  it('keeps items per category', async () => {
    const service = configure(() => ({
      items: [{ id: 'i1', category_id: 's1', description: 'Blocks', budgeted_amount: 100 }],
      total: 1,
      limit: 100,
      offset: 0,
    }));
    await service.loadItems('s1');
    expect(service.items()['s1'].length).toBe(1);
  });

  it('pages through all budget items in a category when total exceeds one page', async () => {
    const service = configure((_name, args) => {
      const offset = Number(args['offset'] ?? 0);
      return offset === 0
        ? {
            items: [
              { id: 'i1', category_id: 's1', description: 'Blocks', budgeted_amount: 100 },
              { id: 'i2', category_id: 's1', description: 'Sand', budgeted_amount: 200 },
            ],
            total: 3,
            limit: 100,
            offset: 0,
          }
        : {
            items: [{ id: 'i3', category_id: 's1', description: 'Cement', budgeted_amount: 300 }],
            total: 3,
            limit: 100,
            offset,
          };
    });

    await service.loadItems('s1');

    expect(service.items()['s1'].map((row) => row.id)).toEqual(['i1', 'i2', 'i3']);
    expect(calls.map((call) => call['offset'])).toEqual([0, 2]);
  });

  it('refreshes only the edited category and the summary on a 15-category budget', async () => {
    const categories = Array.from({ length: 15 }, (_, index) => category(String(index)));
    const service = configure((name) =>
      name === 'getProjectBudget' ? { categories } : { items: [], total: 0 },
    );
    await service.updateItem('p1', '8', 'item-8', 500);
    expect(names).toEqual(['updateBudgetItem', 'getProjectBudget', 'listBudgetItems']);
    expect(calls[2]['category_id']).toBe('8');
    names.length = 0;
    await service.updateItem('p1', '9', 'item-9', 800, null);
    expect(names).toEqual(['updateBudgetItem', 'getProjectBudget']);
  });

  it('fetches the presets once', async () => {
    const service = configure(() => [{ id: 'sp1', name: 'Roofing', sort_order: 0 }]);
    await service.loadPresets();
    await service.loadPresets();
    expect(names.filter((n) => n === 'listCategoryPresets').length).toBe(1);
    expect(service.presetNames()).toEqual(['Roofing']);
  });

  it('reloads the budget after creating an item', async () => {
    const service = configure((name) =>
      name === 'getProjectBudget'
        ? {
            project_id: 'p1',
            currency_code: 'NGN',
            currency_exponent: 2,
            budgeted_amount: 0,
            categories: [],
          }
        : { items: [], total: 0, limit: 100, offset: 0 },
    );
    await service.addItem('p1', 's1', 'Blocks', 500);
    expect(names).toContain('createBudgetItem');
    expect(names).toContain('getProjectBudget');
  });
});
