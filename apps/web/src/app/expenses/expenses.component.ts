import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import type { ExpenseRead, ProjectRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { formatMoney } from '../budget/money';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { DrawerComponent } from '../ui/drawer.component';
import { PaginationComponent } from '../ui/pagination.component';
import { AddExpenseComponent } from './add-expense.component';
import { ExpenseService } from './expense.service';

@Component({
  selector: 'app-expenses',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AddExpenseComponent, ButtonComponent, DrawerComponent, PaginationComponent],
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

  async remove(expenseId: string): Promise<void> {
    await this.expenses.remove(this.project().id, expenseId);
    this.toast.show('Expense taken off the record. It can be restored.');
  }
}
