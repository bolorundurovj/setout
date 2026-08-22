import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import type {
  PersonCurrencyTotal,
  PersonProjectSpend,
  PersonRead,
  PersonSpend,
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
  private readonly people = inject(PersonService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private readonly title = inject(Title);

  readonly id = input.required<string>();

  readonly person = signal<PersonRead | null>(null);
  readonly spend = signal<PersonSpend | null>(null);
  readonly loading = signal(true);

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
    const [person, spend] = await Promise.all([
      this.people.get(this.id()),
      this.people.spend(this.id()),
    ]);
    this.person.set(person);
    this.spend.set(spend);
    this.loading.set(false);
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  money(row: PersonProjectSpend): string {
    return formatMoney(row.spent_amount, row.currency_code, row.currency_exponent);
  }

  edit(): void {
    void this.router.navigate(['/people', this.id(), 'edit']);
  }

  countLabel(person: PersonRead): string {
    if (person.expense_count === 0) {
      return 'nothing recorded yet';
    }
    return person.expense_count === 1 ? '1 purchase' : `${person.expense_count} purchases`;
  }

  spentTotals(spend: PersonSpend): PersonCurrencyTotal[] {
    const rows = new Map<string, PersonCurrencyTotal>();
    for (const project of spend.projects) {
      const held = rows.get(project.currency_code);
      if (held) {
        held.expense_count += project.expense_count;
        held.spent_amount += project.spent_amount;
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

  total(total: PersonCurrencyTotal): string {
    return formatMoney(total.spent_amount, total.currency_code, total.currency_exponent);
  }

  async archive(): Promise<void> {
    await this.people.archive(this.id());
    await this.load();
    this.toast.show('Person archived.');
  }

  async restore(): Promise<void> {
    await this.people.restore(this.id());
    await this.load();
    this.toast.show('Person taken out of the archive.');
  }
}
