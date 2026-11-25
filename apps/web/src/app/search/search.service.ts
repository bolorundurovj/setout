import { Injectable, inject, signal } from '@angular/core';
import { Api, SearchResults, search } from '@setout/api-client';
import { detailOf } from '../api-error';
import { LoadTracker } from '../ui/request-status';

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  private readonly api = inject(Api);

  private readonly tracker = new LoadTracker();

  readonly results = signal<SearchResults | null>(null);
  readonly status = this.tracker.status;
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async search(query: string): Promise<void> {
    const term = query.trim();
    if (!term) {
      this.tracker.reset();
      this.results.set(null);
      this.error.set(null);
      this.loading.set(false);
      return;
    }
    const requestId = this.tracker.start();
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await this.api.invoke(search, { q: term });
      if (!this.tracker.settle(requestId, 'ready')) {
        return;
      }
      this.results.set(response);
    } catch (e: unknown) {
      if (!this.tracker.settle(requestId, 'error')) {
        return;
      }
      this.results.set(null);
      this.error.set(detailOf(e) ?? 'Could not search.');
    } finally {
      if (this.tracker.isCurrent(requestId)) {
        this.loading.set(false);
      }
    }
  }
}
