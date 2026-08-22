import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { detailOf } from '../api-error';
import { ItemService } from './item.service';

function item(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Cement',
    unit: 'bag',
    notes: null,
    purchase_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

function page(items: unknown[], total = items.length) {
  return { items, total, limit: 50, offset: 0 };
}

describe('ItemService', () => {
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
    return TestBed.inject(ItemService);
  }

  it('loads the catalogue', async () => {
    const service = configure(() => page([item('i1')]));
    await service.load();

    expect(service.items().length).toBe(1);
    expect(service.total()).toBe(1);
    expect(service.loading()).toBe(false);
  });

  it('reports a failure instead of throwing', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });
    await service.load();

    expect(service.error()).toBe('Could not load the items.');
    expect(service.loading()).toBe(false);
  });

  it('passes a search term through and drops an empty one', async () => {
    const service = configure(() => page([]));
    await service.load('inch');
    expect((calls[0] as { search?: string }).search).toBe('inch');

    await service.load('');
    expect((calls[1] as { search?: string }).search).toBeUndefined();
  });

  it('asks for ten rows at the offset of the page wanted', async () => {
    const service = configure(() => page([item('i1')], 24));
    await service.load();
    expect((calls[0] as { limit?: number; offset?: number }).limit).toBe(10);
    expect((calls[0] as { offset?: number }).offset).toBe(0);

    await service.goTo(3);
    expect((calls[1] as { offset?: number }).offset).toBe(20);
    expect(service.page()).toBe(3);
  });

  it('goes back to the first page when the search changes', async () => {
    const service = configure(() => page([item('i1')], 24));
    await service.goTo(3);
    await service.load('inch');
    expect(service.page()).toBe(1);
  });

  it('keeps the search term when turning a page', async () => {
    const service = configure(() => page([item('i1')], 24));
    await service.load('inch');
    await service.goTo(2);
    expect((calls[1] as { search?: string }).search).toBe('inch');
  });

  it('holds every choice apart from the page, for the pickers', async () => {
    const service = configure(() => page([item('i1'), item('i2')], 2));
    await service.loadChoices();
    expect(service.choices().length).toBe(2);
    expect((calls[0] as { limit?: number }).limit).toBe(100);
  });

  it('reads the page back from the server after adding, and offers the new choice', async () => {
    const service = configure((name) =>
      name === 'createItem' ? item('i2', { name: 'Blocks' }) : page([item('i1')]),
    );
    await service.load();

    const created = await service.add({ name: 'Blocks' });

    expect(created?.id).toBe('i2');
    expect(names.filter((n) => n === 'listItems').length).toBe(2);
    expect(service.choices()[0].name).toBe('Blocks');
    expect(service.saving()).toBe(false);
  });

  it('surfaces the reason a duplicate name was refused', async () => {
    const service = configure((name) => {
      if (name === 'createItem') {
        throw { error: { detail: 'An item with that name already exists' } };
      }
      return page([]);
    });

    const created = await service.add({ name: 'Cement' });

    expect(created).toBeNull();
    expect(service.error()).toBe('An item with that name already exists');
  });

  it('replaces the row it edited', async () => {
    const service = configure((name) =>
      name === 'updateItem' ? item('i1', { unit: 'truck' }) : page([item('i1')]),
    );
    await service.load();

    await service.edit('i1', { unit: 'truck' });
    expect(service.items()[0].unit).toBe('truck');
  });

  it('reads the page back after archiving, and steps back off an emptied one', async () => {
    const service = configure((name) => (name === 'listItems' ? page([], 10) : undefined));
    await service.goTo(2);

    await service.remove('i1');

    expect(names).toContain('deleteItem');
    expect(service.page()).toBe(1);
  });

  it('reloads after a restore', async () => {
    const service = configure(() => page([item('i1')]));
    await service.restore('i1');

    expect(names).toContain('restoreItem');
    expect(names).toContain('listItems');
  });

  it('returns null rather than throwing when prices cannot be read', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });
    expect(await service.prices('i1')).toBeNull();
    expect(await service.lastPrice('p1', 'i1')).toBeNull();
  });

  it('unwraps the last price for a project', async () => {
    const service = configure(() => ({
      item_id: 'i1',
      project_id: 'p1',
      last_price: { item_id: 'i1', unit_rate: 11_000_00 },
    }));
    const last = await service.lastPrice('p1', 'i1');

    expect(last?.unit_rate).toBe(11_000_00);
    expect(calls[0]).toEqual({ project_id: 'p1', item_id: 'i1' });
  });

  it('reads no last price when nothing has been bought yet', async () => {
    const service = configure(() => ({ item_id: 'i1', project_id: 'p1', last_price: null }));
    expect(await service.lastPrice('p1', 'i1')).toBeNull();
  });

  it('reads a detail off a failure, or nothing', () => {
    expect(detailOf({ error: { detail: 'nope' } })).toBe('nope');
    expect(detailOf({ error: { detail: [{ msg: 'field required' }] } })).toBe('field required');
    expect(detailOf({ error: { detail: [] } })).toBeNull();
    expect(detailOf(new Error('offline'))).toBeNull();
    expect(detailOf(undefined)).toBeNull();
  });
});
