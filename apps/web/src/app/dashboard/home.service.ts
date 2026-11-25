import { Injectable, inject, signal } from '@angular/core';
import {
  Api,
  HomeLatest,
  HomeMonths,
  HomeProject,
  HomeProjects,
  HomeSummary,
  getHomeLatest,
  getHomeMonths,
  getHomeProjects,
  getHomeSummary,
} from '@setout/api-client';
import { detailOf } from '../api-error';
import { PICKER_PAGE_SIZE } from '../ui/paging';
import { LoadTracker } from '../ui/request-status';

const LOAD_ERROR = 'Could not load Home.';

@Injectable({
  providedIn: 'root',
})
export class HomeService {
  private readonly api = inject(Api);

  private readonly tracker = new LoadTracker();

  readonly currency = signal<string | null>(null);
  readonly summary = signal<HomeSummary | null>(null);
  readonly months = signal<HomeMonths | null>(null);
  readonly projects = signal<HomeProjects | null>(null);
  readonly recent = signal<HomeLatest | null>(null);
  readonly status = this.tracker.status;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    const requestId = this.tracker.start();
    this.loading.set(true);
    this.error.set(null);
    const summary = await this.read(() => this.api.invoke(getHomeSummary, this.currencyParams()));
    if (!this.tracker.settle(requestId, summary ? 'ready' : 'error')) {
      return;
    }
    this.summary.set(summary);
    if (summary?.currency_code && !this.currency()) {
      this.currency.set(summary.currency_code);
    }
    this.loading.set(false);
    await this.loadSections();
  }

  async selectCurrency(code: string): Promise<void> {
    if (code === this.currency()) {
      return;
    }
    this.currency.set(code);
    this.months.set(null);
    this.projects.set(null);
    this.recent.set(null);
    await this.load();
  }

  private async loadSections(): Promise<void> {
    await Promise.all([
      this.read(() => this.api.invoke(getHomeMonths, this.currencyParams())).then((response) =>
        this.months.set(response),
      ),
      this.read(() => this.loadAllProjects()).then((response) => this.projects.set(response)),
      this.read(() => this.api.invoke(getHomeLatest, this.currencyParams())).then((response) =>
        this.recent.set(response),
      ),
    ]);
  }

  private async loadAllProjects(): Promise<HomeProjects> {
    const params = this.currencyParams();
    const rows: HomeProject[] = [];
    let last: HomeProjects | null = null;
    let total = Infinity;
    while (rows.length < total) {
      const response = await this.api.invoke(getHomeProjects, {
        ...params,
        limit: PICKER_PAGE_SIZE,
        offset: rows.length,
      });
      last = response;
      total = response.total;
      rows.push(...response.rows);
      if (response.rows.length === 0) {
        break;
      }
    }
    return {
      rows,
      total: last?.total ?? rows.length,
      limit: last?.limit ?? PICKER_PAGE_SIZE,
      offset: 0,
    };
  }

  private currencyParams(): { currency: string | null } {
    return { currency: this.currency() };
  }

  private async read<R>(call: () => Promise<R>): Promise<R | null> {
    try {
      return await call();
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? LOAD_ERROR);
      return null;
    }
  }
}
