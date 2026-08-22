import { Injectable, computed, inject, signal } from '@angular/core';
import { Api, Counts, getCounts } from '@setout/api-client';

/**
 * How many of each thing the install holds. The navigation badges read from
 * here rather than from the list pages, which only know what they have paged in
 * and know nothing at all until they are opened.
 */
@Injectable({
  providedIn: 'root',
})
export class CountsService {
  private readonly api = inject(Api);

  private readonly state = signal<Counts | null>(null);

  readonly counts = this.state.asReadonly();

  readonly projects = computed(() => this.state()?.projects ?? 0);
  readonly vendors = computed(() => this.state()?.vendors ?? 0);
  readonly items = computed(() => this.state()?.items ?? 0);
  readonly people = computed(() => this.state()?.people ?? 0);

  async load(): Promise<void> {
    try {
      this.state.set(await this.api.invoke(getCounts, {}));
    } catch {
      this.state.set(null);
    }
  }
}
