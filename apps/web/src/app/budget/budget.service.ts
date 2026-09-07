import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Api,
  CostType,
  BudgetItemRead,
  ProjectBudget,
  CategoryCreate,
  CategoryPresetRead,
  CategoryRead,
  addBudgetItem,
  restoreCategory,
  updateBudgetItem,
  createCategory,
  deleteBudgetItem,
  deleteCategory,
  getProjectBudget,
  listBudgetItems,
  listCategoryPresets,
  updateCategory,
} from '@setout/api-client';
import { detailOf } from '../api-error';

@Injectable({
  providedIn: 'root',
})
export class BudgetService {
  private readonly api = inject(Api);

  private readonly budgetState = signal<ProjectBudget | null>(null);
  private readonly itemState = signal<Record<string, BudgetItemRead[]>>({});
  private readonly presetState = signal<CategoryPresetRead[]>([]);

  readonly budget = this.budgetState.asReadonly();
  readonly items = this.itemState.asReadonly();
  readonly presetNames = computed(() => this.presetState().map((preset) => preset.name));
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly categories = computed<CategoryRead[]>(() => this.budgetState()?.categories ?? []);
  readonly budgetedTotal = computed(() => this.budgetState()?.budgeted_amount ?? 0);

  async load(projectId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.budgetState.set(await this.api.invoke(getProjectBudget, { project_id: projectId }));
    } catch {
      this.error.set('Could not load the budget.');
    } finally {
      this.loading.set(false);
    }
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

  async loadItems(categoryId: string): Promise<void> {
    try {
      const page = await this.api.invoke(listBudgetItems, { category_id: categoryId, limit: 100 });
      this.itemState.update((all) => ({ ...all, [categoryId]: page.items }));
    } catch {
      this.error.set('Could not load the budget items.');
    }
  }

  async addCategory(projectId: string, body: CategoryCreate): Promise<void> {
    await this.api.invoke(createCategory, { project_id: projectId, body });
    await this.load(projectId);
  }

  async renameCategory(projectId: string, categoryId: string, name: string): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(updateCategory, { category_id: categoryId, body: { name } });
      await this.load(projectId);
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not rename the category.');
      return false;
    }
  }

  async removeCategory(projectId: string, categoryId: string): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(deleteCategory, { category_id: categoryId });
      await this.load(projectId);
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not remove the category.');
      return false;
    }
  }

  async putCategoryBack(projectId: string, categoryId: string): Promise<boolean> {
    try {
      await this.api.invoke(restoreCategory, { category_id: categoryId });
      await this.load(projectId);
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not restore the category.');
      return false;
    }
  }

  async addItem(
    projectId: string,
    categoryId: string,
    description: string,
    budgetedAmount: number,
    costType: CostType | null = null,
  ): Promise<void> {
    await this.api.invoke(addBudgetItem, {
      category_id: categoryId,
      body: { description, budgeted_amount: budgetedAmount, cost_type: costType },
    });
    await this.loadItems(categoryId);
    await this.load(projectId);
  }

  async updateItem(
    projectId: string,
    categoryId: string,
    itemId: string,
    budgetedAmount: number,
  ): Promise<void> {
    await this.api.invoke(updateBudgetItem, {
      item_id: itemId,
      body: { budgeted_amount: budgetedAmount },
    });
    await this.loadItems(categoryId);
    await this.load(projectId);
  }

  async removeItem(projectId: string, categoryId: string, itemId: string): Promise<void> {
    await this.api.invoke(deleteBudgetItem, { item_id: itemId });
    await this.loadItems(categoryId);
    await this.load(projectId);
  }
}
