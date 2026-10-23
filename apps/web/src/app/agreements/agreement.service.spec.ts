import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { AgreementService } from './agreement.service';

function agreement(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    project_id: 'p1',
    vendor_id: 'v1',
    vendor_name: 'Kunle Bricklaying',
    description: 'Block work',
    agreed_amount: 180_000_00,
    paid_amount: 60_000_00,
    balance_amount: 120_000_00,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    ...over,
  };
}

function page(items: unknown[], total?: number) {
  return { items, total: total ?? items.length, limit: 20, offset: 0 };
}

describe('AgreementService', () => {
  let invocations: Record<string, unknown>[];

  function configure(reply: (name: string, params: Record<string, unknown>) => unknown) {
    invocations = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (fn: { name?: string }, params: Record<string, unknown>) => {
        invocations.push({ call: fn?.name ?? '', ...params });
        const result = reply(fn?.name ?? '', params ?? {});
        if (result instanceof Error) {
          throw result;
        }
        return result;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(AgreementService);
  }

  const calls = (name: string) => invocations.filter((call) => call['call'] === name);

  it('loads the agreements for a project with the total count', async () => {
    const service = configure(() => page([agreement('a1'), agreement('a2')], 5));

    await service.load('p1');

    expect(service.agreements().map((row) => row.id)).toEqual(['a1', 'a2']);
    expect(service.agreementTotal()).toBe(5);
    expect(service.hasMore()).toBe(true);
  });

  it('sets an error and leaves the list empty when listing fails', async () => {
    const service = configure(() => new Error('offline'));

    await service.load('p1');

    expect(service.error()).toBe('Could not load the agreements.');
    expect(service.agreements()).toEqual([]);
  });

  it('totals the agreed and balance amounts', async () => {
    const service = configure(() =>
      page([
        agreement('a1', { agreed_amount: 100_00, balance_amount: 40_00 }),
        agreement('a2', { agreed_amount: 250_00, balance_amount: 0 }),
      ]),
    );

    await service.load('p1');

    expect(service.agreedTotal()).toBe(350_00);
    expect(service.balanceTotal()).toBe(40_00);
  });

  it('skips loadMore when all rows are loaded', async () => {
    const service = configure(() => page([agreement('a1')], 1));
    await service.load('p1');

    await service.loadMore('p1');

    expect(calls('listAgreements').length).toBe(1);
  });

  it('loads payments in one request and groups them by agreement', async () => {
    const service = configure((name) =>
      name === 'listAgreements'
        ? page([agreement('a1'), agreement('a2')])
        : page([
            { id: 'e1', agreement_id: 'a1', amount: 60_000_00 },
            { id: 'e2', agreement_id: 'a2', amount: 10_000_00 },
            { id: 'e3', agreement_id: 'a1', amount: 5_000_00 },
          ]),
    );

    await service.loadAll('p1');

    expect(calls('listExpenses').length).toBe(1);
    expect(service.payments()['a1'].map((row) => row.id)).toEqual(['e1', 'e3']);
    expect(service.payments()['a2'].map((row) => row.id)).toEqual(['e2']);
  });

  it('pages through payments until the total is reached', async () => {
    const rows = Array.from({ length: 120 }, (_, index) => ({
      id: `e${index}`,
      agreement_id: 'a1',
      amount: 100,
    }));
    const service = configure((name, params) => {
      if (name === 'listAgreements') {
        return page([agreement('a1')]);
      }
      const from = Number(params['offset'] ?? 0);
      return { items: rows.slice(from, from + 100), total: rows.length, limit: 100, offset: from };
    });

    await service.loadAll('p1');

    expect(calls('listExpenses').length).toBe(2);
    expect(service.payments()['a1'].length).toBe(120);
  });

  it('sets an error when loading payments fails', async () => {
    const service = configure((name) =>
      name === 'listExpenses' ? new Error('offline') : page([agreement('a1')]),
    );

    await service.loadAll('p1');

    expect(service.error()).toBe('Could not load payments.');
    expect(service.payments()['a1']).toBeUndefined();
  });

  it('prepends a created agreement and increments the total', async () => {
    const service = configure((name) =>
      name === 'createAgreement' ? agreement('new') : page([agreement('a1')], 1),
    );
    await service.load('p1');

    const created = await service.create('p1', {
      vendor_id: 'v1',
      description: 'Roofing',
      agreed_amount: 10_000,
    });

    expect(created?.id).toBe('new');
    expect(service.agreements().map((row) => row.id)).toEqual(['new', 'a1']);
    expect(service.agreementTotal()).toBe(2);
  });

  it('surfaces the server error detail when creating fails', async () => {
    const service = configure((name) =>
      name === 'createAgreement'
        ? Object.assign(new Error('refused'), { error: { detail: 'That vendor is archived' } })
        : page([]),
    );

    const created = await service.create('p1', {
      vendor_id: 'v1',
      description: 'Roofing',
      agreed_amount: 1,
    });

    expect(created).toBeNull();
    expect(service.error()).toBe('That vendor is archived');
    expect(service.saving()).toBe(false);
  });

  it('removes an archived agreement from the list and decrements the total', async () => {
    const service = configure((name) =>
      name === 'listAgreements' ? page([agreement('a1'), agreement('a2')], 2) : undefined,
    );
    await service.load('p1');

    await service.archive('a1');

    expect(service.agreements().map((row) => row.id)).toEqual(['a2']);
    expect(service.agreementTotal()).toBe(1);
  });

  it('excludes archived agreements and advances unless include_archived is set', async () => {
    const service = configure((name) =>
      name === 'listAgreements' ? page([agreement('a1')], 1) : page([{ id: 'ad1' }], 1),
    );
    await service.loadAll('p1');
    await service.loadAdvances('p1');
    expect(calls('listAgreements')[0]['include_archived']).toBe(false);
    expect(calls('listAdvances')[0]['include_archived']).toBe(false);

    await service.loadAll('p1', true);
    await service.loadAdvances('p1');
    expect(calls('listAgreements')[1]['include_archived']).toBe(true);
    expect(calls('listAdvances')[1]['include_archived']).toBe(true);
  });

  it('replaces a restored agreement in place with archived_at cleared', async () => {
    const service = configure((name) => {
      if (name === 'listAgreements') {
        return page([agreement('a1', { archived_at: '2026-09-01T00:00:00Z' })], 1);
      }
      return name === 'restoreAgreement' ? agreement('a1') : undefined;
    });
    await service.loadAll('p1', true);

    const restored = await service.restore('a1');

    expect(restored?.archived_at).toBeNull();
    expect(service.agreements()[0].archived_at).toBeNull();
  });

  it('reloads advances and balances after restoring an advance', async () => {
    const service = configure((name) =>
      name === 'listBalances'
        ? []
        : name === 'restoreAdvance'
          ? { id: 'ad1' }
          : page([{ id: 'ad1' }]),
    );

    await service.restoreAdvance('p1', 'ad1');

    expect(calls('restoreAdvance').length).toBe(1);
    expect(calls('listAdvances').length).toBe(1);
    expect(calls('listBalances').length).toBe(1);
  });

  it('loads advances by page and records the current page', async () => {
    const service = configure(() => page([{ id: 'ad1' }], 24));

    await service.loadAdvances('p1', 3);

    expect(service.advancePage()).toBe(3);
    expect(service.advanceTotal()).toBe(24);
    expect(calls('listAdvances')[0]['offset']).toBe(20);
  });

  it('reloads advances and balances after creating an advance', async () => {
    const service = configure((name) => (name === 'listBalances' ? [] : page([{ id: 'ad1' }])));

    await service.createAdvance('p1', { person_id: 'pe1', amount: 5_000 });

    expect(calls('listAdvances').length).toBe(1);
    expect(calls('listBalances').length).toBe(1);
  });

  it('moves to the previous page when archiving the last advance on a page', async () => {
    let rows: unknown[] = [{ id: 'ad1' }];
    const service = configure((name) => {
      if (name === 'listBalances') {
        return [];
      }
      if (name === 'listAdvances') {
        const result = page(rows, 10);
        rows = [];
        return result;
      }
      return undefined;
    });
    await service.loadAdvances('p1', 2);

    await service.archiveAdvance('p1', 'ad1');

    const pages = calls('listAdvances').map((call) => call['offset']);
    expect(pages).toEqual([10, 10, 0]);
  });

  it('clears cached state on project change', async () => {
    let rows = [agreement('a1')];
    const service = configure((name) =>
      name === 'listAgreements' ? page(rows) : page([{ id: 'e1', agreement_id: 'a1' }]),
    );
    await service.loadAll('p1');
    expect(service.agreements().length).toBe(1);
    expect(Object.keys(service.payments())).toEqual(['a1']);

    rows = [];
    await service.load('p2');

    expect(service.agreements()).toEqual([]);
    expect(service.payments()).toEqual({});
    expect(service.agreementTotal()).toBe(0);
  });

  it('keeps cached state for the same project', async () => {
    const service = configure((name) =>
      name === 'listAgreements'
        ? page([agreement('a1')], 1)
        : page([{ id: 'e1', agreement_id: 'a1' }]),
    );
    await service.loadAll('p1');

    await service.loadBalances('p1');

    expect(service.agreements().length).toBe(1);
    expect(service.payments()['a1'].length).toBe(1);
  });

  it('replaces an updated agreement in place', async () => {
    const service = configure((name) =>
      name === 'updateAgreement'
        ? agreement('a1', { description: 'Block work and rendering', agreed_amount: 200_000_00 })
        : page([agreement('a1'), agreement('a2')]),
    );
    await service.load('p1');

    const changed = await service.edit('a1', { agreed_amount: 200_000_00 });

    expect(changed?.agreed_amount).toBe(200_000_00);
    expect(service.agreements()[0].description).toBe('Block work and rendering');
    expect(service.agreements()[1].id).toBe('a2');
  });

  it('reloads advances and balances after updating an advance', async () => {
    const service = configure((name) =>
      name === 'updateAdvance'
        ? { id: 'ad1', person_name: 'Aunty Ngozi', amount: 9_000 }
        : page([]),
    );

    const changed = await service.editAdvance('p1', 'ad1', { amount: 9_000 });

    expect(changed?.amount).toBe(9_000);
    expect(calls('listAdvances').length).toBe(1);
    expect(calls('listBalances').length).toBe(1);
  });

  it('surfaces the server error detail when updating fails', async () => {
    const service = configure((name) =>
      name === 'updateAgreement'
        ? Object.assign(new Error('no'), {
            error: { detail: 'Agreed amount is below what is paid' },
          })
        : page([agreement('a1')]),
    );
    await service.load('p1');

    expect(await service.edit('a1', { agreed_amount: 1 })).toBeNull();
    expect(service.error()).toBe('Agreed amount is below what is paid');
  });
});
