import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { VendorService } from './vendor.service';

function vendor(id: string, overrides: Record<string, unknown> = {}) {
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
    archived_at: null,
    ...overrides,
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

  it('excludes archived vendors unless include_archived is set', async () => {
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

    expect(service.error()).toBe('Could not load the vendors.');
    expect(service.loading()).toBe(false);
  });

  it('requests ten rows at the offset of the requested page', async () => {
    const service = configure(() => page([vendor('v1')], 24));
    await service.load();
    expect((calls[0] as { limit?: number }).limit).toBe(10);

    await service.goTo(3);
    expect((calls[1] as { offset?: number }).offset).toBe(20);
    expect(service.page()).toBe(3);
  });

  it('keeps the search and archived filter when changing page', async () => {
    const service = configure(() => page([vendor('v1')], 24));
    await service.load('block', true);
    await service.goTo(2);
    const asked = calls[1] as { search?: string; include_archived?: boolean };
    expect(asked.search).toBe('block');
    expect(asked.include_archived).toBe(true);
  });

  it('loads picker choices separately from the paged list', async () => {
    const service = configure(() => page([vendor('v1'), vendor('v2')], 2));
    await service.loadChoices();
    expect(service.choices().length).toBe(2);
    expect((calls[0] as { limit?: number }).limit).toBe(100);
  });

  it('reloads the page after creating a vendor and adds it to the choices', async () => {
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

  it('shows the API error when a duplicate name is rejected', async () => {
    const service = configure((name) => {
      if (name === 'createVendor') {
        throw { error: { detail: 'A vendor with that name already exists' } };
      }
      return page([]);
    });

    expect(await service.add({ name: 'Segun Blocks Owode' })).toBeNull();
    expect(service.error()).toBe('A vendor with that name already exists');
  });

  it('replaces the edited row in the list', async () => {
    const service = configure((name) =>
      name === 'updateVendor' ? vendor('v1', { phone: '0800 000 0001' }) : page([vendor('v1')]),
    );
    await service.load();

    await service.edit('v1', { phone: '0800 000 0001' });
    expect(service.vendors()[0].phone).toBe('0800 000 0001');
  });

  it('reloads the page after archiving a vendor', async () => {
    const service = configure(() => page([vendor('v1')]));
    await service.load();

    await service.archive('v1');

    expect(names).toContain('archiveVendor');
    expect(names.filter((n) => n === 'listVendors').length).toBe(2);
  });

  it('reloads the page after restoring a vendor', async () => {
    const service = configure(() => page([vendor('v1')]));
    await service.restore('v1');

    expect(names).toContain('restoreVendor');
    expect(names).toContain('listVendors');
  });

  it('loads the expense summary per project', async () => {
    const service = configure(() => ({
      vendor_id: 'v1',
      name: 'Bright Star Aluminium',
      projects: [{ project_id: 'p1', currency_code: 'NGN', spent_amount: 750_000_00 }],
    }));

    const summary = await service.expenseSummary('v1');
    expect(summary?.projects.length).toBe(1);
  });

  it('returns null when the expense summary fails to load', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });
    expect(await service.expenseSummary('v1')).toBeNull();
  });

  it('ignores a stale response for an earlier search', async () => {
    const pendingReplies: (() => void)[] = [];
    const service = configure((_name, args) => {
      if ((args as { search?: string }).search === 'On') {
        return new Promise((settle) =>
          pendingReplies.push(() => settle(page([vendor('v-stale', { name: 'Stale' })]))),
        );
      }
      return page([vendor('v-fresh', { name: 'Fresh' })]);
    });

    const slow = service.load('On');
    await service.load('Ondo');
    pendingReplies.forEach((release) => release());
    await slow;

    expect(service.vendors().map((row) => row.name)).toEqual(['Fresh']);
    expect(service.loading()).toBe(false);
  });
});
