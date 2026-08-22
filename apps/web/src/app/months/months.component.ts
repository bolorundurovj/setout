import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { ExpenseRead, ProjectRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { formatMoney } from '../budget/money';
import { ExpenseService, type Nested } from '../expenses/expense.service';
import { PaginationComponent } from '../ui/pagination.component';

/** How many scope tints are declared in the stylesheet before they repeat. */
const TINTS = 5;

/** One scope's share of a month, sized as a percentage of that month's bar. */
export interface MonthPart {
  scopeId: string | null;
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

  /**
   * A tint per top level scope, handed out in budget order so a scope keeps the
   * same colour in every bar however the months are read.
   */
  private readonly tints = computed(() => {
    const tints = new Map<string, string>();
    this.budget
      .scopes()
      .filter((scope) => scope.parent_id === null)
      .forEach((scope, index) => tints.set(scope.id, `tint-${(index % TINTS) + 1}`));
    return tints;
  });

  readonly rows = computed<MonthRow[]>(() => {
    const payload = this.expenses.months();
    if (!payload) {
      return [];
    }
    // The heaviest month fills the column; the rest are drawn against it.
    const heaviest = Math.max(1, ...payload.months.map((month) => month.amount));
    const tints = this.tints();
    return payload.months.map((month) => ({
      month: month.month,
      label: this.label(month.month),
      amount: month.amount,
      count: month.expense_count,
      barWidth: `${(month.amount / heaviest) * 100}%`,
      parts: month.scopes.map((part) => ({
        scopeId: part.scope_id,
        name: part.name,
        amount: part.amount,
        width: month.amount ? `${(part.amount / month.amount) * 100}%` : '0%',
        tint: part.scope_id ? (tints.get(part.scope_id) ?? 'tint-unfiled') : 'tint-unfiled',
      })),
    }));
  });

  readonly total = computed(() => this.expenses.months()?.total_amount ?? 0);

  readonly note = computed(() => {
    const busiest = this.expenses.months()?.busiest_month;
    const row = this.rows().find((month) => month.month === busiest);
    if (!row) {
      return 'Nothing recorded yet. The first expense you add opens the first month.';
    }
    return `${row.label} was the heaviest month, at ${this.money(row.amount)}. Every expense sits in the month it was spent, so the months add up to the project total.`;
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

  /** Figures in the table drop the symbol, which the project bar already shows. */
  bare(minor: number): string {
    const exponent = this.project().currency_exponent;
    return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(minor / 10 ** exponent);
  }

  label(month: string): string {
    const [year, number] = month.split('-');
    return new Date(Number(year), Number(number) - 1, 1).toLocaleDateString(undefined, {
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

  monthExpenses(row: MonthRow): Nested | undefined {
    return this.expenses.byMonth()[row.month];
  }

  async goTo(row: MonthRow, page: number): Promise<void> {
    await this.expenses.loadForMonth(this.project().id, row.month, page);
  }

  scopeName(expense: ExpenseRead): string {
    if (!expense.scope_id) {
      return 'Not filed to a scope';
    }
    return (
      this.budget.scopes().find((scope) => scope.id === expense.scope_id)?.name ??
      'Not filed to a scope'
    );
  }
}
