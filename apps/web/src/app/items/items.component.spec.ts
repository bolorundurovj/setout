import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Router } from '@angular/router';
import type { ItemPriceSummary, ItemRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { SEARCH_WAIT } from '../ui/debounce';
import { ItemService } from './item.service';
import { ItemsComponent } from './items.component';

function price(over: Partial<ItemPriceSummary> = {}): ItemPriceSummary {
  return {
    currency_code: 'NGN',
    currency_exponent: 2,
    count: 5,
    first_price: 200_00,
    first_paid_on: '2026-01-05',
    last_price: 270_00,
    last_paid_on: '2026-05-05',
    lowest_price: 200_00,
    highest_price: 270_00,
    change_percent: 35.0,
    ...over,
  };
}

function item(over: Partial<ItemRead> = {}): ItemRead {
  return {
    id: 'i1',
    name: 'Six inch blocks',
    unit: 'each',
    notes: null,
    purchase_count: 5,
    prices: [price()],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

describe('ItemsComponent', () => {
  let rows: ItemRead[];
  let added: unknown[];
  let removed: string[];
  let searches: (string | undefined)[];
  let pages: number[];
  let navigations: unknown[][];
  let toasts: { message: string; type: string }[];
  let addResult: ItemRead | null;

  function render(initial: ItemRead[] = [item()]) {
    rows = initial;
    added = [];
    removed = [];
    searches = [];
    pages = [];
    navigations = [];
    toasts = [];
    addResult = item({ id: 'i2', name: 'Cement' });

    const items = {
      items: () => rows,
      total: () => rows.length,
      page: () => 1,
      choices: () => rows,
      loading: () => false,
      saving: () => false,
      error: () => null,
      load: async (search?: string) => void searches.push(search),
      goTo: async (page: number) => void pages.push(page),
      loadChoices: async () => undefined,
      add: async (body: unknown) => {
        added.push(body);
        return addResult;
      },
      edit: async () => null,
      remove: async (id: string) => void removed.push(id),
      restore: async () => undefined,
      prices: async () => null,
      lastPrice: async () => null,
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ItemsComponent],
      providers: [
        { provide: Router, useValue: { navigate: (...args: unknown[]) => navigations.push(args) } },
        { provide: ItemService, useValue: items },
        {
          provide: ToastService,
          useValue: { show: (message: string, type = 'success') => toasts.push({ message, type }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(ItemsComponent);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('loads the catalogue on the way in', () => {
    render();
    expect(searches.length).toBe(1);
  });

  it('adds an item with a unit', async () => {
    const component = render();
    component.name.set('  Cement  ');
    component.unit.set(' bag ');
    expect(component.isValid()).toBe(true);

    await component.save();

    expect(added[0]).toEqual({ name: 'Cement', unit: 'bag' });
    expect(component.showForm()).toBe(false);
    expect(toasts[0].type).toBe('success');
  });

  it('sends no unit when none is typed', async () => {
    const component = render();
    component.name.set('Cement');

    await component.save();
    expect(added[0]).toEqual({ name: 'Cement', unit: null });
  });

  it('will not add an item without a name', async () => {
    const component = render();
    component.name.set('   ');

    expect(component.isValid()).toBe(false);
    await component.save();
    expect(added.length).toBe(0);
  });

  it('reports an item that could not be added and keeps the form open', async () => {
    const component = render();
    addResult = null;
    component.name.set('Cement');

    await component.save();

    expect(toasts[0].type).toBe('error');
    expect(component.name()).toBe('Cement');
  });

  it('waits for the typing to stop before it asks the server', () => {
    vi.useFakeTimers();
    try {
      const component = render();
      component.onSearch({ target: { value: 'inc' } } as unknown as Event);
      component.onSearch({ target: { value: 'inch' } } as unknown as Event);

      expect(component.search()).toBe('inch');
      expect(searches.length).toBe(1);

      vi.advanceTimersByTime(SEARCH_WAIT);

      expect(searches).toEqual([undefined, 'inch']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens an item', () => {
    render().open('i1');
    expect(navigations[0][0]).toEqual(['/items', 'i1']);
  });

  it('archives an item', async () => {
    await render().archive('i1');
    expect(removed).toEqual(['i1']);
  });

  it('reads the unit, or says there is none', () => {
    const component = render();
    expect(component.unitLabel(item())).toBe('per each');
    expect(component.unitLabel(item({ unit: null }))).toBe(component.notSet);
  });

  it('counts purchases in words', () => {
    const component = render();
    expect(component.countLabel(item({ purchase_count: 0 }))).toBe('never bought');
    expect(component.countLabel(item({ purchase_count: 1 }))).toBe('bought once');
    expect(component.countLabel(item({ purchase_count: 5 }))).toBe('bought 5 times');
  });

  it('reads a price change either way', () => {
    const component = render();
    expect(component.changeLabel(price())).toBe('up 35.0%');
    expect(component.changeLabel(price({ change_percent: -12 }))).toBe('down 12.0%');
    expect(component.changeLabel(price({ change_percent: 0 }))).toBe('no change');
    expect(component.changeLabel(price({ change_percent: null }))).toBe(component.notSet);
  });

  it('flags only a rise', () => {
    const component = render();
    expect(component.hasRisen(price())).toBe(true);
    expect(component.hasRisen(price({ change_percent: -12 }))).toBe(false);
    expect(component.hasRisen(price({ change_percent: null }))).toBe(false);
  });

  it('formats a price in its own currency', () => {
    const component = render();
    expect(component.money(200_00, price())).toContain('200');
  });
});
