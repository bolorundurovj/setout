import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Api,
  CostType,
  BudgetItemRead,
  ProjectBudget,
  CategoryCreate,
  CategoryPresetRead,
  CategoryRead,
  archiveBudgetItem,
  archiveCategory,
  createBudgetItem,
  createCategory,
  deleteBudgetItem,
  deleteCategory,
  restoreBudgetItem,
  restoreCategory,
  updateBudgetItem,
  getProjectBudget,
  listBudgetItems,
  listCategoryPresets,
  updateCategory,
} from '@setout/api-client';
import { detailOf } from '../api-error';
import { PICKER_PAGE_SIZE } from '../ui/paging';
import { KeyedLoadTracker, LoadTracker, type RequestStatus } from '../ui/request-status';

@Injectable({
  providedIn: 'root',
})
export class BudgetService {
  private readonly api = inject(Api);

  private readonly budgetState = signal<ProjectBudget | null>(null);
  private readonly itemState = signal<Record<string, BudgetItemRead[]>>({});
  private readonly presetState = signal<CategoryPresetRead[]>([]);

  private readonly tracker = new LoadTracker();
  private readonly itemTracker = new KeyedLoadTracker();

  readonly budget = this.budgetState.asReadonly();
  readonly status = this.tracker.status;
  readonly items = this.itemState.asReadonly();
  readonly presetNames = computed(() => this.presetState().map((preset) => preset.name));
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly categories = computed<CategoryRead[]>(() => this.budgetState()?.categories ?? []);
  readonly categoryNames = computed(
    () => new Map(this.categories().map((category) => [category.id, category.name])),
  );
  readonly budgetedTotal = computed(() => this.budgetState()?.budgeted_amount ?? 0);

  async load(projectId: string, includeArchived = false, quiet = false): Promise<void> {
    const requestId = this.tracker.start(quiet);
    this.loading.set(true);
    this.error.set(null);
    try {
      const budget = await this.api.invoke(getProjectBudget, {
        project_id: projectId,
        include_archived: includeArchived,
      });
      if (this.tracker.settle(requestId, 'ready')) {
        this.budgetState.set(budget);
      }
    } catch {
      if (this.tracker.settle(requestId, 'error')) {
        this.error.set('Could not load the budget.');
      }
    } finally {
      if (this.tracker.isCurrent(requestId)) {
        this.loading.set(false);
      }
    }
  }

  itemStatus(categoryId: string): RequestStatus {
    return this.itemTracker.status(categoryId);
  }

  async loadPresets(): Promise<void> {
    if (this.presetState().length > 0) {
      return;
    }
    try {
      this.presetState.set(await this.api.invoke(listCategoryPresets));
    } catch {
      this.presetState.set([]);
    }
  }

  async loadItems(categoryId: string, includeArchived = false, quiet = false): Promise<void> {
    const requestId = this.itemTracker.start(categoryId, quiet);
    try {
      const rows: BudgetItemRead[] = [];
      let total = Infinity;
      while (rows.length < total) {
        const page = await this.api.invoke(listBudgetItems, {
          category_id: categoryId,
          include_archived: includeArchived,
          limit: PICKER_PAGE_SIZE,
          offset: rows.length,
        });
        total = page.total;
        rows.push(...page.items);
        if (page.items.length === 0) {
          break;
        }
      }
      if (this.itemTracker.settle(categoryId, requestId, 'ready')) {
        this.itemState.update((all) => ({ ...all, [categoryId]: rows }));
      }
    } catch {
      if (this.itemTracker.settle(categoryId, requestId, 'error')) {
        this.error.set('Could not load the budget items.');
      }
    }
  }

  async addCategory(projectId: string, body: CategoryCreate): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(createCategory, { project_id: projectId, body });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not add the category.');
      return false;
    }
    await this.load(projectId, false, true);
    return true;
  }

  async renameCategory(projectId: string, categoryId: string, name: string): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(updateCategory, { category_id: categoryId, body: { name } });
      await this.load(projectId, false, true);
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not rename the category.');
      return false;
    }
  }

  async archiveCategory(
    projectId: string,
    categoryId: string,
    includeArchived = false,
  ): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(archiveCategory, { category_id: categoryId });
      await this.load(projectId, includeArchived, true);
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not archive the category.');
      return false;
    }
  }

  async restoreCategory(
    projectId: string,
    categoryId: string,
    includeArchived = false,
  ): Promise<boolean> {
    try {
      await this.api.invoke(restoreCategory, { category_id: categoryId });
      await this.load(projectId, includeArchived, true);
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not restore the category.');
      return false;
    }
  }

  async deleteCategory(
    projectId: string,
    categoryId: string,
    includeArchived = true,
  ): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(deleteCategory, { category_id: categoryId });
      await this.load(projectId, includeArchived, true);
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not delete the category.');
      return false;
    }
  }

  async addItem(
    projectId: string,
    categoryId: string,
    description: string,
    budgetedAmount: number,
    costType: CostType | null = null,
    includeArchived: boolean | null = false,
  ): Promise<void> {
    await this.api.invoke(createBudgetItem, {
      category_id: categoryId,
      body: { description, budgeted_amount: budgetedAmount, cost_type: costType },
    });
    await Promise.all([
      this.load(projectId, false, true),
      includeArchived === null ? undefined : this.loadItems(categoryId, includeArchived, true),
    ]);
  }

  async updateItem(
    projectId: string,
    categoryId: string,
    itemId: string,
    budgetedAmount: number,
    includeArchived: boolean | null = false,
  ): Promise<void> {
    await this.api.invoke(updateBudgetItem, {
      item_id: itemId,
      body: { budgeted_amount: budgetedAmount },
    });
    await Promise.all([
      this.load(projectId, false, true),
      includeArchived === null ? undefined : this.loadItems(categoryId, includeArchived, true),
    ]);
  }

  async archiveItem(
    projectId: string,
    categoryId: string,
    itemId: string,
    includeArchived = false,
  ): Promise<void> {
    await this.api.invoke(archiveBudgetItem, { item_id: itemId });
    await Promise.all([
      this.load(projectId, false, true),
      this.loadItems(categoryId, includeArchived, true),
    ]);
  }

  async restoreItem(projectId: string, categoryId: string, itemId: string): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(restoreBudgetItem, { item_id: itemId });
      await Promise.all([
        this.load(projectId, false, true),
        this.loadItems(categoryId, true, true),
      ]);
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not restore that budget item.');
      return false;
    }
  }

  async deleteItem(
    projectId: string,
    categoryId: string,
    itemId: string,
    includeArchived = true,
  ): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(deleteBudgetItem, { item_id: itemId });
      await Promise.all([
        this.load(projectId, false, true),
        this.loadItems(categoryId, includeArchived, true),
      ]);
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not delete that budget item.');
      return false;
    }
  }
}
