import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import type { ItemPricePoint, ItemPriceSeries, ItemPrices } from '@setout/api-client';
import { ItemDetailComponent } from './item-detail.component';
import { ItemService } from './item.service';

function point(id: string, day: string, rate: number, over: Partial<ItemPricePoint> = {}) {
  return {
    expense_id: id,
    spent_on: day,
    unit_rate: rate,
    quantity: '1.000',
    project_id: 'p1',
    project_name: 'Jacaranda Close, Ewuru',
    vendor_id: 'v1',
    vendor_name: 'Segun Blocks Owode',
    ...over,
  } as ItemPricePoint;
}

function series(over: Partial<ItemPriceSeries> = {}): ItemPriceSeries {
  return {
    currency_code: 'NGN',
    currency_exponent: 2,
    count: 3,
    first_price: 200_00,
    first_paid_on: '2026-01-05',
    last_price: 230_00,
    last_paid_on: '2026-03-05',
    lowest_price: 200_00,
    highest_price: 230_00,
    change_percent: 15.0,
    points: [
      point('e1', '2026-01-05', 200_00),
      point('e2', '2026-02-05', 210_00),
      point('e3', '2026-03-05', 230_00),
    ],
    ...over,
  };
}

describe('ItemDetailComponent', () => {
  async function render(prices: ItemPrices | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ItemDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ItemService, useValue: { prices: async () => prices } },
      ],
    });
    const fixture = TestBed.createComponent(ItemDetailComponent);
    fixture.componentRef.setInput('id', 'i1');
    fixture.detectChanges();
    const component = fixture.componentInstance;
    await component.load();
    return component;
  }

  function prices(over: Partial<ItemPrices> = {}): ItemPrices {
    return {
      item_id: 'i1',
      name: 'Six inch blocks',
      unit: 'each',
      series: [series()],
      ...over,
    };
  }

  it('reads the price history', async () => {
    const component = await render(prices());
    expect(component.series().length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('lists the newest price first', async () => {
    const component = await render(prices());
    expect(component.newestFirst(series()).map((p) => p.expense_id)).toEqual(['e3', 'e2', 'e1']);
  });

  it('says when there is no unit', async () => {
    expect((await render(prices())).unitLabel()).toBe('per each');
    expect((await render(prices({ unit: null }))).unitLabel()).toBe('no unit recorded');
  });

  it('reads a change either way', async () => {
    const component = await render(prices());
    expect(component.changeLabel(series())).toBe('risen 15.0%');
    expect(component.changeLabel(series({ change_percent: -8 }))).toBe('fallen 8.0%');
    expect(component.changeLabel(series({ change_percent: 0 }))).toBe('no change');
    expect(component.changeLabel(series({ change_percent: null }))).toBe(component.notSet);
  });

  it('says what the change is measured from', async () => {
    const component = await render(prices());
    expect(component.changeSince(series())).toBe('since 2026-01-05');
  });

  it('counts purchases in words', async () => {
    const component = await render(prices());
    expect(component.countLabel(series({ count: 1 }))).toBe('bought once');
    expect(component.countLabel(series({ count: 3 }))).toBe('bought 3 times');
  });

  it('reads a quantity, or says there is none', async () => {
    const component = await render(prices());
    expect(component.quantityLabel(point('e1', '2026-01-05', 100))).toBe('1');
    expect(component.quantityLabel(point('e1', '2026-01-05', 100, { quantity: null }))).toBe(
      component.notSet,
    );
  });

  it('keeps two currencies apart', async () => {
    const component = await render(
      prices({ series: [series(), series({ currency_code: 'USD', currency_exponent: 2 })] }),
    );
    expect(component.series().map((s) => s.currency_code)).toEqual(['NGN', 'USD']);
  });

  it('copes with an item that is not there', async () => {
    const component = await render(null);
    expect(component.prices()).toBeNull();
    expect(component.series()).toEqual([]);
  });

  it('names the item in the page title', async () => {
    await render(prices({ name: 'Six inch blocks' }));
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Six inch blocks · Setout');
  });

  it('leaves the title alone for an item that is not there', async () => {
    TestBed.inject(Title).setTitle('Item · Setout');
    await render(null);
    TestBed.tick();
    expect(TestBed.inject(Title).getTitle()).toBe('Item · Setout');
  });
});
