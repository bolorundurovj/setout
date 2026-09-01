import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { ExpenseService } from './expense.service';

function expense(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    project_id: 'p1',
    scope_id: null,
    spent_on: '2026-08-01',
    description: 'MISSING',
    quantity: null,
    unit_rate: null,
    amount: 5_300_000,
    attachment_count: 0,
    cost_type: 'material',
    notes: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

const spend = {
  project_id: 'p1',
  currency_code: 'NGN',
  currency_exponent: 2,
  planned_amount: 382_830_000,
  spent_amount: 488_930_000,
  unfiled_amount: 5_300_000,
  variance_percent: 27.72,
};

function page(items: unknown[], total = items.length, offset = 0) {
  return { items, total, limit: 20, offset };
}

describe('ExpenseService', () => {
  let names: string[];
  let calls: unknown[];

  function configure(reply: (name: string, args: unknown) => unknown) {
    names = [];
    calls = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (fn: { name?: string }, args?: unknown) => {
        names.push(fn?.name ?? '');
        calls.push(args);
        return reply(fn?.name ?? '', args);
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(ExpenseService);
  }

  function standard(name: string) {
    return name === 'getProjectSpend' ? spend : page([expense('e1')]);
  }

  it('loads the first page and the project spend together', async () => {
    const service = configure(standard);
    await service.load('p1');

    expect(service.expenses().length).toBe(1);
    expect(service.total()).toBe(1);
    expect(service.spend()?.spent_amount).toBe(488_930_000);
    expect(names).toContain('listExpenses');
    expect(names).toContain('getProjectSpend');
  });

  it('reports a failure instead of throwing', async () => {
    const service = configure((name) => {
      if (name === 'listExpenses') {
        throw new Error('offline');
      }
      return spend;
    });
    await service.load('p1');

    expect(service.error()).toBe('Could not load what has been spent.');
    expect(service.expenses()).toEqual([]);
  });

  it('leaves the spend empty rather than stale when it cannot be read', async () => {
    const service = configure((name) => {
      if (name === 'getProjectSpend') {
        throw new Error('offline');
      }
      return page([expense('e1')]);
    });
    await service.load('p1');
    expect(service.spend()).toBeNull();
  });

  it('asks for ten rows at the offset of the page wanted', async () => {
    const service = configure((name) =>
      name === 'getProjectSpend' ? spend : page([expense('e1')], 24),
    );
    await service.load('p1');
    expect((calls[0] as { limit?: number }).limit).toBe(10);

    await service.goTo('p1', 3);

    expect(service.page()).toBe(3);
    expect(calls.some((args) => (args as { offset?: number })?.offset === 20)).toBe(true);
  });

  it('pages a scope and a month ten at a time, each keeping its own place', async () => {
    const service = configure((name) =>
      name === 'getProjectSpend' ? spend : page([expense('e1')], 24),
    );
    await service.loadForScope('p1', 's1', 2);
    await service.loadForMonth('p1', '2026-06', 3);

    expect(service.byScope()['s1'].page).toBe(2);
    expect(service.byScope()['s1'].total).toBe(24);
    expect(service.byMonth()['2026-06'].page).toBe(3);
    expect(service.byMonth()['2026-06'].rows.length).toBe(1);
  });

  it('puts a new expense at the top and refreshes the spend', async () => {
    const service = configure((name) => {
      if (name === 'getProjectSpend') {
        return spend;
      }
      if (name === 'addExpense') {
        return expense('e2', { description: 'Roofing sheets' });
      }
      return page([expense('e1')]);
    });
    await service.load('p1');

    const created = await service.add('p1', { description: 'Roofing sheets', amount: 75_000_000 });

    expect(created?.id).toBe('e2');
    expect(names.filter((n) => n === 'listExpenses').length).toBe(2);
    expect(service.saving()).toBe(false);
    expect(names.filter((n) => n === 'getProjectSpend').length).toBe(2);
  });

  it('surfaces the reason the backend refused the expense', async () => {
    const service = configure((name) => {
      if (name === 'addExpense') {
        throw { error: { detail: 'Amount should be 150000: quantity times unit rate' } };
      }
      return spend;
    });

    const created = await service.add('p1', { description: 'Blocks', amount: 1 });

    expect(created).toBeNull();
    expect(service.error()).toBe('Amount should be 150000: quantity times unit rate');
    expect(service.saving()).toBe(false);
  });

  it('falls back to a plain message when the failure carries no detail', async () => {
    const service = configure((name) => {
      if (name === 'addExpense') {
        throw new Error('offline');
      }
      return spend;
    });

    await service.add('p1', { description: 'Blocks', amount: 1 });
    expect(service.error()).toBe('Could not save that expense.');
  });

  it('reads the page back after removing one', async () => {
    const service = configure(standard);
    await service.load('p1');

    await service.remove('p1', 'e1');

    expect(names).toContain('deleteExpense');
    expect(names.filter((n) => n === 'listExpenses').length).toBe(2);
  });

  it('steps back off a page that the removal emptied', async () => {
    const service = configure((name) => (name === 'getProjectSpend' ? spend : page([], 10)));
    await service.goTo('p1', 2);

    await service.remove('p1', 'e1');

    expect(service.page()).toBe(1);
  });

  it('reloads everything after a restore, since order depends on the date', async () => {
    const service = configure(standard);
    await service.restore('p1', 'e1');

    expect(names).toContain('restoreExpense');
    expect(names).toContain('listExpenses');
    expect(service.expenses().length).toBe(1);
  });

  it('files many unfiled expenses and refreshes the list', async () => {
    const service = configure((name) => {
      if (name === 'fileExpenses') {
        return { filed_count: 2 };
      }
      return standard(name);
    });

    const count = await service.file('p1', { expense_ids: ['e1', 'e2'], scope_id: 's1' });

    expect(count).toBe(2);
    expect(names).toContain('fileExpenses');
    expect(names).toContain('listExpenses');
    expect(names).toContain('getProjectSpend');
    expect(service.saving()).toBe(false);
  });

  it('surfaces the reason the backend refused bulk filing', async () => {
    const service = configure((name) => {
      if (name === 'fileExpenses') {
        throw { error: { detail: 'A scope with children holds no spend of its own' } };
      }
      return standard(name);
    });

    const count = await service.file('p1', { expense_ids: ['e1'], scope_id: 'sg' });

    expect(count).toBeNull();
    expect(service.error()).toBe('A scope with children holds no spend of its own');
    expect(service.saving()).toBe(false);
  });
});
