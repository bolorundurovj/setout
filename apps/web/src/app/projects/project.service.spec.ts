import { TestBed } from '@angular/core/testing';
import { Api, ProjectRead } from '@setout/api-client';
import { ProjectService } from './project.service';

function project(overrides: Partial<ProjectRead> = {}): ProjectRead {
  return {
    id: 'p1',
    name: 'Jacaranda Close, Ewuru',
    currency_code: 'NGN',
    currency_exponent: 2,
    status: 'active',
    land_id: null,
    land_name: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    planned_amount: 0,
    spent_amount: 0,
    deleted_at: null,
    ...overrides,
  };
}

function page(items: ProjectRead[]) {
  return { items, total: items.length, limit: 20, offset: 0 };
}

const emptySummary = {
  total: 0,
  active: 0,
  on_hold: 0,
  completed: 0,
  archived: 0,
  deleted: 0,
  currency_codes: [],
};

describe('ProjectService', () => {
  let calls: unknown[][];
  let result: unknown;

  function configure(invoke?: (...args: unknown[]) => Promise<unknown>) {
    calls = [];
    const api = {
      invoke: async (...args: unknown[]) => {
        calls.push(args);
        if (invoke) {
          return invoke(...args);
        }
        const name = (args[0] as { name?: string })?.name;
        return name === 'getProjectSummary' ? emptySummary : result;
      },
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(ProjectService);
  }

  it('loads projects', async () => {
    result = page([project()]);
    const service = configure();
    await service.load();
    expect(service.projects().length).toBe(1);
    expect(service.hasProjects()).toBe(true);
    expect(service.loading()).toBe(false);
  });

  it('reports a failure instead of throwing', async () => {
    const service = configure(() => Promise.reject(new Error('offline')));
    await service.load();
    expect(service.error()).toBe('Could not load projects.');
    expect(service.loading()).toBe(false);
  });

  it('puts a created project at the top', async () => {
    result = page([project({ id: 'p1' })]);
    const service = configure();
    await service.load();

    result = project({ id: 'p2', name: 'Owode Bungalow' });
    const created = await service.create({ name: 'Owode Bungalow', currency_code: 'NGN' });

    expect(created?.id).toBe('p2');
    expect(service.projects().map((p) => p.id)).toEqual(['p2', 'p1']);
  });

  it('drops a deleted project from the list', async () => {
    result = page([project({ id: 'p1' }), project({ id: 'p2' })]);
    const service = configure();
    await service.load();

    result = undefined;
    await service.remove('p1');
    expect(service.projects().map((p) => p.id)).toEqual(['p2']);
  });

  it('replaces the project it restored', async () => {
    result = page([project({ id: 'p1', deleted_at: '2026-02-01T00:00:00Z' })]);
    const service = configure();
    await service.load(true);

    result = project({ id: 'p1', deleted_at: null });
    await service.restore('p1');
    expect(service.projects()[0].deleted_at).toBeNull();
  });

  it('only fetches currencies once', async () => {
    result = [{ code: 'NGN', name: 'Nigerian Naira', exponent: 2 }];
    const service = configure();
    await service.loadCurrencies();
    await service.loadCurrencies();
    expect(calls.length).toBe(1);
    expect(service.currencies()[0].code).toBe('NGN');
  });

  it('appends the next page instead of replacing', async () => {
    result = { items: [project({ id: 'p1' })], total: 2, limit: 1, offset: 0 };
    const service = configure();
    await service.load();
    expect(service.hasMore()).toBe(true);

    result = { items: [project({ id: 'p2' })], total: 2, limit: 1, offset: 1 };
    await service.loadMore();
    expect(service.projects().map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(service.hasMore()).toBe(false);
  });

  it('does not ask for more when everything is loaded', async () => {
    result = page([project()]);
    const service = configure();
    await service.load();
    const before = calls.length;
    await service.loadMore();
    expect(calls.length).toBe(before);
  });
});
