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
import { formatMoney } from '../budget/money';
import { ExpenseService, UNFILED, type Nested } from '../expenses/expense.service';
import { currencySymbol } from '../ui/currency-pill.component';
import { PaginationComponent } from '../ui/pagination.component';
import { tintFor } from '../ui/tints';

/** A scope line, or the standing line for spend that reached no scope. */
export interface CompareRow {
  id: string;
  name: string;
  planned: number;
  spent: number;
  count: number;
  isUnfiled: boolean;
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
  readonly openScope = input('');

  readonly budget = inject(BudgetService);
  readonly expenses = inject(ExpenseService);

  readonly expanded = signal<string | null>(null);

  readonly symbol = computed(() => currencySymbol(this.project().currency_code));

  readonly rows = computed<CompareRow[]>(() => {
    const rows: CompareRow[] = this.budget.scopes().map((scope) => ({
      id: scope.id,
      name: scope.name,
      planned: scope.planned_amount,
      spent: scope.spent_amount,
      count: scope.expense_count,
      isUnfiled: false,
    }));

    const unfiled = this.expenses.spend()?.unfiled_amount ?? 0;
    if (unfiled > 0) {
      rows.push({
        id: UNFILED,
        name: 'Not filed to a scope',
        planned: 0,
        spent: unfiled,
        count: this.expenses.spend()?.unfiled_count ?? 0,
        isUnfiled: true,
      });
    }
    return rows;
  });

  readonly plannedTotal = computed(() => this.expenses.spend()?.planned_amount ?? 0);
  readonly spentTotal = computed(() => this.expenses.spend()?.spent_amount ?? 0);

  readonly totalOver = computed(
    () => this.plannedTotal() > 0 && this.spentTotal() > this.plannedTotal(),
  );
  readonly totalLeft = computed(() => this.plannedTotal() - this.spentTotal());

  readonly totalUsed = computed(() =>
    this.plannedTotal() ? `${Math.round((this.spentTotal() / this.plannedTotal()) * 100)}%` : '—',
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
    return `${removed} ${rows} taken off the record in this project, counted nowhere.`;
  });

  constructor() {
    queueMicrotask(() => {
      void this.budget.load(this.project().id);
      void this.expenses.load(this.project().id);
    });
    effect(() => {
      const asked = this.openScope();
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

  private expand(scopeId: string): void {
    this.expanded.set(scopeId);
    if (!this.expenses.byScope()[scopeId]) {
      void this.expenses.loadForScope(this.project().id, scopeId);
    }
  }

  isOpen(row: CompareRow): boolean {
    return this.expanded() === row.id;
  }

  tint(row: CompareRow): string {
    return row.isUnfiled ? 'var(--warn-surface)' : tintFor(row.id).fill;
  }

  tintEdge(row: CompareRow): string {
    return row.isUnfiled ? 'var(--warn-edge)' : tintFor(row.id).ink;
  }

  rowExpenses(row: CompareRow): Nested | undefined {
    return this.expenses.byScope()[row.id];
  }

  async goTo(row: CompareRow, page: number): Promise<void> {
    await this.expenses.loadForScope(this.project().id, row.id, page);
  }

  over(row: CompareRow): boolean {
    return row.planned > 0 && row.spent > row.planned;
  }

  left(row: CompareRow): string {
    return row.planned ? this.bare(row.planned - row.spent) : '—';
  }

  used(row: CompareRow): string {
    return row.planned ? `${Math.round((row.spent / row.planned) * 100)}%` : '—';
  }

  budgetCell(row: CompareRow): string {
    return row.planned ? this.bare(row.planned) : '—';
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
      parts.push(`${Number(expense.quantity)} × ${this.money(expense.unit_rate)}`);
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
