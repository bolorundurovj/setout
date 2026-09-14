import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { ExpenseRead, ExpenseSort, ProjectRead } from '@setout/api-client';
import { BudgetService } from '../budget/budget.service';
import { formatMoney } from '../budget/money';
import { ItemService } from '../items/item.service';
import { PersonService } from '../people/person.service';
import { ToastService } from '../toast.service';
import { ButtonComponent } from '../ui/button.component';
import { ChipGroupComponent, type Chip } from '../ui/chip-group.component';
import { debounce } from '../ui/debounce';
import { DrawerComponent } from '../ui/drawer.component';
import { PaginationComponent } from '../ui/pagination.component';
import { ToggleComponent } from '../ui/toggle.component';
import { VendorService } from '../vendors/vendor.service';
import { AddExpenseComponent } from './add-expense.component';
import { ExpenseService, UNFILED, type ExpenseFilters } from './expense.service';

const SORTS: Chip[] = [
  { value: 'recent', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'largest', label: 'Largest first' },
  { value: 'smallest', label: 'Smallest first' },
];

@Component({
  selector: 'app-expenses',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AddExpenseComponent,
    ButtonComponent,
    ChipGroupComponent,
    DrawerComponent,
    FormsModule,
    PaginationComponent,
    ToggleComponent,
  ],
  templateUrl: './expenses.component.html',
  styleUrl: './expenses.component.scss',
})
export class ExpensesComponent {
  readonly project = input.required<ProjectRead>();
  readonly filters = input<ExpenseFilters>({});

  readonly expenses = inject(ExpenseService);
  readonly vendors = inject(VendorService);
  readonly people = inject(PersonService);
  readonly items = inject(ItemService);
  private readonly budget = inject(BudgetService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly adding = signal(false);
  readonly editingExpense = signal<ExpenseRead | null>(null);
  readonly filing = signal(false);
  readonly includeArchived = signal(false);
  readonly selected = signal<Set<string>>(new Set());
  readonly bulkCategoryId = signal<string>('');

  readonly uncategorized = computed(() => this.expenses.byCategory()[UNFILED]?.rows ?? []);
  readonly uncategorizedTotal = computed(() => this.expenses.byCategory()[UNFILED]?.total ?? 0);
  readonly uncategorizedPage = computed(() => this.expenses.byCategory()[UNFILED]?.page ?? 1);
  readonly allSelected = computed(
    () =>
      this.uncategorized().length > 0 &&
      this.uncategorized().every((e) => this.selected().has(e.id)),
  );
  readonly selectedCount = computed(() => this.selected().size);
  readonly canFile = computed(() => this.selectedCount() > 0 && this.bulkCategoryId() !== '');
  readonly fileableCategories = computed(() => this.budget.categories().filter((s) => !s.is_group));

  readonly notSet = '—';

  readonly showFilters = signal(false);
  readonly search = signal('');
  readonly vendorId = signal('');
  readonly paidById = signal('');
  readonly itemId = signal('');
  readonly from = signal('');
  readonly to = signal('');
  readonly sort = signal<ExpenseSort>('recent');

  readonly sortChips = SORTS;

  readonly vendorChips = computed<Chip[]>(() => [
    { value: '', label: 'Any vendor' },
    ...this.vendors.choices().map((v) => ({ value: v.id, label: v.name, detail: v.trade })),
  ]);

  readonly personChips = computed<Chip[]>(() => [
    { value: '', label: 'Anybody' },
    ...this.people.choices().map((p) => ({ value: p.id, label: p.name, detail: p.role })),
  ]);

  readonly itemChips = computed<Chip[]>(() => [
    { value: '', label: 'Any item' },
    ...this.items.choices().map((i) => ({ value: i.id, label: i.name, detail: i.unit })),
  ]);

  readonly activeCount = computed(() => {
    const held = this.filters();
    const set = [held.search, held.vendorId, held.paidById, held.itemId, held.from, held.to];
    return set.filter(Boolean).length + (held.sort && held.sort !== 'recent' ? 1 : 0);
  });

  readonly filtered = computed(() => this.activeCount() > 0);

  readonly matchLine = computed(() => {
    const total = this.expenses.total();
    const rows = total === 1 ? 'expense' : 'expenses';
    return `${total} ${rows} matching · ${this.money(this.expenses.totalAmount())}`;
  });

  private readonly typing = debounce<string>((text) => {
    this.search.set(text);
    this.apply();
  });

  constructor() {
    effect(() => {
      const held = this.filters();
      this.search.set(held.search ?? '');
      this.vendorId.set(held.vendorId ?? '');
      this.paidById.set(held.paidById ?? '');
      this.itemId.set(held.itemId ?? '');
      this.from.set(held.from ?? '');
      this.to.set(held.to ?? '');
      this.sort.set(held.sort ?? 'recent');
      void this.expenses.load(this.project().id, {
        ...held,
        includeArchived: untracked(this.includeArchived),
      });
    });
    queueMicrotask(() => {
      void this.budget.load(this.project().id);
      void this.vendors.loadChoices();
      void this.people.loadChoices();
      void this.items.loadChoices();
    });
    inject(DestroyRef).onDestroy(() => this.typing.cancel());
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onSearch(event: Event): void {
    this.typing.call(this.value(event));
  }

  pick(which: 'vendorId' | 'paidById' | 'itemId', value: string): void {
    this[which].set(value);
    this.apply();
  }

  pickSort(value: string): void {
    this.sort.set((value as ExpenseSort) || 'recent');
    this.apply();
  }

  setDate(which: 'from' | 'to', event: Event): void {
    this[which].set(this.value(event));
    this.apply();
  }

  toggleFilters(): void {
    this.showFilters.update((open) => !open);
  }

  clear(): void {
    this.typing.cancel();
    this.search.set('');
    this.vendorId.set('');
    this.paidById.set('');
    this.itemId.set('');
    this.from.set('');
    this.to.set('');
    this.sort.set('recent');
    this.apply();
  }

  filtersLabel(): string {
    const count = this.activeCount();
    return count ? `Filters (${count})` : 'Filters';
  }

  /** The URL holds the filters, so the effect above reloads when they land. */
  private apply(): void {
    this.filing.set(false);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.search() || null,
        vendor: this.vendorId() || null,
        person: this.paidById() || null,
        item: this.itemId() || null,
        from: this.from() || null,
        to: this.to() || null,
        sort: this.sort() === 'recent' ? null : this.sort(),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  money(minor: number): string {
    const project = this.project();
    return formatMoney(minor, project.currency_code, project.currency_exponent);
  }

  variance(percent: number): string {
    const rounded = Math.abs(percent).toFixed(1);
    if (percent > 0) {
      return `${rounded}% over`;
    }
    return percent < 0 ? `${rounded}% under` : 'on budget';
  }

  categoryName(expense: ExpenseRead): string {
    if (!expense.category_id) {
      return 'Uncategorized';
    }
    return (
      this.budget.categories().find((s) => s.id === expense.category_id)?.name ?? 'Uncategorized'
    );
  }

  meta(expense: ExpenseRead): string {
    const parts: string[] = [];
    if (expense.cost_type) {
      parts.push(expense.cost_type);
    }
    if (expense.quantity !== null && expense.unit_rate !== null) {
      parts.push(`${Number(expense.quantity)} × ${this.money(expense.unit_rate)}`);
    }
    return parts.join(' · ');
  }

  photoTitle(expense: ExpenseRead): string {
    const count = expense.attachment_count;
    return count === 1 ? 'One file attached' : `${count} files attached`;
  }

  openDrawer(): void {
    this.editingExpense.set(null);
    this.adding.set(true);
  }

  edit(expense: ExpenseRead): void {
    this.editingExpense.set(expense);
    this.adding.set(true);
  }

  closeDrawer(): void {
    this.adding.set(false);
    this.editingExpense.set(null);
  }

  async onSaved(): Promise<void> {
    await this.expenses.load(this.project().id, {
      ...this.filters(),
      includeArchived: this.includeArchived(),
    });
  }

  async goTo(page: number): Promise<void> {
    await this.expenses.goTo(this.project().id, page);
  }

  startFiling(): void {
    this.filing.set(true);
    this.selected.set(new Set());
    this.bulkCategoryId.set('');
    void this.expenses.loadForCategory(this.project().id, UNFILED);
  }

  stopFiling(): void {
    this.filing.set(false);
    this.selected.set(new Set());
    this.bulkCategoryId.set('');
  }

  async goToUncategorized(page: number): Promise<void> {
    await this.expenses.loadForCategory(this.project().id, UNFILED, page);
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.selected.set(new Set());
    } else {
      this.selected.set(new Set(this.uncategorized().map((e) => e.id)));
    }
  }

  toggleOne(expenseId: string): void {
    const next = new Set(this.selected());
    if (next.has(expenseId)) {
      next.delete(expenseId);
    } else {
      next.add(expenseId);
    }
    this.selected.set(next);
  }

  async fileSelected(): Promise<void> {
    if (!this.canFile()) {
      return;
    }
    const count = await this.expenses.file(this.project().id, {
      expense_ids: Array.from(this.selected()),
      category_id: this.bulkCategoryId(),
    });
    if (count === null) {
      this.toast.show(this.expenses.error() ?? 'Could not assign those expenses.', 'error');
      return;
    }
    this.toast.show(`${count} expense${count === 1 ? '' : 's'} filed.`, 'success');
    this.selected.set(new Set());
    this.bulkCategoryId.set('');
    await this.expenses.loadForCategory(this.project().id, UNFILED, this.uncategorizedPage());
    if (this.uncategorizedTotal() === 0) {
      this.stopFiling();
    }
  }

  async remove(expenseId: string): Promise<void> {
    await this.expenses.remove(this.project().id, expenseId);
    this.toast.show('Expense archived. Show archived to restore it.');
  }

  async restore(expenseId: string): Promise<void> {
    await this.expenses.restore(this.project().id, expenseId);
    this.toast.show('Expense restored.');
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.filing.set(false);
    this.includeArchived.set(on);
    await this.expenses.load(this.project().id, { ...this.filters(), includeArchived: on });
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }
}
