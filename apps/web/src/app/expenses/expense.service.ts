import { Injectable, inject, signal } from '@angular/core';
import { detailOf } from '../api-error';
import {
  Api,
  BulkFileExpenses,
  ExpenseCreate,
  ExpenseUpdate,
  ExpenseRead,
  ProjectMonths,
  ProjectSpend,
  CategorySuggestion,
  addExpense,
  deleteExpense,
  fileExpenses,
  getProjectMonths,
  getProjectSpend,
  listExpenses,
  restoreExpense,
  suggestCategory,
  updateExpense,
} from '@setout/api-client';
import { PAGE_SIZE, offsetOf } from '../ui/paging';

/** Stands in for a category on rows that hold spend which reached no category. */
export const UNFILED = 'uncategorized';

export interface Nested {
  rows: ExpenseRead[];
  total: number;
  page: number;
}

@Injectable({
  providedIn: 'root',
})
export class ExpenseService {
  private readonly api = inject(Api);

  private readonly state = signal<ExpenseRead[]>([]);
  private readonly spendState = signal<ProjectSpend | null>(null);
  private readonly totalState = signal(0);
  private readonly pageState = signal(1);
  private readonly byCategoryState = signal<Record<string, Nested>>({});
  private readonly monthsState = signal<ProjectMonths | null>(null);
  private readonly byMonthState = signal<Record<string, Nested>>({});

  readonly expenses = this.state.asReadonly();
  readonly spend = this.spendState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly byCategory = this.byCategoryState.asReadonly();
  readonly months = this.monthsState.asReadonly();
  readonly byMonth = this.byMonthState.asReadonly();
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly page = this.pageState.asReadonly();

  async load(projectId: string): Promise<void> {
    await this.goTo(projectId, 1);
  }

  async goTo(projectId: string, page: number): Promise<void> {
    this.error.set(null);
    try {
      const rows = await this.api.invoke(listExpenses, {
        project_id: projectId,
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      this.state.set(rows.items);
      this.totalState.set(rows.total);
      this.pageState.set(page);
    } catch {
      this.error.set('Could not load expenses.');
    }
    await this.loadSpend(projectId);
  }

  async loadSpend(projectId: string): Promise<void> {
    try {
      this.spendState.set(await this.api.invoke(getProjectSpend, { project_id: projectId }));
    } catch {
      this.spendState.set(null);
    }
  }

  async loadForCategory(projectId: string, categoryId: string, page = 1): Promise<void> {
    try {
      const rows = await this.api.invoke(listExpenses, {
        project_id: projectId,
        category_id: categoryId === UNFILED ? undefined : categoryId,
        uncategorized_only: categoryId === UNFILED,
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      this.byCategoryState.update((all) => ({
        ...all,
        [categoryId]: { rows: rows.items, total: rows.total, page },
      }));
    } catch {
      this.byCategoryState.update((all) => ({
        ...all,
        [categoryId]: { rows: [], total: 0, page: 1 },
      }));
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
    try {
      const rows = await this.api.invoke(listExpenses, {
        project_id: projectId,
        month,
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      this.byMonthState.update((all) => ({
        ...all,
        [month]: { rows: rows.items, total: rows.total, page },
      }));
    } catch {
      this.byMonthState.update((all) => ({ ...all, [month]: { rows: [], total: 0, page: 1 } }));
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
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(addExpense, { project_id: projectId, body });
      await this.goTo(projectId, this.pageState());
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
      await this.loadSpend(projectId);
      return updated;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not update the expense.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async file(projectId: string, body: BulkFileExpenses): Promise<number | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const result = await this.api.invoke(fileExpenses, { project_id: projectId, body });
      await this.refresh(projectId);
      await this.loadSpend(projectId);
      return result.filed_count;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not assign those expenses.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async remove(projectId: string, expenseId: string): Promise<void> {
    await this.api.invoke(deleteExpense, { expense_id: expenseId });
    await this.refresh(projectId);
  }

  async restore(projectId: string, expenseId: string): Promise<void> {
    await this.api.invoke(restoreExpense, { expense_id: expenseId });
    await this.refresh(projectId);
  }

  private async refresh(projectId: string): Promise<void> {
    const here = this.pageState();
    await this.goTo(projectId, here);
    if (this.state().length === 0 && here > 1) {
      await this.goTo(projectId, here - 1);
    }
  }
}
