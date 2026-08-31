import { TestBed } from '@angular/core/testing';
import type { AgreementRead, ProjectRead } from '@setout/api-client';
import { PersonService } from '../people/person.service';
import { ToastService } from '../toast.service';
import { ExpenseService } from '../expenses/expense.service';
import { VendorService } from '../vendors/vendor.service';
import { AgreementService } from './agreement.service';
import { AgreementsComponent } from './agreements.component';

const project: ProjectRead = {
  id: 'p1',
  name: 'Jacaranda Close, Ewuru',
  currency_code: 'NGN',
  currency_exponent: 2,
  land_id: null,
  land_name: null,
  status: 'active',
  notes: null,
  planned_amount: 0,
  spent_amount: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

function agreement(over: Partial<AgreementRead> = {}): AgreementRead {
  return {
    id: 'a1',
    project_id: 'p1',
    vendor_id: 'v1',
    vendor_name: 'Idris Bricklaying',
    description: 'Block work',
    agreed_amount: 22_300_000,
    paid_amount: 0,
    balance_amount: 22_300_000,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

describe('AgreementsComponent', () => {
  let added: unknown[][];
  let advances: unknown[][];
  let payments: unknown[][];

  function render(rows: AgreementRead[] = [], balances: unknown[] = []) {
    added = [];
    advances = [];
    payments = [];
    const service = {
      agreements: () => rows,
      advances: () => [],
      balances: () => balances,
      payments: () => ({}),
      agreementTotal: () => rows.length,
      advanceTotal: () => 0,
      advancePage: () => 1,
      hasMore: () => false,
      loadAll: async () => undefined,
      loadMore: async () => undefined,
      saving: () => false,
      error: () => null,
      agreedTotal: () => rows.reduce((t, r) => t + r.agreed_amount, 0),
      owedTotal: () => rows.reduce((t, r) => t + r.balance_amount, 0),
      load: async () => undefined,
      loadAdvances: async () => undefined,
      loadBalances: async () => undefined,
      add: async (...args: unknown[]) => {
        added.push(args);
        return agreement();
      },
      addAdvance: async (...args: unknown[]) => {
        advances.push(args);
        return { id: 'ad1', person_name: 'Mummy', amount: 10_000_000 };
      },
      remove: async () => undefined,
      removeAdvance: async () => undefined,
    };
    const list = {
      vendors: () => [],
      people: () => [],
      choices: () => [],
      load: async () => undefined,
      loadChoices: async () => undefined,
    };
    const expenses = {
      error: () => null,
      add: async (...args: unknown[]) => {
        payments.push(args);
        return { id: 'e1', description: 'Part payment' };
      },
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AgreementsComponent],
      providers: [
        { provide: AgreementService, useValue: service },
        { provide: ExpenseService, useValue: expenses },
        { provide: VendorService, useValue: list },
        { provide: PersonService, useValue: list },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(AgreementsComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('adds up what is still owed', () => {
    const component = render([
      agreement({ balance_amount: 6_000_000 }),
      agreement({ id: 'a2', balance_amount: 1_000_000 }),
    ]);
    expect(component.agreements.owedTotal()).toBe(7_000_000);
  });

  it('fills the meter by what has been paid', () => {
    const component = render();
    expect(component.paidPercent(agreement({ agreed_amount: 1000, paid_amount: 250 }))).toBe(25);
    expect(component.paidPercent(agreement({ agreed_amount: 1000, paid_amount: 5000 }))).toBe(100);
    expect(component.paidPercent(agreement({ agreed_amount: 0, paid_amount: 500 }))).toBe(0);
  });

  it('calls an agreement settled once nothing is owed', () => {
    const component = render();
    expect(component.settled(agreement({ balance_amount: 0 }))).toBe(true);
    expect(component.settled(agreement({ balance_amount: 1 }))).toBe(false);
  });

  it('will not save an agreement without a vendor and a price', async () => {
    const component = render();
    expect(component.canSave()).toBe(false);

    component.vendorId.set('v1');
    component.description.set('Block work');
    expect(component.canSave()).toBe(false);

    component.agreedAmount.set('223000');
    expect(component.canSave()).toBe(true);

    await component.save();
    expect(added[0][1]).toEqual({
      vendor_id: 'v1',
      description: 'Block work',
      agreed_amount: 22_300_000,
    });
  });

  it('says whether someone holds money or is owed it', () => {
    const component = render();
    expect(component.holding(37_500_00)).toBe('holds');
    expect(component.holding(-11_000_00)).toBe('is owed');
    expect(component.holding(0)).toBe('holds');
  });

  it('will not give an advance without a person and an amount', async () => {
    const component = render();
    expect(component.canSaveAdvance()).toBe(false);

    component.personId.set('pe1');
    component.advanceAmount.set('100000');
    expect(component.canSaveAdvance()).toBe(true);

    await component.saveAdvance();
    expect(advances[0][1]).toEqual({ person_id: 'pe1', amount: 10_000_000 });
  });

  it('records a payment as an expense against the agreement', async () => {
    const component = render([agreement()]);
    component.startPayment('a1');
    component.paymentAmount.set('70000');
    expect(component.canPay()).toBe(true);

    await component.savePayment(agreement());

    expect(payments.length).toBe(1);
    const body = payments[0][1] as Record<string, unknown>;
    expect(body['agreement_id']).toBe('a1');
    expect(body['amount']).toBe(7_000_000);
    expect(body['vendor_id']).toBe('v1');
  });

  it('will not record a payment of nothing', () => {
    const component = render([agreement()]);
    component.startPayment('a1');
    expect(component.canPay()).toBe(false);
    component.paymentAmount.set('0');
    expect(component.canPay()).toBe(false);
  });

  it('shows figures without repeating the currency', () => {
    const component = render();
    expect(component.bare(22_300_000)).toBe('223,000');
    expect(component.bare(6_000_000)).toBe('60,000');
  });
});
