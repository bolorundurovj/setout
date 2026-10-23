import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { PersonService } from './person.service';

function person(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Mum',
    role: 'family',
    phone: null,
    notes: null,
    expense_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    ...overrides,
  };
}

function page(items: unknown[], total = items.length) {
  return { items, total, limit: 50, offset: 0 };
}

describe('PersonService', () => {
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
    return TestBed.inject(PersonService);
  }

  it('loads the people', async () => {
    const service = configure(() => page([person('pe1')]));
    await service.load();

    expect(service.people().length).toBe(1);
    expect(service.total()).toBe(1);
  });

  it('excludes archived people unless include_archived is set', async () => {
    const service = configure(() => page([]));
    await service.load();
    expect((calls[0] as { include_archived?: boolean }).include_archived).toBe(false);

    await service.load(undefined, true);
    expect((calls[1] as { include_archived?: boolean }).include_archived).toBe(true);
  });

  it('sets an error when the list fails to load', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });
    await service.load();

    expect(service.error()).toBe('Could not load the people.');
  });

  it('requests ten rows at the offset of the requested page', async () => {
    const service = configure(() => page([person('pe1')], 24));
    await service.load();
    expect((calls[0] as { limit?: number }).limit).toBe(10);

    await service.goTo(3);
    expect((calls[1] as { offset?: number }).offset).toBe(20);
    expect(service.page()).toBe(3);
  });

  it('loads picker choices separately from the paged list', async () => {
    const service = configure(() => page([person('pe1'), person('pe2')], 2));
    await service.loadChoices();
    expect(service.choices().length).toBe(2);
    expect((calls[0] as { limit?: number }).limit).toBe(100);
  });

  it('reloads the page after creating a person and adds it to the choices', async () => {
    const service = configure((name) =>
      name === 'createPerson' ? person('pe2', { name: 'Mr Idris' }) : page([person('pe1')]),
    );
    await service.load();

    const created = await service.add({ name: 'Mr Idris' });

    expect(created?.id).toBe('pe2');
    expect(service.choices()[0].name).toBe('Mr Idris');
  });

  it('shows the API error when a duplicate name is rejected', async () => {
    const service = configure((name) => {
      if (name === 'createPerson') {
        throw { error: { detail: 'A person with that name already exists' } };
      }
      return page([]);
    });

    expect(await service.add({ name: 'Mum' })).toBeNull();
    expect(service.error()).toBe('A person with that name already exists');
  });

  it('replaces the edited row in the list', async () => {
    const service = configure((name) =>
      name === 'updatePerson' ? person('pe1', { role: 'foreman' }) : page([person('pe1')]),
    );
    await service.load();

    await service.edit('pe1', { role: 'foreman' });
    expect(service.people()[0].role).toBe('foreman');
  });

  it('reloads the page after archiving a person', async () => {
    const service = configure(() => page([person('pe1')]));
    await service.load();

    await service.archive('pe1');

    expect(names).toContain('archivePerson');
    expect(names.filter((n) => n === 'listPeople').length).toBe(2);
  });

  it('reloads the page after restoring a person', async () => {
    const service = configure(() => page([person('pe1')]));
    await service.restore('pe1');

    expect(names).toContain('restorePerson');
    expect(names).toContain('listPeople');
  });

  it('loads the expense summary per project', async () => {
    const service = configure(() => ({
      person_id: 'pe1',
      name: 'Mum',
      projects: [{ project_id: 'p1', currency_code: 'NGN', spent_amount: 37_500_00 }],
    }));

    expect((await service.expenseSummary('pe1'))?.projects.length).toBe(1);
  });

  it('returns null when the expense summary fails to load', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });
    expect(await service.expenseSummary('pe1')).toBeNull();
  });
});
