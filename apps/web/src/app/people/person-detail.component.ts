import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import type {
  PersonCurrencyTotal,
  PersonExpenseSummary,
  PersonProjectExpenseSummary,
  PersonRead,
} from '@setout/api-client';
import { formatMoney } from '../budget/money';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { PersonService } from './person.service';

@Component({
  selector: 'app-person-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ButtonComponent],
  templateUrl: './person-detail.component.html',
  styleUrl: './person-detail.component.scss',
})
export class PersonDetailComponent {
  private readonly personService = inject(PersonService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private readonly title = inject(Title);

  readonly id = input.required<string>();

  readonly person = signal<PersonRead | null>(null);
  readonly expenseSummary = signal<PersonExpenseSummary | null>(null);
  readonly loading = signal(true);
  readonly pendingDelete = signal(false);
  readonly deleteConfirmationText = signal('');

  readonly notSet = '—';

  constructor() {
    effect(() => {
      this.id();
      void this.load();
    });
    effect(() => {
      const person = this.person();
      if (person) {
        this.title.setTitle(`${person.name} · Setout`);
      }
    });
  }

  async load(): Promise<void> {
    const [person, expenseSummary] = await Promise.all([
      this.personService.get(this.id()),
      this.personService.expenseSummary(this.id()),
    ]);
    this.person.set(person);
    this.expenseSummary.set(expenseSummary);
    this.loading.set(false);
  }

  formatSpent(row: PersonProjectExpenseSummary): string {
    return formatMoney(row.spent_amount, row.currency_code, row.currency_exponent);
  }

  edit(): void {
    void this.router.navigate(['/people', this.id(), 'edit']);
  }

  countLabel(person: PersonRead): string {
    if (person.expense_count === 0) {
      return 'no expenses yet';
    }
    return person.expense_count === 1 ? '1 expense' : `${person.expense_count} expenses`;
  }

  spentTotals(summary: PersonExpenseSummary): PersonCurrencyTotal[] {
    const rows = new Map<string, PersonCurrencyTotal>();
    for (const project of summary.projects) {
      const existing = rows.get(project.currency_code);
      if (existing) {
        existing.expense_count += project.expense_count;
        existing.spent_amount += project.spent_amount;
      } else {
        rows.set(project.currency_code, {
          currency_code: project.currency_code,
          currency_exponent: project.currency_exponent,
          expense_count: project.expense_count,
          spent_amount: project.spent_amount,
        });
      }
    }
    return [...rows.values()];
  }

  formatTotal(total: PersonCurrencyTotal): string {
    return formatMoney(total.spent_amount, total.currency_code, total.currency_exponent);
  }

  async archive(): Promise<void> {
    await this.personService.archive(this.id());
    await this.load();
    this.toast.show('Person archived.');
  }

  async restore(): Promise<void> {
    await this.personService.restore(this.id());
    await this.load();
    this.toast.show('Person restored.');
  }

  requestDelete(): void {
    this.pendingDelete.set(true);
    this.deleteConfirmationText.set('');
  }

  cancelDelete(): void {
    this.pendingDelete.set(false);
    this.deleteConfirmationText.set('');
  }

  canConfirmDelete(): boolean {
    return this.deleteConfirmationText().trim() === 'DELETE';
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  async deletePermanently(): Promise<void> {
    if (!this.canConfirmDelete()) {
      return;
    }
    await this.personService.delete(this.id());
    this.toast.show('Person deleted permanently.');
    void this.router.navigate(['/people']);
  }
}
