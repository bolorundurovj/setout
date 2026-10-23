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
import { Router, RouterLink } from '@angular/router';
import type {
  DeliveryRead,
  VendorAgreement,
  VendorCurrencyTotal,
  VendorExpenseSummary,
  VendorProjectExpenseSummary,
  VendorRead,
} from '@setout/api-client';
import { formatMoney } from '../budget/money';
import { DeliveryService } from '../deliveries/delivery.service';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { VendorService } from './vendor.service';

@Component({
  selector: 'app-vendor-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent],
  templateUrl: './vendor-detail.component.html',
  styleUrl: './vendor-detail.component.scss',
})
export class VendorDetailComponent {
  private readonly vendorService = inject(VendorService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly deliveries = inject(DeliveryService);

  private readonly title = inject(Title);

  readonly id = input.required<string>();

  readonly vendor = signal<VendorRead | null>(null);
  readonly expenseSummary = signal<VendorExpenseSummary | null>(null);
  readonly agreements = signal<VendorAgreement[]>([]);
  readonly outstandingDeliveries = computed(() => this.deliveries.forVendor(this.id()).rows);
  readonly loading = signal(true);

  readonly notSet = '—';

  constructor() {
    effect(() => {
      this.id();
      void this.load();
      void this.deliveries.loadForVendor(this.id());
    });
    effect(() => {
      const vendor = this.vendor();
      if (vendor) {
        this.title.setTitle(`${vendor.name} · Setout`);
      }
    });
  }

  async load(): Promise<void> {
    const [vendor, expenseSummary, agreements] = await Promise.all([
      this.vendorService.get(this.id()),
      this.vendorService.expenseSummary(this.id()),
      this.vendorService.agreements(this.id()),
    ]);
    this.vendor.set(vendor);
    this.expenseSummary.set(expenseSummary);
    this.agreements.set(agreements);
    this.loading.set(false);
  }

  agreementMoney(row: VendorAgreement, minor: number): string {
    return formatMoney(minor, row.currency_code, row.currency_exponent);
  }

  deliveryAmount(delivery: DeliveryRead): string {
    return formatMoney(delivery.amount, delivery.currency_code, delivery.currency_exponent);
  }

  deliveryDates(delivery: DeliveryRead): string {
    const paid = new Date(delivery.spent_on).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return delivery.expected ? `Paid ${paid} · expected ${delivery.expected}` : `Paid ${paid}`;
  }

  async markReceived(delivery: DeliveryRead): Promise<void> {
    await this.deliveries.markReceived(delivery.id);
    await this.deliveries.loadForVendor(this.id());
    this.toast.show(`${delivery.description} marked received.`);
  }

  formatSpent(row: VendorProjectExpenseSummary): string {
    return formatMoney(row.spent_amount, row.currency_code, row.currency_exponent);
  }

  isIncomplete(vendor: VendorRead): boolean {
    return !vendor.trade && !vendor.contact_name && !vendor.phone;
  }

  edit(): void {
    void this.router.navigate(['/vendors', this.id(), 'edit']);
  }

  totalsByCurrency(summary: VendorExpenseSummary): VendorCurrencyTotal[] {
    const rows = new Map<string, VendorCurrencyTotal>();
    for (const project of summary.projects) {
      const existing = rows.get(project.currency_code);
      if (existing) {
        existing.expense_count += project.expense_count;
        existing.spent_amount += project.spent_amount;
      } else {
        rows.set(project.currency_code, {
          currency_code: project.currency_code,
          currency_exponent: project.currency_exponent,
          expense_count: project.expense_count,
          spent_amount: project.spent_amount,
        });
      }
    }
    return [...rows.values()];
  }

  formatTotal(total: VendorCurrencyTotal): string {
    return formatMoney(total.spent_amount, total.currency_code, total.currency_exponent);
  }

  async archive(): Promise<void> {
    await this.vendorService.archive(this.id());
    await this.load();
    this.toast.show('Vendor archived. Their expenses are still included in totals.');
  }

  async restore(): Promise<void> {
    await this.vendorService.restore(this.id());
    await this.load();
    this.toast.show('Vendor restored.');
  }
}
