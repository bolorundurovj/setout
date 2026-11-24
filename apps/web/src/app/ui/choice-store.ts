import { computed, signal } from '@angular/core';
import { PICKER_PAGE_SIZE } from './paging';

export interface ChoicePage<T> {
  items: T[];
  total: number;
}

/**
 * Holds server-searched, paginated choices for a picker without disturbing the
 * entity service's main paged list.
 */
export class ChoiceStore<T extends { id: string }> {
  private readonly itemsState = signal<T[]>([]);
  private readonly totalState = signal(0);
  private readonly loadingState = signal(false);
  private query = '';
  private requestSeq = 0;

  readonly items = this.itemsState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly hasMore = computed(() => this.itemsState().length < this.totalState());

  constructor(
    private readonly fetch: (params: {
      search?: string;
      limit: number;
      offset: number;
    }) => Promise<ChoicePage<T>>,
  ) {}

  async load(search = ''): Promise<void> {
    const trimmed = search.trim();
    this.query = trimmed;
    const requestId = ++this.requestSeq;
    this.loadingState.set(true);
    try {
      const page = await this.fetch({
        search: trimmed || undefined,
        limit: PICKER_PAGE_SIZE,
        offset: 0,
      });
      if (requestId !== this.requestSeq) {
        return;
      }
      this.itemsState.set(page.items);
      this.totalState.set(page.total);
    } catch {
      if (requestId !== this.requestSeq) {
        return;
      }
      this.itemsState.set([]);
      this.totalState.set(0);
    } finally {
      if (requestId === this.requestSeq) {
        this.loadingState.set(false);
      }
    }
  }

  async loadMore(): Promise<void> {
    if (this.loadingState() || !this.hasMore()) {
      return;
    }
    const requestId = this.requestSeq;
    const offset = this.itemsState().length;
    this.loadingState.set(true);
    try {
      const page = await this.fetch({
        search: this.query || undefined,
        limit: PICKER_PAGE_SIZE,
        offset,
      });
      if (requestId !== this.requestSeq) {
        return;
      }
      const existing = this.itemsState();
      const seen = new Set(existing.map((row) => row.id));
      const added = page.items.filter((row) => !seen.has(row.id));
      this.itemsState.set([...existing, ...added]);
      this.totalState.set(page.total);
    } catch {
      // Keep the rows already loaded if fetching the next page fails.
    } finally {
      if (requestId === this.requestSeq) {
        this.loadingState.set(false);
      }
    }
  }

  prepend(row: T): void {
    const existing = this.itemsState();
    if (existing.some((item) => item.id === row.id)) {
      return;
    }
    this.itemsState.set([row, ...existing]);
    this.totalState.update((total) => total + 1);
  }
}
