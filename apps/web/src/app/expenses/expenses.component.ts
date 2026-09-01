import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ExpenseRead, ProjectRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { formatMoney } from '../budget/money';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { DrawerComponent } from '../ui/drawer.component';
import { PaginationComponent } from '../ui/pagination.component';
import { AddExpenseComponent } from './add-expense.component';
import { ExpenseService, UNFILED } from './expense.service';

@Component({
  selector: 'app-expenses',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddExpenseComponent,
    ButtonComponent,
    DrawerComponent,
    FormsModule,
    PaginationComponent,
  ],
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.scss',
})
export class ExpensesComponent {
  readonly project = input.required<ProjectRead>();

  readonly expenses = inject(ExpenseService);
  private readonly budget = inject(BudgetService);
  private readonly toast = inject(ToastService);

  readonly adding = signal(false);
  readonly editingExpense = signal<ExpenseRead | null>(null);
  readonly filing = signal(false);
  readonly selected = signal<Set<string>>(new Set());
  readonly bulkScopeId = signal<string>('');

  readonly unfiled = computed(() => this.expenses.byScope()[UNFILED]?.rows ?? []);
  readonly unfiledTotal = computed(() => this.expenses.byScope()[UNFILED]?.total ?? 0);
  readonly unfiledPage = computed(() => this.expenses.byScope()[UNFILED]?.page ?? 1);
  readonly allSelected = computed(
    () => this.unfiled().length > 0 && this.unfiled().every((e) => this.selected().has(e.id)),
  );
  readonly selectedCount = computed(() => this.selected().size);
  readonly canFile = computed(() => this.selectedCount() > 0 && this.bulkScopeId() !== '');
  readonly fileableScopes = computed(() => this.budget.scopes().filter((s) => !s.is_group));

  readonly notSet = '—';

  constructor() {
    queueMicrotask(() => {
      void this.expenses.load(this.project().id);
      void this.budget.load(this.project().id);
    });
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  variance(percent: number): string {
    const rounded = Math.abs(percent).toFixed(1);
    if (percent > 0) {
      return `${rounded}% over`;
    }
    return percent < 0 ? `${rounded}% under` : 'on plan';
  }

  scopeName(expense: ExpenseRead): string {
    if (!expense.scope_id) {
      return 'Unfiled';
    }
    return this.budget.scopes().find((s) => s.id === expense.scope_id)?.name ?? 'Unfiled';
  }

  meta(expense: ExpenseRead): string {
    const parts: string[] = [];
    if (expense.cost_type) {
      parts.push(expense.cost_type);
    }
    if (expense.quantity !== null && expense.unit_rate !== null) {
      parts.push(`${Number(expense.quantity)} × ${this.money(expense.unit_rate)}`);
    }
    return parts.join(' · ');
  }

  photoTitle(expense: ExpenseRead): string {
    const count = expense.attachment_count;
    return count === 1 ? 'One file kept beside this' : `${count} files kept beside this`;
  }

  openDrawer(): void {
    this.editingExpense.set(null);
    this.adding.set(true);
  }

  edit(expense: ExpenseRead): void {
    this.editingExpense.set(expense);
    this.adding.set(true);
  }

  closeDrawer(): void {
    this.adding.set(false);
    this.editingExpense.set(null);
  }

  async onSaved(): Promise<void> {
    await this.expenses.load(this.project().id);
  }

  async goTo(page: number): Promise<void> {
    await this.expenses.goTo(this.project().id, page);
  }

  startFiling(): void {
    this.filing.set(true);
    this.selected.set(new Set());
    this.bulkScopeId.set('');
    void this.expenses.loadForScope(this.project().id, UNFILED);
  }

  stopFiling(): void {
    this.filing.set(false);
    this.selected.set(new Set());
    this.bulkScopeId.set('');
  }

  async goToUnfiled(page: number): Promise<void> {
    await this.expenses.loadForScope(this.project().id, UNFILED, page);
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.selected.set(new Set());
    } else {
      this.selected.set(new Set(this.unfiled().map((e) => e.id)));
    }
  }

  toggleOne(expenseId: string): void {
    const next = new Set(this.selected());
    if (next.has(expenseId)) {
      next.delete(expenseId);
    } else {
      next.add(expenseId);
    }
    this.selected.set(next);
  }

  async fileSelected(): Promise<void> {
    if (!this.canFile()) {
      return;
    }
    const count = await this.expenses.file(this.project().id, {
      expense_ids: Array.from(this.selected()),
      scope_id: this.bulkScopeId(),
    });
    if (count === null) {
      this.toast.show(this.expenses.error() ?? 'Could not file those expenses.', 'error');
      return;
    }
    this.toast.show(`${count} expense${count === 1 ? '' : 's'} filed.`, 'success');
    this.selected.set(new Set());
    this.bulkScopeId.set('');
    await this.expenses.loadForScope(this.project().id, UNFILED, this.unfiledPage());
    if (this.unfiledTotal() === 0) {
      this.stopFiling();
    }
  }

  async remove(expenseId: string): Promise<void> {
    await this.expenses.remove(this.project().id, expenseId);
    this.toast.show('Expense taken off the record. It can be restored.');
  }
}
