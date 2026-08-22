import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import type {
  CurrencyChoice,
  HomeAlert,
  HomeMonth,
  HomeProject,
  HomeSpend,
} from '@setout/api-client';
import { AuthService } from '../auth/auth.service';
import { formatMoney } from '../budget/money';
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
  busiest: boolean;
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

  readonly greeting = computed(() => `Welcome back, ${this.auth.user()?.name ?? 'you'}`);

  readonly choices = computed(() => this.home.summary()?.currencies ?? []);
  readonly showing = computed(() => this.home.summary()?.currency_code ?? null);
  readonly split = computed(() => this.choices().length > 1);

  readonly planned = computed(() => this.home.summary()?.planned_amount ?? 0);
  readonly spent = computed(() => this.home.summary()?.spent_amount ?? 0);
  readonly left = computed(() => Math.abs(this.planned() - this.spent()));
  readonly over = computed(() => this.planned() > 0 && this.spent() > this.planned());
  readonly leftLabel = computed(() => (this.over() ? 'Over by' : 'Left'));

  readonly usedLabel = computed(() =>
    this.planned() ? `${Math.round((this.spent() / this.planned()) * 100)}%` : '—',
  );

  readonly usedPercent = computed(() =>
    this.planned() ? Math.min(100, (this.spent() / this.planned()) * 100) : 0,
  );

  readonly alerts = computed(() => this.home.summary()?.alerts ?? []);
  readonly rows = computed(() => this.home.projects()?.rows ?? []);
  readonly recent = computed(() => this.home.latest()?.rows ?? []);

  readonly standing = computed(() => {
    const found = this.home.summary();
    if (!found) {
      return '';
    }
    if (!found.projects) {
      return 'No projects yet. The first one takes a name, a currency and its scopes.';
    }
    const projects = `${found.projects} ${found.projects === 1 ? 'project' : 'projects'} open`;
    if (!found.alerts.length) {
      return `${projects}. Nothing needs attention.`;
    }
    return `${projects}. ${found.alerts.map((alert) => alert.detail).join(', ')}.`;
  });

  readonly currencyNote = computed(() => {
    const found = this.home.summary();
    if (!found?.projects || !found.currency_code) {
      return '';
    }
    const kept = found.currency_projects;
    const counted = `${kept} ${kept === 1 ? 'project' : 'projects'}`;
    if (!this.split()) {
      return `${counted}, all in ${found.currency_code} — totalled straight`;
    }
    return `${counted} in ${found.currency_code}. Currencies are never added together, so each is read on its own.`;
  });

  readonly bars = computed<MonthBar[]>(() => {
    const found = this.home.months();
    if (!found?.months.length) {
      return [];
    }
    const tallest = Math.max(...found.months.map((month) => month.amount), 1);
    return found.months.map((month) => ({
      month: month.month,
      label: this.monthName(month).toUpperCase(),
      amount: month.amount,
      height: Math.max(2, Math.round((month.amount / tallest) * 100)),
      figure: this.bare(month.amount),
      busiest: month.month === found.busiest_month,
    }));
  });

  readonly heaviest = computed(() => {
    const found = this.home.months();
    const busiest = found?.months.find((month) => month.month === found.busiest_month);
    if (!busiest) {
      return '';
    }
    return `Heaviest month was ${this.monthName(busiest)}, at ${this.money(busiest.amount)}. Bars are every project kept in ${found?.currency_code}.`;
  });

  constructor() {
    queueMicrotask(() => void this.home.load());
  }

  pillLabel(choice: CurrencyChoice): string {
    return `${choice.currency_code} ${choice.projects}`;
  }

  showingPill(choice: CurrencyChoice): boolean {
    return choice.currency_code === this.showing();
  }

  showCurrency(choice: CurrencyChoice): void {
    void this.home.show(choice.currency_code);
  }

  money(minor: number): string {
    const found = this.home.summary();
    if (!found?.currency_code) {
      return this.bare(minor);
    }
    return formatMoney(minor, found.currency_code, found.currency_exponent ?? 2);
  }

  bare(minor: number): string {
    const exponent = this.home.summary()?.currency_exponent ?? 2;
    return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(minor / 10 ** exponent);
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

  rowMoney(row: HomeProject | HomeSpend, minor: number): string {
    return formatMoney(minor, row.currency_code, row.currency_exponent);
  }

  rowOver(row: HomeProject): boolean {
    return row.planned_amount > 0 && row.spent_amount > row.planned_amount;
  }

  rowFill(row: HomeProject): number {
    if (!row.planned_amount) {
      return row.spent_amount > 0 ? 100 : 0;
    }
    return Math.min(100, (row.spent_amount / row.planned_amount) * 100);
  }

  rowOverFill(row: HomeProject): number {
    if (!this.rowOver(row)) {
      return 0;
    }
    const over = row.spent_amount - row.planned_amount;
    return Math.min(100 - this.rowFill(row), (over / row.planned_amount) * 100);
  }

  rowStanding(row: HomeProject): string {
    if (!row.planned_amount) {
      return 'No budget set';
    }
    const gap = Math.abs(row.planned_amount - row.spent_amount);
    return this.rowOver(row)
      ? `Over by ${this.rowMoney(row, gap)}`
      : `${this.rowMoney(row, gap)} left`;
  }

  countLabel(row: HomeProject): string {
    return `${row.expense_count} ${row.expense_count === 1 ? 'expense' : 'expenses'}`;
  }

  alertMoney(alert: HomeAlert): string {
    return alert.amount ? this.money(alert.amount) : '';
  }

  day(row: HomeSpend): string {
    return new Date(row.spent_on).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  where(row: HomeSpend): string {
    return `${row.project_name} · ${row.scope_name ?? 'Unfiled'}`;
  }

  barTitle(bar: MonthBar): string {
    return `${bar.label}: ${this.money(bar.amount)}`;
  }

  open(row: HomeProject): void {
    void this.router.navigate(['/projects', row.id]);
  }

  addExpense(row: HomeProject): void {
    void this.router.navigate(['/projects', row.id, 'expense']);
  }

  openSpend(row: HomeSpend): void {
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
      alert.kind === 'unfiled' ? 'table' : 'deliveries',
    ]);
  }

  allProjects(): void {
    void this.router.navigate(['/projects']);
  }

  newProject(): void {
    void this.router.navigate(['/projects'], { queryParams: { add: 1 } });
  }
}
