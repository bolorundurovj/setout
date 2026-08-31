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
  planned_amount: 0,
  spent_amount: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  deleted_at: null,
};

function owed(over: Partial<DeliveryRead> = {}): DeliveryRead {
  return {
    id: 'd1',
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

function bucket(rows: DeliveryRead[], over: Record<string, unknown> = {}) {
  return {
    rows,
    total: rows.length,
    owed: rows.filter((row) => !row.received_at).reduce((sum, row) => sum + row.amount, 0),
    ...over,
  };
}

describe('DeliveriesComponent', () => {
  let received: string[];
  let putBack: string[];
  let removed: string[];
  let restored: string[];
  let changed: Record<string, unknown>[];
  let pagesAsked: number[];

  function render(
    waiting: ReturnType<typeof bucket> = bucket([]),
    arrived: ReturnType<typeof bucket> = bucket([]),
  ) {
    received = [];
    putBack = [];
    removed = [];
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
            waiting: () => waiting,
            arrived: () => arrived,
            loadWaiting: async (_id: string, page = 1) => {
              pagesAsked.push(page);
            },
            loadArrived: async () => undefined,
            receive: async (id: string) => {
              received.push(id);
            },
            unreceive: async (id: string) => {
              putBack.push(id);
            },
            remove: async (id: string) => {
              removed.push(id);
            },
            restore: async (id: string) => {
              restored.push(id);
              return owed({ id });
            },
            update: async (id: string, body: Record<string, unknown>) => {
              changed.push({ id, ...body });
              return owed({ id, description: String(body['description']) });
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

  it('counts and adds up everything owed, not the page in hand', () => {
    const component = render(bucket([owed({ id: 'a' })], { total: 14, owed: 20_000_000 }));
    expect(component.owedNote()).toContain('14 things owed');
    expect(component.owedNote()).toContain('200,000');
  });

  it('says so plainly when everything has arrived', () => {
    const component = render(bucket([]), bucket([owed({ received_at: '2026-08-16T00:00:00Z' })]));
    expect(component.owedNote()).toBe('Everything paid for has arrived.');
  });

  it('asks the server for the page it was sent to', async () => {
    const component = render(bucket([owed({ id: 'a' })], { total: 30 }));
    await component.goToWaiting(3);
    expect(component.waitingPage()).toBe(3);
    expect(pagesAsked).toContain(3);
  });

  it('corrects what is owed, and reads an emptied promise as nobody having said', async () => {
    const component = render(bucket([owed({ id: 'd1' })]));
    component.startEdit(owed({ id: 'd1', description: '17 bags of cement' }));
    expect(component.editWhat()).toBe('17 bags of cement');

    component.editWhat.set('18 bags of cement');
    component.editPromised.set('  ');
    await component.saveEdit(owed({ id: 'd1' }));

    expect(changed).toEqual([{ id: 'd1', description: '18 bags of cement', promised: null }]);
    expect(component.editing()).toBeNull();
  });

  it('will not save a correction with nothing left in it', () => {
    const component = render(bucket([owed({ id: 'd1' })]));
    component.startEdit(owed({ id: 'd1' }));
    component.editWhat.set('   ');
    expect(component.canSaveEdit()).toBe(false);
  });

  it('takes off a delivery that should never have been recorded', async () => {
    const component = render(bucket([owed({ id: 'd1' })]));
    await component.remove(owed({ id: 'd1' }));
    expect(removed).toEqual(['d1']);
  });

  it('offers to put back what was just taken off, and does', async () => {
    const component = render(bucket([owed({ id: 'd1' })]));
    await component.remove(owed({ id: 'd1', description: '17 bags' }));
    expect(component.justRemoved()?.description).toBe('17 bags');

    await component.putBackRemoved();

    expect(restored).toEqual(['d1']);
    expect(component.justRemoved()).toBeNull();
  });

  it('reads the promise alongside the day it was paid', () => {
    const component = render();
    expect(component.waiting(owed())).toContain('promised this week');
    expect(component.waiting(owed({ promised: null }))).not.toContain('promised');
  });

  it('says when nobody recorded the vendor', () => {
    const component = render();
    expect(component.vendorName(owed({ vendor_name: null }))).toBe('vendor not recorded');
  });

  it('marks a delivery, and puts one back that was marked by mistake', async () => {
    const component = render(bucket([owed({ id: 'd1' })]));
    await component.markDelivered(owed({ id: 'd1' }));
    expect(received).toEqual(['d1']);

    await component.putBack(owed({ id: 'd1' }));
    expect(putBack).toEqual(['d1']);
  });
});
