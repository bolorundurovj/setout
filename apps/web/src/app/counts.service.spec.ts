import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { CountsService } from './counts.service';

describe('CountsService', () => {
  let calls: string[];

  function configure(invoke: () => unknown) {
    calls = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (fn: { name?: string }) => {
        calls.push(fn?.name ?? '');
        return invoke();
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(CountsService);
  }

  it('counts nothing before it has been loaded', () => {
    const service = configure(() => ({}));
    expect(service.counts()).toBeNull();
    expect(service.projects()).toBe(0);
    expect(service.vendors()).toBe(0);
    expect(service.items()).toBe(0);
    expect(service.people()).toBe(0);
  });

  it('reads every count from the one request', async () => {
    const service = configure(() => ({ projects: 2, vendors: 6, items: 4, people: 3 }));
    await service.load();

    expect(calls).toEqual(['getCounts']);
    expect(service.projects()).toBe(2);
    expect(service.vendors()).toBe(6);
    expect(service.items()).toBe(4);
    expect(service.people()).toBe(3);
  });

  it('falls back to nothing rather than throwing at the navigation', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });
    await service.load();
    expect(service.counts()).toBeNull();
    expect(service.projects()).toBe(0);
  });
});
