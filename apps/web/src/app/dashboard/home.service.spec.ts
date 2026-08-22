import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { HomeService } from './home.service';

interface Asked {
  name: string;
  currency: string | null;
}

describe('HomeService', () => {
  let asked: Asked[];

  function configure(reply: (name: string) => unknown) {
    asked = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (fn: { name: string }, params?: { currency?: string | null }) => {
        asked.push({ name: fn.name, currency: params?.currency ?? null });
        const answer = reply(fn.name);
        if (answer instanceof Error) {
          throw answer;
        }
        return answer;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(HomeService);
  }

  const summary = {
    projects: 2,
    currencies: [
      { currency_code: 'NGN', currency_exponent: 2, projects: 1 },
      { currency_code: 'USD', currency_exponent: 2, projects: 1 },
    ],
    currency_code: 'NGN',
    currency_exponent: 2,
    currency_projects: 1,
    planned_amount: 100,
    spent_amount: 40,
    alerts: [],
  };

  function answer(name: string): unknown {
    if (name === 'getHomeSummary') {
      return summary;
    }
    if (name === 'getHomeMonths') {
      return { currency_code: 'NGN', currency_exponent: 2, months: [], busiest_month: null };
    }
    return { rows: [] };
  }

  it('reads each section on its own so one slow part holds up nothing else', async () => {
    const service = configure(answer);

    await service.load();

    expect(asked.map((call) => call.name)).toEqual([
      'getHomeSummary',
      'getHomeMonths',
      'getHomeProjects',
      'getHomeLatest',
    ]);
    expect(service.summary()?.projects).toBe(2);
    expect(service.months()?.currency_code).toBe('NGN');
    expect(service.projects()?.rows).toEqual([]);
    expect(service.latest()?.rows).toEqual([]);
    expect(service.error()).toBeNull();
  });

  it('lets the server pick the currency first, then asks for that one by name', async () => {
    const service = configure(answer);

    await service.load();

    expect(asked[0].currency).toBeNull();
    expect(asked.slice(1).map((call) => call.currency)).toEqual(['NGN', 'NGN', 'NGN']);
    expect(service.currency()).toBe('NGN');
  });

  it('re-reads every section in the currency asked for', async () => {
    const service = configure(answer);
    await service.load();
    asked = [];

    await service.show('USD');

    expect(asked.map((call) => call.currency)).toEqual(['USD', 'USD', 'USD', 'USD']);
  });

  it('does not go back to the server for the currency already shown', async () => {
    const service = configure(answer);
    await service.load();
    asked = [];

    await service.show('NGN');

    expect(asked).toEqual([]);
  });

  it('holds nothing rather than something stale when a read fails', async () => {
    const service = configure(() => new Error('offline'));

    await service.load();

    expect(service.summary()).toBeNull();
    expect(service.months()).toBeNull();
    expect(service.error()).toBe('Could not read what the record holds.');
  });

  it('keeps the sections it did get when only one read fails', async () => {
    const service = configure((name) =>
      name === 'getHomeMonths' ? new Error('offline') : answer(name),
    );

    await service.load();

    expect(service.summary()?.projects).toBe(2);
    expect(service.months()).toBeNull();
    expect(service.latest()?.rows).toEqual([]);
    expect(service.error()).toBe('Could not read what the record holds.');
  });
});
