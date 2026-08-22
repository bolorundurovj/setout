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
  VendorProjectSpend,
  VendorRead,
  VendorSpend,
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
  private readonly vendors = inject(VendorService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly deliveries = inject(DeliveryService);

  private readonly title = inject(Title);

  readonly id = input.required<string>();

  readonly vendor = signal<VendorRead | null>(null);
  readonly spend = signal<VendorSpend | null>(null);
  readonly agreements = signal<VendorAgreement[]>([]);
  readonly owedHere = computed(() => this.deliveries.forVendor(this.id()).rows);
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
    const [vendor, spend, agreements] = await Promise.all([
      this.vendors.get(this.id()),
      this.vendors.spend(this.id()),
      this.vendors.agreements(this.id()),
    ]);
    this.vendor.set(vendor);
    this.spend.set(spend);
    this.agreements.set(agreements);
    this.loading.set(false);
  }

  agreementMoney(row: VendorAgreement, minor: number): string {
    return formatMoney(minor, row.currency_code, row.currency_exponent);
  }

  owedMoney(owed: DeliveryRead): string {
    return formatMoney(owed.amount, owed.currency_code, owed.currency_exponent);
  }

  owedWhen(owed: DeliveryRead): string {
    const paid = new Date(owed.spent_on).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return owed.promised ? `Paid ${paid} · promised ${owed.promised}` : `Paid ${paid}`;
  }

  async markDelivered(owed: DeliveryRead): Promise<void> {
    await this.deliveries.receive(owed.id);
    await this.deliveries.loadForVendor(this.id());
    this.toast.show(`${owed.description} marked delivered.`);
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  money(row: VendorProjectSpend): string {
    return formatMoney(row.spent_amount, row.currency_code, row.currency_exponent);
  }

  needsFillingIn(vendor: VendorRead): boolean {
    return !vendor.trade && !vendor.contact_name && !vendor.phone;
  }

  edit(): void {
    void this.router.navigate(['/vendors', this.id(), 'edit']);
  }

  totalsByCurrency(spend: VendorSpend): VendorCurrencyTotal[] {
    const rows = new Map<string, VendorCurrencyTotal>();
    for (const project of spend.projects) {
      const held = rows.get(project.currency_code);
      if (held) {
        held.expense_count += project.expense_count;
        held.spent_amount += project.spent_amount;
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

  total(total: VendorCurrencyTotal): string {
    return formatMoney(total.spent_amount, total.currency_code, total.currency_exponent);
  }

  async archive(): Promise<void> {
    await this.vendors.archive(this.id());
    await this.load();
    this.toast.show('Vendor archived. Everything filed against them still counts.');
  }

  async restore(): Promise<void> {
    await this.vendors.restore(this.id());
    await this.load();
    this.toast.show('Vendor taken out of the archive.');
  }
}
