import { ArchiveConfirmComponent } from '../ui/archive-confirm.component';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { AdvanceRead, AgreementRead, ExpenseRead, ProjectRead } from '@setout/api-client';
import { AttachmentParent } from '../attachments/attachment.service';
import { AttachmentsComponent } from '../attachments/attachments.component';
import { ChangeHistoryComponent } from '../changes/change-history.component';
import {
  formatAmount,
  formatAmountInput,
  formatMoney,
  moneyInputHint,
  parseMoney,
} from '../budget/money';
import { ExpenseService } from '../expenses/expense.service';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { InfiniteScrollDirective } from '../ui/infinite-scroll.directive';
import { MoneyHintComponent } from '../ui/money-hint.component';
import { Option, OptionPickerComponent } from '../ui/option-picker.component';
import { PaginationComponent } from '../ui/pagination.component';
import { formatDay, isoDay } from '../shared/dates';
import { ToggleComponent } from '../ui/toggle.component';
import { currencySymbol } from '../ui/currency-pill.component';
import { PersonService } from '../people/person.service';
import { VendorService } from '../vendors/vendor.service';
import { AgreementService } from './agreement.service';
import { DeleteConfirmDirective, isDeleteConfirmed } from '../ui/delete-confirm.directive';

@Component({
  selector: 'app-agreements',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ArchiveConfirmComponent,
    DeleteConfirmDirective,
    AttachmentsComponent,
    ChangeHistoryComponent,
    ButtonComponent,
    InfiniteScrollDirective,
    MoneyHintComponent,
    OptionPickerComponent,
    PaginationComponent,
    ToggleComponent,
  ],
  templateUrl: './agreements.component.html',
  styleUrl: './agreements.component.scss',
})
export class AgreementsComponent {
  readonly project = input.required<ProjectRead>();

  readonly agreements = inject(AgreementService);
  readonly vendors = inject(VendorService);
  readonly people = inject(PersonService);
  readonly expenses = inject(ExpenseService);
  private readonly toast = inject(ToastService);

  readonly adding = signal(false);
  readonly addingAdvance = signal(false);
  readonly includeArchived = signal(false);
  readonly pendingDelete = signal<string | null>(null);
  readonly deleteConfirmationText = signal('');
  readonly personId = signal('');
  readonly advanceAmount = signal('');
  readonly expenseAgreementId = signal<string | null>(null);
  readonly editing = signal<string | null>(null);
  readonly inspecting = signal<string | null>(null);
  readonly editingParent = computed<AttachmentParent | null>(() => {
    const id = this.editing();
    return id ? { attachedTo: 'agreement', id, projectId: this.project().id } : null;
  });
  readonly inspectingParent = computed<AttachmentParent | null>(() => {
    const id = this.inspecting();
    return id ? { attachedTo: 'agreement', id, projectId: this.project().id } : null;
  });
  readonly editDescription = signal('');
  readonly editAgreed = signal('');
  readonly editingAdvance = signal<string | null>(null);
  readonly editAdvanceAmount = signal('');
  readonly expenseAmount = signal('');
  readonly expenseDate = signal(isoDay());
  readonly vendorId = signal('');
  readonly description = signal('');
  readonly agreedAmount = signal('');

  readonly symbol = computed(() => currencySymbol(this.project().currency_code));

  readonly vendorOptions = computed<Option[]>(() => [
    { value: '', label: 'Select a vendor' },
    ...this.vendors
      .choices()
      .map((vendor) => ({ value: vendor.id, label: vendor.name, detail: vendor.trade })),
  ]);

  readonly personOptions = computed<Option[]>(() => [
    { value: '', label: 'Select a person' },
    ...this.people
      .choices()
      .map((person) => ({ value: person.id, label: person.name, detail: person.role })),
  ]);

  amountHint(value: string): string {
    const project = this.project();
    return moneyInputHint(value, project.currency_code, project.currency_exponent)?.text ?? '';
  }

  amountInvalid(value: string): boolean {
    const project = this.project();
    return moneyInputHint(value, project.currency_code, project.currency_exponent)?.valid === false;
  }

  readonly balancePage = signal(1);
  readonly balanceRows = computed(() => this.agreements.balances());

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

  async goToBalancePage(page: number): Promise<void> {
    this.balancePage.set(page);
    await this.agreements.loadBalances(this.project().id, page);
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  expensesFor(agreementId: string): ExpenseRead[] {
    return this.agreements.agreementExpenses()[agreementId] ?? [];
  }

  /** Omits the currency symbol because the column header shows it. */
  formatAmount(minor: number): string {
    return formatAmount(minor, this.project().currency_exponent);
  }

  formatDate(value: string): string {
    return formatDay(value);
  }

  startEdit(agreement: AgreementRead): void {
    this.inspecting.set(null);
    this.editing.set(agreement.id);
    this.editDescription.set(agreement.description);
    this.editAgreed.set(
      formatAmountInput(agreement.agreed_amount, this.project().currency_exponent),
    );
  }

  toggleInspect(id: string): void {
    this.inspecting.update((current) => (current === id ? null : id));
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
      this.toast.show(this.agreements.error() ?? 'Could not update the agreement.', 'error');
      return;
    }
    this.cancelEdit();
    this.toast.show(
      `Agreement with ${changed.vendor_name} updated to ${this.money(changed.agreed_amount)}.`,
    );
  }

  startEditAdvance(advance: AdvanceRead): void {
    this.editingAdvance.set(advance.id);
    this.editAdvanceAmount.set(formatAmountInput(advance.amount, this.project().currency_exponent));
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
      this.toast.show(this.agreements.error() ?? 'Could not update the advance.', 'error');
      return;
    }
    this.cancelEditAdvance();
    this.toast.show(`Advance to ${changed.person_name} updated to ${this.money(changed.amount)}.`);
  }

  startExpense(agreementId: string): void {
    this.expenseAgreementId.set(agreementId);
    this.expenseDate.set(isoDay());
    this.expenseAmount.set('');
  }

  cancelExpense(): void {
    this.expenseAgreementId.set(null);
    this.expenseAmount.set('');
  }

  canSaveExpense(): boolean {
    const amount = parseMoney(this.expenseAmount(), this.project().currency_exponent);
    return !!this.expenseDate() && amount !== null && amount > 0;
  }

  /** Recorded as an expense linked to the agreement, so the server recalculates paid_amount. */
  async saveExpense(agreement: AgreementRead): Promise<void> {
    const amount = parseMoney(this.expenseAmount(), this.project().currency_exponent);
    if (!this.canSaveExpense() || amount === null) {
      return;
    }
    const previous = this.expensesFor(agreement.id)[0];
    const created = await this.expenses.add(this.project().id, {
      description: agreement.description,
      amount,
      agreement_id: agreement.id,
      vendor_id: agreement.vendor_id,
      spent_on: this.expenseDate(),
      category_id: previous?.category_id ?? null,
      cost_type: previous?.cost_type ?? null,
    });
    if (!created) {
      this.toast.show(this.expenses.error() ?? 'Could not save the expense.', 'error');
      return;
    }
    this.cancelExpense();
    await this.agreements.loadAll(this.project().id, this.includeArchived());
    this.toast.show(`Expense of ${this.money(amount)} recorded for ${agreement.vendor_name}.`);
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

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
    const created = await this.agreements.create(this.project().id, {
      vendor_id: this.vendorId(),
      description: this.description().trim(),
      agreed_amount: agreed,
    });
    if (created) {
      this.toast.show(
        `Agreement with ${created.vendor_name} saved for ${this.money(created.agreed_amount)}.`,
      );
      this.cancel();
    } else {
      this.toast.show(this.agreements.error() ?? 'Could not save the agreement.', 'error');
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
    const created = await this.agreements.createAdvance(this.project().id, {
      person_id: this.personId(),
      amount,
    });
    if (created) {
      this.toast.show(`Advance of ${this.money(amount)} recorded for ${created.person_name}.`);
      this.advanceAmount.set('');
      this.addingAdvance.set(false);
    } else {
      this.toast.show(this.agreements.error() ?? 'Could not save the advance.', 'error');
    }
  }

  async archiveAdvance(advanceId: string): Promise<void> {
    await this.agreements.archiveAdvance(this.project().id, advanceId);
    this.toast.show('Advance archived. Show archived to restore it.');
  }

  async restoreAdvance(advanceId: string): Promise<void> {
    const restored = await this.agreements.restoreAdvance(this.project().id, advanceId);
    if (!restored) {
      this.toast.show(this.agreements.error() ?? 'Could not restore that advance.', 'error');
      return;
    }
    this.toast.show(`Advance to ${restored.person_name} restored.`);
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
    return isDeleteConfirmed(this.deleteConfirmationText());
  }

  async deletePermanently(agreement: AgreementRead): Promise<void> {
    if (!this.canConfirmDelete()) {
      return;
    }
    await this.agreements.delete(agreement.id);
    this.cancelDelete();
    this.toast.show(`Agreement with ${agreement.vendor_name} deleted permanently.`);
  }

  async deleteAdvancePermanently(advance: AdvanceRead): Promise<void> {
    if (!this.canConfirmDelete()) {
      return;
    }
    await this.agreements.deleteAdvance(this.project().id, advance.id);
    this.cancelDelete();
    this.toast.show(`Advance to ${advance.person_name} deleted permanently.`);
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.includeArchived.set(on);
    this.cancelEdit();
    this.cancelEditAdvance();
    this.cancelExpense();
    await this.agreements.loadAll(this.project().id, on);
    await this.agreements.loadAdvances(this.project().id, 1, on);
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }

  /** A positive balance is unspent money the person holds; a negative balance is owed to them. */
  balanceDirection(balance: number): string {
    return balance >= 0 ? 'Unspent' : 'Owed';
  }

  async archive(agreementId: string): Promise<void> {
    await this.agreements.archive(agreementId);
    this.toast.show('Agreement archived. Show archived to restore it.');
  }

  async restore(agreementId: string): Promise<void> {
    const restored = await this.agreements.restore(agreementId);
    if (!restored) {
      this.toast.show(this.agreements.error() ?? 'Could not restore that agreement.', 'error');
      return;
    }
    this.toast.show(`Agreement with ${restored.vendor_name} restored.`);
  }
}
