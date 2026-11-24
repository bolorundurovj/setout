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

  private requestSeq = 0;

  async search(query: string): Promise<void> {
    const term = query.trim();
    const requestId = ++this.requestSeq;
    if (!term) {
      this.results.set(null);
      this.error.set(null);
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const response = await this.api.invoke(search, { q: term });
      if (requestId !== this.requestSeq) {
        return;
      }
      this.results.set(response);
    } catch (e: unknown) {
      if (requestId !== this.requestSeq) {
        return;
      }
      this.results.set(null);
      this.error.set(detailOf(e) ?? 'Could not search.');
    } finally {
      if (requestId === this.requestSeq) {
        this.loading.set(false);
      }
    }
  }
}
