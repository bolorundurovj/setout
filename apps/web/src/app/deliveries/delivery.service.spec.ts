import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { DeliveryService } from './delivery.service';

function owed(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    project_id: 'p1',
    expense_id: 'e1',
    vendor_id: 'v1',
    vendor_name: 'Corner Depot Cement',
    description: '17 bags of cement',
    promised: 'this week',
    amount: 7_650_000,
    currency_code: 'NGN',
    currency_exponent: 2,
    spent_on: '2026-08-14',
    received_at: null,
    created_at: '2026-08-14T00:00:00Z',
    updated_at: '2026-08-14T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

function page(items: ReturnType<typeof owed>[], over: Record<string, unknown> = {}) {
  return {
    items,
    total: items.length,
    owed_amount: items.filter((row) => !row.received_at).reduce((sum, row) => sum + row.amount, 0),
    limit: 10,
    offset: 0,
    ...over,
  };
}

describe('DeliveryService', () => {
  const asked: Record<string, unknown>[] = [];

  function configure(reply: (name: string, params: Record<string, unknown>) => unknown) {
    TestBed.resetTestingModule();
    asked.length = 0;
    const api = {
      invoke: async (fn: { name?: string }, params: Record<string, unknown>) => {
        asked.push({ call: fn?.name ?? '', ...params });
        return reply(fn?.name ?? '', params ?? {});
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(DeliveryService);
  }

  it('keeps waiting, delivered and a vendor apart, so loading one empties none', async () => {
    const service = configure((name, params) => {
      if (name === 'listAllDeliveries') {
        return page([owed('b')]);
      }
      return params['received_only'] ? page([owed('c', { received_at: 'x' })]) : page([owed('a')]);
    });

    await service.loadWaiting('p1');
    await service.loadArrived('p1');
    await service.loadForVendor('v1');

    expect(service.waiting('p1').rows.map((r) => r.id)).toEqual(['a']);
    expect(service.arrived('p1').rows.map((r) => r.id)).toEqual(['c']);
    expect(service.forVendor('v1').rows.map((r) => r.id)).toEqual(['b']);
  });

  it('answers with nothing for a project it has not loaded', () => {
    const service = configure(() => page([]));
    expect(service.waiting('unknown').rows).toEqual([]);
    expect(service.arrived('unknown').total).toBe(0);
    expect(service.forVendor('unknown').owed).toBe(0);
  });

  it('asks for one page of ten and skips to the page it was sent to', async () => {
    const service = configure(() => page([]));

    await service.loadWaiting('p1', 3);

    expect(asked[0]['limit']).toBe(10);
    expect(asked[0]['offset']).toBe(20);
  });

  it('counts what is owed across every page, not the rows in hand', async () => {
    const service = configure(() => page([owed('a')], { total: 14, owed_amount: 20_000_000 }));

    await service.loadWaiting('p1');

    expect(service.waiting('p1').rows.length).toBe(1);
    expect(service.waiting('p1').total).toBe(14);
    expect(service.waiting('p1').owed).toBe(20_000_000);
  });

  it('moves every copy of a row that gets marked delivered', async () => {
    const service = configure((name) => {
      if (name === 'receiveDelivery') {
        return owed('b', { received_at: '2026-08-16T00:00:00Z' });
      }
      return name === 'listAllDeliveries' ? page([owed('b')]) : page([owed('a'), owed('b')]);
    });
    await service.loadWaiting('p1');
    await service.loadForVendor('v1');

    await service.receive('b');

    expect(service.waiting('p1').rows.find((r) => r.id === 'b')?.received_at).toBeTruthy();
    expect(service.forVendor('v1').rows[0].received_at).toBeTruthy();
    expect(service.waiting('p1').owed).toBe(7_650_000);
  });

  it('takes a removed row out of every list holding it', async () => {
    const service = configure((name) =>
      name === 'listAllDeliveries' ? page([owed('b')]) : page([owed('a'), owed('b')]),
    );
    await service.loadWaiting('p1');
    await service.loadForVendor('v1');

    await service.remove('b');

    expect(service.waiting('p1').rows.map((r) => r.id)).toEqual(['a']);
    expect(service.waiting('p1').total).toBe(1);
    expect(service.waiting('p1').owed).toBe(7_650_000);
    expect(service.forVendor('v1').rows).toEqual([]);
  });

  it('files a new one under what the project is still waiting for', async () => {
    const service = configure((name) => (name === 'addDelivery' ? owed('new') : page([owed('a')])));
    await service.loadWaiting('p1');

    await service.add('p1', { expense_id: 'e9' });

    expect(service.waiting('p1').rows.map((r) => r.id)).toEqual(['new', 'a']);
    expect(service.waiting('p1').total).toBe(2);
    expect(service.waiting('p1').owed).toBe(15_300_000);
  });

  it('puts a corrected row back in place of the old one', async () => {
    const service = configure((name) =>
      name === 'updateDelivery'
        ? owed('a', { description: '18 bags of cement' })
        : page([owed('a')]),
    );
    await service.loadWaiting('p1');

    const changed = await service.update('a', { description: '18 bags of cement' });

    expect(changed?.description).toBe('18 bags of cement');
    expect(service.waiting('p1').rows[0].description).toBe('18 bags of cement');
  });

  it('says so when the list cannot be read', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });
    await service.loadWaiting('p1');
    expect(service.error()).toBe('Could not load what is still owed.');
    expect(service.waiting('p1').rows).toEqual([]);
  });
});
