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
  CategorySuggestion,
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
  readonly expenseToEdit = input<ExpenseRead | null>(null);

  readonly saved = output<void>();
  readonly isEditing = computed(() => this.expenseToEdit() !== null);
  readonly closed = output<void>();

  readonly expenses = inject(ExpenseService);
  readonly items = inject(ItemService);
  readonly vendors = inject(VendorService);
  readonly people = inject(PersonService);
  private readonly budget = inject(BudgetService);
  private readonly agreements = inject(AgreementService);
  private readonly toast = inject(ToastService);
  private readonly deliveries = inject(DeliveryService);
  readonly attachments = inject(AttachmentService);

  readonly categoryId = signal('');
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
  readonly outstandingDelivery = signal(false);
  readonly deliveryDescription = signal('');
  readonly deliveryExpected = signal('');
  readonly addingVendor = signal(false);
  readonly newVendorName = signal('');
  readonly suggestedCategoryId = signal<string | null>(null);
  readonly categoryExplicitlyCleared = signal(false);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');
  readonly selectedFile = signal<File | null>(null);
  readonly lastArchived = signal<AttachmentRead | null>(null);

  readonly symbol = computed(() => currencySymbol(this.project().currency_code));

  readonly categoryChips = computed<Chip[]>(() => [
    { value: '', label: 'Uncategorised' },
    ...this.budget
      .categories()
      .filter((category) => !category.is_group)
      .map((category) => ({ value: category.id, label: category.name })),
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
    { value: '', label: 'No item' },
    ...this.items
      .choices()
      .map((item) => ({ value: item.id, label: item.name, detail: item.unit })),
  ]);

  readonly vendorChips = computed<Chip[]>(() => [
    { value: '', label: 'No vendor' },
    ...this.vendors
      .choices()
      .map((vendor) => ({ value: vendor.id, label: vendor.name, detail: vendor.trade })),
  ]);

  readonly payerChips = computed<Chip[]>(() => [
    { value: '', label: 'Me' },
    ...this.people
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

  readonly calculatedAmount = computed(() => {
    const quantity = this.quantityValue();
    const rate = this.unitRateMinor();
    return quantity === null || rate === null ? null : Math.round(quantity * rate);
  });

  readonly expenseAttachments = computed(() => {
    const expense = this.expenseToEdit();
    return expense ? this.attachments.forExpense(expense.id) : [];
  });

  readonly fileLabel = computed(() => {
    const file = this.selectedFile();
    if (!file) {
      return 'No file selected.';
    }
    return `${file.name} · ${this.attachments.formatSize(file.size)} · stored on your server`;
  });

  constructor() {
    effect(() => {
      const expense = this.expenseToEdit();
      if (expense) {
        this.prefill(expense);
        void this.attachments.load(expense.id);
      }
    });
    effect(() => {
      if (this.isEditing() || this.budget.categories().length === 0) {
        return;
      }
      const itemId = this.itemId();
      const vendorId = this.vendorId();
      if (!itemId && !vendorId) {
        this.suggestedCategoryId.set(null);
        return;
      }
      void this.suggestCategory(itemId, vendorId);
    });
    queueMicrotask(() => {
      void this.budget.load(this.project().id);
      void this.agreements.load(this.project().id);
      void this.items.loadChoices();
      void this.vendors.loadChoices();
      void this.people.loadChoices();
    });
  }

  readonly agreementChips = computed<Chip[]>(() => [
    { value: '', label: 'None' },
    ...this.agreements
      .agreements()
      .map((a) => ({ value: a.id, label: `${a.vendor_name}: ${a.description}` })),
  ]);

  readonly agreementNote = computed(() => {
    const agreement = this.agreements.agreements().find((a) => a.id === this.agreementId());
    if (!agreement) {
      return '';
    }
    const project = this.project();
    const balance = formatMoney(
      agreement.balance_amount,
      project.currency_code,
      project.currency_exponent,
    );
    return agreement.balance_amount === 0
      ? 'This agreement is fully paid.'
      : `Balance: ${balance}.`;
  });

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  categoryNote(): string {
    const category = this.budget.categories().find((s) => s.id === this.categoryId());
    if (!category) {
      return 'Saved as Uncategorised. You can assign a category later.';
    }
    if (this.categoryId() === this.suggestedCategoryId()) {
      return `Suggested from past expenses. Counts against the budget for ${category.name}.`;
    }
    return `Counts against the budget for ${category.name}.`;
  }

  dateNote(): string {
    return this.spentOn() === isoDay()
      ? 'Today. Change the date when entering older receipts.'
      : `Dated ${this.spentOn()}. The expense is counted in that month.`;
  }

  costTypeNote(): string {
    return this.costType()
      ? 'Splits the project total by cost type on the dashboard. Select again to clear.'
      : 'Optional. The expense is included in all totals either way.';
  }

  calculationNote(): string {
    const calculated = this.calculatedAmount();
    if (calculated === null) {
      return 'Enter a quantity and unit rate and the total is calculated.';
    }
    return `${this.quantity()} × ${this.money(this.unitRateMinor() ?? 0)} = ${this.money(calculated)}`;
  }

  priceIncreaseWarning(): string {
    const last = this.lastPrice();
    const rate = this.unitRateMinor();
    if (last === null || rate === null || last.unit_rate === 0 || rate <= last.unit_rate) {
      return '';
    }
    const above = Math.round(((rate - last.unit_rate) / last.unit_rate) * 100);
    return `${this.money(rate)} is ${above}% above the last price paid (${this.money(last.unit_rate)}).`;
  }

  payerNote(): string {
    const person = this.people.choices().find((p) => p.id === this.paidById());
    return person ? `Deducted from the balance of ${person.name}.` : 'Paid by you.';
  }

  lastPriceWhere(): string {
    const last = this.lastPrice();
    if (last === null) {
      return '';
    }
    const source = last.vendor_name ? `from ${last.vendor_name}` : 'vendor not recorded';
    return `${source} on ${last.spent_on}`;
  }

  amountMinor(): number | null {
    const calculated = this.calculatedAmount();
    return calculated !== null
      ? calculated
      : parseMoney(this.amount(), this.project().currency_exponent);
  }

  canSave(): boolean {
    const amount = this.amountMinor();
    return this.description().trim().length > 0 && amount !== null && amount >= 0;
  }

  saveHint(): string {
    return this.canSave()
      ? `Saves to ${this.project().name}`
      : 'Description and amount are required.';
  }

  async pickItem(itemId: string): Promise<void> {
    this.itemId.set(itemId);
    this.lastPrice.set(null);
    if (!itemId) {
      return;
    }
    const last = await this.items.lastPrice(this.project().id, itemId);
    this.lastPrice.set(last);
    if (last && !this.unitRate().trim()) {
      const exponent = this.project().currency_exponent;
      this.unitRate.set((last.unit_rate / 10 ** exponent).toFixed(exponent));
    }
  }

  pickCategory(categoryId: string): void {
    this.categoryId.set(categoryId);
    this.suggestedCategoryId.set(null);
    this.categoryExplicitlyCleared.set(categoryId === '');
  }

  private async suggestCategory(itemId: string, vendorId: string): Promise<void> {
    const suggestion: CategorySuggestion | null = await this.expenses.suggestCategory(
      this.project().id,
      itemId || undefined,
      vendorId || undefined,
    );
    if (suggestion?.category_id && !this.categoryId()) {
      this.categoryId.set(suggestion.category_id);
      this.suggestedCategoryId.set(suggestion.category_id);
      this.categoryExplicitlyCleared.set(false);
    }
  }

  async addItem(): Promise<void> {
    const name = this.newItemName().trim();
    if (!name) {
      return;
    }
    const created = await this.items.add({
      name,
      unit: this.newItemUnit().trim() || null,
    });
    if (created) {
      this.newItemName.set('');
      this.newItemUnit.set('');
      this.addingItem.set(false);
      await this.pickItem(created.id);
    } else {
      this.toast.show(this.items.error() ?? 'Could not add the item.', 'error');
    }
  }

  async addVendor(): Promise<void> {
    const name = this.newVendorName().trim();
    if (!name) {
      return;
    }
    const created = await this.vendors.add({ name });
    if (created) {
      this.vendorId.set(created.id);
      this.newVendorName.set('');
      this.addingVendor.set(false);
    } else {
      this.toast.show(this.vendors.error() ?? 'Could not add the vendor.', 'error');
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
    this.categoryId.set(expense.category_id ?? '');
    this.categoryExplicitlyCleared.set(expense.category_id === null);
    this.itemId.set(expense.item_id ?? '');
    this.agreementId.set(expense.agreement_id ?? '');
    this.vendorId.set(expense.vendor_id ?? '');
    this.paidById.set(expense.paid_by_id ?? '');
    this.quantity.set(expense.quantity === null ? '' : String(Number(expense.quantity)));
    this.unitRate.set(major(expense.unit_rate));
    this.costType.set(expense.cost_type ?? '');
    this.notes.set(expense.notes ?? '');
  }

  toggleOutstandingDelivery(): void {
    this.outstandingDelivery.update((on) => !on);
  }

  fileUrl(file: AttachmentRead): string {
    return this.attachments.fileUrl(file.id);
  }

  isImage(file: AttachmentRead): boolean {
    return file.content_type.startsWith('image/');
  }

  fileNote(file: AttachmentRead): string {
    return `${this.attachments.formatSize(file.byte_size)} · stored on your server`;
  }

  openFilePicker(): void {
    this.fileInput().nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      return;
    }
    input.value = '';
    const existing = this.expenseToEdit();
    if (!existing) {
      this.selectedFile.set(file);
      return;
    }
    const added = await this.attachments.add(this.project().id, existing.id, file);
    if (!added) {
      this.toast.show(this.attachments.error() ?? 'Could not attach that file.', 'error');
      return;
    }
    this.toast.show(`${added.filename} attached.`);
  }

  async archiveAttachment(file: AttachmentRead): Promise<void> {
    const existing = this.expenseToEdit();
    if (!existing) {
      return;
    }
    await this.attachments.archive(existing.id, file.id);
    this.lastArchived.set(file);
    this.toast.show('Attachment archived. The expense is unchanged.');
  }

  async restoreLastArchived(): Promise<void> {
    const existing = this.expenseToEdit();
    const archived = this.lastArchived();
    if (!existing || !archived) {
      return;
    }
    const restored = await this.attachments.restore(existing.id, archived.id);
    this.lastArchived.set(null);
    this.toast.show(
      restored
        ? `${restored.filename} restored.`
        : (this.attachments.error() ?? 'Could not restore the attachment.'),
      restored ? 'success' : 'error',
    );
  }

  async save(another: boolean): Promise<void> {
    const amount = this.amountMinor();
    // Ignores repeat submits, such as a double tap, while a save is in progress.
    if (this.expenses.saving() || !this.canSave() || amount === null) {
      return;
    }
    const calculated = this.calculatedAmount();
    const body = {
      description: this.description().trim(),
      amount: calculated === null ? amount : null,
      spent_on: this.spentOn() || null,
      category_id: this.categoryId() || null,
      item_id: this.itemId() || null,
      vendor_id: this.vendorId() || null,
      agreement_id: this.agreementId() || null,
      paid_by_id: this.paidById() || null,
      quantity: this.quantityValue(),
      unit_rate: this.unitRateMinor(),
      cost_type: (this.costType() as CostType) || null,
      notes: this.notes().trim() || null,
    };

    const existing = this.expenseToEdit();
    const saved = existing
      ? await this.expenses.update(this.project().id, existing.id, body)
      : await this.expenses.add(this.project().id, {
          ...body,
          auto_categorize: !this.categoryExplicitlyCleared(),
        });

    if (!saved) {
      this.toast.show(this.expenses.error() ?? 'Could not save that expense.', 'error');
      return;
    }

    const file = this.selectedFile();
    if (!existing && file) {
      const added = await this.attachments.add(this.project().id, saved.id, file);
      if (!added) {
        this.toast.show(this.attachments.error() ?? 'Could not attach that file.', 'error');
      }
    }

    if (!existing && this.outstandingDelivery()) {
      const delivery = await this.deliveries.add(this.project().id, {
        expense_id: saved.id,
        description: this.deliveryDescription().trim() || null,
        expected: this.deliveryExpected().trim() || null,
      });
      if (!delivery) {
        this.toast.show(this.deliveries.error() ?? 'Could not save the delivery.', 'error');
      }
    }

    this.toast.show(existing ? `${saved.description} updated.` : `${saved.description} recorded.`);
    if (!existing) {
      this.reset();
    }
    this.saved.emit();
    if (!another || existing) {
      this.closed.emit();
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
    this.suggestedCategoryId.set(null);
    this.categoryExplicitlyCleared.set(false);
    this.outstandingDelivery.set(false);
    this.deliveryDescription.set('');
    this.deliveryExpected.set('');
    this.selectedFile.set(null);
  }
}
