import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { BudgetService } from './budget.service';

function scope(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
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

describe('BudgetService', () => {
  let names: string[];

  function configure(reply: (name: string) => unknown) {
    names = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (fn: { name?: string }) => {
        names.push(fn?.name ?? '');
        return reply(fn?.name ?? '');
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(BudgetService);
  }

  it('exposes the scopes and the planned total', async () => {
    const service = configure(() => ({
      project_id: 'p1',
      currency_code: 'NGN',
      currency_exponent: 2,
      planned_amount: 215000000,
      scopes: [scope('s1', { planned_amount: 215000000 })],
    }));
    await service.load('p1');
    expect(service.scopes().length).toBe(1);
    expect(service.plannedTotal()).toBe(215000000);
  });

  it('reports a failure instead of throwing', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });
    await service.load('p1');
    expect(service.error()).toBe('Could not load the budget.');
    expect(service.loading()).toBe(false);
  });

  it('keeps items per scope', async () => {
    const service = configure(() => ({
      items: [{ id: 'i1', scope_id: 's1', description: 'Blocks', planned_amount: 100 }],
      total: 1,
      limit: 100,
      offset: 0,
    }));
    await service.loadItems('s1');
    expect(service.items()['s1'].length).toBe(1);
  });

  it('only fetches the presets once', async () => {
    const service = configure(() => [{ id: 'sp1', name: 'Roofing', sort_order: 0 }]);
    await service.loadPresets();
    await service.loadPresets();
    expect(names.filter((n) => n === 'listScopePresets').length).toBe(1);
    expect(service.presetNames()).toEqual(['Roofing']);
  });

  it('reloads the budget after adding an item', async () => {
    const service = configure((name) =>
      name === 'getProjectBudget'
        ? {
            project_id: 'p1',
            currency_code: 'NGN',
            currency_exponent: 2,
            planned_amount: 0,
            scopes: [],
          }
        : { items: [], total: 0, limit: 100, offset: 0 },
    );
    await service.addItem('p1', 's1', 'Blocks', 500);
    expect(names).toContain('addBudgetItem');
    expect(names).toContain('getProjectBudget');
  });
});
