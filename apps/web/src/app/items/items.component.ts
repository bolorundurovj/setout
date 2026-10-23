import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { ItemPriceSummary, ItemRead } from '@setout/api-client';
import { formatMoney } from '../budget/money';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { debounce } from '../ui/debounce';
import { PaginationComponent } from '../ui/pagination.component';
import { ToggleComponent } from '../ui/toggle.component';
import { TopbarComponent } from '../ui/topbar.component';
import { ItemService } from './item.service';

@Component({
  selector: 'app-items',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, PaginationComponent, ToggleComponent, TopbarComponent],
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
  readonly includeArchived = signal(false);
  readonly pendingDelete = signal<string | null>(null);
  readonly deleteConfirmationText = signal('');
  readonly name = signal('');
  readonly unit = signal('');

  private readonly debouncedSearch = debounce<string>(
    (text) => void this.items.load(text, this.includeArchived()),
  );

  constructor() {
    void this.items.load();
    inject(DestroyRef).onDestroy(() => this.debouncedSearch.cancel());
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onSearch(event: Event): void {
    this.search.set(this.value(event));
    this.debouncedSearch.call(this.search());
  }

  async goTo(page: number): Promise<void> {
    await this.items.goTo(page);
  }

  openItem(itemId: string): void {
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
      this.toast.show(`${created.name} saved.`);
    } else {
      this.toast.show(this.items.error() ?? 'Could not add the item.', 'error');
    }
  }

  async archive(itemId: string): Promise<void> {
    await this.items.archive(itemId);
    this.toast.show('Item archived. Show archived to restore it.');
  }

  async restore(itemId: string): Promise<void> {
    await this.items.restore(itemId);
    this.toast.show('Item restored.');
  }

  requestDelete(id: string): void {
    this.pendingDelete.set(id);
    this.deleteConfirmationText.set('');
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
    this.deleteConfirmationText.set('');
  }

  canConfirmDelete(): boolean {
    return this.deleteConfirmationText().trim() === 'DELETE';
  }

  async deletePermanently(itemId: string): Promise<void> {
    if (!this.canConfirmDelete()) {
      return;
    }
    await this.items.delete(itemId);
    this.cancelDelete();
    this.toast.show('Item permanently deleted.');
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.debouncedSearch.cancel();
    this.includeArchived.set(on);
    await this.items.load(this.search(), on);
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }

  unitLabel(item: ItemRead): string {
    if (!item.unit) {
      return this.notSet;
    }
    return item.unit.toLowerCase() === 'each' ? 'each' : `per ${item.unit}`;
  }

  countLabel(item: ItemRead): string {
    if (item.purchase_count === 0) {
      return 'No expenses';
    }
    return item.purchase_count === 1 ? '1 expense' : `${item.purchase_count} expenses`;
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

  hasIncreased(price: ItemPriceSummary): boolean {
    return (price.change_percent ?? 0) > 0;
  }
}
