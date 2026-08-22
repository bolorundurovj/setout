import { Injectable, inject, signal } from '@angular/core';
import { detailOf } from '../api-error';
import {
  Api,
  ItemCreate,
  ItemLastPrice,
  ItemPrices,
  ItemRead,
  ItemUpdate,
  createItem,
  deleteItem,
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

  readonly items = this.state.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly page = this.pageState.asReadonly();
  // Every choice for the pickers, which cannot work off one page of the table.
  readonly choices = this.choiceState.asReadonly();
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  private asked = 0;

  async load(search?: string): Promise<void> {
    this.searchState.set(search ?? '');
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
    const ticket = ++this.asked;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.api.invoke(listItems, {
        search: this.searchState() || undefined,
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      if (ticket !== this.asked) {
        return;
      }
      this.state.set(rows.items);
      this.totalState.set(rows.total);
      this.pageState.set(page);
    } catch {
      if (ticket !== this.asked) {
        return;
      }
      this.error.set('Could not load the items.');
    } finally {
      if (ticket === this.asked) {
        this.loading.set(false);
      }
    }
  }

  private async refresh(): Promise<void> {
    const here = this.pageState();
    await this.goTo(here);
    if (this.state().length === 0 && here > 1) {
      await this.goTo(here - 1);
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
      this.error.set(detailOf(e) ?? 'Could not add that item.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async edit(itemId: string, body: ItemUpdate): Promise<ItemRead | null> {
    this.error.set(null);
    try {
      const updated = await this.api.invoke(updateItem, { item_id: itemId, body });
      this.state.update((rows) => rows.map((row) => (row.id === itemId ? updated : row)));
      return updated;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save that item.');
      return null;
    }
  }

  async remove(itemId: string): Promise<void> {
    await this.api.invoke(deleteItem, { item_id: itemId });
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
      const resp = await this.api.invoke(getItemLastPrice, {
        project_id: projectId,
        item_id: itemId,
      });
      return resp.last_price;
    } catch {
      return null;
    }
  }
}
