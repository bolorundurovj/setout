import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { VendorCurrencyTotal, VendorRead } from '@setout/api-client';
import { formatMoney } from '../budget/money';
import { ButtonComponent } from '../ui/button.component';
import { debounce } from '../ui/debounce';
import { PaginationComponent } from '../ui/pagination.component';
import { ToggleComponent } from '../ui/toggle.component';
import { TopbarComponent } from '../ui/topbar.component';
import { VendorService } from './vendor.service';

@Component({
  selector: 'app-vendors',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, PaginationComponent, ToggleComponent, TopbarComponent],
  templateUrl: './vendors.component.html',
  styleUrl: './vendors.component.scss',
})
export class VendorsComponent {
  readonly vendorService = inject(VendorService);
  private readonly router = inject(Router);

  readonly notSet = '—';

  readonly search = signal('');
  readonly includeArchived = signal(false);
  private readonly debouncedSearch = debounce<string>(
    (text) => void this.vendorService.load(text, this.includeArchived()),
  );

  constructor() {
    void this.vendorService.load();
    inject(DestroyRef).onDestroy(() => this.debouncedSearch.cancel());
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onSearch(event: Event): void {
    this.search.set(this.inputValue(event));
    this.debouncedSearch.call(this.search());
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.debouncedSearch.cancel();
    this.includeArchived.set(on);
    await this.vendorService.load(this.search(), on);
  }

  async goTo(page: number): Promise<void> {
    await this.vendorService.goTo(page);
  }

  open(vendorId: string): void {
    void this.router.navigate(['/vendors', vendorId]);
  }

  newVendor(): void {
    void this.router.navigate(['/vendors/new']);
  }

  countLabel(): string {
    const total = this.vendorService.total();
    const label = `${total} ${total === 1 ? 'vendor' : 'vendors'}`;
    return `${label} · shared across all projects`;
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }

  contactLabel(vendor: VendorRead): string {
    return vendor.contact_name ?? this.notSet;
  }

  phoneLabel(vendor: VendorRead): string {
    return vendor.phone ?? this.notSet;
  }

  formatSpent(total: VendorCurrencyTotal): string {
    return formatMoney(total.spent_amount, total.currency_code, total.currency_exponent);
  }
}
