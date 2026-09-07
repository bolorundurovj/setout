import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { ProjectRead, CategoryRead } from '@setout/api-client';
import { AgreementService } from '../agreements/agreement.service';
import { BudgetService } from '../budget/budget.service';
import { DeliveryService } from '../deliveries/delivery.service';
import { formatMoney, formatNumber } from '../budget/money';
import { ExpenseService } from '../expenses/expense.service';
import { currencySymbol } from '../ui/currency-pill.component';
import { tintFor } from '../ui/tints';

interface Alert {
  key: string;
  title: string;
  detail: string;
  amount: string;
  urgent: boolean;
  tab: string;
}

@Component({
  selector: 'app-project-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-dashboard.component.html',
  styleUrl: './project-dashboard.component.scss',
})
export class ProjectDashboardComponent {
  readonly project = input.required<ProjectRead>();
  readonly openTab = output<string>();
  readonly openCategory = output<string>();

  readonly budget = inject(BudgetService);
  readonly expenses = inject(ExpenseService);
  readonly agreements = inject(AgreementService);
  readonly deliveries = inject(DeliveryService);

  readonly symbol = computed(() => currencySymbol(this.project().currency_code));

  readonly budgeted = computed(() => this.expenses.spend()?.budgeted_amount ?? 0);
  readonly spent = computed(() => this.expenses.spend()?.spent_amount ?? 0);
  readonly uncategorized = computed(() => this.expenses.spend()?.uncategorized_amount ?? 0);

  readonly isOver = computed(() => this.budgeted() > 0 && this.spent() > this.budgeted());
  readonly varianceLabel = computed(() => (this.isOver() ? 'Over by' : 'Remaining'));

  readonly varianceAmount = computed(() => {
    if (!this.budgeted()) {
      return null;
    }
    return Math.abs(this.budgeted() - this.spent());
  });

  readonly varianceNote = computed(() => {
    if (!this.budgeted()) {
      return 'No budget set.';
    }
    const percent = this.expenses.spend()?.variance_percent;
    if (percent === null || percent === undefined) {
      return '';
    }
    const shown = formatNumber(Math.abs(percent), 1);
    return this.isOver() ? `${shown}% over budget.` : `${shown}% under budget.`;
  });

  readonly budgetNote = computed(() =>
    this.budgeted() ? `Across ${this.budget.categories().length} categories.` : 'No budget set.',
  );

  readonly spentNote = computed(() => {
    const count = this.expenses.total();
    const uncategorized = this.uncategorized();
    const filed = `${count} ${count === 1 ? 'expense' : 'expenses'}`;
    return uncategorized ? `${filed}, ${this.bare(uncategorized)} uncategorized.` : `${filed}.`;
  });

  readonly usedLabel = computed(() =>
    this.budgeted() ? `${Math.round((this.spent() / this.budgeted()) * 100)}%` : '—',
  );

  readonly rows = computed(() =>
    this.budget
      .categories()
      .filter((category) => category.budgeted_amount > 0 || category.spent_amount > 0)
      .sort((a, b) => this.overBy(b) - this.overBy(a)),
  );

  constructor() {
    queueMicrotask(() => {
      void this.budget.load(this.project().id);
      void this.expenses.load(this.project().id);
      void this.agreements.load(this.project().id);
      void this.agreements.loadBalances(this.project().id);
      void this.deliveries.loadWaiting(this.project().id);
    });
  }

  readonly alerts = computed<Alert[]>(() => {
    const alerts: Alert[] = [];

    if (this.uncategorized() > 0) {
      alerts.push({
        key: 'uncategorized',
        title: 'Uncategorized expenses',
        detail: 'Uncategorized, so not included in the bars above',
        amount: this.bare(this.uncategorized()),
        urgent: true,
        tab: 'table',
      });
    }

    for (const agreement of this.agreements.agreements()) {
      if (agreement.balance_amount > 0) {
        alerts.push({
          key: `agreement-${agreement.id}`,
          title: 'Remaining on an agreement',
          detail: `${agreement.vendor_name} · ${agreement.description.toLowerCase()}`,
          amount: this.bare(agreement.balance_amount),
          urgent: false,
          tab: 'agreements',
        });
      }
    }

    const owed = this.deliveries.waiting(this.project().id);
    if (owed.total > 0) {
      const first = owed.rows[0];
      alerts.push({
        key: 'deliveries',
        title: 'Paid for, not delivered',
        detail:
          owed.total === 1 && first
            ? `${first.description} · ${first.vendor_name ?? 'vendor not recorded'}`
            : `${owed.total} items owed by vendors`,
        amount: this.bare(owed.owed),
        urgent: false,
        tab: 'deliveries',
      });
    }

    for (const balance of this.agreements.balances()) {
      if (balance.balance_amount < 0) {
        alerts.push({
          key: `owed-${balance.person_id}`,
          title: `Owed to ${balance.person_name}`,
          detail: 'Purchased on your behalf, not yet reimbursed',
          amount: this.bare(-balance.balance_amount),
          urgent: false,
          tab: 'agreements',
        });
      }
    }

    return alerts;
  });

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  bare(minor: number): string {
    const exponent = this.project().currency_exponent;
    return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(minor / 10 ** exponent);
  }

  usedPercent(): number {
    if (!this.budgeted()) {
      return 0;
    }
    return Math.min(100, (this.spent() / this.budgeted()) * 100);
  }

  overPercent(): number {
    if (!this.budgeted() || this.spent() <= this.budgeted()) {
      return 0;
    }
    const over = this.spent() - this.budgeted();
    return Math.min(100 - this.usedPercent(), (over / this.budgeted()) * 100);
  }

  readonly scale = computed(() =>
    Math.max(
      1,
      ...this.rows().map((category) => Math.max(category.budgeted_amount, category.spent_amount)),
    ),
  );

  overBy(category: CategoryRead): number {
    return category.spent_amount - category.budgeted_amount;
  }

  categoryOver(category: CategoryRead): boolean {
    return category.budgeted_amount > 0 && category.spent_amount > category.budgeted_amount;
  }

  tint(category: CategoryRead): string {
    return tintFor(category.id).fill;
  }

  tintEdge(category: CategoryRead): string {
    return tintFor(category.id).ink;
  }

  fillPercent(category: CategoryRead): number {
    const within = category.budgeted_amount
      ? Math.min(category.spent_amount, category.budgeted_amount)
      : category.spent_amount;
    return (within / this.scale()) * 100;
  }

  categoryOverPercent(category: CategoryRead): number {
    if (!this.categoryOver(category)) {
      return 0;
    }
    return ((category.spent_amount - category.budgeted_amount) / this.scale()) * 100;
  }

  budgetMarkPercent(category: CategoryRead): number | null {
    if (!category.budgeted_amount) {
      return null;
    }
    return (category.budgeted_amount / this.scale()) * 100;
  }

  categoryNote(category: CategoryRead): string {
    if (!category.budgeted_amount) {
      return category.spent_amount > 0 ? 'No budget set' : '';
    }
    return `${this.bare(category.spent_amount)} / ${this.bare(category.budgeted_amount)}`;
  }
}
