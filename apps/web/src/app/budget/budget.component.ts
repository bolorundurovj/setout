import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { BudgetItemRead, CostType, ProjectRead, ScopeRead } from '@setout/api-client';
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

  readonly openScope = signal<string | null>(null);
  readonly newScopeName = signal('');
  private readonly drafts = signal<Record<string, string>>({});
  readonly itemDescription = signal('');
  readonly itemAmount = signal('');
  readonly itemCostType = signal('');

  readonly symbol = computed(() => currencySymbol(this.project().currency_code));
  readonly plannedTotal = computed(() => this.money(this.budget.plannedTotal()));

  readonly availablePresets = computed(() => {
    const used = new Set(this.budget.scopes().map((scope) => scope.name.toLowerCase()));
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
    for (const scope of this.budget.scopes()) {
      await this.budget.loadItems(scope.id);
    }
    this.syncDrafts();
  }

  private syncDrafts(): void {
    const exponent = this.project().currency_exponent;
    const next: Record<string, string> = {};
    for (const scope of this.budget.scopes()) {
      const amount = scope.own_planned_amount;
      next[scope.id] = amount ? (amount / 10 ** exponent).toFixed(exponent) : '';
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
    const planned = parseMoney(this.itemAmount(), this.project().currency_exponent);
    return this.itemDescription().trim().length > 0 && planned !== null && planned >= 0;
  }

  /** Several items can sit under one scope, which is what the row total sums. */
  async addLineItem(scope: ScopeRead): Promise<void> {
    const planned = parseMoney(this.itemAmount(), this.project().currency_exponent);
    if (!this.canAddItem() || planned === null) {
      return;
    }
    await this.budget.addItem(
      this.project().id,
      scope.id,
      this.itemDescription().trim(),
      planned,
      (this.itemCostType() as CostType) || null,
    );
    this.itemDescription.set('');
    this.itemAmount.set('');
    this.itemCostType.set('');
    await this.load();
    this.toast.show('Planned item added.');
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  itemsFor(scopeId: string): BudgetItemRead[] {
    return this.budget.items()[scopeId] ?? [];
  }

  draftFor(scopeId: string): string {
    return this.drafts()[scopeId] ?? '';
  }

  /** The day the number was last set on purpose. */
  setOn(scopeId: string): string {
    const items = this.itemsFor(scopeId);
    return items.length ? this.day(items[0].set_at) : '—';
  }

  changed(scopeId: string): string {
    const items = this.itemsFor(scopeId);
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

  onAmountInput(scopeId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.drafts.update((all) => ({ ...all, [scopeId]: value }));
  }

  async toggleScope(scope: ScopeRead): Promise<void> {
    if (this.openScope() === scope.id) {
      this.openScope.set(null);
      return;
    }
    this.openScope.set(scope.id);
    this.itemDescription.set('');
    this.itemAmount.set('');
    this.itemCostType.set('');
    await this.budget.loadItems(scope.id);
  }

  /** One row, one number. Extra detail lives in the items under the row. */
  async commit(scope: ScopeRead): Promise<void> {
    const typed = this.draftFor(scope.id).trim();
    const items = this.itemsFor(scope.id);
    if (typed === '') {
      return;
    }
    const planned = parseMoney(typed, this.project().currency_exponent);
    if (planned === null) {
      this.toast.show('That is not an amount.', 'error');
      this.syncDrafts();
      return;
    }
    if (planned === scope.own_planned_amount) {
      return;
    }
    if (items.length > 1) {
      this.toast.show('This scope has several planned items. Open it to change them.', 'info');
      this.syncDrafts();
      return;
    }

    if (items.length === 1) {
      await this.budget.updateItem(this.project().id, scope.id, items[0].id, planned);
    } else {
      await this.budget.addItem(this.project().id, scope.id, scope.name, planned);
    }
    await this.load();
    this.toast.show(`${scope.name} planned at ${this.money(planned)}.`);
  }

  async addScope(): Promise<void> {
    const name = this.newScopeName().trim();
    if (!name) {
      return;
    }
    await this.budget.addScope(this.project().id, { name });
    this.newScopeName.set('');
    await this.load();
    this.toast.show(`${name} added.`);
  }

  async removeItem(scope: ScopeRead, itemId: string): Promise<void> {
    await this.budget.removeItem(this.project().id, scope.id, itemId);
    await this.load();
    this.toast.show('Planned item removed.');
  }
}
