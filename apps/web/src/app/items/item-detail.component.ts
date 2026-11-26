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
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { PaginationComponent } from '../ui/pagination.component';
import { pageOf } from '../ui/paging';
import { ItemService } from './item.service';

@Component({
  selector: 'app-item-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, RouterLink, PaginationComponent],
  templateUrl: './item-detail.component.html',
  styleUrl: './item-detail.component.scss',
})
export class ItemDetailComponent {
  readonly items = inject(ItemService);
  private readonly toast = inject(ToastService);

  private readonly title = inject(Title);

  readonly id = input.required<string>();

  readonly prices = signal<ItemPrices | null>(null);
  readonly loading = signal(true);
  readonly editing = signal(false);
  readonly editName = signal('');
  readonly editUnit = signal('');

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

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  startEdit(): void {
    const detail = this.prices();
    if (!detail) {
      return;
    }
    this.editName.set(detail.name);
    this.editUnit.set(detail.unit ?? '');
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  canSaveEdit(): boolean {
    return this.editName().trim().length > 0;
  }

  async saveEdit(): Promise<void> {
    if (!this.canSaveEdit()) {
      return;
    }
    const unit = this.editUnit().trim();
    const updated = await this.items.update(this.id(), {
      name: this.editName().trim(),
      unit: unit || null,
    });
    if (!updated) {
      this.toast.show(this.items.error() ?? 'Could not save the item.', 'error');
      return;
    }
    this.editing.set(false);
    this.toast.show(`${updated.name} updated.`);
    await this.load();
  }

  money(minor: number, series: ItemPriceSeries): string {
    return formatMoney(minor, series.currency_code, series.currency_exponent);
  }

  unitLabel(): string {
    const unit = this.prices()?.unit;
    if (!unit) {
      return 'no unit recorded';
    }
    return unit.toLowerCase() === 'each' ? 'each' : `per ${unit}`;
  }

  countLabel(series: ItemPriceSeries): string {
    return series.count === 1 ? '1 expense' : `${series.count} expenses`;
  }

  changeLabel(series: ItemPriceSeries): string {
    if (series.change_percent === null) {
      return this.notSet;
    }
    const rounded = Math.abs(series.change_percent).toFixed(1);
    if (series.change_percent > 0) {
      return `up ${rounded}%`;
    }
    return series.change_percent < 0 ? `down ${rounded}%` : 'no change';
  }

  hasIncreased(series: ItemPriceSeries): boolean {
    return (series.change_percent ?? 0) > 0;
  }

  changeSince(series: ItemPriceSeries): string {
    return `since ${series.first_paid_on}`;
  }

  private readonly pages = signal<Record<string, number>>({});

  private readonly newestFirst = computed(
    () => new Map(this.series().map((s) => [s.currency_code, [...s.points].reverse()])),
  );

  pageNewestFirst(series: ItemPriceSeries): ItemPricePoint[] {
    const points = this.newestFirst().get(series.currency_code) ?? [...series.points].reverse();
    return pageOf(points, this.pageOn(series));
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
