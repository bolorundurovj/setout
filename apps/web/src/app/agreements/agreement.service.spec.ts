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
    deleted_at: null,
    ...over,
  };
}

function page(items: unknown[], total?: number) {
  return { items, total: total ?? items.length, limit: 20, offset: 0 };
}

describe('AgreementService', () => {
  let asked: Record<string, unknown>[];

  function configure(reply: (name: string, params: Record<string, unknown>) => unknown) {
    asked = [];
    TestBed.resetTestingModule();
    const api = {
      invoke: async (fn: { name?: string }, params: Record<string, unknown>) => {
        asked.push({ call: fn?.name ?? '', ...params });
        const answer = reply(fn?.name ?? '', params ?? {});
        if (answer instanceof Error) {
          throw answer;
        }
        return answer;
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(AgreementService);
  }

  const calls = (name: string) => asked.filter((call) => call['call'] === name);

  it('reads the agreements on a project and says how many there are', async () => {
    const service = configure(() => page([agreement('a1'), agreement('a2')], 5));

    await service.load('p1');

    expect(service.agreements().map((row) => row.id)).toEqual(['a1', 'a2']);
    expect(service.agreementTotal()).toBe(5);
    expect(service.hasMore()).toBe(true);
  });

  it('says so rather than showing a half list when the read fails', async () => {
    const service = configure(() => new Error('offline'));

    await service.load('p1');

    expect(service.error()).toBe('Could not load the agreements.');
    expect(service.agreements()).toEqual([]);
  });

  it('adds up what was agreed and what is still owed', async () => {
    const service = configure(() =>
      page([
        agreement('a1', { agreed_amount: 100_00, balance_amount: 40_00 }),
        agreement('a2', { agreed_amount: 250_00, balance_amount: 0 }),
      ]),
    );

    await service.load('p1');

    expect(service.agreedTotal()).toBe(350_00);
    expect(service.owedTotal()).toBe(40_00);
  });

  it('asks for nothing more once the whole list is in hand', async () => {
    const service = configure(() => page([agreement('a1')], 1));
    await service.load('p1');

    await service.loadMore('p1');

    expect(calls('listAgreements').length).toBe(1);
  });

  it('reads every payment in one request and groups them by agreement', async () => {
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

  it('keeps asking while there are more payments than one page holds', async () => {
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

  it('says so rather than showing an agreement as unpaid when the read fails', async () => {
    const service = configure((name) =>
      name === 'listExpenses' ? new Error('offline') : page([agreement('a1')]),
    );

    await service.loadAll('p1');

    expect(service.error()).toBe('Could not read what has been paid.');
    expect(service.payments()['a1']).toBeUndefined();
  });

  it('puts a new agreement at the top and counts it', async () => {
    const service = configure((name) =>
      name === 'addAgreement' ? agreement('new') : page([agreement('a1')], 1),
    );
    await service.load('p1');

    const made = await service.add('p1', {
      vendor_id: 'v1',
      description: 'Roofing',
      agreed_amount: 10_000,
    });

    expect(made?.id).toBe('new');
    expect(service.agreements().map((row) => row.id)).toEqual(['new', 'a1']);
    expect(service.agreementTotal()).toBe(2);
  });

  it('repeats what the server said about an agreement it would not take', async () => {
    const service = configure((name) =>
      name === 'addAgreement'
        ? Object.assign(new Error('refused'), { error: { detail: 'That vendor is archived' } })
        : page([]),
    );

    const made = await service.add('p1', {
      vendor_id: 'v1',
      description: 'Roofing',
      agreed_amount: 1,
    });

    expect(made).toBeNull();
    expect(service.error()).toBe('That vendor is archived');
    expect(service.saving()).toBe(false);
  });

  it('takes a removed agreement out of the list and off the count', async () => {
    const service = configure((name) =>
      name === 'listAgreements' ? page([agreement('a1'), agreement('a2')], 2) : undefined,
    );
    await service.load('p1');

    await service.remove('a1');

    expect(service.agreements().map((row) => row.id)).toEqual(['a2']);
    expect(service.agreementTotal()).toBe(1);
  });

  it('reads advances a page at a time and remembers which page it is on', async () => {
    const service = configure(() => page([{ id: 'ad1' }], 24));

    await service.loadAdvances('p1', 3);

    expect(service.advancePage()).toBe(3);
    expect(service.advanceTotal()).toBe(24);
    expect(calls('listAdvances')[0]['offset']).toBe(20);
  });

  it('reads the balances again once an advance is given, since they move together', async () => {
    const service = configure((name) => (name === 'listBalances' ? [] : page([{ id: 'ad1' }])));

    await service.addAdvance('p1', { person_id: 'pe1', amount: 5_000 });

    expect(calls('listAdvances').length).toBe(1);
    expect(calls('listBalances').length).toBe(1);
  });

  it('steps back a page when removing the last advance on it empties it', async () => {
    let rows: unknown[] = [{ id: 'ad1' }];
    const service = configure((name) => {
      if (name === 'listBalances') {
        return [];
      }
      if (name === 'listAdvances') {
        const answer = page(rows, 10);
        rows = [];
        return answer;
      }
      return undefined;
    });
    await service.loadAdvances('p1', 2);

    await service.removeAdvance('p1', 'ad1');

    const pages = calls('listAdvances').map((call) => call['offset']);
    expect(pages).toEqual([10, 10, 0]);
  });

  it('empties what it holds when a different project is asked about', async () => {
    let held = [agreement('a1')];
    const service = configure((name) =>
      name === 'listAgreements' ? page(held) : page([{ id: 'e1', agreement_id: 'a1' }]),
    );
    await service.loadAll('p1');
    expect(service.agreements().length).toBe(1);
    expect(Object.keys(service.payments())).toEqual(['a1']);

    held = [];
    await service.load('p2');

    // The old project's rows must not sit under the new one's name.
    expect(service.agreements()).toEqual([]);
    expect(service.payments()).toEqual({});
    expect(service.agreementTotal()).toBe(0);
  });

  it('keeps what it holds while the same project is asked again', async () => {
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

  it('puts a corrected agreement back in place of the old one', async () => {
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

  it('reads the advances and balances again once one is corrected', async () => {
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

  it('repeats what the server said about a correction it would not take', async () => {
    const service = configure((name) =>
      name === 'updateAgreement'
        ? Object.assign(new Error('no'), {
            error: { detail: 'Agreed price is below what is paid' },
          })
        : page([agreement('a1')]),
    );
    await service.load('p1');

    expect(await service.edit('a1', { agreed_amount: 1 })).toBeNull();
    expect(service.error()).toBe('Agreed price is below what is paid');
  });
});
