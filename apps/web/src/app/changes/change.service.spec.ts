import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { ChangeService, ChangeTarget } from './change.service';

function change(id: string) {
  return {
    id,
    entity: 'expense',
    entity_id: 'e1',
    entity_name: 'Cement',
    project_id: 'p1',
    action: 'update',
    fields: [{ name: 'amount', before: 100, after: 150 }],
    user_name: 'Admin',
    created_at: '2026-10-25T09:30:00Z',
  };
}

const EXPENSE: ChangeTarget = { entity: 'expense', id: 'e1' };

describe('ChangeService', () => {
  let invocations: Record<string, unknown>[];

  function configure(reply: (name: string, params: Record<string, unknown>) => unknown) {
    invocations = [];
    TestBed.resetTestingModule();
    const api = {
      rootUrl: '',
      invoke: async (fn: { name?: string }, params: Record<string, unknown>) => {
        invocations.push({ call: fn?.name ?? '', ...params });
        return reply(fn?.name ?? '', params ?? {});
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(ChangeService);
  }

  it('lists the changes of one record through listChanges', async () => {
    const service = configure(() => ({ items: [change('c1')], total: 1 }));

    await service.load(EXPENSE);

    expect(invocations[0]).toMatchObject({
      call: 'listChanges',
      entity: 'expense',
      entity_id: 'e1',
      offset: 0,
    });
    expect(service.forTarget(EXPENSE).rows.map((row) => row.id)).toEqual(['c1']);
  });

  it('lists a project through listProjectChanges and keeps it apart from records', async () => {
    const service = configure((name) =>
      name === 'listProjectChanges'
        ? { items: [change('c1'), change('c2')], total: 2 }
        : { items: [], total: 0 },
    );

    await service.load({ projectId: 'p1' });
    await service.load(EXPENSE);

    expect(service.forTarget({ projectId: 'p1' }).total).toBe(2);
    expect(service.forTarget(EXPENSE).total).toBe(0);
  });

  it('appends the next page from the current row count', async () => {
    const service = configure((_name, params) =>
      params['offset'] === 0
        ? { items: [change('c1')], total: 2 }
        : { items: [change('c2')], total: 2 },
    );

    await service.load(EXPENSE);
    await service.loadMore(EXPENSE);

    expect(invocations[1]['offset']).toBe(1);
    expect(service.forTarget(EXPENSE).rows.map((row) => row.id)).toEqual(['c1', 'c2']);
  });

  it('does not request another page when every row is loaded', async () => {
    const service = configure(() => ({ items: [change('c1')], total: 1 }));

    await service.load(EXPENSE);
    await service.loadMore(EXPENSE);

    expect(invocations.length).toBe(1);
  });

  it('sets an error and stops loading when the request fails', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });

    await service.load(EXPENSE);

    expect(service.error()).toBe('Could not load the change history.');
    expect(service.forTarget(EXPENSE).loading).toBe(false);
  });
});
