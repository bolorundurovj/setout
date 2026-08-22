import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import type { ItemPricePoint, ItemPriceSeries, ItemPrices } from '@setout/api-client';
import { formatMoney } from '../budget/money';
import { PaginationComponent } from '../ui/pagination.component';
import { pageOf } from '../ui/paging';
import { ItemService } from './item.service';

@Component({
  selector: 'app-item-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PaginationComponent],
  templateUrl: './item-detail.component.html',
  styleUrl: './item-detail.component.scss',
})
export class ItemDetailComponent {
  private readonly items = inject(ItemService);

  private readonly title = inject(Title);

  readonly id = input.required<string>();

  readonly prices = signal<ItemPrices | null>(null);
  readonly loading = signal(true);

  readonly notSet = '—';

  readonly series = computed<ItemPriceSeries[]>(() => this.prices()?.series ?? []);

  constructor() {
    effect(() => {
      this.id();
      void this.load();
    });
    effect(() => {
      const prices = this.prices();
      if (prices) {
        this.title.setTitle(`${prices.name} · Setout`);
      }
    });
  }

  async load(): Promise<void> {
    this.prices.set(await this.items.prices(this.id()));
    this.loading.set(false);
  }

  money(minor: number, series: ItemPriceSeries): string {
    return formatMoney(minor, series.currency_code, series.currency_exponent);
  }

  unitLabel(): string {
    const unit = this.prices()?.unit;
    return unit ? `per ${unit}` : 'no unit recorded';
  }

  countLabel(series: ItemPriceSeries): string {
    return series.count === 1 ? 'bought once' : `bought ${series.count} times`;
  }

  changeLabel(series: ItemPriceSeries): string {
    if (series.change_percent === null) {
      return this.notSet;
    }
    const rounded = Math.abs(series.change_percent).toFixed(1);
    if (series.change_percent > 0) {
      return `risen ${rounded}%`;
    }
    return series.change_percent < 0 ? `fallen ${rounded}%` : 'no change';
  }

  hasRisen(series: ItemPriceSeries): boolean {
    return (series.change_percent ?? 0) > 0;
  }

  changeSince(series: ItemPriceSeries): string {
    return `since ${series.first_paid_on}`;
  }

  private readonly pages = signal<Record<string, number>>({});

  newestFirst(series: ItemPriceSeries): ItemPricePoint[] {
    return pageOf([...series.points].reverse(), this.pageOn(series));
  }

  pageOn(series: ItemPriceSeries): number {
    return this.pages()[series.currency_code] ?? 1;
  }

  goTo(series: ItemPriceSeries, page: number): void {
    this.pages.update((all) => ({ ...all, [series.currency_code]: page }));
  }

  quantityLabel(point: ItemPricePoint): string {
    if (point.quantity === null) {
      return this.notSet;
    }
    return String(Number(point.quantity));
  }
}
