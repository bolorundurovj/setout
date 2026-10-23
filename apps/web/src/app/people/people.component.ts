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
  readonly personService = inject(PersonService);
  private readonly router = inject(Router);

  readonly notSet = '—';

  readonly search = signal('');
  readonly includeArchived = signal(false);
  private readonly debouncedSearch = debounce<string>(
    (text) => void this.personService.load(text, this.includeArchived()),
  );

  constructor() {
    void this.personService.load();
    inject(DestroyRef).onDestroy(() => this.debouncedSearch.cancel());
  }

  inputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onSearch(event: Event): void {
    this.search.set(this.inputValue(event));
    this.debouncedSearch.call(this.search());
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.debouncedSearch.cancel();
    this.includeArchived.set(on);
    await this.personService.load(this.search(), on);
  }

  async goTo(page: number): Promise<void> {
    await this.personService.goTo(page);
  }

  open(personId: string): void {
    void this.router.navigate(['/people', personId]);
  }

  newPerson(): void {
    void this.router.navigate(['/people/new']);
  }

  peopleCountLabel(): string {
    const total = this.personService.total();
    return `${total} ${total === 1 ? 'person' : 'people'}`;
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }

  countLabel(person: PersonRead): string {
    if (person.expense_count === 0) {
      return 'no expenses yet';
    }
    return person.expense_count === 1 ? '1 expense' : `${person.expense_count} expenses`;
  }

  formatSpent(total: PersonCurrencyTotal): string {
    return formatMoney(total.spent_amount, total.currency_code, total.currency_exponent);
  }
}
