import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import type { DeliveryRead, VendorExpenseSummary, VendorRead } from '@setout/api-client';
import { DeliveryService } from '../deliveries/delivery.service';
import { ToastService } from '../toast.service';
import { VendorDetailComponent } from './vendor-detail.component';
import { VendorService } from './vendor.service';

function vendor(overrides: Partial<VendorRead> = {}): VendorRead {
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
    archived_at: null,
    ...overrides,
  };
}

const summary: VendorExpenseSummary = {
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

function outstandingDelivery(overrides: Partial<DeliveryRead> = {}): DeliveryRead {
  return {
    id: 'd1',
    project_id: 'p1',
    expense_id: 'e1',
    vendor_id: 'v1',
    vendor_name: 'A Vendor',
    description: '17 bags of cement',
    expected: '2026-10-25',
    amount: 76_500_00,
    currency_code: 'NGN',
    currency_exponent: 2,
    spent_on: '2026-08-14',
    received_at: null,
    attachment_count: 0,
    created_at: '2026-08-14T00:00:00Z',
    updated_at: '2026-08-14T00:00:00Z',
    archived_at: null,
    ...overrides,
  };
}

describe('VendorDetailComponent', () => {
  let edits: unknown[];
  let archived: string[];
  let restored: string[];
  let deleted: string[];
  let toasts: { message: string; type: string }[];
  let navigations: unknown[][];
  let outstandingDeliveries: DeliveryRead[];
  let marked: string[];
  let reloads: string[];

  async function render(current: VendorRead | null = vendor(), outstanding: DeliveryRead[] = []) {
    edits = [];
    archived = [];
    restored = [];
    deleted = [];
    toasts = [];
    navigations = [];
    outstandingDeliveries = outstanding;
    marked = [];
    reloads = [];

    const vendors = {
      error: () => null,
      get: async () => current,
      expenseSummary: async () => (current ? summary : null),
      agreements: async () => [],
      edit: async (_id: string, body: unknown) => void edits.push(body),
      archive: async (id: string) => void archived.push(id),
      restore: async (id: string) => void restored.push(id),
      delete: async (id: string) => void deleted.push(id),
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
            forVendor: () => ({
              rows: outstandingDeliveries,
              total: outstandingDeliveries.length,
              outstandingAmount: 0,
            }),
            loadForVendor: async () => void reloads.push('v1'),
            markReceived: async (id: string) => void marked.push(id),
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

  it('loads the vendor and its expense summary', async () => {
    const component = await render();
    expect(component.vendor()?.name).toBe('A Vendor');
    expect(component.expenseSummary()?.projects.length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('lists the outstanding deliveries for the vendor', async () => {
    const component = await render(vendor(), [outstandingDelivery()]);
    expect(component.outstandingDeliveries().map((row) => row.description)).toEqual([
      '17 bags of cement',
    ]);
    expect(component.deliveryDates(outstandingDelivery())).toContain('expected');
    expect(component.deliveryDates(outstandingDelivery())).toContain('2026');
    expect(component.deliveryDates(outstandingDelivery())).toContain('25');
  });

  it('reloads the outstanding deliveries after marking one received', async () => {
    const component = await render(vendor(), [outstandingDelivery()]);
    await component.markReceived(outstandingDelivery());
    expect(marked).toEqual(['d1']);
    expect(reloads).toContain('v1');
  });

  it('opens the edit form', async () => {
    (await render()).edit();
    expect(navigations[0][0]).toEqual(['/vendors', 'v1', 'edit']);
  });

  it('totals the spent amount per currency', async () => {
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
    expect(component.formatTotal(totals[0])).toContain('1,000,000');
  });

  it('archives and restores', async () => {
    const component = await render();
    await component.archive();
    await component.restore();

    expect(archived).toEqual(['v1']);
    expect(restored).toEqual(['v1']);
  });

  it('permanently deletes an archived vendor and redirects', async () => {
    const component = await render(vendor({ archived_at: '2026-08-16T00:00:00Z' }));
    component.deleteConfirmationText.set('DELETE');
    await component.deletePermanently();

    expect(deleted).toEqual(['v1']);
    expect(navigations[0][0]).toEqual(['/vendors']);
  });

  it('flags a vendor with only a name as incomplete', async () => {
    const component = await render();
    expect(component.isIncomplete(vendor())).toBe(false);
    expect(component.isIncomplete(vendor({ trade: null, contact_name: null, phone: null }))).toBe(
      true,
    );
  });

  it('formats a project row in the project currency', async () => {
    const component = await render();
    expect(component.formatSpent(summary.projects[0])).toContain('800,000');
  });

  it('shows no vendor when the vendor is not found', async () => {
    const component = await render(null);
    expect(component.vendor()).toBeNull();
    expect(component.expenseSummary()).toBeNull();
  });

  it('shows the vendor name in the page title', async () => {
    await render(vendor({ name: 'Corner Depot Cement' }));
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Corner Depot Cement · Setout');
  });

  it('keeps the page title when the vendor is not found', async () => {
    TestBed.inject(Title).setTitle('Vendor · Setout');
    await render(null);
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Vendor · Setout');
  });
});
