import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Api,
  CostType,
  BudgetItemRead,
  ProjectBudget,
  ScopeCreate,
  ScopePresetRead,
  ScopeRead,
  addBudgetItem,
  restoreScope,
  updateBudgetItem,
  createScope,
  deleteBudgetItem,
  deleteScope,
  getProjectBudget,
  listBudgetItems,
  listScopePresets,
  updateScope,
} from '@setout/api-client';
import { detailOf } from '../api-error';

@Injectable({
  providedIn: 'root',
})
export class BudgetService {
  private readonly api = inject(Api);

  private readonly budgetState = signal<ProjectBudget | null>(null);
  private readonly itemState = signal<Record<string, BudgetItemRead[]>>({});
  private readonly presetState = signal<ScopePresetRead[]>([]);

  readonly budget = this.budgetState.asReadonly();
  readonly items = this.itemState.asReadonly();
  readonly presetNames = computed(() => this.presetState().map((preset) => preset.name));
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly scopes = computed<ScopeRead[]>(() => this.budgetState()?.scopes ?? []);
  readonly plannedTotal = computed(() => this.budgetState()?.planned_amount ?? 0);

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
      this.presetState.set(await this.api.invoke(listScopePresets));
    } catch {
      this.presetState.set([]);
    }
  }

  async loadItems(scopeId: string): Promise<void> {
    try {
      const page = await this.api.invoke(listBudgetItems, { scope_id: scopeId, limit: 100 });
      this.itemState.update((all) => ({ ...all, [scopeId]: page.items }));
    } catch {
      this.error.set('Could not load the budget items.');
    }
  }

  async addScope(projectId: string, body: ScopeCreate): Promise<void> {
    await this.api.invoke(createScope, { project_id: projectId, body });
    await this.load(projectId);
  }

  async renameScope(projectId: string, scopeId: string, name: string): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(updateScope, { scope_id: scopeId, body: { name } });
      await this.load(projectId);
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not rename that scope.');
      return false;
    }
  }

  async removeScope(projectId: string, scopeId: string): Promise<boolean> {
    this.error.set(null);
    try {
      await this.api.invoke(deleteScope, { scope_id: scopeId });
      await this.load(projectId);
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not remove that scope.');
      return false;
    }
  }

  async putScopeBack(projectId: string, scopeId: string): Promise<boolean> {
    try {
      await this.api.invoke(restoreScope, { scope_id: scopeId });
      await this.load(projectId);
      return true;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not put that scope back.');
      return false;
    }
  }

  async addItem(
    projectId: string,
    scopeId: string,
    description: string,
    plannedAmount: number,
    costType: CostType | null = null,
  ): Promise<void> {
    await this.api.invoke(addBudgetItem, {
      scope_id: scopeId,
      body: { description, planned_amount: plannedAmount, cost_type: costType },
    });
    await this.loadItems(scopeId);
    await this.load(projectId);
  }

  async updateItem(
    projectId: string,
    scopeId: string,
    itemId: string,
    plannedAmount: number,
  ): Promise<void> {
    await this.api.invoke(updateBudgetItem, {
      item_id: itemId,
      body: { planned_amount: plannedAmount },
    });
    await this.loadItems(scopeId);
    await this.load(projectId);
  }

  async removeItem(projectId: string, scopeId: string, itemId: string): Promise<void> {
    await this.api.invoke(deleteBudgetItem, { item_id: itemId });
    await this.loadItems(scopeId);
    await this.load(projectId);
  }
}
