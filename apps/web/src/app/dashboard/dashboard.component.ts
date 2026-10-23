import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import type {
  CurrencyChoice,
  HomeAlert,
  HomeMonth,
  HomeExpenseSummary,
  HomeProject,
} from '@setout/api-client';
import { AuthService } from '../auth/auth.service';
import { formatAmount, formatMoney } from '../budget/money';
import { ButtonComponent } from '../ui/button.component';
import { TopbarComponent } from '../ui/topbar.component';
import { HomeService } from './home.service';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface MonthBar {
  month: string;
  label: string;
  amount: number;
  height: number;
  figure: string;
  highest: boolean;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, TopbarComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  readonly home = inject(HomeService);
  private readonly router = inject(Router);

  readonly today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  readonly greeting = computed(() => {
    const name = this.auth.user()?.name;
    return name ? `Welcome back, ${name}` : 'Welcome back';
  });

  readonly currencies = computed(() => this.home.summary()?.currencies ?? []);
  readonly selectedCurrency = computed(() => this.home.summary()?.currency_code ?? null);
  readonly hasMultipleCurrencies = computed(() => this.currencies().length > 1);

  readonly budgeted = computed(() => this.home.summary()?.budgeted_amount ?? 0);
  readonly spent = computed(() => this.home.summary()?.spent_amount ?? 0);
  readonly remaining = computed(() => Math.abs(this.budgeted() - this.spent()));
  readonly isOverBudget = computed(() => this.budgeted() > 0 && this.spent() > this.budgeted());
  readonly remainingLabel = computed(() => (this.isOverBudget() ? 'Over budget by' : 'Remaining'));

  readonly usedLabel = computed(() =>
    this.budgeted() ? `${Math.round((this.spent() / this.budgeted()) * 100)}%` : '—',
  );

  readonly usedPercent = computed(() =>
    this.budgeted() ? Math.min(100, (this.spent() / this.budgeted()) * 100) : 0,
  );

  readonly alerts = computed(() => this.home.summary()?.alerts ?? []);
  readonly rows = computed(() => this.home.projects()?.rows ?? []);
  readonly recent = computed(() => this.home.recent()?.rows ?? []);

  readonly summaryLine = computed(() => {
    const summary = this.home.summary();
    if (!summary) {
      return '';
    }
    if (!summary.project_count) {
      return 'No projects yet. Create a project with a name, currency and categories.';
    }
    const count = summary.project_count;
    const projects = `${count} ${count === 1 ? 'project' : 'projects'}`;
    if (!summary.alerts.length) {
      return `${projects}. Nothing needs attention.`;
    }
    return `${projects}. ${summary.alerts.map((alert) => alert.detail).join(', ')}.`;
  });

  readonly currencyNote = computed(() => {
    const summary = this.home.summary();
    if (!summary?.project_count || !summary.currency_code) {
      return '';
    }
    const projectCount = summary.currency_project_count ?? 0;
    const projectLabel = `${projectCount} ${projectCount === 1 ? 'project' : 'projects'}`;
    if (!this.hasMultipleCurrencies()) {
      return `${projectLabel}, all in ${summary.currency_code}.`;
    }
    return `${projectLabel} in ${summary.currency_code}. Currencies are shown separately and never combined.`;
  });

  readonly bars = computed<MonthBar[]>(() => {
    const months = this.home.months();
    if (!months?.months.length) {
      return [];
    }
    const tallest = Math.max(...months.months.map((month) => month.amount), 1);
    return months.months.map((month) => ({
      month: month.month,
      label: this.monthName(month).toUpperCase(),
      amount: month.amount,
      height: Math.max(2, Math.round((month.amount / tallest) * 100)),
      figure: this.formatAmount(month.amount),
      highest: month.month === months.highest_month,
    }));
  });

  readonly highestMonthCaption = computed(() => {
    const months = this.home.months();
    const highest = months?.months.find((month) => month.month === months.highest_month);
    if (!highest) {
      return '';
    }
    return `Highest month: ${this.monthName(highest)} at ${this.money(highest.amount)}. Bars include every project in ${months?.currency_code}.`;
  });

  constructor() {
    queueMicrotask(() => void this.home.load());
  }

  pillLabel(choice: CurrencyChoice): string {
    return `${choice.currency_code} ${choice.project_count}`;
  }

  isSelectedCurrency(choice: CurrencyChoice): boolean {
    return choice.currency_code === this.selectedCurrency();
  }

  showCurrency(choice: CurrencyChoice): void {
    void this.home.selectCurrency(choice.currency_code);
  }

  money(minor: number): string {
    const summary = this.home.summary();
    if (!summary?.currency_code) {
      return this.formatAmount(minor);
    }
    return formatMoney(minor, summary.currency_code, summary.currency_exponent ?? 2);
  }

  formatAmount(minor: number): string {
    return formatAmount(minor, this.home.summary()?.currency_exponent ?? 2);
  }

  monthName(month: HomeMonth): string {
    const [, index] = month.month.split('-');
    return MONTHS[Number(index) - 1] ?? month.month;
  }

  initials(name: string): string {
    return name
      .split(/[\s,]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? '')
      .join('');
  }

  rowMoney(row: HomeProject | HomeExpenseSummary, minor: number): string {
    return formatMoney(minor, row.currency_code, row.currency_exponent);
  }

  rowIsOverBudget(row: HomeProject): boolean {
    return row.budgeted_amount > 0 && row.spent_amount > row.budgeted_amount;
  }

  rowFill(row: HomeProject): number {
    if (!row.budgeted_amount) {
      return row.spent_amount > 0 ? 100 : 0;
    }
    return Math.min(100, (row.spent_amount / row.budgeted_amount) * 100);
  }

  rowOverBudgetPercent(row: HomeProject): number {
    if (!this.rowIsOverBudget(row)) {
      return 0;
    }
    const overspend = row.spent_amount - row.budgeted_amount;
    return Math.min(100 - this.rowFill(row), (overspend / row.budgeted_amount) * 100);
  }

  rowBudgetStatus(row: HomeProject): string {
    if (!row.budgeted_amount) {
      return 'No budget set';
    }
    const gap = Math.abs(row.budgeted_amount - row.spent_amount);
    return this.rowIsOverBudget(row)
      ? `Over budget by ${this.rowMoney(row, gap)}`
      : `${this.rowMoney(row, gap)} remaining`;
  }

  countLabel(row: HomeProject): string {
    return `${row.expense_count} ${row.expense_count === 1 ? 'expense' : 'expenses'}`;
  }

  alertMoney(alert: HomeAlert): string {
    return alert.amount ? this.money(alert.amount) : '';
  }

  formatDate(row: HomeExpenseSummary): string {
    return new Date(row.spent_on).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  expenseLocation(row: HomeExpenseSummary): string {
    return `${row.project_name} · ${row.category_name ?? 'Uncategorised'}`;
  }

  barTitle(bar: MonthBar): string {
    return `${bar.label}: ${this.money(bar.amount)}`;
  }

  open(row: HomeProject): void {
    void this.router.navigate(['/projects', row.id]);
  }

  newExpense(row: HomeProject): void {
    void this.router.navigate(['/projects', row.id, 'expense']);
  }

  openExpense(row: HomeExpenseSummary): void {
    void this.router.navigate(['/projects', row.project_id, 'expense']);
  }

  openAlert(alert: HomeAlert): void {
    const row = this.rows()[0];
    if (!row) {
      return;
    }
    void this.router.navigate([
      '/projects',
      row.id,
      alert.kind === 'uncategorised' ? 'table' : 'deliveries',
    ]);
  }

  openProjects(): void {
    void this.router.navigate(['/projects']);
  }

  newProject(): void {
    void this.router.navigate(['/projects'], { queryParams: { add: 1 } });
  }
}
