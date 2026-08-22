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
  readonly vendors = inject(VendorService);
  private readonly router = inject(Router);

  readonly notSet = '—';

  readonly search = signal('');
  readonly includeArchived = signal(false);
  private readonly typing = debounce<string>(
    (text) => void this.vendors.load(text, this.includeArchived()),
  );

  constructor() {
    void this.vendors.load();
    inject(DestroyRef).onDestroy(() => this.typing.cancel());
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onSearch(event: Event): void {
    this.search.set(this.value(event));
    this.typing.call(this.search());
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.typing.cancel();
    this.includeArchived.set(on);
    await this.vendors.load(this.search(), on);
  }

  async goTo(page: number): Promise<void> {
    await this.vendors.goTo(page);
  }

  open(vendorId: string): void {
    void this.router.navigate(['/vendors', vendorId]);
  }

  newVendor(): void {
    void this.router.navigate(['/vendors/new']);
  }

  countLabel(): string {
    const total = this.vendors.total();
    const label = `${total} ${total === 1 ? 'vendor' : 'vendors'}`;
    return `${label} · shared across every project`;
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }

  contactLabel(vendor: VendorRead): string {
    return vendor.contact_name ?? this.notSet;
  }

  phoneLabel(vendor: VendorRead): string {
    return vendor.phone ?? 'no phone';
  }

  money(total: VendorCurrencyTotal): string {
    return formatMoney(total.spent_amount, total.currency_code, total.currency_exponent);
  }
}
