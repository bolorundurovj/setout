import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { BudgetItemRead, CostType, ProjectRead, CategoryRead } from '@setout/api-client';
import { ChangeHistoryComponent } from '../changes/change-history.component';
import { ButtonComponent } from '../ui/button.component';
import { DrawerComponent } from '../ui/drawer.component';
import { MoneyHintComponent } from '../ui/money-hint.component';
import { Chip, ChipGroupComponent } from '../ui/chip-group.component';
import { ComboboxComponent } from '../ui/combobox.component';
import { ToastService } from '../toast.service';
import { ToggleComponent } from '../ui/toggle.component';
import { currencySymbol } from '../ui/currency-pill.component';
import { formatStampDay } from '../shared/dates';
import { BudgetService } from './budget.service';
import { formatAmountInput, formatMoney, parseMoney } from './money';
import { DeleteConfirmDirective, isDeleteConfirmed } from '../ui/delete-confirm.directive';

@Component({
  selector: 'app-budget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DeleteConfirmDirective,
    FormsModule,
    ButtonComponent,
    ChangeHistoryComponent,
    ChipGroupComponent,
    ComboboxComponent,
    DrawerComponent,
    MoneyHintComponent,
    ToggleComponent,
  ],
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
  readonly changesFor = signal<BudgetItemRead | null>(null);
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
    this.syncDrafts();
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.includeArchived.set(on);
    const categoryId = this.openCategory();
    if (categoryId) await this.budget.loadItems(categoryId, on);
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
      this.includeArchived(),
    );
    this.itemDescription.set('');
    this.itemAmount.set('');
    this.itemCostType.set('');
    this.syncDrafts();
    this.toast.show('Budget item added.');
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  showChanges(item: BudgetItemRead): void {
    this.changesFor.set(item);
  }

  itemsFor(categoryId: string): BudgetItemRead[] {
    return this.budget.items()[categoryId] ?? [];
  }

  draftFor(categoryId: string): string {
    return this.drafts()[categoryId] ?? '';
  }

  setDate(categoryId: string): string {
    const summary = this.budget.budget()?.item_summaries?.[categoryId];
    return summary ? this.formatDate(summary.set_at) : '?';
  }

  lastChangedDate(categoryId: string): string {
    const summary = this.budget.budget()?.item_summaries?.[categoryId];
    if (!summary) return '?';
    return summary.changed_at ? this.formatDate(summary.changed_at) : 'Not changed';
  }

  private formatDate(value: string): string {
    return formatStampDay(value);
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
    if (category.is_group) return;
    this.openCategory.set(category.id);
    this.itemDescription.set('');
    this.itemAmount.set('');
    this.itemCostType.set('');
    await this.budget.loadItems(category.id, this.includeArchived());
  }

  /** A category with more than one item can only be changed through its items. */
  private readonly pendingCommits = new Set<string>();

  async commit(category: CategoryRead): Promise<void> {
    const typed = this.draftFor(category.id).trim();
    const summary = this.budget.budget()?.item_summaries?.[category.id];
    if (this.pendingCommits.has(category.id) || typed === '') {
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
    if (summary && summary.item_count > 1) {
      this.toast.show('This category has several budget items. Open it to edit them.', 'info');
      this.syncDrafts();
      return;
    }

    this.pendingCommits.add(category.id);
    try {
      const archived = this.openCategory() === category.id ? this.includeArchived() : null;
      if (summary) {
        await this.budget.updateItem(
          this.project().id,
          category.id,
          summary.first_item_id,
          budgeted,
          archived,
        );
      } else {
        await this.budget.addItem(
          this.project().id,
          category.id,
          category.name,
          budgeted,
          null,
          archived,
        );
      }
      this.syncDrafts();
      this.toast.show(`${category.name} budgeted at ${this.money(budgeted)}.`);
    } finally {
      this.pendingCommits.delete(category.id);
    }
  }

  async addCategory(): Promise<void> {
    const name = this.newCategoryName().trim();
    if (!name) {
      return;
    }
    await this.budget.addCategory(this.project().id, { name });
    this.newCategoryName.set('');
    this.syncDrafts();
    this.toast.show(`${name} added.`);
  }

  async archiveItem(category: CategoryRead, itemId: string): Promise<void> {
    await this.budget.archiveItem(this.project().id, category.id, itemId, this.includeArchived());
    this.syncDrafts();
    this.toast.show('Budget item archived. Show archived to restore it.');
  }

  async restoreItem(category: CategoryRead, itemId: string): Promise<void> {
    const restored = await this.budget.restoreItem(this.project().id, category.id, itemId);
    this.syncDrafts();
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
    return isDeleteConfirmed(this.deleteConfirmationText());
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
    this.syncDrafts();
    this.toast.show(
      done
        ? 'Budget item deleted permanently.'
        : (this.budget.error() ?? 'Could not delete that budget item.'),
      done ? 'success' : 'error',
    );
  }
}
