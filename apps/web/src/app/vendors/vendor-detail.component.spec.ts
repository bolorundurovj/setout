import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import type { DeliveryRead, VendorRead, VendorSpend } from '@setout/api-client';
import { DeliveryService } from '../deliveries/delivery.service';
import { ToastService } from '../toast.service';
import { VendorDetailComponent } from './vendor-detail.component';
import { VendorService } from './vendor.service';

function vendor(over: Partial<VendorRead> = {}): VendorRead {
  return {
    id: 'v1',
    name: 'A Vendor',
    trade: 'a trade',
    contact_name: 'A Contact',
    phone: '0000 000 0000',
    email: null,
    notes: null,
    expense_count: 2,
    totals: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

const spend: VendorSpend = {
  vendor_id: 'v1',
  name: 'A Vendor',
  projects: [
    {
      project_id: 'p1',
      project_name: 'First project',
      currency_code: 'NGN',
      currency_exponent: 2,
      expense_count: 2,
      spent_amount: 800_000_00,
    },
  ],
};

function owedRow(over: Partial<DeliveryRead> = {}): DeliveryRead {
  return {
    id: 'd1',
    project_id: 'p1',
    expense_id: 'e1',
    vendor_id: 'v1',
    vendor_name: 'A Vendor',
    description: '17 bags of cement',
    promised: 'this week',
    amount: 76_500_00,
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

describe('VendorDetailComponent', () => {
  let edits: unknown[];
  let archived: string[];
  let restored: string[];
  let toasts: { message: string; type: string }[];
  let navigations: unknown[][];
  let owedRows: DeliveryRead[];
  let marked: string[];
  let reloads: string[];

  async function render(current: VendorRead | null = vendor(), owed: DeliveryRead[] = []) {
    edits = [];
    archived = [];
    restored = [];
    toasts = [];
    navigations = [];
    owedRows = owed;
    marked = [];
    reloads = [];

    const vendors = {
      error: () => null,
      get: async () => current,
      spend: async () => (current ? spend : null),
      agreements: async () => [],
      edit: async (_id: string, body: unknown) => void edits.push(body),
      archive: async (id: string) => void archived.push(id),
      restore: async (id: string) => void restored.push(id),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [VendorDetailComponent],
      providers: [
        provideRouter([]),
        { provide: VendorService, useValue: vendors },
        {
          provide: DeliveryService,
          useValue: {
            error: () => null,
            forVendor: () => ({ rows: owedRows, total: owedRows.length, owed: 0 }),
            loadForVendor: async () => void reloads.push('v1'),
            receive: async (id: string) => void marked.push(id),
          },
        },
        {
          provide: ToastService,
          useValue: { show: (message: string, type = 'success') => toasts.push({ message, type }) },
        },
      ],
    });
    const router = TestBed.inject(Router);
    router.navigate = (...args: unknown[]) => {
      navigations.push(args);
      return Promise.resolve(true);
    };

    const fixture = TestBed.createComponent(VendorDetailComponent);
    fixture.componentRef.setInput('id', 'v1');
    fixture.detectChanges();
    const component = fixture.componentInstance;
    await component.load();
    return component;
  }

  it('reads the vendor and what was spent with them', async () => {
    const component = await render();
    expect(component.vendor()?.name).toBe('A Vendor');
    expect(component.spend()?.projects.length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('lists what the vendor has been paid for and not delivered', async () => {
    const component = await render(vendor(), [owedRow()]);
    expect(component.owedHere().map((row) => row.description)).toEqual(['17 bags of cement']);
    expect(component.owedWhen(owedRow())).toContain('promised this week');
  });

  it('asks the list again once something is marked delivered, so it leaves', async () => {
    const component = await render(vendor(), [owedRow()]);
    await component.markDelivered(owedRow());
    expect(marked).toEqual(['d1']);
    expect(reloads).toContain('v1');
  });

  it('goes to the form screen to edit', async () => {
    (await render()).edit();
    expect(navigations[0][0]).toEqual(['/vendors', 'v1', 'edit']);
  });

  it('totals the spend per currency for the total row', async () => {
    const component = await render();
    const totals = component.totalsByCurrency({
      vendor_id: 'v1',
      name: 'A Vendor',
      projects: [
        {
          project_id: 'p1',
          project_name: 'First project',
          currency_code: 'NGN',
          currency_exponent: 2,
          expense_count: 2,
          spent_amount: 800_000_00,
        },
        {
          project_id: 'p2',
          project_name: 'Second project',
          currency_code: 'NGN',
          currency_exponent: 2,
          expense_count: 1,
          spent_amount: 200_000_00,
        },
        {
          project_id: 'p3',
          project_name: 'Third project',
          currency_code: 'USD',
          currency_exponent: 2,
          expense_count: 1,
          spent_amount: 400_00,
        },
      ],
    });

    expect(totals.length).toBe(2);
    expect(totals[0]).toEqual({
      currency_code: 'NGN',
      currency_exponent: 2,
      expense_count: 3,
      spent_amount: 1_000_000_00,
    });
    expect(component.total(totals[0])).toContain('1,000,000');
  });

  it('archives and restores', async () => {
    const component = await render();
    await component.archive();
    await component.restore();

    expect(archived).toEqual(['v1']);
    expect(restored).toEqual(['v1']);
  });

  it('flags a vendor that carries only a name', async () => {
    const component = await render();
    expect(component.needsFillingIn(vendor())).toBe(false);
    expect(component.needsFillingIn(vendor({ trade: null, contact_name: null, phone: null }))).toBe(
      true,
    );
  });

  it('formats spend in the project currency', async () => {
    const component = await render();
    expect(component.money(spend.projects[0])).toContain('800,000');
  });

  it('copes with a vendor that is not there', async () => {
    const component = await render(null);
    expect(component.vendor()).toBeNull();
    expect(component.spend()).toBeNull();
  });

  it('names the vendor in the page title', async () => {
    await render(vendor({ name: 'Corner Depot Cement' }));
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Corner Depot Cement · Setout');
  });

  it('leaves the title alone for a vendor that is not there', async () => {
    TestBed.inject(Title).setTitle('Vendor · Setout');
    await render(null);
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Vendor · Setout');
  });
});
