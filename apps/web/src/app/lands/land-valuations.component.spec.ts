import { TestBed } from '@angular/core/testing';
import type { LandRead, LandValuationCreate, LandValuationRead } from '@setout/api-client';
import { ProjectService } from '../projects/project.service';
import { LandService } from './land.service';
import { LandValuationsComponent } from './land-valuations.component';

function land(over: Partial<LandRead> = {}): LandRead {
  return {
    id: 'l1',
    name: 'Ewuru plot',
    address: null,
    city: null,
    state: null,
    country_code: null,
    country_name: null,
    purchased_on: null,
    currency_code: null,
    currency_exponent: null,
    purchase_amount: null,
    current_value: null,
    valuation_count: 0,
    size_value: null,
    size_unit: null,
    notes: null,
    document_count: 0,
    missing_kinds: [],
    projects: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

function entry(over: Partial<LandValuationRead> = {}): LandValuationRead {
  return {
    id: 'v1',
    land_id: 'l1',
    kind: 'valuation',
    amount: 4500000,
    currency_code: 'NGN',
    currency_exponent: 2,
    valued_on: '2023-03-11',
    note: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

describe('LandValuationsComponent', () => {
  let recorded: LandValuationCreate[];

  async function render(row: LandRead = land(), rows: LandValuationRead[] = []) {
    recorded = [];

    const lands = {
      saving: () => false,
      error: () => null,
      valuations: async () => rows,
      addValuation: async (_id: string, body: LandValuationCreate) => {
        recorded.push(body);
        return entry();
      },
      removeValuation: async () => undefined,
    };

    const projects = {
      currencies: () => [
        { code: 'NGN', name: 'Nigerian Naira', exponent: 2 },
        { code: 'JPY', name: 'Japanese Yen', exponent: 0 },
      ],
      loadCurrencies: async () => undefined,
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LandValuationsComponent],
      providers: [
        { provide: LandService, useValue: lands },
        { provide: ProjectService, useValue: projects },
      ],
    });
    const fixture = TestBed.createComponent(LandValuationsComponent);
    fixture.componentRef.setInput('land', row);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    await component.load();
    fixture.detectChanges();
    return { component, element: fixture.nativeElement as HTMLElement };
  }

  it('offers to record what it cost before anything is known', async () => {
    const { component } = await render();
    component.open();
    expect(component.kindChips().map((chip) => chip.value)).toContain('purchase');
  });

  it('stops offering a purchase once the plot has one', async () => {
    const { component } = await render(land(), [entry({ kind: 'purchase' })]);
    expect(component.kindChips().map((chip) => chip.value)).toEqual(['valuation']);
  });

  it('lets the first entry pick the currency', async () => {
    const { component } = await render();
    expect(component.pinned()).toBe('');
  });

  it('fixes the currency once the plot has one', async () => {
    const { component } = await render(land({ currency_code: 'NGN', currency_exponent: 2 }));
    expect(component.pinned()).toBe('NGN');
  });

  it('does not rescale the figure when the currency changes mid entry', async () => {
    const { component } = await render();
    component.open();
    component.amount.set('1000');

    component.currency.set('NGN');
    expect(component.exponent()).toBe(2);

    component.currency.set('JPY');
    // The typed string is untouched; only the exponent it will be read with moved.
    expect(component.amount()).toBe('1000');
    expect(component.exponent()).toBe(0);
  });

  it('converts to minor units with the currency chosen at the time', async () => {
    const { component } = await render();
    component.open();
    component.currency.set('JPY');
    component.amount.set('1000');
    component.valuedOn.set('2026-06-30');

    await component.save();

    expect(recorded[0]).toMatchObject({ amount: 1000, currency_code: 'JPY' });
  });

  it('will not save without an amount, a currency and a day', async () => {
    const { component } = await render();
    component.open();
    expect(component.isValid()).toBe(false);

    component.currency.set('NGN');
    component.amount.set('45000');
    expect(component.isValid()).toBe(false);

    component.valuedOn.set('2023-03-11');
    expect(component.isValid()).toBe(true);
  });

  it('shows what it moved by since the entry before it', async () => {
    const { component } = await render(land({ currency_code: 'NGN', currency_exponent: 2 }), [
      entry({ id: 'v2', amount: 6200000, valued_on: '2025-01-02' }),
      entry({ id: 'v1', amount: 4500000, valued_on: '2023-03-11', kind: 'purchase' }),
    ]);

    expect(component.change(0)).toBe('+37.8%');
    expect(component.change(1)).toBe('');
  });

  it('reads a fall as a fall', async () => {
    const { component } = await render(land({ currency_code: 'NGN', currency_exponent: 2 }), [
      entry({ id: 'v2', amount: 4000000, valued_on: '2025-01-02' }),
      entry({ id: 'v1', amount: 5000000, valued_on: '2023-03-11' }),
    ]);

    expect(component.change(0)).toBe('-20%');
  });

  it('names the purchase for what it is', async () => {
    const { component } = await render();
    expect(component.label(entry({ kind: 'purchase' }))).toBe('Bought for');
    expect(component.label(entry())).toBe('Valued at');
  });
});
