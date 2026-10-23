import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import type { Hit, HitGroup } from '@setout/api-client';
import { formatMoney } from '../budget/money';
import { ButtonComponent } from '../ui/button.component';
import { TopbarComponent } from '../ui/topbar.component';
import { SearchService } from './search.service';

const GROUP_LABELS: Record<string, string> = {
  projects: 'Projects',
  expenses: 'Expenses',
  vendors: 'Vendors',
  people: 'People',
  items: 'Items',
};

@Component({
  selector: 'app-search',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, TopbarComponent],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
})
export class SearchComponent {
  readonly q = input('');

  readonly search = inject(SearchService);
  private readonly router = inject(Router);

  readonly summary = computed(() => {
    const results = this.search.results();
    if (!results) {
      return '';
    }
    const matches = results.total === 1 ? 'match' : 'matches';
    return `${results.total} ${matches} for "${results.query}"`;
  });

  readonly empty = computed(
    () => !this.search.loading() && this.q().trim().length > 0 && !this.search.results()?.total,
  );

  constructor() {
    effect(() => {
      void this.search.search(this.q());
    });
  }

  heading(group: HitGroup): string {
    const name = GROUP_LABELS[group.kind] ?? group.kind;
    if (group.total > group.hits.length) {
      return `${name} · showing ${group.hits.length} of ${group.total}`;
    }
    return `${name} · ${group.total}`;
  }

  money(hit: Hit): string {
    if (hit.amount === null || hit.amount === undefined || !hit.currency_code) {
      return '';
    }
    return formatMoney(hit.amount, hit.currency_code, hit.currency_exponent ?? 2);
  }

  spentOn(hit: Hit): string {
    if (!hit.spent_on) {
      return '';
    }
    return new Date(hit.spent_on).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  open(group: HitGroup, hit: Hit): void {
    switch (group.kind) {
      case 'projects':
        void this.router.navigate(['/projects', hit.id]);
        break;
      case 'expenses':
        void this.router.navigate(['/projects', hit.project_id, 'expense']);
        break;
      case 'vendors':
        void this.router.navigate(['/vendors', hit.id]);
        break;
      case 'people':
        void this.router.navigate(['/people', hit.id]);
        break;
      case 'items':
        void this.router.navigate(['/items', hit.id]);
        break;
    }
  }

  exitSearch(): void {
    void this.router.navigate(['/']);
  }
}
