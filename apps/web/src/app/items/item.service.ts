import { Injectable, inject, signal } from '@angular/core';
import { detailOf } from '../api-error';
import {
  Api,
  ItemCreate,
  ItemLastPrice,
  ItemPrices,
  ItemRead,
  ItemUpdate,
  archiveItem,
  createItem,
  getItemLastPrice,
  getItemPrices,
  listItems,
  restoreItem,
  updateItem,
} from '@setout/api-client';
import { CountsService } from '../counts.service';
import { CHOICE_LIMIT, PAGE_SIZE, offsetOf } from '../ui/paging';

@Injectable({
  providedIn: 'root',
})
export class ItemService {
  private readonly api = inject(Api);
  private readonly counts = inject(CountsService);

  private readonly state = signal<ItemRead[]>([]);
  private readonly totalState = signal(0);
  private readonly pageState = signal(1);
  private readonly choiceState = signal<ItemRead[]>([]);
  private readonly searchState = signal('');
  private readonly archivedState = signal(false);

  readonly items = this.state.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly page = this.pageState.asReadonly();
  // Up to CHOICE_LIMIT rows for the pickers, which cannot page.
  readonly choices = this.choiceState.asReadonly();
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  private latestRequest = 0;

  async load(search?: string, includeArchived = false): Promise<void> {
    this.searchState.set(search ?? '');
    this.archivedState.set(includeArchived);
    await this.goTo(1);
  }

  async loadChoices(): Promise<void> {
    try {
      const rows = await this.api.invoke(listItems, { limit: CHOICE_LIMIT });
      this.choiceState.set(rows.items);
    } catch {
      this.choiceState.set([]);
    }
  }

  async goTo(page: number): Promise<void> {
    const requestId = ++this.latestRequest;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.api.invoke(listItems, {
        search: this.searchState() || undefined,
        include_archived: this.archivedState(),
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      if (requestId !== this.latestRequest) {
        return;
      }
      this.state.set(rows.items);
      this.totalState.set(rows.total);
      this.pageState.set(page);
    } catch {
      if (requestId !== this.latestRequest) {
        return;
      }
      this.error.set('Could not load the items.');
    } finally {
      if (requestId === this.latestRequest) {
        this.loading.set(false);
      }
    }
  }

  private async refresh(): Promise<void> {
    const currentPage = this.pageState();
    await this.goTo(currentPage);
    if (this.state().length === 0 && currentPage > 1) {
      await this.goTo(currentPage - 1);
    }
  }

  async add(body: ItemCreate): Promise<ItemRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createItem, { body });
      await this.goTo(this.pageState());
      this.choiceState.update((rows) => [created, ...rows]);
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
    this.error.set(null);
    try {
      const updated = await this.api.invoke(updateItem, { item_id: itemId, body });
      this.state.update((rows) => rows.map((row) => (row.id === itemId ? updated : row)));
      return updated;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save the item.');
      return null;
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

  async prices(itemId: string): Promise<ItemPrices | null> {
    try {
      return await this.api.invoke(getItemPrices, { item_id: itemId });
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
