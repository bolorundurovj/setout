import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import type { ExpenseRead, ProjectRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { formatMoney, formatNumber } from '../budget/money';
import { ExpenseService, UNFILED, type Nested } from '../expenses/expense.service';
import { currencySymbol } from '../ui/currency-pill.component';
import { PaginationComponent } from '../ui/pagination.component';
import { tintFor } from '../ui/tints';

/** A category line, or the standing line for spend that reached no category. */
export interface CompareRow {
  id: string;
  name: string;
  budgeted: number;
  spent: number;
  count: number;
  isUncategorized: boolean;
}

@Component({
  selector: 'app-budget-compare',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PaginationComponent],
  templateUrl: './budget-compare.component.html',
  styleUrl: './budget-compare.component.scss',
})
export class BudgetCompareComponent {
  readonly project = input.required<ProjectRead>();
  readonly openCategory = input('');

  readonly budget = inject(BudgetService);
  readonly expenses = inject(ExpenseService);

  readonly expanded = signal<string | null>(null);

  readonly symbol = computed(() => currencySymbol(this.project().currency_code));

  readonly rows = computed<CompareRow[]>(() => {
    const rows: CompareRow[] = this.budget.categories().map((category) => ({
      id: category.id,
      name: category.name,
      budgeted: category.budgeted_amount,
      spent: category.spent_amount,
      count: category.expense_count,
      isUncategorized: false,
    }));

    const uncategorized = this.expenses.spend()?.uncategorized_amount ?? 0;
    if (uncategorized > 0) {
      rows.push({
        id: UNFILED,
        name: 'Uncategorized',
        budgeted: 0,
        spent: uncategorized,
        count: this.expenses.spend()?.uncategorized_count ?? 0,
        isUncategorized: true,
      });
    }
    return rows;
  });

  readonly budgetedTotal = computed(() => this.expenses.spend()?.budgeted_amount ?? 0);
  readonly spentTotal = computed(() => this.expenses.spend()?.spent_amount ?? 0);

  readonly totalOver = computed(
    () => this.budgetedTotal() > 0 && this.spentTotal() > this.budgetedTotal(),
  );
  readonly totalLeft = computed(() => this.budgetedTotal() - this.spentTotal());

  readonly totalUsed = computed(() =>
    this.budgetedTotal() ? `${Math.round((this.spentTotal() / this.budgetedTotal()) * 100)}%` : '—',
  );

  readonly countLabel = computed(() => {
    const count = this.expenses.total();
    return `${count} ${count === 1 ? 'expense' : 'expenses'}`;
  });

  readonly removedNote = computed(() => {
    const removed = this.expenses.spend()?.removed_count ?? 0;
    if (!removed) {
      return '';
    }
    const rows = removed === 1 ? 'expense' : 'expenses';
    return `${removed} ${rows} removed from this project and not counted.`;
  });

  constructor() {
    queueMicrotask(() => {
      void this.budget.load(this.project().id);
      void this.expenses.load(this.project().id);
    });
    effect(() => {
      const asked = this.openCategory();
      if (asked) {
        this.expand(asked);
      }
    });
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  bare(minor: number): string {
    const exponent = this.project().currency_exponent;
    return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(minor / 10 ** exponent);
  }

  toggle(row: CompareRow): void {
    if (this.expanded() === row.id) {
      this.expanded.set(null);
      return;
    }
    this.expand(row.id);
  }

  private expand(categoryId: string): void {
    this.expanded.set(categoryId);
    if (!this.expenses.byCategory()[categoryId]) {
      void this.expenses.loadForCategory(this.project().id, categoryId);
    }
  }

  isOpen(row: CompareRow): boolean {
    return this.expanded() === row.id;
  }

  tint(row: CompareRow): string {
    return row.isUncategorized ? 'var(--warn-surface)' : tintFor(row.id).fill;
  }

  tintEdge(row: CompareRow): string {
    return row.isUncategorized ? 'var(--warn-edge)' : tintFor(row.id).ink;
  }

  rowExpenses(row: CompareRow): Nested | undefined {
    return this.expenses.byCategory()[row.id];
  }

  async goTo(row: CompareRow, page: number): Promise<void> {
    await this.expenses.loadForCategory(this.project().id, row.id, page);
  }

  over(row: CompareRow): boolean {
    return row.budgeted > 0 && row.spent > row.budgeted;
  }

  left(row: CompareRow): string {
    return row.budgeted ? this.bare(row.budgeted - row.spent) : '—';
  }

  used(row: CompareRow): string {
    return row.budgeted ? `${Math.round((row.spent / row.budgeted) * 100)}%` : '—';
  }

  budgetCell(row: CompareRow): string {
    return row.budgeted ? this.bare(row.budgeted) : '—';
  }

  rowCount(row: CompareRow): string {
    if (!row.count) {
      return 'no expenses';
    }
    return `${row.count} ${row.count === 1 ? 'expense' : 'expenses'}`;
  }

  meta(expense: ExpenseRead): string {
    const parts: string[] = [];
    if (expense.cost_type) {
      parts.push(expense.cost_type);
    }
    if (expense.quantity !== null && expense.unit_rate !== null) {
      parts.push(`${formatNumber(expense.quantity)} × ${this.money(expense.unit_rate)}`);
    }
    return parts.join(' · ');
  }

  when(expense: ExpenseRead): string {
    return new Date(expense.spent_on).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}
