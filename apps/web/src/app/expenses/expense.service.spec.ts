import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { ExpenseService, UNCATEGORISED } from './expense.service';

function expense(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    project_id: 'p1',
    category_id: null,
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
    archived_at: null,
    ...overrides,
  };
}

const summary = {
  project_id: 'p1',
  currency_code: 'NGN',
  currency_exponent: 2,
  budgeted_amount: 382_830_000,
  spent_amount: 488_930_000,
  uncategorised_amount: 5_300_000,
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

  function defaultReply(name: string) {
    return name === 'getProjectExpenseSummary' ? summary : page([expense('e1')]);
  }

  it('loads the first page and the expense summary together', async () => {
    const service = configure(defaultReply);
    await service.load('p1');

    expect(service.expenses().length).toBe(1);
    expect(service.total()).toBe(1);
    expect(service.summary()?.spent_amount).toBe(488_930_000);
    expect(names).toContain('listExpenses');
    expect(names).toContain('getProjectExpenseSummary');
  });

  it('excludes archived rows unless requested and keeps the choice when paging', async () => {
    const service = configure(defaultReply);
    await service.load('p1');
    expect((calls[0] as { include_archived?: boolean }).include_archived).toBe(false);

    await service.load('p1', { includeArchived: true });
    expect((calls[2] as { include_archived?: boolean }).include_archived).toBe(true);

    await service.goTo('p1', 2);
    expect((calls[4] as { include_archived?: boolean }).include_archived).toBe(true);
  });

  it('sends every filter and keeps them when paging', async () => {
    const service = configure(defaultReply);
    await service.load('p1', {
      search: 'cement',
      vendorId: 'v1',
      paidById: 'pe1',
      itemId: 'i1',
      from: '2026-03-01',
      to: '2026-03-31',
      sort: 'largest',
    });

    const asked = calls[0] as Record<string, unknown>;
    expect(asked['search']).toBe('cement');
    expect(asked['vendor_id']).toBe('v1');
    expect(asked['paid_by_id']).toBe('pe1');
    expect(asked['item_id']).toBe('i1');
    expect(asked['spent_from']).toBe('2026-03-01');
    expect(asked['spent_to']).toBe('2026-03-31');
    expect(asked['sort']).toBe('largest');

    await service.goTo('p1', 2);
    expect((calls[2] as Record<string, unknown>)['search']).toBe('cement');
  });

  it('sends no filters when none are set', async () => {
    const service = configure(defaultReply);
    await service.load('p1', { search: 'cement' });
    await service.load('p1');

    const asked = calls[2] as Record<string, unknown>;
    expect(asked['search']).toBeUndefined();
    expect(asked['sort']).toBe('recent');
  });

  it('exposes the total amount of all matching expenses', async () => {
    const service = configure((name) =>
      name === 'getProjectExpenseSummary'
        ? summary
        : { ...page([expense('e1')], 8), total_amount: 44_000 },
    );
    await service.load('p1');

    expect(service.totalAmount()).toBe(44_000);
  });

  it('sets an error instead of throwing when loading fails', async () => {
    const service = configure((name) => {
      if (name === 'listExpenses') {
        throw new Error('offline');
      }
      return summary;
    });
    await service.load('p1');

    expect(service.error()).toBe('Could not load expenses.');
    expect(service.expenses()).toEqual([]);
  });

  it('clears the expense summary when it cannot be loaded', async () => {
    const service = configure((name) => {
      if (name === 'getProjectExpenseSummary') {
        throw new Error('offline');
      }
      return page([expense('e1')]);
    });
    await service.load('p1');
    expect(service.summary()).toBeNull();
  });

  it('requests ten rows at the offset of the requested page', async () => {
    const service = configure((name) =>
      name === 'getProjectExpenseSummary' ? summary : page([expense('e1')], 24),
    );
    await service.load('p1');
    expect((calls[0] as { limit?: number }).limit).toBe(10);

    await service.goTo('p1', 3);

    expect(service.page()).toBe(3);
    expect(calls.some((args) => (args as { offset?: number })?.offset === 20)).toBe(true);
  });

  it('pages category and month lists separately, ten rows each', async () => {
    const service = configure((name) =>
      name === 'getProjectExpenseSummary' ? summary : page([expense('e1')], 24),
    );
    await service.loadForCategory('p1', 's1', 2);
    await service.loadForMonth('p1', '2026-06', 3);

    expect(service.categoryPage('p1', 's1')?.page).toBe(2);
    expect(service.categoryPage('p1', 's1')?.total).toBe(24);
    expect(service.monthPage('p1', '2026-06')?.page).toBe(3);
    expect(service.monthPage('p1', '2026-06')?.rows.length).toBe(1);
  });

  it("keeps each project's category and month rows separate", async () => {
    const service = configure((_name, args) =>
      page([expense((args as { project_id: string }).project_id === 'pA' ? 'from-a' : 'from-b')]),
    );
    await service.loadForCategory('pA', UNCATEGORISED);
    await service.loadForMonth('pA', '2026-06');

    expect(service.categoryPage('pB', UNCATEGORISED)).toBeUndefined();
    expect(service.monthPage('pB', '2026-06')).toBeUndefined();

    await service.loadForCategory('pB', UNCATEGORISED);
    expect(service.categoryPage('pA', UNCATEGORISED)?.rows[0].id).toBe('from-a');
    expect(service.categoryPage('pB', UNCATEGORISED)?.rows[0].id).toBe('from-b');
  });

  it('reloads the cached category and month pages after a change', async () => {
    let description = 'Before';
    const service = configure((name) => {
      if (name === 'getProjectExpenseSummary') {
        return summary;
      }
      if (name === 'archiveExpense') {
        description = 'After';
        return undefined;
      }
      return page([expense('e1', { description })]);
    });
    await service.loadForCategory('p1', 's1');
    await service.loadForMonth('p1', '2026-06');
    await service.loadForCategory('p2', 's1');
    expect(service.categoryPage('p1', 's1')?.rows[0].description).toBe('Before');

    await service.archive('p1', 'e1');

    expect(service.categoryPage('p1', 's1')?.rows[0].description).toBe('After');
    expect(service.monthPage('p1', '2026-06')?.rows[0].description).toBe('After');
    expect(service.categoryPage('p2', 's1')?.rows[0].description).toBe('Before');
  });

  it('reloads the list and expense summary after creating an expense', async () => {
    const service = configure((name) => {
      if (name === 'getProjectExpenseSummary') {
        return summary;
      }
      if (name === 'createExpense') {
        return expense('e2', { description: 'Roofing sheets' });
      }
      return page([expense('e1')]);
    });
    await service.load('p1');

    const created = await service.add('p1', { description: 'Roofing sheets', amount: 75_000_000 });

    expect(created?.id).toBe('e2');
    expect(names.filter((n) => n === 'listExpenses').length).toBe(2);
    expect(service.saving()).toBe(false);
    expect(names.filter((n) => n === 'getProjectExpenseSummary').length).toBe(2);
  });

  it('shows the server error when creating fails', async () => {
    const service = configure((name) => {
      if (name === 'createExpense') {
        throw { error: { detail: 'Amount should be 150000: quantity times unit rate' } };
      }
      return summary;
    });

    const created = await service.add('p1', { description: 'Blocks', amount: 1 });

    expect(created).toBeNull();
    expect(service.error()).toBe('Amount should be 150000: quantity times unit rate');
    expect(service.saving()).toBe(false);
  });

  it('falls back to a generic error when the server gives no detail', async () => {
    const service = configure((name) => {
      if (name === 'createExpense') {
        throw new Error('offline');
      }
      return summary;
    });

    await service.add('p1', { description: 'Blocks', amount: 1 });
    expect(service.error()).toBe('Could not save the expense.');
  });

  it('reloads the page after archiving', async () => {
    const service = configure(defaultReply);
    await service.load('p1');

    await service.archive('p1', 'e1');

    expect(names).toContain('archiveExpense');
    expect(names.filter((n) => n === 'listExpenses').length).toBe(2);
  });

  it('moves to the previous page when archiving empties the current one', async () => {
    const service = configure((name) =>
      name === 'getProjectExpenseSummary' ? summary : page([], 10),
    );
    await service.goTo('p1', 2);

    await service.archive('p1', 'e1');

    expect(service.page()).toBe(1);
  });

  it('reloads the list after restoring', async () => {
    const service = configure(defaultReply);
    await service.restore('p1', 'e1');

    expect(names).toContain('restoreExpense');
    expect(names).toContain('listExpenses');
    expect(service.expenses().length).toBe(1);
  });

  it('assigns a category to expenses in bulk and reloads the list', async () => {
    const service = configure((name) => {
      if (name === 'categoriseExpenses') {
        return { categorised_count: 2 };
      }
      return defaultReply(name);
    });

    const count = await service.categorise('p1', { expense_ids: ['e1', 'e2'], category_id: 's1' });

    expect(count).toBe(2);
    expect(names).toContain('categoriseExpenses');
    expect(names).toContain('listExpenses');
    expect(names).toContain('getProjectExpenseSummary');
    expect(service.saving()).toBe(false);
  });

  it('shows the server error when bulk categorising fails', async () => {
    const service = configure((name) => {
      if (name === 'categoriseExpenses') {
        throw { error: { detail: 'A category with children holds no expenses of its own' } };
      }
      return defaultReply(name);
    });

    const count = await service.categorise('p1', { expense_ids: ['e1'], category_id: 'sg' });

    expect(count).toBeNull();
    expect(service.error()).toBe('A category with children holds no expenses of its own');
    expect(service.saving()).toBe(false);
  });

  describe('status', () => {
    it('becomes ready only after the expense summary has loaded', async () => {
      let releaseSummary!: () => void;
      const service = configure((name) =>
        name === 'getProjectExpenseSummary'
          ? new Promise((resolve) => (releaseSummary = () => resolve(summary)))
          : page([]),
      );

      const loading = service.load('p1');
      expect(service.status()).toBe('loading');
      await vi.waitFor(() => expect(names).toContain('getProjectExpenseSummary'));
      expect(service.status()).toBe('loading');

      releaseSummary();
      await loading;
      expect(service.status()).toBe('ready');
    });

    it('moves to error when the list fails to load', async () => {
      const service = configure((name) => {
        if (name === 'listExpenses') {
          throw new Error('offline');
        }
        return summary;
      });
      await service.load('p1');
      expect(service.status()).toBe('error');
    });

    it('tracks category and month pages separately and keeps no rows from a failed load', async () => {
      const service = configure((_name, args) => {
        if ((args as { month?: string }).month) {
          throw new Error('offline');
        }
        return page([expense('e1')]);
      });
      expect(service.categoryStatus('p1', 's1')).toBe('idle');

      await service.loadForCategory('p1', 's1');
      await service.loadForMonth('p1', '2026-06');

      expect(service.categoryStatus('p1', 's1')).toBe('ready');
      expect(service.monthStatus('p1', '2026-06')).toBe('error');
      expect(service.monthPage('p1', '2026-06')).toBeUndefined();
    });

    it('tracks the month summary', async () => {
      const service = configure(() => ({ months: [] }));
      const loading = service.loadMonths('p1');
      expect(service.monthsStatus()).toBe('loading');
      await loading;
      expect(service.monthsStatus()).toBe('ready');
    });

    it('keeps the list status when creating an expense fails', async () => {
      const service = configure((name) => {
        if (name === 'createExpense') {
          throw { error: { detail: 'Amount is required' } };
        }
        return defaultReply(name);
      });
      await service.load('p1');

      await service.add('p1', {} as never);

      expect(service.error()).toBe('Amount is required');
      expect(service.status()).toBe('ready');
    });
  });
});
