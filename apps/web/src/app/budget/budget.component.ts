import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { BudgetItemRead, CostType, ProjectRead, CategoryRead } from '@setout/api-client';
import { ButtonComponent } from '../ui/button.component';
import { Chip, ChipGroupComponent } from '../ui/chip-group.component';
import { ComboboxComponent } from '../ui/combobox.component';
import { ToastService } from '../toast.service';
import { currencySymbol } from '../ui/currency-pill.component';
import { BudgetService } from './budget.service';
import { formatMoney, parseMoney } from './money';

@Component({
  selector: 'app-budget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ButtonComponent, ChipGroupComponent, ComboboxComponent],
  templateUrl: './budget.component.html',
  styleUrl: './budget.component.scss',
})
export class BudgetComponent {
  readonly project = input.required<ProjectRead>();

  readonly budget = inject(BudgetService);
  private readonly toast = inject(ToastService);

  readonly openCategory = signal<string | null>(null);
  readonly newCategoryName = signal('');
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
      await this.budget.loadItems(category.id);
    }
    this.syncDrafts();
  }

  private syncDrafts(): void {
    const exponent = this.project().currency_exponent;
    const next: Record<string, string> = {};
    for (const category of this.budget.categories()) {
      const amount = category.own_budgeted_amount;
      next[category.id] = amount ? (amount / 10 ** exponent).toFixed(exponent) : '';
    }
    this.drafts.set(next);
  }

  readonly costTypes: Chip[] = [
    { value: '', label: 'Not split' },
    { value: 'labour', label: 'Labour' },
    { value: 'material', label: 'Material' },
    { value: 'fixed', label: 'Fixed' },
  ];

  splitOf(item: BudgetItemRead): string {
    return item.cost_type ?? '';
  }

  asValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  canAddItem(): boolean {
    const budgeted = parseMoney(this.itemAmount(), this.project().currency_exponent);
    return this.itemDescription().trim().length > 0 && budgeted !== null && budgeted >= 0;
  }

  /** Several items can sit under one category, which is what the row total sums. */
  async addLineItem(category: CategoryRead): Promise<void> {
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

  draftFor(categoryId: string): string {
    return this.drafts()[categoryId] ?? '';
  }

  /** The day the number was last set on purpose. */
  setOn(categoryId: string): string {
    const items = this.itemsFor(categoryId);
    return items.length ? this.day(items[0].set_at) : '—';
  }

  changed(categoryId: string): string {
    const items = this.itemsFor(categoryId);
    if (!items.length) {
      return '—';
    }
    const latest = items.reduce((a, b) => (a.updated_at > b.updated_at ? a : b));
    return latest.updated_at === latest.created_at ? 'never' : this.day(latest.updated_at);
  }

  private day(value: string): string {
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
    await this.budget.loadItems(category.id);
  }

  /** One row, one number. Extra detail lives in the items under the row. */
  async commit(category: CategoryRead): Promise<void> {
    const typed = this.draftFor(category.id).trim();
    const items = this.itemsFor(category.id);
    if (typed === '') {
      return;
    }
    const budgeted = parseMoney(typed, this.project().currency_exponent);
    if (budgeted === null) {
      this.toast.show('That is not an amount.', 'error');
      this.syncDrafts();
      return;
    }
    if (budgeted === category.own_budgeted_amount) {
      return;
    }
    if (items.length > 1) {
      this.toast.show('This category has several budget items. Open it to change them.', 'info');
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

  async removeItem(category: CategoryRead, itemId: string): Promise<void> {
    await this.budget.removeItem(this.project().id, category.id, itemId);
    await this.load();
    this.toast.show('Budget item removed.');
  }
}
