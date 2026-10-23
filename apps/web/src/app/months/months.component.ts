import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { ExpenseRead, ProjectRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { formatAmount, formatMoney } from '../budget/money';
import { ExpenseService, type ExpensePage } from '../expenses/expense.service';
import { PaginationComponent } from '../ui/pagination.component';

/** Number of category tints in the stylesheet before they repeat. */
const TINTS = 5;

/** A category's share of a month, as a percentage of that month's bar. */
export interface MonthPart {
  categoryId: string | null;
  name: string;
  amount: number;
  width: string;
  tint: string;
}

export interface MonthRow {
  month: string;
  label: string;
  amount: number;
  count: number;
  barWidth: string;
  parts: MonthPart[];
}

@Component({
  selector: 'app-months',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PaginationComponent],
  templateUrl: './months.component.html',
  styleUrl: './months.component.scss',
})
export class MonthsComponent {
  readonly project = input.required<ProjectRead>();

  readonly expenses = inject(ExpenseService);
  private readonly budget = inject(BudgetService);

  readonly openMonth = signal<string | null>(null);

  /** Assigns tints to top-level categories in budget order so each keeps one colour in every bar. */
  private readonly tints = computed(() => {
    const tints = new Map<string, string>();
    this.budget
      .categories()
      .filter((category) => category.parent_id === null)
      .forEach((category, index) => tints.set(category.id, `tint-${(index % TINTS) + 1}`));
    return tints;
  });

  readonly rows = computed<MonthRow[]>(() => {
    const payload = this.expenses.months();
    if (!payload) {
      return [];
    }
    // The highest month spans the full column; other months are scaled to it.
    const maxAmount = Math.max(1, ...payload.months.map((month) => month.amount));
    const tints = this.tints();
    return payload.months.map((month) => ({
      month: month.month,
      label: this.label(month.month),
      amount: month.amount,
      count: month.expense_count,
      barWidth: `${(month.amount / maxAmount) * 100}%`,
      parts: month.categories.map((part) => ({
        categoryId: part.category_id,
        name: part.name,
        amount: part.amount,
        width: month.amount ? `${(part.amount / month.amount) * 100}%` : '0%',
        tint: part.category_id
          ? (tints.get(part.category_id) ?? 'tint-uncategorised')
          : 'tint-uncategorised',
      })),
    }));
  });

  readonly total = computed(() => this.expenses.months()?.total_amount ?? 0);

  readonly note = computed(() => {
    const highestMonth = this.expenses.months()?.highest_month;
    const row = this.rows().find((month) => month.month === highestMonth);
    if (!row) {
      return 'No expenses yet. Months appear as expenses are added.';
    }
    return `Highest month: ${row.label} at ${this.money(row.amount)}. Each expense is counted in the month it was spent, so the months add up to the project total.`;
  });

  constructor() {
    queueMicrotask(() => {
      void this.expenses.loadMonths(this.project().id);
      void this.budget.load(this.project().id);
    });
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  /** Table figures omit the currency symbol, which the project bar already shows. */
  plainAmount(minor: number): string {
    return formatAmount(minor, this.project().currency_exponent);
  }

  label(month: string): string {
    const [year, monthNumber] = month.split('-');
    return new Date(Number(year), Number(monthNumber) - 1, 1).toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
    });
  }

  countLabel(row: MonthRow): string {
    return `${row.count} ${row.count === 1 ? 'expense' : 'expenses'}`;
  }

  toggle(row: MonthRow): void {
    if (this.openMonth() === row.month) {
      this.openMonth.set(null);
      return;
    }
    this.openMonth.set(row.month);
    if (!this.expenses.byMonth()[row.month]) {
      void this.expenses.loadForMonth(this.project().id, row.month);
    }
  }

  isOpen(row: MonthRow): boolean {
    return this.openMonth() === row.month;
  }

  monthExpenses(row: MonthRow): ExpensePage | undefined {
    return this.expenses.byMonth()[row.month];
  }

  async goToPage(row: MonthRow, page: number): Promise<void> {
    await this.expenses.loadForMonth(this.project().id, row.month, page);
  }

  categoryName(expense: ExpenseRead): string {
    if (!expense.category_id) {
      return 'Uncategorised';
    }
    return (
      this.budget.categories().find((category) => category.id === expense.category_id)?.name ??
      'Uncategorised'
    );
  }
}
