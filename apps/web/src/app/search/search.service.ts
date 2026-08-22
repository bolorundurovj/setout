import { Injectable, inject, signal } from '@angular/core';
import { Api, SearchResults, search } from '@setout/api-client';
import { detailOf } from '../api-error';

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  private readonly api = inject(Api);

  readonly results = signal<SearchResults | null>(null);
  readonly looking = signal(false);
  readonly error = signal<string | null>(null);

  async look(query: string): Promise<void> {
    const wanted = query.trim();
    if (!wanted) {
      this.results.set(null);
      return;
    }
    this.looking.set(true);
    this.error.set(null);
    try {
      this.results.set(await this.api.invoke(search, { q: wanted }));
    } catch (e: unknown) {
      this.results.set(null);
      this.error.set(detailOf(e) ?? 'Could not search the record.');
    } finally {
      this.looking.set(false);
    }
  }
}
