import { Injectable, computed, inject, signal } from '@angular/core';
import { Api, Counts, getCounts } from '@setout/api-client';

/**
 * Record totals for the navigation badges. List pages only hold the rows they
 * have paged in, so the totals come from the server.
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
  readonly lands = computed(() => this.state()?.lands ?? 0);

  async load(): Promise<void> {
    try {
      this.state.set(await this.api.invoke(getCounts, {}));
    } catch {
      this.state.set(null);
    }
  }
}
