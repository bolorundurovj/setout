import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { ItemPriceSummary, ItemRead } from '@setout/api-client';
import { formatMoney } from '../budget/money';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { debounce } from '../ui/debounce';
import { PaginationComponent } from '../ui/pagination.component';
import { TopbarComponent } from '../ui/topbar.component';
import { ItemService } from './item.service';

@Component({
  selector: 'app-items',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, PaginationComponent, TopbarComponent],
  templateUrl: './items.component.html',
  styleUrl: './items.component.scss',
})
export class ItemsComponent {
  readonly items = inject(ItemService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly notSet = '—';

  readonly search = signal('');
  readonly showForm = signal(false);
  readonly name = signal('');
  readonly unit = signal('');

  private readonly typing = debounce<string>((text) => void this.items.load(text));

  constructor() {
    void this.items.load();
    inject(DestroyRef).onDestroy(() => this.typing.cancel());
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onSearch(event: Event): void {
    this.search.set(this.value(event));
    this.typing.call(this.search());
  }

  async goTo(page: number): Promise<void> {
    await this.items.goTo(page);
  }

  open(itemId: string): void {
    void this.router.navigate(['/items', itemId]);
  }

  isValid(): boolean {
    return this.name().trim().length > 0;
  }

  openForm(): void {
    this.showForm.set(true);
  }

  cancel(): void {
    this.showForm.set(false);
    this.name.set('');
    this.unit.set('');
  }

  async save(): Promise<void> {
    if (!this.isValid()) {
      return;
    }
    const created = await this.items.add({
      name: this.name().trim(),
      unit: this.unit().trim() || null,
    });
    if (created) {
      this.cancel();
      this.toast.show(`${created.name} added to the catalogue.`);
    } else {
      this.toast.show(this.items.error() ?? 'Could not add that item.', 'error');
    }
  }

  async archive(itemId: string): Promise<void> {
    await this.items.remove(itemId);
    this.toast.show('Item archived.');
  }

  unitLabel(item: ItemRead): string {
    return item.unit ? `per ${item.unit}` : this.notSet;
  }

  countLabel(item: ItemRead): string {
    if (item.purchase_count === 0) {
      return 'never bought';
    }
    return item.purchase_count === 1 ? 'bought once' : `bought ${item.purchase_count} times`;
  }

  money(minor: number, price: ItemPriceSummary): string {
    return formatMoney(minor, price.currency_code, price.currency_exponent);
  }

  changeLabel(price: ItemPriceSummary): string {
    if (price.change_percent === null) {
      return this.notSet;
    }
    const rounded = Math.abs(price.change_percent).toFixed(1);
    if (price.change_percent > 0) {
      return `up ${rounded}%`;
    }
    return price.change_percent < 0 ? `down ${rounded}%` : 'no change';
  }

  hasRisen(price: ItemPriceSummary): boolean {
    return (price.change_percent ?? 0) > 0;
  }
}
