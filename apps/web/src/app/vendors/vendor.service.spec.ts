import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { VendorService } from './vendor.service';

function vendor(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name: 'Segun Blocks Owode',
    trade: 'block supplier',
    contact_name: 'Mr Segun',
    phone: null,
    email: null,
    notes: null,
    expense_count: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

function page(items: unknown[], total = items.length) {
  return { items, total, limit: 50, offset: 0 };
}

describe('VendorService', () => {
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
    return TestBed.inject(VendorService);
  }

  it('loads the vendors', async () => {
    const service = configure(() => page([vendor('v1')]));
    await service.load();

    expect(service.vendors().length).toBe(1);
    expect(service.total()).toBe(1);
  });

  it('leaves the archived out unless asked', async () => {
    const service = configure(() => page([]));
    await service.load();
    expect((calls[0] as { include_archived?: boolean }).include_archived).toBe(false);

    await service.load(undefined, true);
    expect((calls[1] as { include_archived?: boolean }).include_archived).toBe(true);
  });

  it('reports a failure instead of throwing', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });
    await service.load();

    expect(service.error()).toBe('Could not load the vendors.');
    expect(service.loading()).toBe(false);
  });

  it('asks for ten rows at the offset of the page wanted', async () => {
    const service = configure(() => page([vendor('v1')], 24));
    await service.load();
    expect((calls[0] as { limit?: number }).limit).toBe(10);

    await service.goTo(3);
    expect((calls[1] as { offset?: number }).offset).toBe(20);
    expect(service.page()).toBe(3);
  });

  it('keeps the search and the archived choice when turning a page', async () => {
    const service = configure(() => page([vendor('v1')], 24));
    await service.load('block', true);
    await service.goTo(2);
    const asked = calls[1] as { search?: string; include_archived?: boolean };
    expect(asked.search).toBe('block');
    expect(asked.include_archived).toBe(true);
  });

  it('holds every choice apart from the page, for the pickers', async () => {
    const service = configure(() => page([vendor('v1'), vendor('v2')], 2));
    await service.loadChoices();
    expect(service.choices().length).toBe(2);
    expect((calls[0] as { limit?: number }).limit).toBe(100);
  });

  it('reads the page back after adding, and offers the new choice', async () => {
    const service = configure((name) =>
      name === 'createVendor'
        ? vendor('v2', { name: 'Sawmill Jacaranda Close' })
        : page([vendor('v1')]),
    );
    await service.load();

    const created = await service.add({ name: 'Sawmill Jacaranda Close' });

    expect(created?.id).toBe('v2');
    expect(names.filter((n) => n === 'listVendors').length).toBe(2);
    expect(service.choices()[0].name).toBe('Sawmill Jacaranda Close');
  });

  it('surfaces the reason a duplicate name was refused', async () => {
    const service = configure((name) => {
      if (name === 'createVendor') {
        throw { error: { detail: 'A vendor with that name already exists' } };
      }
      return page([]);
    });

    expect(await service.add({ name: 'Segun Blocks Owode' })).toBeNull();
    expect(service.error()).toBe('A vendor with that name already exists');
  });

  it('replaces the row it edited', async () => {
    const service = configure((name) =>
      name === 'updateVendor' ? vendor('v1', { phone: '0800 000 0001' }) : page([vendor('v1')]),
    );
    await service.load();

    await service.edit('v1', { phone: '0800 000 0001' });
    expect(service.vendors()[0].phone).toBe('0800 000 0001');
  });

  it('reads the page back after archiving one', async () => {
    const service = configure(() => page([vendor('v1')]));
    await service.load();

    await service.archive('v1');

    expect(names).toContain('deleteVendor');
    expect(names.filter((n) => n === 'listVendors').length).toBe(2);
  });

  it('reloads after taking one out of the archive', async () => {
    const service = configure(() => page([vendor('v1')]));
    await service.restore('v1');

    expect(names).toContain('restoreVendor');
    expect(names).toContain('listVendors');
  });

  it('reads spend per project', async () => {
    const service = configure(() => ({
      vendor_id: 'v1',
      name: 'Bright Star Aluminium',
      projects: [{ project_id: 'p1', currency_code: 'NGN', spent_amount: 750_000_00 }],
    }));

    const spend = await service.spend('v1');
    expect(spend?.projects.length).toBe(1);
  });

  it('returns null rather than throwing when spend cannot be read', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });
    expect(await service.spend('v1')).toBeNull();
  });

  it('ignores a slow reply for a search that has been typed past', async () => {
    const held: (() => void)[] = [];
    const service = configure((_name, args) => {
      if ((args as { search?: string }).search === 'On') {
        return new Promise((settle) =>
          held.push(() => settle(page([vendor('v-stale', { name: 'Stale' })]))),
        );
      }
      return page([vendor('v-fresh', { name: 'Fresh' })]);
    });

    const slow = service.load('On');
    await service.load('Ondo');
    held.forEach((release) => release());
    await slow;

    expect(service.vendors().map((row) => row.name)).toEqual(['Fresh']);
    expect(service.loading()).toBe(false);
  });
});
