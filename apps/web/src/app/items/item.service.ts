import { Injectable, inject, signal } from '@angular/core';
import { detailOf } from '../api-error';
import {
  Api,
  ItemCreate,
  ItemLastPrice,
  ItemPricePoint,
  ItemPrices,
  ItemRead,
  ItemUpdate,
  archiveItem,
  createItem,
  deleteItem,
  getItemLastPrice,
  getItemPrices,
  listItems,
  restoreItem,
  updateItem,
} from '@setout/api-client';
import { CountsService } from '../counts.service';
import { ChoiceStore } from '../ui/choice-store';
import { LoadTracker } from '../ui/request-status';
import { PAGE_SIZE, PICKER_PAGE_SIZE, offsetOf } from '../ui/paging';

@Injectable({
  providedIn: 'root',
})
export class ItemService {
  private readonly api = inject(Api);
  private readonly counts = inject(CountsService);

  private readonly state = signal<ItemRead[]>([]);
  private readonly totalState = signal(0);
  private readonly pageState = signal(1);
  private readonly searchState = signal('');
  private readonly archivedState = signal(false);
  private readonly choiceStore = new ChoiceStore<ItemRead>((params) =>
    this.api.invoke(listItems, params),
  );

  private readonly tracker = new LoadTracker();

  readonly items = this.state.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly status = this.tracker.status;
  readonly page = this.pageState.asReadonly();
  readonly choices = this.choiceStore.items;
  readonly choicesTotal = this.choiceStore.total;
  readonly choicesHasMore = this.choiceStore.hasMore;
  readonly choicesLoading = this.choiceStore.loading;
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  async load(search?: string, includeArchived = false): Promise<void> {
    this.searchState.set(search ?? '');
    this.archivedState.set(includeArchived);
    await this.goTo(1);
  }

  async loadChoices(search = ''): Promise<void> {
    await this.choiceStore.load(search);
  }

  async loadMoreChoices(): Promise<void> {
    await this.choiceStore.loadMore();
  }

  async goTo(page: number, quiet = false): Promise<void> {
    const requestId = this.tracker.start(quiet);
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.api.invoke(listItems, {
        search: this.searchState() || undefined,
        include_archived: this.archivedState(),
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      if (!this.tracker.settle(requestId, 'ready')) {
        return;
      }
      this.state.set(rows.items);
      this.totalState.set(rows.total);
      this.pageState.set(page);
    } catch {
      if (!this.tracker.settle(requestId, 'error')) {
        return;
      }
      this.error.set('Could not load the items.');
    } finally {
      if (this.tracker.isCurrent(requestId)) {
        this.loading.set(false);
      }
    }
  }

  private async refresh(): Promise<void> {
    const currentPage = this.pageState();
    await this.goTo(currentPage, true);
    if (this.state().length === 0 && currentPage > 1) {
      await this.goTo(currentPage - 1, true);
    }
  }

  async add(body: ItemCreate): Promise<ItemRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createItem, { body });
      await this.goTo(this.pageState());
      this.choiceStore.prepend(created);
      void this.counts.load();
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not add the item.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async update(itemId: string, body: ItemUpdate): Promise<ItemRead | null> {
    if (this.saving()) return null;
    this.saving.set(true);
    this.error.set(null);
    try {
      const updated = await this.api.invoke(updateItem, { item_id: itemId, body });
      this.state.update((rows) => rows.map((row) => (row.id === itemId ? updated : row)));
      return updated;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save the item.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async archive(itemId: string): Promise<void> {
    await this.api.invoke(archiveItem, { item_id: itemId });
    await this.refresh();
    void this.counts.load();
  }

  async restore(itemId: string): Promise<void> {
    await this.api.invoke(restoreItem, { item_id: itemId });
    await this.refresh();
    void this.counts.load();
  }

  async delete(itemId: string): Promise<void> {
    await this.api.invoke(deleteItem, { item_id: itemId });
    await this.refresh();
    void this.counts.load();
  }

  async prices(itemId: string): Promise<ItemPrices | null> {
    try {
      let first: ItemPrices | null = null;
      const pointsByCurrency: Record<string, ItemPricePoint[]> = {};
      let offset = 0;
      for (;;) {
        const page = await this.api.invoke(getItemPrices, {
          item_id: itemId,
          limit: PICKER_PAGE_SIZE,
          offset,
        });
        first ??= page;
        for (const series of page.series) {
          (pointsByCurrency[series.currency_code] ??= []).push(...series.points);
        }
        const exhausted = page.series.every(
          (series) => (pointsByCurrency[series.currency_code]?.length ?? 0) >= series.points_total,
        );
        const empty = page.series.every((series) => series.points.length === 0);
        if (exhausted || empty) {
          break;
        }
        offset += PICKER_PAGE_SIZE;
      }
      return first
        ? {
            ...first,
            series: first.series.map((series) => ({
              ...series,
              points: pointsByCurrency[series.currency_code] ?? [],
            })),
          }
        : null;
    } catch {
      return null;
    }
  }

  async lastPrice(projectId: string, itemId: string): Promise<ItemLastPrice | null> {
    try {
      const response = await this.api.invoke(getItemLastPrice, {
        project_id: projectId,
        item_id: itemId,
      });
      return response.last_price;
    } catch {
      return null;
    }
  }
}
