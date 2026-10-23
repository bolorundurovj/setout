import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let calls: Record<string, unknown>[];

  function configure(respond: () => unknown) {
    calls = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (fn: { name?: string }, params: Record<string, unknown>) => {
        calls.push({ call: fn?.name ?? '', ...params });
        const response = respond();
        if (response instanceof Error) {
          throw response;
        }
        return response;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(SearchService);
  }

  it('sends the trimmed query', async () => {
    const service = configure(() => ({ query: 'cement', total: 1, groups: [] }));

    await service.search('  cement  ');

    expect(calls[0]['q']).toBe('cement');
    expect(service.results()?.total).toBe(1);
    expect(service.loading()).toBe(false);
  });

  it('sends no request for a blank query', async () => {
    const service = configure(() => ({ query: '', total: 0, groups: [] }));

    await service.search('   ');

    expect(calls).toEqual([]);
    expect(service.results()).toBeNull();
  });

  it('clears results when the search fails', async () => {
    const service = configure(() => new Error('offline'));

    await service.search('cement');

    expect(service.results()).toBeNull();
    expect(service.error()).toBe('Could not search.');
  });
});
