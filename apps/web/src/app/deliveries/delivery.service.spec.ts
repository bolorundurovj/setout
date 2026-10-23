import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { DeliveryService } from './delivery.service';

function delivery(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    project_id: 'p1',
    expense_id: 'e1',
    vendor_id: 'v1',
    vendor_name: 'Corner Depot Cement',
    description: '17 bags of cement',
    expected: 'this week',
    amount: 7_650_000,
    currency_code: 'NGN',
    currency_exponent: 2,
    spent_on: '2026-08-14',
    received_at: null,
    created_at: '2026-08-14T00:00:00Z',
    updated_at: '2026-08-14T00:00:00Z',
    archived_at: null,
    ...overrides,
  };
}

function page(items: ReturnType<typeof delivery>[], overrides: Record<string, unknown> = {}) {
  return {
    items,
    total: items.length,
    outstanding_amount: items
      .filter((row) => !row.received_at)
      .reduce((sum, row) => sum + row.amount, 0),
    limit: 10,
    offset: 0,
    ...overrides,
  };
}

describe('DeliveryService', () => {
  const requests: Record<string, unknown>[] = [];

  function configure(reply: (name: string, params: Record<string, unknown>) => unknown) {
    TestBed.resetTestingModule();
    requests.length = 0;
    const api = {
      invoke: async (fn: { name?: string }, params: Record<string, unknown>) => {
        requests.push({ call: fn?.name ?? '', ...params });
        return reply(fn?.name ?? '', params ?? {});
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(DeliveryService);
  }

  it('caches outstanding, received and vendor lists separately', async () => {
    const service = configure((name, params) => {
      if (name === 'listAllDeliveries') {
        return page([delivery('b')]);
      }
      return params['received_only']
        ? page([delivery('c', { received_at: 'x' })])
        : page([delivery('a')]);
    });

    await service.loadOutstanding('p1');
    await service.loadReceived('p1');
    await service.loadForVendor('v1');

    expect(service.outstanding('p1').rows.map((r) => r.id)).toEqual(['a']);
    expect(service.received('p1').rows.map((r) => r.id)).toEqual(['c']);
    expect(service.forVendor('v1').rows.map((r) => r.id)).toEqual(['b']);
  });

  it('returns an empty list for a project that is not loaded', () => {
    const service = configure(() => page([]));
    expect(service.outstanding('unknown').rows).toEqual([]);
    expect(service.received('unknown').total).toBe(0);
    expect(service.forVendor('unknown').outstandingAmount).toBe(0);
  });

  it('requests ten rows at the offset of the requested page', async () => {
    const service = configure(() => page([]));

    await service.loadOutstanding('p1', 3);

    expect(requests[0]['limit']).toBe(10);
    expect(requests[0]['offset']).toBe(20);
  });

  it('takes the outstanding total from the server, not the loaded rows', async () => {
    const service = configure(() =>
      page([delivery('a')], { total: 14, outstanding_amount: 20_000_000 }),
    );

    await service.loadOutstanding('p1');

    expect(service.outstanding('p1').rows.length).toBe(1);
    expect(service.outstanding('p1').total).toBe(14);
    expect(service.outstanding('p1').outstandingAmount).toBe(20_000_000);
  });

  it('updates every cached copy when a delivery is marked received', async () => {
    const service = configure((name) => {
      if (name === 'receiveDelivery') {
        return delivery('b', { received_at: '2026-08-16T00:00:00Z' });
      }
      return name === 'listAllDeliveries'
        ? page([delivery('b')])
        : page([delivery('a'), delivery('b')]);
    });
    await service.loadOutstanding('p1');
    await service.loadForVendor('v1');

    await service.markReceived('b');

    expect(service.outstanding('p1').rows.find((r) => r.id === 'b')?.received_at).toBeTruthy();
    expect(service.forVendor('v1').rows[0].received_at).toBeTruthy();
    expect(service.outstanding('p1').outstandingAmount).toBe(7_650_000);
  });

  it('excludes archived rows unless requested', async () => {
    const service = configure(() => page([delivery('a')]));
    await service.loadOutstanding('p1');
    await service.loadReceived('p1', 1, true);

    expect(requests[0]['include_archived']).toBe(false);
    expect(requests[1]['include_archived']).toBe(true);
  });

  it('removes an archived row from every cached list', async () => {
    const service = configure((name) =>
      name === 'listAllDeliveries' ? page([delivery('b')]) : page([delivery('a'), delivery('b')]),
    );
    await service.loadOutstanding('p1');
    await service.loadForVendor('v1');

    await service.archive('b');

    expect(service.outstanding('p1').rows.map((r) => r.id)).toEqual(['a']);
    expect(service.outstanding('p1').total).toBe(1);
    expect(service.outstanding('p1').outstandingAmount).toBe(7_650_000);
    expect(service.forVendor('v1').rows).toEqual([]);
  });

  it('adds a created delivery to the outstanding list', async () => {
    const service = configure((name) =>
      name === 'createDelivery' ? delivery('new') : page([delivery('a')]),
    );
    await service.loadOutstanding('p1');

    await service.add('p1', { expense_id: 'e9' });

    expect(service.outstanding('p1').rows.map((r) => r.id)).toEqual(['new', 'a']);
    expect(service.outstanding('p1').total).toBe(2);
    expect(service.outstanding('p1').outstandingAmount).toBe(15_300_000);
  });

  it('replaces an updated row in place', async () => {
    const service = configure((name) =>
      name === 'updateDelivery'
        ? delivery('a', { description: '18 bags of cement' })
        : page([delivery('a')]),
    );
    await service.loadOutstanding('p1');

    const changed = await service.update('a', { description: '18 bags of cement' });

    expect(changed?.description).toBe('18 bags of cement');
    expect(service.outstanding('p1').rows[0].description).toBe('18 bags of cement');
  });

  it('shows an error when the list cannot be loaded', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });
    await service.loadOutstanding('p1');
    expect(service.error()).toBe('Could not load the deliveries.');
    expect(service.outstanding('p1').rows).toEqual([]);
  });
});
