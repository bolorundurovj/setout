import { TestBed } from '@angular/core/testing';
import type { DeliveryRead, ProjectRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { DeliveriesComponent } from './deliveries.component';
import { DeliveryService } from './delivery.service';

const project: ProjectRead = {
  id: 'p1',
  name: 'Jacaranda Close, Ewuru',
  currency_code: 'NGN',
  currency_exponent: 2,
  land_id: null,
  land_name: null,
  status: 'active',
  notes: null,
  budgeted_amount: 0,
  spent_amount: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  archived_at: null,
};

function delivery(overrides: Partial<DeliveryRead> = {}): DeliveryRead {
  return {
    id: 'd1',
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

function deliveryList(rows: DeliveryRead[], overrides: Record<string, unknown> = {}) {
  return {
    rows,
    total: rows.length,
    outstandingAmount: rows
      .filter((row) => !row.received_at)
      .reduce((sum, row) => sum + row.amount, 0),
    ...overrides,
  };
}

describe('DeliveriesComponent', () => {
  let markedReceived: string[];
  let markedOutstanding: string[];
  let archived: string[];
  let restored: string[];
  let changed: Record<string, unknown>[];
  let pagesAsked: number[];

  function render(
    outstanding: ReturnType<typeof deliveryList> = deliveryList([]),
    received: ReturnType<typeof deliveryList> = deliveryList([]),
  ) {
    markedReceived = [];
    markedOutstanding = [];
    archived = [];
    restored = [];
    changed = [];
    pagesAsked = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DeliveriesComponent],
      providers: [
        {
          provide: DeliveryService,
          useValue: {
            error: () => null,
            outstanding: () => outstanding,
            received: () => received,
            loadOutstanding: async (_id: string, page = 1) => {
              pagesAsked.push(page);
            },
            loadReceived: async () => undefined,
            markReceived: async (id: string) => {
              markedReceived.push(id);
            },
            markOutstanding: async (id: string) => {
              markedOutstanding.push(id);
            },
            archive: async (id: string) => {
              archived.push(id);
            },
            restore: async (id: string) => {
              restored.push(id);
              return delivery({ id });
            },
            update: async (id: string, body: Record<string, unknown>) => {
              changed.push({ id, ...body });
              return delivery({ id, description: String(body['description']) });
            },
          },
        },
        { provide: ToastService, useValue: { show: () => undefined } },
      ],
    });
    const fixture = TestBed.createComponent(DeliveriesComponent);
    fixture.componentRef.setInput('project', project);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('summarises the outstanding count and total from the server', () => {
    const component = render(
      deliveryList([delivery({ id: 'a' })], { total: 14, outstandingAmount: 20_000_000 }),
    );
    expect(component.outstandingSummary()).toContain('14 items outstanding');
    expect(component.outstandingSummary()).toContain('200,000');
  });

  it('says all items are received when none are outstanding', () => {
    const component = render(
      deliveryList([]),
      deliveryList([delivery({ received_at: '2026-08-16T00:00:00Z' })]),
    );
    expect(component.outstandingSummary()).toBe('All paid items have been received.');
  });

  it('loads the requested page', async () => {
    const component = render(deliveryList([delivery({ id: 'a' })], { total: 30 }));
    await component.goToOutstanding(3);
    expect(component.outstandingPage()).toBe(3);
    expect(pagesAsked).toContain(3);
  });

  it('updates a delivery and sends a blank expected date as null', async () => {
    const component = render(deliveryList([delivery({ id: 'd1' })]));
    component.startEdit(delivery({ id: 'd1', description: '17 bags of cement' }));
    expect(component.editDescription()).toBe('17 bags of cement');

    component.editDescription.set('18 bags of cement');
    component.editExpected.set('  ');
    await component.saveEdit(delivery({ id: 'd1' }));

    expect(changed).toEqual([{ id: 'd1', description: '18 bags of cement', expected: null }]);
    expect(component.editing()).toBeNull();
  });

  it('disables saving when the description is blank', () => {
    const component = render(deliveryList([delivery({ id: 'd1' })]));
    component.startEdit(delivery({ id: 'd1' }));
    component.editDescription.set('   ');
    expect(component.canSaveEdit()).toBe(false);
  });

  it('archives a delivery', async () => {
    const component = render(deliveryList([delivery({ id: 'd1' })]));
    await component.archive(delivery({ id: 'd1' }));
    expect(archived).toEqual(['d1']);
  });

  it('restores the last archived delivery', async () => {
    const component = render(deliveryList([delivery({ id: 'd1' })]));
    await component.archive(delivery({ id: 'd1', description: '17 bags' }));
    expect(component.lastArchived()?.description).toBe('17 bags');

    await component.restoreLastArchived();

    expect(restored).toEqual(['d1']);
    expect(component.lastArchived()).toBeNull();
  });

  it('shows the expected date after the paid date', () => {
    const component = render();
    expect(component.outstandingDetail(delivery())).toContain('expected this week');
    expect(component.outstandingDetail(delivery({ expected: null }))).not.toContain('expected');
  });

  it('shows a placeholder when the vendor is not recorded', () => {
    const component = render();
    expect(component.vendorName(delivery({ vendor_name: null }))).toBe('vendor not recorded');
  });

  it('marks a delivery received and then outstanding', async () => {
    const component = render(deliveryList([delivery({ id: 'd1' })]));
    await component.markReceived(delivery({ id: 'd1' }));
    expect(markedReceived).toEqual(['d1']);

    await component.markOutstanding(delivery({ id: 'd1' }));
    expect(markedOutstanding).toEqual(['d1']);
  });
});
