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
import { ExpenseService, UNCATEGORISED, type ExpenseFilters } from './expense.service';

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

  readonly drawerOpen = signal(false);
  readonly editingExpense = signal<ExpenseRead | null>(null);
  readonly assigning = signal(false);
  readonly includeArchived = signal(false);
  readonly pendingDelete = signal<string | null>(null);
  readonly deleteConfirmationText = signal('');
  readonly selected = signal<Set<string>>(new Set());
  readonly bulkCategoryId = signal<string>('');

  readonly uncategorised = computed(() => this.expenses.byCategory()[UNCATEGORISED]?.rows ?? []);
  readonly uncategorisedTotal = computed(
    () => this.expenses.byCategory()[UNCATEGORISED]?.total ?? 0,
  );
  readonly uncategorisedPage = computed(() => this.expenses.byCategory()[UNCATEGORISED]?.page ?? 1);
  readonly allSelected = computed(
    () =>
      this.uncategorised().length > 0 &&
      this.uncategorised().every((e) => this.selected().has(e.id)),
  );
  readonly selectedCount = computed(() => this.selected().size);
  readonly canAssign = computed(() => this.selectedCount() > 0 && this.bulkCategoryId() !== '');
  readonly assignableCategories = computed(() =>
    this.budget.categories().filter((s) => !s.is_group),
  );

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
    { value: '', label: 'Anyone' },
    ...this.people.choices().map((p) => ({ value: p.id, label: p.name, detail: p.role })),
  ]);

  readonly itemChips = computed<Chip[]>(() => [
    { value: '', label: 'Any item' },
    ...this.items.choices().map((i) => ({ value: i.id, label: i.name, detail: i.unit })),
  ]);

  readonly activeCount = computed(() => {
    const filters = this.filters();
    const activeValues = [
      filters.search,
      filters.vendorId,
      filters.paidById,
      filters.itemId,
      filters.from,
      filters.to,
    ];
    return (
      activeValues.filter(Boolean).length + (filters.sort && filters.sort !== 'recent' ? 1 : 0)
    );
  });

  readonly filtered = computed(() => this.activeCount() > 0);

  readonly matchLine = computed(() => {
    const total = this.expenses.total();
    const noun = total === 1 ? 'expense' : 'expenses';
    return `${total} ${noun} matching · ${this.money(this.expenses.totalAmount())}`;
  });

  private readonly debouncedSearch = debounce<string>((text) => {
    this.search.set(text);
    this.apply();
  });

  constructor() {
    effect(() => {
      const filters = this.filters();
      this.search.set(filters.search ?? '');
      this.vendorId.set(filters.vendorId ?? '');
      this.paidById.set(filters.paidById ?? '');
      this.itemId.set(filters.itemId ?? '');
      this.from.set(filters.from ?? '');
      this.to.set(filters.to ?? '');
      this.sort.set(filters.sort ?? 'recent');
      void this.expenses.load(this.project().id, {
        ...filters,
        includeArchived: untracked(this.includeArchived),
      });
    });
    queueMicrotask(() => {
      void this.budget.load(this.project().id);
      void this.vendors.loadChoices();
      void this.people.loadChoices();
      void this.items.loadChoices();
    });
    inject(DestroyRef).onDestroy(() => this.debouncedSearch.cancel());
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  onSearch(event: Event): void {
    this.debouncedSearch.call(this.value(event));
  }

  setFilter(field: 'vendorId' | 'paidById' | 'itemId', value: string): void {
    this[field].set(value);
    this.apply();
  }

  pickSort(value: string): void {
    this.sort.set((value as ExpenseSort) || 'recent');
    this.apply();
  }

  setDate(field: 'from' | 'to', event: Event): void {
    this[field].set(this.value(event));
    this.apply();
  }

  toggleFilters(): void {
    this.showFilters.update((open) => !open);
  }

  clear(): void {
    this.debouncedSearch.cancel();
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

  /** Filters are stored in the URL query; the route effect reloads the list when it changes. */
  private apply(): void {
    this.assigning.set(false);
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

  usedPercent(variancePercent: number): string {
    return `${(100 + variancePercent).toFixed(1)}%`;
  }

  categoryName(expense: ExpenseRead): string {
    if (!expense.category_id) {
      return 'Uncategorised';
    }
    return (
      this.budget.categories().find((s) => s.id === expense.category_id)?.name ?? 'Uncategorised'
    );
  }

  detailLine(expense: ExpenseRead): string {
    const parts: string[] = [];
    if (expense.cost_type) {
      parts.push(expense.cost_type);
    }
    if (expense.quantity !== null && expense.unit_rate !== null) {
      parts.push(`${Number(expense.quantity)} × ${this.money(expense.unit_rate)}`);
    }
    return parts.join(' · ');
  }

  attachmentTitle(expense: ExpenseRead): string {
    const count = expense.attachment_count;
    return count === 1 ? '1 attachment' : `${count} attachments`;
  }

  openDrawer(): void {
    this.editingExpense.set(null);
    this.drawerOpen.set(true);
  }

  edit(expense: ExpenseRead): void {
    this.editingExpense.set(expense);
    this.drawerOpen.set(true);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
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

  startAssigning(): void {
    this.assigning.set(true);
    this.selected.set(new Set());
    this.bulkCategoryId.set('');
    void this.expenses.loadForCategory(this.project().id, UNCATEGORISED);
  }

  stopAssigning(): void {
    this.assigning.set(false);
    this.selected.set(new Set());
    this.bulkCategoryId.set('');
  }

  async goToUncategorised(page: number): Promise<void> {
    await this.expenses.loadForCategory(this.project().id, UNCATEGORISED, page);
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.selected.set(new Set());
    } else {
      this.selected.set(new Set(this.uncategorised().map((e) => e.id)));
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

  async assignSelected(): Promise<void> {
    if (!this.canAssign()) {
      return;
    }
    const count = await this.expenses.categorise(this.project().id, {
      expense_ids: Array.from(this.selected()),
      category_id: this.bulkCategoryId(),
    });
    if (count === null) {
      this.toast.show(
        this.expenses.error() ?? 'Could not assign a category to those expenses.',
        'error',
      );
      return;
    }
    this.toast.show(`${count} expense${count === 1 ? '' : 's'} assigned.`, 'success');
    this.selected.set(new Set());
    this.bulkCategoryId.set('');
    await this.expenses.loadForCategory(this.project().id, UNCATEGORISED, this.uncategorisedPage());
    if (this.uncategorisedTotal() === 0) {
      this.stopAssigning();
    }
  }

  async archive(expenseId: string): Promise<void> {
    await this.expenses.archive(this.project().id, expenseId);
    this.toast.show('Expense archived. Show archived to restore it.');
  }

  async restore(expenseId: string): Promise<void> {
    await this.expenses.restore(this.project().id, expenseId);
    this.toast.show('Expense restored.');
  }

  requestDelete(id: string): void {
    this.pendingDelete.set(id);
    this.deleteConfirmationText.set('');
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
    this.deleteConfirmationText.set('');
  }

  canConfirmDelete(): boolean {
    return this.deleteConfirmationText().trim() === 'DELETE';
  }

  async deletePermanently(expenseId: string): Promise<void> {
    if (!this.canConfirmDelete()) {
      return;
    }
    await this.expenses.delete(this.project().id, expenseId);
    this.cancelDelete();
    this.toast.show('Expense permanently deleted.');
  }

  async setIncludeArchived(on: boolean): Promise<void> {
    this.assigning.set(false);
    this.includeArchived.set(on);
    await this.expenses.load(this.project().id, { ...this.filters(), includeArchived: on });
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }
}
