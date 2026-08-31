import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type {
  AttachmentRead,
  CostType,
  ExpenseRead,
  ItemLastPrice,
  ProjectRead,
  ScopeSuggestion,
} from '@setout/api-client';
import { AgreementService } from '../agreements/agreement.service';
import { AttachmentService } from '../attachments/attachment.service';
import { BudgetService } from '../budget/budget.service';
import { formatMoney, parseMoney } from '../budget/money';
import { ItemService } from '../items/item.service';
import { PersonService } from '../people/person.service';
import { DeliveryService } from '../deliveries/delivery.service';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { Chip, ChipGroupComponent } from '../ui/chip-group.component';
import { currencySymbol } from '../ui/currency-pill.component';
import { VendorService } from '../vendors/vendor.service';
import { ExpenseService } from './expense.service';

function isoDay(offsetDays = 0): string {
  const day = new Date();
  day.setDate(day.getDate() - offsetDays);
  const month = `${day.getMonth() + 1}`.padStart(2, '0');
  const date = `${day.getDate()}`.padStart(2, '0');
  return `${day.getFullYear()}-${month}-${date}`;
}

@Component({
  selector: 'app-add-expense',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ChipGroupComponent],
  templateUrl: './add-expense.component.html',
  styleUrl: './add-expense.component.scss',
})
export class AddExpenseComponent {
  readonly project = input.required<ProjectRead>();
  // Given an expense, the form edits it instead of recording a new one.
  readonly editing = input<ExpenseRead | null>(null);

  readonly saved = output<void>();
  readonly isEditing = computed(() => this.editing() !== null);
  readonly done = output<void>();

  readonly expenses = inject(ExpenseService);
  readonly itemsCatalogue = inject(ItemService);
  readonly vendorList = inject(VendorService);
  readonly peopleList = inject(PersonService);
  private readonly budget = inject(BudgetService);
  private readonly agreements = inject(AgreementService);
  private readonly toast = inject(ToastService);
  private readonly deliveries = inject(DeliveryService);
  readonly attachments = inject(AttachmentService);

  readonly scopeId = signal('');
  readonly description = signal('');
  readonly spentOn = signal(isoDay());
  readonly costType = signal('');
  readonly amount = signal('');
  readonly quantity = signal('');
  readonly unitRate = signal('');
  readonly itemId = signal('');
  readonly vendorId = signal('');
  readonly agreementId = signal('');
  readonly paidById = signal('');
  readonly notes = signal('');

  readonly lastPrice = signal<ItemLastPrice | null>(null);
  readonly addingItem = signal(false);
  readonly newItemName = signal('');
  readonly newItemUnit = signal('');
  readonly owed = signal(false);
  readonly owedWhat = signal('');
  readonly owedWhen = signal('');
  readonly addingVendor = signal(false);
  readonly newVendorName = signal('');
  readonly suggestedScopeId = signal<string | null>(null);

  private readonly photo = viewChild.required<ElementRef<HTMLInputElement>>('photo');
  readonly chosen = signal<File | null>(null);
  readonly justRemoved = signal<AttachmentRead | null>(null);

  readonly symbol = computed(() => currencySymbol(this.project().currency_code));

  readonly scopeChips = computed<Chip[]>(() => [
    { value: '', label: 'Not sure yet' },
    ...this.budget
      .scopes()
      .filter((scope) => !scope.is_group)
      .map((scope) => ({ value: scope.id, label: scope.name })),
  ]);

  readonly dateChips = computed<Chip[]>(() => [
    { value: isoDay(), label: 'Today' },
    { value: isoDay(1), label: 'Yesterday' },
  ]);

  readonly costTypeChips: Chip[] = [
    { value: 'material', label: 'Material' },
    { value: 'labour', label: 'Labour' },
    { value: 'fixed', label: 'Fixed' },
  ];

  readonly itemChips = computed<Chip[]>(() => [
    { value: '', label: 'Not tracked' },
    ...this.itemsCatalogue
      .choices()
      .map((item) => ({ value: item.id, label: item.name, detail: item.unit })),
  ]);

  readonly vendorChips = computed<Chip[]>(() => [
    { value: '', label: 'No vendor' },
    ...this.vendorList
      .choices()
      .map((vendor) => ({ value: vendor.id, label: vendor.name, detail: vendor.trade })),
  ]);

  readonly payerChips = computed<Chip[]>(() => [
    { value: '', label: 'Me' },
    ...this.peopleList
      .choices()
      .map((person) => ({ value: person.id, label: person.name, detail: person.role })),
  ]);

  readonly quantityValue = computed<number | null>(() => {
    const cleaned = this.quantity().replace(/[\s,]/g, '');
    if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') {
      return null;
    }
    const parsed = Number(cleaned);
    return parsed > 0 ? parsed : null;
  });

  readonly unitRateMinor = computed(() =>
    parseMoney(this.unitRate(), this.project().currency_exponent),
  );

  readonly derived = computed(() => {
    const quantity = this.quantityValue();
    const rate = this.unitRateMinor();
    return quantity === null || rate === null ? null : Math.round(quantity * rate);
  });

  readonly attached = computed(() => {
    const expense = this.editing();
    return expense ? this.attachments.forExpense(expense.id) : [];
  });

  readonly photoLabel = computed(() => {
    const file = this.chosen();
    if (!file) {
      return 'Photograph the receipt now. Paper on site does not survive the month';
    }
    return `${file.name} � ${this.attachments.size(file.size)} � kept beside the record on your own server`;
  });

  constructor() {
    effect(() => {
      const expense = this.editing();
      if (expense) {
        this.prefill(expense);
        void this.attachments.load(expense.id);
      }
    });
    effect(() => {
      if (this.isEditing() || this.budget.scopes().length === 0) {
        return;
      }
      const itemId = this.itemId();
      const vendorId = this.vendorId();
      if (!itemId && !vendorId) {
        this.suggestedScopeId.set(null);
        return;
      }
      void this.suggestScope(itemId, vendorId);
    });
    queueMicrotask(() => {
      void this.budget.load(this.project().id);
      void this.agreements.load(this.project().id);
      void this.itemsCatalogue.loadChoices();
      void this.vendorList.loadChoices();
      void this.peopleList.loadChoices();
    });
  }

  readonly agreementChips = computed<Chip[]>(() => [
    { value: '', label: 'None' },
    ...this.agreements
      .agreements()
      .map((a) => ({ value: a.id, label: `${a.vendor_name}: ${a.description}` })),
  ]);

  // Say what is left on the agreement, so a part payment is entered knowing it.
  readonly agreementNote = computed(() => {
    const chosen = this.agreements.agreements().find((a) => a.id === this.agreementId());
    if (!chosen) {
      return '';
    }
    const project = this.project();
    const left = formatMoney(
      chosen.balance_amount,
      project.currency_code,
      project.currency_exponent,
    );
    return chosen.balance_amount === 0 ? 'This agreement is settled.' : `${left} still owed.`;
  });

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  scopeNote(): string {
    const scope = this.budget.scopes().find((s) => s.id === this.scopeId());
    if (!scope) {
      return 'Files as unfiled. Nothing is blocked, and you can file it later.';
    }
    if (this.scopeId() === this.suggestedScopeId()) {
      return `Suggested from past purchases. Counts against the plan for ${scope.name}.`;
    }
    return `Counts against the plan for ${scope.name}.`;
  }

  dateNote(): string {
    return this.spentOn() === isoDay()
      ? 'Today. Change it when you are working through a pile of receipts.'
      : `Filed on ${this.spentOn()}, not today. It lands in that month.`;
  }

  costTypeNote(): string {
    return this.costType()
      ? 'Splits the project total three ways on the dashboard. Tap again to clear it.'
      : 'Optional. Leave it off and the expense still counts in every total.';
  }

  calcLine(): string {
    const derived = this.derived();
    if (derived === null) {
      return 'Fill in quantity and rate and the total works itself out.';
    }
    return `${this.quantity()} × ${this.money(this.unitRateMinor() ?? 0)} = ${this.money(derived)}`;
  }

  warnLine(): string {
    const last = this.lastPrice();
    const rate = this.unitRateMinor();
    if (last === null || rate === null || last.unit_rate === 0 || rate <= last.unit_rate) {
      return '';
    }
    const above = Math.round(((rate - last.unit_rate) / last.unit_rate) * 100);
    return `${this.money(rate)} is ${above}% above the last price paid (${this.money(last.unit_rate)}).`;
  }

  payerNote(): string {
    const person = this.peopleList.choices().find((p) => p.id === this.paidById());
    return person ? `Adds to what you owe ${person.name}.` : 'Nothing owed to anyone.';
  }

  lastPriceWhere(): string {
    const last = this.lastPrice();
    if (last === null) {
      return '';
    }
    const where = last.vendor_name ? `from ${last.vendor_name}` : 'no vendor recorded';
    return `${where} on ${last.spent_on}`;
  }

  amountMinor(): number | null {
    const derived = this.derived();
    return derived !== null ? derived : parseMoney(this.amount(), this.project().currency_exponent);
  }

  canSave(): boolean {
    const amount = this.amountMinor();
    return this.description().trim().length > 0 && amount !== null && amount >= 0;
  }

  saveHint(): string {
    return this.canSave()
      ? `Files to ${this.project().name}`
      : 'Description and amount are all that is required.';
  }

  async pickItem(itemId: string): Promise<void> {
    this.itemId.set(itemId);
    this.lastPrice.set(null);
    if (!itemId) {
      return;
    }
    const last = await this.itemsCatalogue.lastPrice(this.project().id, itemId);
    this.lastPrice.set(last);
    if (last && !this.unitRate().trim()) {
      const exponent = this.project().currency_exponent;
      this.unitRate.set((last.unit_rate / 10 ** exponent).toFixed(exponent));
    }
  }

  private async suggestScope(itemId: string, vendorId: string): Promise<void> {
    const suggestion: ScopeSuggestion | null = await this.expenses.suggestScope(
      this.project().id,
      itemId || undefined,
      vendorId || undefined,
    );
    if (suggestion?.scope_id && !this.scopeId()) {
      this.scopeId.set(suggestion.scope_id);
      this.suggestedScopeId.set(suggestion.scope_id);
    }
  }

  async addItem(): Promise<void> {
    const name = this.newItemName().trim();
    if (!name) {
      return;
    }
    const created = await this.itemsCatalogue.add({
      name,
      unit: this.newItemUnit().trim() || null,
    });
    if (created) {
      this.newItemName.set('');
      this.newItemUnit.set('');
      this.addingItem.set(false);
      await this.pickItem(created.id);
    } else {
      this.toast.show(this.itemsCatalogue.error() ?? 'Could not add that item.', 'error');
    }
  }

  async addVendor(): Promise<void> {
    const name = this.newVendorName().trim();
    if (!name) {
      return;
    }
    const created = await this.vendorList.add({ name });
    if (created) {
      this.vendorId.set(created.id);
      this.newVendorName.set('');
      this.addingVendor.set(false);
    } else {
      this.toast.show(this.vendorList.error() ?? 'Could not add that vendor.', 'error');
    }
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    void this.save(false);
  }

  private prefill(expense: ExpenseRead): void {
    const exponent = this.project().currency_exponent;
    const major = (minor: number | null): string =>
      minor === null ? '' : (minor / 10 ** exponent).toFixed(exponent);

    this.description.set(expense.description);
    this.amount.set(major(expense.amount));
    this.spentOn.set(expense.spent_on);
    this.scopeId.set(expense.scope_id ?? '');
    this.itemId.set(expense.item_id ?? '');
    this.agreementId.set(expense.agreement_id ?? '');
    this.vendorId.set(expense.vendor_id ?? '');
    this.paidById.set(expense.paid_by_id ?? '');
    this.quantity.set(expense.quantity === null ? '' : String(Number(expense.quantity)));
    this.unitRate.set(major(expense.unit_rate));
    this.costType.set(expense.cost_type ?? '');
    this.notes.set(expense.notes ?? '');
  }

  toggleOwed(): void {
    this.owed.update((on) => !on);
  }

  fileUrl(file: AttachmentRead): string {
    return this.attachments.fileUrl(file.id);
  }

  isImage(file: AttachmentRead): boolean {
    return file.content_type.startsWith('image/');
  }

  fileNote(file: AttachmentRead): string {
    return `${this.attachments.size(file.byte_size)} � kept beside the record on your own server`;
  }

  pick(): void {
    this.photo().nativeElement.click();
  }

  async onPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      return;
    }
    input.value = '';
    const existing = this.editing();
    if (!existing) {
      this.chosen.set(file);
      return;
    }
    const added = await this.attachments.add(this.project().id, existing.id, file);
    if (!added) {
      this.toast.show(this.attachments.error() ?? 'Could not attach that file.', 'error');
      return;
    }
    this.toast.show(`${added.filename} attached.`);
  }

  async removeFile(file: AttachmentRead): Promise<void> {
    const existing = this.editing();
    if (!existing) {
      return;
    }
    await this.attachments.remove(existing.id, file.id);
    this.justRemoved.set(file);
    this.toast.show('Photo removed. The expense stands.');
  }

  async putPhotoBack(): Promise<void> {
    const existing = this.editing();
    const gone = this.justRemoved();
    if (!existing || !gone) {
      return;
    }
    const back = await this.attachments.restore(existing.id, gone.id);
    this.justRemoved.set(null);
    this.toast.show(
      back ? `${back.filename} is back.` : (this.attachments.error() ?? 'Could not put it back.'),
      back ? 'success' : 'error',
    );
  }

  async save(another: boolean): Promise<void> {
    const amount = this.amountMinor();
    // A double tap on a phone is one purchase, not two.
    if (this.expenses.saving() || !this.canSave() || amount === null) {
      return;
    }
    const derived = this.derived();
    const body = {
      description: this.description().trim(),
      amount: derived === null ? amount : null,
      spent_on: this.spentOn() || null,
      scope_id: this.scopeId() || null,
      item_id: this.itemId() || null,
      vendor_id: this.vendorId() || null,
      agreement_id: this.agreementId() || null,
      paid_by_id: this.paidById() || null,
      quantity: this.quantityValue(),
      unit_rate: this.unitRateMinor(),
      cost_type: (this.costType() as CostType) || null,
      notes: this.notes().trim() || null,
    };

    const existing = this.editing();
    const saved = existing
      ? await this.expenses.update(this.project().id, existing.id, body)
      : await this.expenses.add(this.project().id, body);

    if (!saved) {
      this.toast.show(this.expenses.error() ?? 'Could not save that expense.', 'error');
      return;
    }

    const file = this.chosen();
    if (!existing && file) {
      const added = await this.attachments.add(this.project().id, saved.id, file);
      if (!added) {
        this.toast.show(this.attachments.error() ?? 'Could not attach that file.', 'error');
      }
    }

    if (!existing && this.owed()) {
      const waiting = await this.deliveries.add(this.project().id, {
        expense_id: saved.id,
        description: this.owedWhat().trim() || null,
        promised: this.owedWhen().trim() || null,
      });
      if (!waiting) {
        this.toast.show(this.deliveries.error() ?? 'Could not record what is owed.', 'error');
      }
    }

    this.toast.show(existing ? `${saved.description} changed.` : `${saved.description} recorded.`);
    if (!existing) {
      this.reset();
    }
    this.saved.emit();
    if (!another || existing) {
      this.done.emit();
    }
  }

  private reset(): void {
    this.description.set('');
    this.amount.set('');
    this.quantity.set('');
    this.unitRate.set('');
    this.notes.set('');
    this.itemId.set('');
    this.lastPrice.set(null);
    this.suggestedScopeId.set(null);
    this.owed.set(false);
    this.owedWhat.set('');
    this.owedWhen.set('');
    this.chosen.set(null);
  }
}
