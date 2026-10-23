import { Injectable, inject, signal } from '@angular/core';
import {
  Api,
  HomeLatest,
  HomeMonths,
  HomeProjects,
  HomeSummary,
  getHomeLatest,
  getHomeMonths,
  getHomeProjects,
  getHomeSummary,
} from '@setout/api-client';
import { detailOf } from '../api-error';

const LOAD_ERROR = 'Could not load Home.';

@Injectable({
  providedIn: 'root',
})
export class HomeService {
  private readonly api = inject(Api);

  readonly currency = signal<string | null>(null);
  readonly summary = signal<HomeSummary | null>(null);
  readonly months = signal<HomeMonths | null>(null);
  readonly projects = signal<HomeProjects | null>(null);
  readonly recent = signal<HomeLatest | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const summary = await this.read(() => this.api.invoke(getHomeSummary, this.currencyParams()));
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
      this.read(() => this.api.invoke(getHomeProjects, this.currencyParams())).then((response) =>
        this.projects.set(response),
      ),
      this.read(() => this.api.invoke(getHomeLatest, this.currencyParams())).then((response) =>
        this.recent.set(response),
      ),
    ]);
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
