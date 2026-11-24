import { Injectable, inject, signal } from '@angular/core';
import { detailOf } from '../api-error';
import {
  Api,
  BulkCategoriseExpenses,
  ExpenseCreate,
  ExpenseSort,
  ExpenseUpdate,
  ExpenseRead,
  ProjectMonths,
  ProjectExpenseSummary,
  CategorySuggestion,
  archiveExpense,
  categoriseExpenses,
  createExpense,
  deleteExpense,
  getProjectExpenseSummary,
  getProjectMonths,
  listExpenses,
  restoreExpense,
  suggestCategory,
  updateExpense,
} from '@setout/api-client';
import { PAGE_SIZE, offsetOf } from '../ui/paging';

/** Placeholder category id for expenses without a category. */
export const UNCATEGORISED = 'uncategorised';

export interface ExpensePage {
  rows: ExpenseRead[];
  total: number;
  page: number;
}

export interface ExpenseFilters {
  search?: string;
  vendorId?: string;
  paidById?: string;
  itemId?: string;
  from?: string;
  to?: string;
  sort?: ExpenseSort;
  includeArchived?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  private readonly api = inject(Api);

  private readonly state = signal<ExpenseRead[]>([]);
  private readonly summaryState = signal<ProjectExpenseSummary | null>(null);
  private readonly totalState = signal(0);
  private readonly pageState = signal(1);
  // Keyed by project and then category or month, so one project's rows never show in another.
  private readonly byCategoryState = signal<Record<string, ExpensePage>>({});
  private readonly monthsState = signal<ProjectMonths | null>(null);
  private readonly byMonthState = signal<Record<string, ExpensePage>>({});
  private readonly filterState = signal<ExpenseFilters>({});
  private readonly totalAmountState = signal(0);

  readonly expenses = this.state.asReadonly();
  readonly summary = this.summaryState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly months = this.monthsState.asReadonly();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly page = this.pageState.asReadonly();
  readonly totalAmount = this.totalAmountState.asReadonly();

  /** The loaded page of a project's expenses in one category, if any. */
  categoryPage(projectId: string, categoryId: string): ExpensePage | undefined {
    return this.byCategoryState()[cacheKey(projectId, categoryId)];
  }

  /** The loaded page of a project's expenses in one month, if any. */
  monthPage(projectId: string, month: string): ExpensePage | undefined {
    return this.byMonthState()[cacheKey(projectId, month)];
  }

  async load(projectId: string, filters: ExpenseFilters = {}): Promise<void> {
    this.filterState.set(filters);
    await this.goTo(projectId, 1);
  }

  async goTo(projectId: string, page: number): Promise<void> {
    this.error.set(null);
    try {
      const filters = this.filterState();
      const rows = await this.api.invoke(listExpenses, {
        project_id: projectId,
        search: filters.search || undefined,
        vendor_id: filters.vendorId || undefined,
        paid_by_id: filters.paidById || undefined,
        item_id: filters.itemId || undefined,
        spent_from: filters.from || undefined,
        spent_to: filters.to || undefined,
        sort: filters.sort ?? 'recent',
        include_archived: filters.includeArchived ?? false,
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      this.state.set(rows.items);
      this.totalState.set(rows.total);
      this.totalAmountState.set(rows.total_amount);
      this.pageState.set(page);
    } catch {
      this.error.set('Could not load expenses.');
    }
    await this.loadSummary(projectId);
  }

  async loadSummary(projectId: string): Promise<void> {
    try {
      this.summaryState.set(
        await this.api.invoke(getProjectExpenseSummary, { project_id: projectId }),
      );
    } catch {
      this.summaryState.set(null);
    }
  }

  async loadForCategory(projectId: string, categoryId: string, page = 1): Promise<void> {
    const key = cacheKey(projectId, categoryId);
    try {
      const rows = await this.api.invoke(listExpenses, {
        project_id: projectId,
        category_id: categoryId === UNCATEGORISED ? undefined : categoryId,
        uncategorised_only: categoryId === UNCATEGORISED,
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      this.byCategoryState.update((all) => ({
        ...all,
        [key]: { rows: rows.items, total: rows.total, page },
      }));
    } catch {
      this.byCategoryState.update((all) => ({ ...all, [key]: { rows: [], total: 0, page: 1 } }));
    }
  }

  async loadMonths(projectId: string): Promise<void> {
    this.error.set(null);
    try {
      this.monthsState.set(await this.api.invoke(getProjectMonths, { project_id: projectId }));
    } catch {
      this.monthsState.set(null);
      this.error.set('Could not load the expense summary.');
    }
  }

  async loadForMonth(projectId: string, month: string, page = 1): Promise<void> {
    const key = cacheKey(projectId, month);
    try {
      const rows = await this.api.invoke(listExpenses, {
        project_id: projectId,
        month,
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      this.byMonthState.update((all) => ({
        ...all,
        [key]: { rows: rows.items, total: rows.total, page },
      }));
    } catch {
      this.byMonthState.update((all) => ({ ...all, [key]: { rows: [], total: 0, page: 1 } }));
    }
  }

  async suggestCategory(
    projectId: string,
    itemId?: string,
    vendorId?: string,
  ): Promise<CategorySuggestion | null> {
    try {
      return await this.api.invoke(suggestCategory, {
        project_id: projectId,
        item_id: itemId || undefined,
        vendor_id: vendorId || undefined,
      });
    } catch {
      return null;
    }
  }

  async add(projectId: string, body: ExpenseCreate): Promise<ExpenseRead | null> {
    if (this.saving()) return null;
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createExpense, { project_id: projectId, body });
      await this.goTo(projectId, this.pageState());
      await this.reloadCached(projectId);
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save the expense.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async update(
    projectId: string,
    expenseId: string,
    body: ExpenseUpdate,
  ): Promise<ExpenseRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const updated = await this.api.invoke(updateExpense, { expense_id: expenseId, body });
      this.state.update((rows) => rows.map((row) => (row.id === expenseId ? updated : row)));
      await this.loadSummary(projectId);
      await this.reloadCached(projectId);
      return updated;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not update the expense.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async categorise(projectId: string, body: BulkCategoriseExpenses): Promise<number | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.api.invoke(categoriseExpenses, { project_id: projectId, body });
      await this.refresh(projectId);
      await this.loadSummary(projectId);
      return result.categorised_count;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not assign a category to those expenses.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async archive(projectId: string, expenseId: string): Promise<void> {
    await this.api.invoke(archiveExpense, { expense_id: expenseId });
    await this.refresh(projectId);
  }

  async restore(projectId: string, expenseId: string): Promise<void> {
    await this.api.invoke(restoreExpense, { expense_id: expenseId });
    await this.refresh(projectId);
  }

  async delete(projectId: string, expenseId: string): Promise<void> {
    await this.api.invoke(deleteExpense, { expense_id: expenseId });
    await this.refresh(projectId);
  }

  private async refresh(projectId: string): Promise<void> {
    const currentPage = this.pageState();
    await this.goTo(projectId, currentPage);
    if (this.state().length === 0 && currentPage > 1) {
      await this.goTo(projectId, currentPage - 1);
    }
    await this.reloadCached(projectId);
  }

  /** Reload a project's cached category and month pages so they don't show stale rows. */
  private async reloadCached(projectId: string): Promise<void> {
    const prefix = cacheKey(projectId, '');
    const reloads: Promise<void>[] = [];
    for (const [key, cached] of Object.entries(this.byCategoryState())) {
      if (key.startsWith(prefix)) {
        reloads.push(this.loadForCategory(projectId, key.slice(prefix.length), cached.page));
      }
    }
    for (const [key, cached] of Object.entries(this.byMonthState())) {
      if (key.startsWith(prefix)) {
        reloads.push(this.loadForMonth(projectId, key.slice(prefix.length), cached.page));
      }
    }
    await Promise.all(reloads);
  }
}

function cacheKey(projectId: string, id: string): string {
  return `${projectId}/${id}`;
}
