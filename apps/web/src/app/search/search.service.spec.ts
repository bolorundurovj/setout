import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { SearchService } from './search.service';

describe('SearchService', () => {
  let asked: Record<string, unknown>[];

  function configure(reply: () => unknown) {
    asked = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (fn: { name?: string }, params: Record<string, unknown>) => {
        asked.push({ call: fn?.name ?? '', ...params });
        const answer = reply();
        if (answer instanceof Error) {
          throw answer;
        }
        return answer;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(SearchService);
  }

  it('asks for the trimmed words', async () => {
    const service = configure(() => ({ query: 'cement', total: 1, groups: [] }));

    await service.look('  cement  ');

    expect(asked[0]['q']).toBe('cement');
    expect(service.results()?.total).toBe(1);
    expect(service.looking()).toBe(false);
  });

  it('asks for nothing when there is nothing to ask', async () => {
    const service = configure(() => ({ query: '', total: 0, groups: [] }));

    await service.look('   ');

    expect(asked).toEqual([]);
    expect(service.results()).toBeNull();
  });

  it('holds no stale results when the search fails', async () => {
    const service = configure(() => new Error('offline'));

    await service.look('cement');

    expect(service.results()).toBeNull();
    expect(service.error()).toBe('Could not search the record.');
  });
});
