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
import { formatDay } from '../shared/dates';
import { DeliveryService } from '../deliveries/delivery.service';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { PaginationComponent } from '../ui/pagination.component';
import type { RequestStatus } from '../ui/request-status';
import { VendorService } from './vendor.service';
import { DeleteConfirmDirective, isDeleteConfirmed } from '../ui/delete-confirm.directive';

@Component({
  selector: 'app-vendor-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DeleteConfirmDirective, RouterLink, ButtonComponent, PaginationComponent],
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
  readonly agreementsStatus = signal<RequestStatus>('idle');
  readonly deliveryStatus = computed(() => this.deliveries.vendorStatus(this.id()));
  readonly outstandingTotals = computed(() =>
    (this.deliveries.forVendor(this.id()).currencyTotals ?? [])
      .filter((total) => total.amount !== 0)
      .map(
        (total) =>
          total.currency_code +
          ' ' +
          formatMoney(total.amount, total.currency_code, total.currency_exponent),
      ),
  );
  readonly outstandingDeliveries = computed(() => this.deliveries.forVendor(this.id()).rows);
  readonly deliveryTotal = computed(() => this.deliveries.forVendor(this.id()).total);
  readonly deliveryPage = signal(1);
  readonly loading = signal(true);
  readonly pendingDelete = signal(false);
  readonly deleteConfirmationText = signal('');

  readonly notSet = '—';

  private loadSeq = 0;

  constructor() {
    effect(() => {
      this.id();
      this.deliveryPage.set(1);
      void this.load();
      void this.deliveries.loadForVendor(this.id(), 1);
    });
    effect(() => {
      const vendor = this.vendor();
      if (vendor) {
        this.title.setTitle(`${vendor.name} · Setout`);
      }
    });
  }

  async load(): Promise<void> {
    const requestId = ++this.loadSeq;
    const [vendor, expenseSummary, agreements] = await Promise.all([
      this.vendorService.get(this.id()),
      this.vendorService.expenseSummary(this.id()),
      this.vendorService.agreements(this.id()),
    ]);
    if (requestId !== this.loadSeq) {
      return;
    }
    this.vendor.set(vendor);
    this.expenseSummary.set(expenseSummary);
    this.agreements.set(agreements ?? []);
    this.agreementsStatus.set(agreements ? 'ready' : 'error');
    this.loading.set(false);
  }

  agreementMoney(row: VendorAgreement, minor: number): string {
    return formatMoney(minor, row.currency_code, row.currency_exponent);
  }

  deliveryAmount(delivery: DeliveryRead): string {
    return formatMoney(delivery.amount, delivery.currency_code, delivery.currency_exponent);
  }

  deliveryDates(delivery: DeliveryRead): string {
    const paid = formatDay(delivery.spent_on);
    if (!delivery.expected) {
      return `Paid ${paid}`;
    }
    return `Paid ${paid} · expected ${formatDay(delivery.expected)}`;
  }

  async goToDeliveryPage(page: number): Promise<void> {
    this.deliveryPage.set(page);
    await this.deliveries.loadForVendor(this.id(), page);
  }

  async markReceived(delivery: DeliveryRead): Promise<void> {
    await this.deliveries.markReceived(delivery.id);
    const currentPage = this.deliveryPage();
    await this.deliveries.loadForVendor(this.id(), currentPage, true);
    if (this.outstandingDeliveries().length === 0 && currentPage > 1) {
      await this.goToDeliveryPage(currentPage - 1);
    }
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

  requestDelete(): void {
    this.pendingDelete.set(true);
    this.deleteConfirmationText.set('');
  }

  cancelDelete(): void {
    this.pendingDelete.set(false);
    this.deleteConfirmationText.set('');
  }

  canConfirmDelete(): boolean {
    return isDeleteConfirmed(this.deleteConfirmationText());
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  async deletePermanently(): Promise<void> {
    if (!this.canConfirmDelete()) {
      return;
    }
    await this.vendorService.delete(this.id());
    this.toast.show('Vendor deleted permanently.');
    void this.router.navigate(['/vendors']);
  }
}
