import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { ProjectRead, CategoryRead } from '@setout/api-client';
import { AgreementService } from '../agreements/agreement.service';
import { BudgetService } from '../budget/budget.service';
import { DeliveryService } from '../deliveries/delivery.service';
import { formatAmount, formatMoney, formatNumber } from '../budget/money';
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

  readonly budgeted = computed(() => this.expenses.summary()?.budgeted_amount ?? 0);
  readonly spent = computed(() => this.expenses.summary()?.spent_amount ?? 0);
  readonly uncategorised = computed(() => this.expenses.summary()?.uncategorised_amount ?? 0);

  readonly isOverBudget = computed(() => this.budgeted() > 0 && this.spent() > this.budgeted());
  readonly varianceLabel = computed(() => (this.isOverBudget() ? 'Over budget by' : 'Remaining'));

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
    const percent = this.expenses.summary()?.variance_percent;
    if (percent === null || percent === undefined) {
      return '';
    }
    const percentLabel = formatNumber(Math.abs(percent), 1);
    return this.isOverBudget() ? `${percentLabel}% over budget.` : `${percentLabel}% under budget.`;
  });

  readonly budgetNote = computed(() =>
    this.budgeted() ? `Across ${this.budget.categories().length} categories.` : 'No budget set.',
  );

  readonly spentNote = computed(() => {
    const count = this.expenses.total();
    const uncategorised = this.uncategorised();
    const countLabel = `${count} ${count === 1 ? 'expense' : 'expenses'}`;
    return uncategorised
      ? `${countLabel}, ${this.formatAmount(uncategorised)} uncategorised.`
      : `${countLabel}.`;
  });

  readonly usedLabel = computed(() =>
    this.budgeted() ? `${Math.round((this.spent() / this.budgeted()) * 100)}%` : '—',
  );

  readonly rows = computed(() =>
    this.budget
      .categories()
      .filter((category) => category.budgeted_amount > 0 || category.spent_amount > 0)
      .sort((a, b) => this.overspend(b) - this.overspend(a)),
  );

  constructor() {
    queueMicrotask(() => {
      void this.budget.load(this.project().id);
      void this.expenses.load(this.project().id);
      void this.agreements.load(this.project().id);
      void this.agreements.loadBalances(this.project().id);
      void this.deliveries.loadOutstanding(this.project().id);
    });
  }

  readonly alerts = computed<Alert[]>(() => {
    const alerts: Alert[] = [];

    if (this.uncategorised() > 0) {
      alerts.push({
        key: 'uncategorised',
        title: 'Uncategorised expenses',
        detail: 'Not included in the category bars',
        amount: this.formatAmount(this.uncategorised()),
        urgent: true,
        tab: 'table',
      });
    }

    for (const agreement of this.agreements.agreements()) {
      if (agreement.balance_amount > 0) {
        alerts.push({
          key: `agreement-${agreement.id}`,
          title: 'Agreement balance',
          detail: `${agreement.vendor_name} · ${agreement.description.toLowerCase()}`,
          amount: this.formatAmount(agreement.balance_amount),
          urgent: false,
          tab: 'agreements',
        });
      }
    }

    const outstanding = this.deliveries.outstanding(this.project().id);
    if (outstanding.total > 0) {
      const first = outstanding.rows[0];
      alerts.push({
        key: 'deliveries',
        title: 'Outstanding deliveries',
        detail:
          outstanding.total === 1 && first
            ? `${first.description} · ${first.vendor_name ?? 'vendor not recorded'}`
            : `${outstanding.total} paid items outstanding`,
        amount: this.formatAmount(outstanding.outstandingAmount),
        urgent: false,
        tab: 'deliveries',
      });
    }

    for (const balance of this.agreements.balances()) {
      if (balance.balance_amount < 0) {
        alerts.push({
          key: `reimbursement-${balance.person_id}`,
          title: `Owed to ${balance.person_name}`,
          detail: 'Spent on your behalf, not yet reimbursed',
          amount: this.formatAmount(-balance.balance_amount),
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

  formatAmount(minor: number): string {
    return formatAmount(minor, this.project().currency_exponent);
  }

  usedPercent(): number {
    if (!this.budgeted()) {
      return 0;
    }
    return Math.min(100, (this.spent() / this.budgeted()) * 100);
  }

  overBudgetPercent(): number {
    if (!this.budgeted() || this.spent() <= this.budgeted()) {
      return 0;
    }
    const overspend = this.spent() - this.budgeted();
    return Math.min(100 - this.usedPercent(), (overspend / this.budgeted()) * 100);
  }

  readonly scale = computed(() =>
    Math.max(
      1,
      ...this.rows().map((category) => Math.max(category.budgeted_amount, category.spent_amount)),
    ),
  );

  overspend(category: CategoryRead): number {
    return category.spent_amount - category.budgeted_amount;
  }

  categoryIsOverBudget(category: CategoryRead): boolean {
    return category.budgeted_amount > 0 && category.spent_amount > category.budgeted_amount;
  }

  tint(category: CategoryRead): string {
    return tintFor(category.id).fill;
  }

  tintEdge(category: CategoryRead): string {
    return tintFor(category.id).ink;
  }

  fillPercent(category: CategoryRead): number {
    const inBudgetAmount = category.budgeted_amount
      ? Math.min(category.spent_amount, category.budgeted_amount)
      : category.spent_amount;
    return (inBudgetAmount / this.scale()) * 100;
  }

  categoryOverPercent(category: CategoryRead): number {
    if (!this.categoryIsOverBudget(category)) {
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
    return `${this.formatAmount(category.spent_amount)} / ${this.formatAmount(category.budgeted_amount)}`;
  }
}
