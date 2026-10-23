import { Injectable, inject, signal } from '@angular/core';
import { Api, SearchResults, search } from '@setout/api-client';
import { detailOf } from '../api-error';

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  private readonly api = inject(Api);

  readonly results = signal<SearchResults | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async search(query: string): Promise<void> {
    const term = query.trim();
    if (!term) {
      this.results.set(null);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      this.results.set(await this.api.invoke(search, { q: term }));
    } catch (e: unknown) {
      this.results.set(null);
      this.error.set(detailOf(e) ?? 'Could not search.');
    } finally {
      this.loading.set(false);
    }
  }
}
