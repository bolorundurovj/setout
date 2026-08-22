import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { PersonCurrencyTotal, PersonRead } from '@setout/api-client';
import { formatMoney } from '../budget/money';
import { ButtonComponent } from '../ui/button.component';
import { debounce } from '../ui/debounce';
import { PaginationComponent } from '../ui/pagination.component';
import { ToggleComponent } from '../ui/toggle.component';
import { TopbarComponent } from '../ui/topbar.component';
import { PersonService } from './person.service';

@Component({
  selector: 'app-people',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, PaginationComponent, ToggleComponent, TopbarComponent],
  templateUrl: './people.component.html',
  styleUrl: './people.component.scss',
})
export class PeopleComponent {
  readonly people = inject(PersonService);
  private readonly router = inject(Router);

  readonly notSet = '—';

  readonly search = signal('');
  readonly includeArchived = signal(false);
  private readonly typing = debounce<string>(
    (text) => void this.people.load(text, this.includeArchived()),
  );

  constructor() {
    void this.people.load();
    inject(DestroyRef).onDestroy(() => this.typing.cancel());
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onSearch(event: Event): void {
    this.search.set(this.value(event));
    this.typing.call(this.search());
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.typing.cancel();
    this.includeArchived.set(on);
    await this.people.load(this.search(), on);
  }

  async goTo(page: number): Promise<void> {
    await this.people.goTo(page);
  }

  open(personId: string): void {
    void this.router.navigate(['/people', personId]);
  }

  addSomeone(): void {
    void this.router.navigate(['/people/new']);
  }

  peopleCountLabel(): string {
    const total = this.people.total();
    return `${total} ${total === 1 ? 'person' : 'people'}`;
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }

  countLabel(person: PersonRead): string {
    if (person.expense_count === 0) {
      return 'nothing bought yet';
    }
    return person.expense_count === 1 ? '1 purchase' : `${person.expense_count} purchases`;
  }

  money(total: PersonCurrencyTotal): string {
    return formatMoney(total.spent_amount, total.currency_code, total.currency_exponent);
  }
}
