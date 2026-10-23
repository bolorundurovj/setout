import { TestBed } from '@angular/core/testing';
import type { LandRead, LandValuationCreate, LandValuationRead } from '@setout/api-client';
import { ProjectService } from '../projects/project.service';
import { LandService } from './land.service';
import { LandValuationsComponent } from './land-valuations.component';

function land(over: Partial<LandRead> = {}): LandRead {
  return {
    id: 'l1',
    name: 'Ewuru',
    address: null,
    geocoded_address: null,
    city: null,
    state: null,
    country_code: null,
    country_name: null,
    purchased_on: null,
    latitude: null,
    longitude: null,
    boundary: null,
    boundary_area_sqm: null,
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
    archived_at: null,
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
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    ...over,
  };
}

describe('LandValuationsComponent', () => {
  let recorded: LandValuationCreate[];
  let archived: string[];
  let restored: string[];

  async function render(row: LandRead = land(), rows: LandValuationRead[] = []) {
    recorded = [];
    archived = [];
    restored = [];

    const lands = {
      saving: () => false,
      error: () => null,
      valuations: async () => rows,
      createValuation: async (_id: string, body: LandValuationCreate) => {
        recorded.push(body);
        return entry();
      },
      archiveValuation: async (id: string) => {
        archived.push(id);
      },
      restoreValuation: async (id: string) => {
        restored.push(id);
      },
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

  it('offers Purchase Price when no entry exists', async () => {
    const { component } = await render();
    component.open();
    expect(component.kindChips().map((chip) => chip.value)).toContain('purchase');
  });

  it('offers only Valuation once a purchase price exists', async () => {
    const { component } = await render(land(), [entry({ kind: 'purchase' })]);
    expect(component.kindChips().map((chip) => chip.value)).toEqual(['valuation']);
  });

  it('leaves the currency open before the first entry', async () => {
    const { component } = await render();
    expect(component.landCurrency()).toBe('');
  });

  it('uses the land record currency once one is set', async () => {
    const { component } = await render(land({ currency_code: 'NGN', currency_exponent: 2 }));
    expect(component.landCurrency()).toBe('NGN');
  });

  it('keeps the typed amount when the currency changes', async () => {
    const { component } = await render();
    component.open();
    component.amount.set('1000');

    component.currency.set('NGN');
    expect(component.exponent()).toBe(2);

    component.currency.set('JPY');
    expect(component.amount()).toBe('1000');
    expect(component.exponent()).toBe(0);
  });

  it('converts to minor units with the currency selected at save time', async () => {
    const { component } = await render();
    component.open();
    component.currency.set('JPY');
    component.amount.set('1000');
    component.valuedOn.set('2026-06-30');

    await component.save();

    expect(recorded[0]).toMatchObject({ amount: 1000, currency_code: 'JPY' });
  });

  it('requires an amount, a currency and a date', async () => {
    const { component } = await render();
    component.open();
    expect(component.isValid()).toBe(false);

    component.currency.set('NGN');
    component.amount.set('45000');
    expect(component.isValid()).toBe(false);

    component.valuedOn.set('2023-03-11');
    expect(component.isValid()).toBe(true);
  });

  it('shows the percentage change from the previous entry', async () => {
    const { component } = await render(land({ currency_code: 'NGN', currency_exponent: 2 }), [
      entry({ id: 'v2', amount: 6200000, valued_on: '2025-01-02' }),
      entry({ id: 'v1', amount: 4500000, valued_on: '2023-03-11', kind: 'purchase' }),
    ]);

    expect(component.percentChange(0)).toBe('+37.8%');
    expect(component.percentChange(1)).toBe('');
  });

  it('shows a negative change for a lower valuation', async () => {
    const { component } = await render(land({ currency_code: 'NGN', currency_exponent: 2 }), [
      entry({ id: 'v2', amount: 4000000, valued_on: '2025-01-02' }),
      entry({ id: 'v1', amount: 5000000, valued_on: '2023-03-11' }),
    ]);

    expect(component.percentChange(0)).toBe('-20%');
  });

  it('labels purchase and valuation entries', async () => {
    const { component } = await render();
    expect(component.label(entry({ kind: 'purchase' }))).toBe('Purchase Price');
    expect(component.label(entry())).toBe('Valuation');
  });

  it('restores the last archived valuation on undo', async () => {
    const { component } = await render(land(), [entry()]);
    await component.archive(entry());
    expect(archived).toEqual(['v1']);
    expect(component.lastArchived()?.id).toBe('v1');

    await component.restoreLastArchived();
    expect(restored).toEqual(['v1']);
    expect(component.lastArchived()).toBeNull();
  });
});
