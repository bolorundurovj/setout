import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { AdvanceRead, AgreementRead, ExpenseRead, ProjectRead } from '@setout/api-client';
import { formatMoney, parseMoney } from '../budget/money';
import { ExpenseService } from '../expenses/expense.service';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { InfiniteScrollDirective } from '../ui/infinite-scroll.directive';
import { PaginationComponent } from '../ui/pagination.component';
import { pageOf } from '../ui/paging';
import { currencySymbol } from '../ui/currency-pill.component';
import { PersonService } from '../people/person.service';
import { VendorService } from '../vendors/vendor.service';
import { AgreementService } from './agreement.service';

@Component({
  selector: 'app-agreements',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, InfiniteScrollDirective, PaginationComponent],
  templateUrl: './agreements.component.html',
  styleUrl: './agreements.component.scss',
})
export class AgreementsComponent {
  readonly project = input.required<ProjectRead>();

  readonly agreements = inject(AgreementService);
  readonly vendors = inject(VendorService);
  readonly people = inject(PersonService);
  private readonly expenses = inject(ExpenseService);
  private readonly toast = inject(ToastService);

  readonly adding = signal(false);
  readonly addingAdvance = signal(false);
  readonly personId = signal('');
  readonly advanceAmount = signal('');
  readonly paying = signal<string | null>(null);
  readonly editing = signal<string | null>(null);
  readonly editDescription = signal('');
  readonly editAgreed = signal('');
  readonly editingAdvance = signal<string | null>(null);
  readonly editAdvanceAmount = signal('');
  readonly paymentAmount = signal('');
  readonly vendorId = signal('');
  readonly description = signal('');
  readonly agreedAmount = signal('');

  readonly symbol = computed(() => currencySymbol(this.project().currency_code));

  readonly balancePage = signal(1);
  readonly balanceRows = computed(() => pageOf(this.agreements.balances(), this.balancePage()));

  constructor() {
    queueMicrotask(() => {
      void this.agreements.loadAll(this.project().id);
      void this.vendors.loadChoices();
      void this.people.loadChoices();
      void this.agreements.loadAdvances(this.project().id);
      void this.agreements.loadBalances(this.project().id);
    });
  }

  async loadMore(): Promise<void> {
    await this.agreements.loadMore(this.project().id);
  }

  async goToAdvances(page: number): Promise<void> {
    await this.agreements.loadAdvances(this.project().id, page);
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  paymentsFor(agreementId: string): ExpenseRead[] {
    return this.agreements.payments()[agreementId] ?? [];
  }

  /** The column already says which currency, so the figure does not repeat it. */
  bare(minor: number): string {
    const exponent = this.project().currency_exponent;
    return new Intl.NumberFormat('en', {
      minimumFractionDigits: exponent === 0 ? 0 : 0,
      maximumFractionDigits: 0,
    }).format(minor / 10 ** exponent);
  }

  day(value: string): string {
    return new Date(value).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  startEdit(agreement: AgreementRead): void {
    this.editing.set(agreement.id);
    this.editDescription.set(agreement.description);
    this.editAgreed.set(this.bare(agreement.agreed_amount).replace(/,/g, ''));
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  canSaveEdit(): boolean {
    const agreed = parseMoney(this.editAgreed(), this.project().currency_exponent);
    return this.editDescription().trim().length > 0 && agreed !== null && agreed >= 0;
  }

  async saveEdit(agreement: AgreementRead): Promise<void> {
    const agreed = parseMoney(this.editAgreed(), this.project().currency_exponent);
    if (!this.canSaveEdit() || agreed === null) {
      return;
    }
    const changed = await this.agreements.edit(agreement.id, {
      description: this.editDescription().trim(),
      agreed_amount: agreed,
    });
    if (!changed) {
      this.toast.show(this.agreements.error() ?? 'Could not change that agreement.', 'error');
      return;
    }
    this.cancelEdit();
    this.toast.show(`${changed.vendor_name}: now ${this.money(changed.agreed_amount)} agreed.`);
  }

  startEditAdvance(advance: AdvanceRead): void {
    this.editingAdvance.set(advance.id);
    this.editAdvanceAmount.set(this.bare(advance.amount).replace(/,/g, ''));
  }

  cancelEditAdvance(): void {
    this.editingAdvance.set(null);
  }

  async saveEditAdvance(advance: AdvanceRead): Promise<void> {
    const amount = parseMoney(this.editAdvanceAmount(), this.project().currency_exponent);
    if (amount === null || amount <= 0) {
      return;
    }
    const changed = await this.agreements.editAdvance(this.project().id, advance.id, { amount });
    if (!changed) {
      this.toast.show(this.agreements.error() ?? 'Could not change that advance.', 'error');
      return;
    }
    this.cancelEditAdvance();
    this.toast.show(`${changed.person_name} now holds ${this.money(changed.amount)}.`);
  }

  startPayment(agreementId: string): void {
    this.paying.set(agreementId);
    this.paymentAmount.set('');
  }

  cancelPayment(): void {
    this.paying.set(null);
    this.paymentAmount.set('');
  }

  canPay(): boolean {
    const amount = parseMoney(this.paymentAmount(), this.project().currency_exponent);
    return amount !== null && amount > 0;
  }

  /** A payment is an expense filed against the agreement, so paid moves with it. */
  async savePayment(agreement: AgreementRead): Promise<void> {
    const amount = parseMoney(this.paymentAmount(), this.project().currency_exponent);
    if (!this.canPay() || amount === null) {
      return;
    }
    const created = await this.expenses.add(this.project().id, {
      description: 'Part payment',
      amount,
      agreement_id: agreement.id,
      vendor_id: agreement.vendor_id,
      cost_type: 'labour',
    });
    if (!created) {
      this.toast.show(this.expenses.error() ?? 'Could not record that payment.', 'error');
      return;
    }
    this.cancelPayment();
    await this.agreements.loadAll(this.project().id);
    this.toast.show(`${this.money(amount)} paid to ${agreement.vendor_name}.`);
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  /** How much of the agreed amount has been paid, for the meter. */
  paidPercent(agreement: AgreementRead): number {
    if (!agreement.agreed_amount) {
      return 0;
    }
    return Math.min(100, (agreement.paid_amount / agreement.agreed_amount) * 100);
  }

  settled(agreement: AgreementRead): boolean {
    return agreement.balance_amount === 0;
  }

  canSave(): boolean {
    const agreed = parseMoney(this.agreedAmount(), this.project().currency_exponent);
    return (
      this.vendorId().length > 0 &&
      this.description().trim().length > 0 &&
      agreed !== null &&
      agreed >= 0
    );
  }

  openForm(): void {
    this.adding.set(true);
  }

  cancel(): void {
    this.adding.set(false);
    this.description.set('');
    this.agreedAmount.set('');
  }

  async save(): Promise<void> {
    const agreed = parseMoney(this.agreedAmount(), this.project().currency_exponent);
    if (!this.canSave() || agreed === null) {
      return;
    }
    const created = await this.agreements.add(this.project().id, {
      vendor_id: this.vendorId(),
      description: this.description().trim(),
      agreed_amount: agreed,
    });
    if (created) {
      this.toast.show(`Agreed ${this.money(created.agreed_amount)} with ${created.vendor_name}.`);
      this.cancel();
    } else {
      this.toast.show(this.agreements.error() ?? 'Could not save that agreement.', 'error');
    }
  }

  canSaveAdvance(): boolean {
    const amount = parseMoney(this.advanceAmount(), this.project().currency_exponent);
    return this.personId().length > 0 && amount !== null && amount > 0;
  }

  async saveAdvance(): Promise<void> {
    const amount = parseMoney(this.advanceAmount(), this.project().currency_exponent);
    if (!this.canSaveAdvance() || amount === null) {
      return;
    }
    const created = await this.agreements.addAdvance(this.project().id, {
      person_id: this.personId(),
      amount,
    });
    if (created) {
      this.toast.show(`${this.money(amount)} given to ${created.person_name}.`);
      this.advanceAmount.set('');
      this.addingAdvance.set(false);
    } else {
      this.toast.show(this.agreements.error() ?? 'Could not save that advance.', 'error');
    }
  }

  async removeAdvance(advanceId: string): Promise<void> {
    await this.agreements.removeAdvance(this.project().id, advanceId);
    this.toast.show('Advance removed.');
  }

  /** Positive means they still hold money, negative means they are owed it. */
  holding(balance: number): string {
    return balance >= 0 ? 'holds' : 'is owed';
  }

  async remove(agreementId: string): Promise<void> {
    await this.agreements.remove(agreementId);
    this.toast.show('Agreement removed.');
  }
}
