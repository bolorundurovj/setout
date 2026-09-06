import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { ProjectRead, ScopeRead } from '@setout/api-client';
import { AgreementService } from '../agreements/agreement.service';
import { BudgetService } from '../budget/budget.service';
import { DeliveryService } from '../deliveries/delivery.service';
import { formatMoney } from '../budget/money';
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
  readonly openScope = output<string>();

  readonly budget = inject(BudgetService);
  readonly expenses = inject(ExpenseService);
  readonly agreements = inject(AgreementService);
  readonly deliveries = inject(DeliveryService);

  readonly symbol = computed(() => currencySymbol(this.project().currency_code));

  readonly planned = computed(() => this.expenses.spend()?.planned_amount ?? 0);
  readonly spent = computed(() => this.expenses.spend()?.spent_amount ?? 0);
  readonly unfiled = computed(() => this.expenses.spend()?.unfiled_amount ?? 0);

  readonly isOver = computed(() => this.planned() > 0 && this.spent() > this.planned());
  readonly varianceLabel = computed(() => (this.isOver() ? 'Over by' : 'Remaining'));

  readonly varianceAmount = computed(() => {
    if (!this.planned()) {
      return null;
    }
    return Math.abs(this.planned() - this.spent());
  });

  readonly varianceNote = computed(() => {
    if (!this.planned()) {
      return 'No budget set.';
    }
    const percent = this.expenses.spend()?.variance_percent;
    if (percent === null || percent === undefined) {
      return '';
    }
    return this.isOver() ? `${percent}% over budget.` : `${Math.abs(percent)}% under budget.`;
  });

  readonly budgetNote = computed(() =>
    this.planned() ? `Across ${this.budget.scopes().length} categories.` : 'No budget set.',
  );

  readonly spentNote = computed(() => {
    const count = this.expenses.total();
    const unfiled = this.unfiled();
    const filed = `${count} ${count === 1 ? 'expense' : 'expenses'}`;
    return unfiled ? `${filed}, ${this.bare(unfiled)} unfiled.` : `${filed}.`;
  });

  readonly usedLabel = computed(() =>
    this.planned() ? `${Math.round((this.spent() / this.planned()) * 100)}%` : '—',
  );

  readonly rows = computed(() =>
    this.budget
      .scopes()
      .filter((scope) => scope.planned_amount > 0 || scope.spent_amount > 0)
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

    if (this.unfiled() > 0) {
      alerts.push({
        key: 'unfiled',
        title: 'Uncategorized expenses',
        detail: 'Uncategorized, so not included in the bars above',
        amount: this.bare(this.unfiled()),
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
    if (!this.planned()) {
      return 0;
    }
    return Math.min(100, (this.spent() / this.planned()) * 100);
  }

  overPercent(): number {
    if (!this.planned() || this.spent() <= this.planned()) {
      return 0;
    }
    const over = this.spent() - this.planned();
    return Math.min(100 - this.usedPercent(), (over / this.planned()) * 100);
  }

  readonly scale = computed(() =>
    Math.max(1, ...this.rows().map((scope) => Math.max(scope.planned_amount, scope.spent_amount))),
  );

  overBy(scope: ScopeRead): number {
    return scope.spent_amount - scope.planned_amount;
  }

  scopeOver(scope: ScopeRead): boolean {
    return scope.planned_amount > 0 && scope.spent_amount > scope.planned_amount;
  }

  tint(scope: ScopeRead): string {
    return tintFor(scope.id).fill;
  }

  tintEdge(scope: ScopeRead): string {
    return tintFor(scope.id).ink;
  }

  fillPercent(scope: ScopeRead): number {
    const within = scope.planned_amount
      ? Math.min(scope.spent_amount, scope.planned_amount)
      : scope.spent_amount;
    return (within / this.scale()) * 100;
  }

  scopeOverPercent(scope: ScopeRead): number {
    if (!this.scopeOver(scope)) {
      return 0;
    }
    return ((scope.spent_amount - scope.planned_amount) / this.scale()) * 100;
  }

  budgetMarkPercent(scope: ScopeRead): number | null {
    if (!scope.planned_amount) {
      return null;
    }
    return (scope.planned_amount / this.scale()) * 100;
  }

  scopeNote(scope: ScopeRead): string {
    if (!scope.planned_amount) {
      return scope.spent_amount > 0 ? 'No budget set' : '';
    }
    return `${this.bare(scope.spent_amount)} / ${this.bare(scope.planned_amount)}`;
  }
}
