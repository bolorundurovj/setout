import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Router } from '@angular/router';
import type { VendorRead } from '@setout/api-client';
import { SEARCH_WAIT } from '../ui/debounce';
import { VendorService } from './vendor.service';
import { VendorsComponent } from './vendors.component';

function vendor(over: Partial<VendorRead> = {}): VendorRead {
  return {
    id: 'v1',
    name: 'A Vendor',
    trade: 'a trade',
    contact_name: 'A Contact',
    phone: '0000 000 0000',
    email: null,
    notes: null,
    expense_count: 1,
    totals: [
      { currency_code: 'NGN', currency_exponent: 2, expense_count: 1, spent_amount: 750_000_00 },
    ],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

describe('VendorsComponent', () => {
  let rows: VendorRead[];
  let loads: { search?: string; archived?: boolean }[];
  let navigations: unknown[][];

  function render(initial: VendorRead[] = [vendor()]) {
    rows = initial;
    loads = [];
    navigations = [];

    const vendors = {
      vendors: () => rows,
      total: () => rows.length,
      page: () => 1,
      choices: () => rows,
      loading: () => false,
      saving: () => false,
      error: () => null,
      load: async (search?: string, includeArchived?: boolean) =>
        void loads.push({ search, archived: includeArchived }),
      goTo: async () => undefined,
      loadChoices: async () => undefined,
      add: async () => null,
      edit: async () => null,
      archive: async () => undefined,
      restore: async () => undefined,
      get: async () => null,
      spend: async () => null,
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [VendorsComponent],
      providers: [
        { provide: Router, useValue: { navigate: (...args: unknown[]) => navigations.push(args) } },
        { provide: VendorService, useValue: vendors },
      ],
    });
    const fixture = TestBed.createComponent(VendorsComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('asks for the archived only when the toggle is on', async () => {
    const component = render();
    await component.setIncludeArchived(true);

    expect(component.includeArchived()).toBe(true);
    expect(loads[1]).toEqual({ search: '', archived: true });
  });

  it('keeps the search term when the toggle changes, and asks only once', async () => {
    vi.useFakeTimers();
    try {
      const component = render();
      component.onSearch({ target: { value: 'Ondo' } } as unknown as Event);
      await component.setIncludeArchived(true);

      expect(loads[1]).toEqual({ search: 'Ondo', archived: true });

      vi.advanceTimersByTime(SEARCH_WAIT);

      expect(loads.length).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens a vendor', () => {
    render().open('v1');
    expect(navigations[0][0]).toEqual(['/vendors', 'v1']);
  });

  it('reads the contact, falling back when there is none', () => {
    const component = render();
    expect(component.contactLabel(vendor())).toBe('A Contact');
    expect(component.contactLabel(vendor({ contact_name: null }))).toBe(component.notSet);
  });

  it('says so plainly when there is no phone', () => {
    const component = render();
    expect(component.phoneLabel(vendor())).toBe('0000 000 0000');
    expect(component.phoneLabel(vendor({ phone: null }))).toBe('no phone');
  });

  it('counts the vendors and says they are shared', () => {
    expect(render([vendor()]).countLabel()).toBe('1 vendor · shared across every project');
    expect(render([vendor(), vendor({ id: 'v2' })]).countLabel()).toBe(
      '2 vendors · shared across every project',
    );
  });

  it('flips the archive toggle label', async () => {
    const component = render();
    expect(component.archivedLabel()).toBe('Show archived');
    await component.setIncludeArchived(true);
    expect(component.archivedLabel()).toBe('Hide archived');
  });

  it('goes to the form screen for a new vendor', () => {
    render().newVendor();
    expect(navigations[0][0]).toEqual(['/vendors/new']);
  });

  it('formats a total in its own currency', () => {
    const component = render();
    expect(component.money(vendor().totals[0])).toContain('750,000');
  });
});
