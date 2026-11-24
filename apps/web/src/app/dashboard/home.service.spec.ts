import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { HomeService } from './home.service';

interface Invocation {
  name: string;
  currency: string | null;
  offset?: number;
}

describe('HomeService', () => {
  let invocations: Invocation[];

  function configure(reply: (name: string, params?: Record<string, unknown>) => unknown) {
    invocations = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (
        fn: { name: string },
        params?: { currency?: string | null; offset?: number },
      ) => {
        invocations.push({
          name: fn.name,
          currency: params?.currency ?? null,
          offset: params?.offset,
        });
        const result = reply(fn.name, params);
        if (result instanceof Error) {
          throw result;
        }
        return result;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(HomeService);
  }

  const summary = {
    project_count: 2,
    currencies: [
      { currency_code: 'NGN', currency_exponent: 2, project_count: 1 },
      { currency_code: 'USD', currency_exponent: 2, project_count: 1 },
    ],
    currency_code: 'NGN',
    currency_exponent: 2,
    currency_project_count: 1,
    budgeted_amount: 100,
    spent_amount: 40,
    alerts: [],
  };

  function stubReply(name: string): unknown {
    if (name === 'getHomeSummary') {
      return summary;
    }
    if (name === 'getHomeMonths') {
      return { currency_code: 'NGN', currency_exponent: 2, months: [], highest_month: null };
    }
    if (name === 'getHomeProjects') {
      return { rows: [], total: 0, limit: 100, offset: 0 };
    }
    return { rows: [] };
  }

  it('requests the summary and then each section', async () => {
    const service = configure(stubReply);

    await service.load();

    expect(invocations.map((call) => call.name)).toEqual([
      'getHomeSummary',
      'getHomeMonths',
      'getHomeProjects',
      'getHomeLatest',
    ]);
    expect(service.summary()?.project_count).toBe(2);
    expect(service.months()?.currency_code).toBe('NGN');
    expect(service.projects()?.rows).toEqual([]);
    expect(service.recent()?.rows).toEqual([]);
    expect(service.error()).toBeNull();
  });

  it('uses the server default currency, then requests it explicitly', async () => {
    const service = configure(stubReply);

    await service.load();

    expect(invocations[0].currency).toBeNull();
    expect(invocations.slice(1).map((call) => call.currency)).toEqual(['NGN', 'NGN', 'NGN']);
    expect(service.currency()).toBe('NGN');
  });

  it('reloads every section in the selected currency', async () => {
    const service = configure(stubReply);
    await service.load();
    invocations = [];

    await service.selectCurrency('USD');

    expect(invocations.map((call) => call.currency)).toEqual(['USD', 'USD', 'USD', 'USD']);
  });

  it('skips reloading when the selected currency is unchanged', async () => {
    const service = configure(stubReply);
    await service.load();
    invocations = [];

    await service.selectCurrency('NGN');

    expect(invocations).toEqual([]);
  });

  it('clears sections and sets an error when requests fail', async () => {
    const service = configure(() => new Error('offline'));

    await service.load();

    expect(service.summary()).toBeNull();
    expect(service.months()).toBeNull();
    expect(service.error()).toBe('Could not load Home.');
  });

  it('keeps loaded sections when one request fails', async () => {
    const service = configure((name) =>
      name === 'getHomeMonths' ? new Error('offline') : stubReply(name),
    );

    await service.load();

    expect(service.summary()?.project_count).toBe(2);
    expect(service.months()).toBeNull();
    expect(service.recent()?.rows).toEqual([]);
    expect(service.error()).toBe('Could not load Home.');
  });

  it('collects all pages of home projects when total exceeds one page', async () => {
    const service = configure((name, params) => {
      if (name !== 'getHomeProjects') {
        return stubReply(name);
      }
      const offset = Number(params?.['offset'] ?? 0);
      return offset === 0
        ? { rows: [{ id: 'p1' }, { id: 'p2' }], total: 3, limit: 100, offset: 0 }
        : { rows: [{ id: 'p3' }], total: 3, limit: 100, offset };
    });

    await service.load();

    expect(service.projects()?.rows.map((row) => row.id)).toEqual(['p1', 'p2', 'p3']);
    const projectCalls = invocations.filter((call) => call.name === 'getHomeProjects');
    expect(projectCalls.map((call) => call.offset)).toEqual([0, 2]);
  });
});
