import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Api,
  CurrencyRead,
  ProjectCreate,
  ProjectRead,
  ProjectSummary,
  ProjectUpdate,
  createProject,
  deleteProject,
  getProject,
  getProjectSummary,
  listCurrencies,
  listProjects,
  restoreProject,
  updateProject,
} from '@setout/api-client';
import { CountsService } from '../counts.service';
import { detailOf } from '../api-error';
import { SCROLL_SIZE } from '../ui/paging';

@Injectable({
  providedIn: 'root',
})
export class ProjectService {
  private readonly api = inject(Api);
  private readonly counts = inject(CountsService);

  private readonly state = signal<ProjectRead[]>([]);
  private readonly currencyState = signal<CurrencyRead[]>([]);
  private readonly summaryState = signal<ProjectSummary | null>(null);
  private readonly totalState = signal(0);
  private readonly offsetState = signal(0);
  private readonly includeDeletedState = signal(false);

  readonly projects = this.state.asReadonly();
  readonly currencies = this.currencyState.asReadonly();
  readonly summary = this.summaryState.asReadonly();
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly hasProjects = computed(() => this.state().length > 0);
  readonly total = this.totalState.asReadonly();
  readonly hasMore = computed(() => this.state().length < this.totalState());

  async load(includeDeleted = false): Promise<void> {
    this.includeDeletedState.set(includeDeleted);
    this.offsetState.set(0);
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.api.invoke(listProjects, {
        include_deleted: includeDeleted,
        limit: SCROLL_SIZE,
        offset: 0,
      });
      this.state.set(page.items);
      this.totalState.set(page.total);
      this.offsetState.set(page.items.length);
    } catch {
      this.error.set('Could not load projects.');
    } finally {
      this.loading.set(false);
    }
    await this.loadSummary();
  }

  async loadMore(): Promise<void> {
    if (this.loading() || !this.hasMore()) {
      return;
    }
    this.loading.set(true);
    try {
      const page = await this.api.invoke(listProjects, {
        include_deleted: this.includeDeletedState(),
        limit: SCROLL_SIZE,
        offset: this.offsetState(),
      });
      this.state.update((projects) => [...projects, ...page.items]);
      this.totalState.set(page.total);
      this.offsetState.update((offset) => offset + page.items.length);
    } catch {
      this.error.set('Could not load more projects.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadSummary(): Promise<void> {
    try {
      this.summaryState.set(await this.api.invoke(getProjectSummary));
    } catch {
      this.summaryState.set(null);
    }
  }

  async get(id: string): Promise<ProjectRead | null> {
    try {
      return await this.api.invoke(getProject, { project_id: id });
    } catch {
      this.error.set('Could not load that project.');
      return null;
    }
  }

  async loadCurrencies(): Promise<void> {
    if (this.currencyState().length > 0) {
      return;
    }
    try {
      this.currencyState.set(await this.api.invoke(listCurrencies));
    } catch {
      this.error.set('Could not load currencies.');
    }
  }

  async create(body: ProjectCreate): Promise<ProjectRead | null> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createProject, { body });
      this.state.update((projects) => [created, ...projects]);
      this.totalState.update((total) => total + 1);
      await this.loadSummary();
      void this.counts.load();
      return created;
    } catch {
      this.error.set('Could not create the project.');
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  async update(id: string, body: ProjectUpdate): Promise<ProjectRead | null> {
    this.error.set(null);
    try {
      const updated = await this.api.invoke(updateProject, { project_id: id, body });
      this.state.update((projects) => projects.map((p) => (p.id === id ? updated : p)));
      await this.loadSummary();
      return updated;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save that project.');
      return null;
    }
  }

  async remove(id: string): Promise<void> {
    await this.api.invoke(deleteProject, { project_id: id });
    this.state.update((projects) => projects.filter((p) => p.id !== id));
    this.totalState.update((total) => Math.max(0, total - 1));
    await this.loadSummary();
    void this.counts.load();
  }

  async restore(id: string): Promise<void> {
    const restored = await this.api.invoke(restoreProject, { project_id: id });
    this.state.update((projects) => projects.map((p) => (p.id === id ? restored : p)));
    await this.loadSummary();
    void this.counts.load();
  }
}
