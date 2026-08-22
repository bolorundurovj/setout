import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import type { VendorRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { VendorFormComponent } from './vendor-form.component';
import { VendorService } from './vendor.service';

function vendor(over: Partial<VendorRead> = {}): VendorRead {
  return {
    id: 'v1',
    name: 'A Vendor',
    trade: 'a trade',
    contact_name: 'A Contact',
    phone: '0000 000 0000',
    email: 'invoices@example.com',
    notes: 'a note',
    expense_count: 0,
    totals: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

describe('VendorFormComponent', () => {
  let added: unknown[];
  let edited: unknown[];
  let navigations: unknown[][];
  let toasts: { message: string; type: string }[];
  let saveResult: VendorRead | null;

  async function render(id = '', existing: VendorRead | null = vendor()) {
    added = [];
    edited = [];
    navigations = [];
    toasts = [];
    saveResult = vendor({ id: 'v9', name: 'Saved Vendor' });

    const vendors = {
      saving: () => false,
      error: () => null,
      get: async () => existing,
      add: async (body: unknown) => {
        added.push(body);
        return saveResult;
      },
      edit: async (_id: string, body: unknown) => {
        edited.push(body);
        return saveResult;
      },
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [VendorFormComponent],
      providers: [
        provideRouter([]),
        { provide: VendorService, useValue: vendors },
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

    const fixture = TestBed.createComponent(VendorFormComponent);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    await component.load();
    return component;
  }

  it('starts empty for a new vendor', async () => {
    const component = await render();
    expect(component.isEdit()).toBe(false);
    expect(component.title()).toBe('New Vendor');
    expect(component.name()).toBe('');
  });

  it('fills itself from the vendor being edited', async () => {
    const component = await render('v1');
    expect(component.isEdit()).toBe(true);
    expect(component.title()).toBe('Edit Vendor');
    expect(component.name()).toBe('A Vendor');
    expect(component.trade()).toBe('a trade');
    expect(component.contactName()).toBe('A Contact');
    expect(component.phone()).toBe('0000 000 0000');
    expect(component.notes()).toBe('a note');
  });

  it('creates a vendor and opens it', async () => {
    const component = await render();
    component.name.set('  A New Vendor  ');
    component.trade.set(' a trade ');

    await component.save();

    expect(added[0]).toEqual({
      name: 'A New Vendor',
      trade: 'a trade',
      contact_name: null,
      phone: null,
      email: null,
      notes: null,
    });
    expect(edited.length).toBe(0);
    expect(navigations[0][0]).toEqual(['/vendors', 'v9']);
  });

  it('saves an edit rather than creating a second vendor', async () => {
    const component = await render('v1');
    component.trade.set('another trade');

    await component.save();

    expect(added.length).toBe(0);
    expect(edited[0]).toEqual({
      name: 'A Vendor',
      trade: 'another trade',
      contact_name: 'A Contact',
      phone: '0000 000 0000',
      email: 'invoices@example.com',
      notes: 'a note',
    });
  });

  it('will not save without a name', async () => {
    const component = await render();
    component.name.set('   ');

    expect(component.isValid()).toBe(false);
    await component.save();
    expect(added.length).toBe(0);
  });

  it('reports a save that was refused and stays put', async () => {
    const component = await render();
    saveResult = null;
    component.name.set('A Vendor');

    await component.save();

    expect(toasts[0].type).toBe('error');
    expect(navigations.length).toBe(0);
  });

  it('cancels back to the list when new, and to the vendor when editing', async () => {
    (await render()).cancel();
    expect(navigations[0][0]).toEqual(['/vendors']);

    (await render('v1')).cancel();
    expect(navigations[0][0]).toEqual(['/vendors', 'v1']);
  });

  it('copes with a vendor that is not there', async () => {
    const component = await render('v1', null);
    expect(component.name()).toBe('');
    expect(component.loading()).toBe(false);
  });

  it('names who is being edited in the page title', async () => {
    await render('x1', vendor({ name: 'Corner Depot Cement' }));
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Edit Corner Depot Cement · Setout');
  });

  it('leaves the title alone when adding a new one', async () => {
    TestBed.inject(Title).setTitle('Add · Setout');
    await render('');
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Add · Setout');
  });
});
