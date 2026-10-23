import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { BudgetItemRead, CostType, ProjectRead, CategoryRead } from '@setout/api-client';
import { ButtonComponent } from '../ui/button.component';
import { Chip, ChipGroupComponent } from '../ui/chip-group.component';
import { ComboboxComponent } from '../ui/combobox.component';
import { ToastService } from '../toast.service';
import { ToggleComponent } from '../ui/toggle.component';
import { currencySymbol } from '../ui/currency-pill.component';
import { BudgetService } from './budget.service';
import { formatAmountInput, formatMoney, parseMoney } from './money';

@Component({
  selector: 'app-budget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonComponent, ChipGroupComponent, ComboboxComponent, ToggleComponent],
  templateUrl: './budget.component.html',
  styleUrl: './budget.component.scss',
})
export class BudgetComponent {
  readonly project = input.required<ProjectRead>();

  readonly budget = inject(BudgetService);
  private readonly toast = inject(ToastService);

  readonly openCategory = signal<string | null>(null);
  readonly newCategoryName = signal('');
  readonly includeArchived = signal(false);
  readonly pendingDelete = signal<string | null>(null);
  readonly deleteConfirmationText = signal('');
  private readonly drafts = signal<Record<string, string>>({});
  readonly itemDescription = signal('');
  readonly itemAmount = signal('');
  readonly itemCostType = signal('');

  readonly symbol = computed(() => currencySymbol(this.project().currency_code));
  readonly budgetedTotal = computed(() => this.money(this.budget.budgetedTotal()));

  readonly availablePresets = computed(() => {
    const used = new Set(this.budget.categories().map((category) => category.name.toLowerCase()));
    return this.budget.presetNames().filter((name) => !used.has(name.toLowerCase()));
  });

  constructor() {
    queueMicrotask(() => {
      void this.load();
      void this.budget.loadPresets();
    });
  }

  private async load(): Promise<void> {
    await this.budget.load(this.project().id);
    for (const category of this.budget.categories()) {
      await this.budget.loadItems(category.id, this.includeArchived());
    }
    this.syncDrafts();
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.includeArchived.set(on);
    await this.load();
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }

  private syncDrafts(): void {
    const exponent = this.project().currency_exponent;
    const next: Record<string, string> = {};
    for (const category of this.budget.categories()) {
      const amount = category.own_budgeted_amount;
      next[category.id] = amount ? formatAmountInput(amount, exponent) : '';
    }
    this.drafts.set(next);
  }

  readonly costTypes: Chip[] = [
    { value: '', label: 'None' },
    { value: 'labour', label: 'Labour' },
    { value: 'material', label: 'Material' },
    { value: 'fixed', label: 'Fixed' },
  ];

  costTypeOf(item: BudgetItemRead): string {
    return item.cost_type ?? '';
  }

  asValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  canAddItem(): boolean {
    const budgeted = parseMoney(this.itemAmount(), this.project().currency_exponent);
    return this.itemDescription().trim().length > 0 && budgeted !== null && budgeted >= 0;
  }

  async addItem(category: CategoryRead): Promise<void> {
    const budgeted = parseMoney(this.itemAmount(), this.project().currency_exponent);
    if (!this.canAddItem() || budgeted === null) {
      return;
    }
    await this.budget.addItem(
      this.project().id,
      category.id,
      this.itemDescription().trim(),
      budgeted,
      (this.itemCostType() as CostType) || null,
    );
    this.itemDescription.set('');
    this.itemAmount.set('');
    this.itemCostType.set('');
    await this.load();
    this.toast.show('Budget item added.');
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  itemsFor(categoryId: string): BudgetItemRead[] {
    return this.budget.items()[categoryId] ?? [];
  }

  /** Archived items are displayed but excluded from totals. */
  private activeItemsFor(categoryId: string): BudgetItemRead[] {
    return this.itemsFor(categoryId).filter((item) => !item.archived_at);
  }

  draftFor(categoryId: string): string {
    return this.drafts()[categoryId] ?? '';
  }

  setDate(categoryId: string): string {
    const items = this.activeItemsFor(categoryId);
    return items.length ? this.formatDate(items[0].set_at) : '—';
  }

  lastChangedDate(categoryId: string): string {
    const items = this.activeItemsFor(categoryId);
    if (!items.length) {
      return '—';
    }
    const latest = items.reduce((a, b) => (a.updated_at > b.updated_at ? a : b));
    return latest.updated_at === latest.created_at
      ? 'Not changed'
      : this.formatDate(latest.updated_at);
  }

  private formatDate(value: string): string {
    return new Date(value).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  onAmountInput(categoryId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.drafts.update((all) => ({ ...all, [categoryId]: value }));
  }

  async toggleCategory(category: CategoryRead): Promise<void> {
    if (this.openCategory() === category.id) {
      this.openCategory.set(null);
      return;
    }
    this.openCategory.set(category.id);
    this.itemDescription.set('');
    this.itemAmount.set('');
    this.itemCostType.set('');
    await this.budget.loadItems(category.id, this.includeArchived());
  }

  /** A category with more than one item can only be changed through its items. */
  async commit(category: CategoryRead): Promise<void> {
    const typed = this.draftFor(category.id).trim();
    const items = this.activeItemsFor(category.id);
    if (typed === '') {
      return;
    }
    const budgeted = parseMoney(typed, this.project().currency_exponent);
    if (budgeted === null) {
      this.toast.show('Enter a valid amount.', 'error');
      this.syncDrafts();
      return;
    }
    if (budgeted === category.own_budgeted_amount) {
      return;
    }
    if (items.length > 1) {
      this.toast.show('This category has several budget items. Open it to edit them.', 'info');
      this.syncDrafts();
      return;
    }

    if (items.length === 1) {
      await this.budget.updateItem(this.project().id, category.id, items[0].id, budgeted);
    } else {
      await this.budget.addItem(this.project().id, category.id, category.name, budgeted);
    }
    await this.load();
    this.toast.show(`${category.name} budgeted at ${this.money(budgeted)}.`);
  }

  async addCategory(): Promise<void> {
    const name = this.newCategoryName().trim();
    if (!name) {
      return;
    }
    await this.budget.addCategory(this.project().id, { name });
    this.newCategoryName.set('');
    await this.load();
    this.toast.show(`${name} added.`);
  }

  async archiveItem(category: CategoryRead, itemId: string): Promise<void> {
    await this.budget.archiveItem(this.project().id, category.id, itemId, this.includeArchived());
    await this.load();
    this.toast.show('Budget item archived. Show archived to restore it.');
  }

  async restoreItem(category: CategoryRead, itemId: string): Promise<void> {
    const restored = await this.budget.restoreItem(this.project().id, category.id, itemId);
    await this.load();
    this.toast.show(
      restored
        ? 'Budget item restored.'
        : (this.budget.error() ?? 'Could not restore that budget item.'),
      restored ? 'success' : 'error',
    );
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

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  async deleteItemPermanently(category: CategoryRead, itemId: string): Promise<void> {
    if (!this.canConfirmDelete()) {
      return;
    }
    const done = await this.budget.deleteItem(
      this.project().id,
      category.id,
      itemId,
      this.includeArchived(),
    );
    this.cancelDelete();
    await this.load();
    this.toast.show(
      done
        ? 'Budget item deleted permanently.'
        : (this.budget.error() ?? 'Could not delete that budget item.'),
      done ? 'success' : 'error',
    );
  }
}
