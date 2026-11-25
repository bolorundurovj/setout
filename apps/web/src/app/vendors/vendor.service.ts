import { Injectable, inject, signal } from '@angular/core';
import {
  Api,
  VendorCreate,
  VendorRead,
  VendorAgreement,
  VendorExpenseSummary,
  VendorUpdate,
  archiveVendor,
  createVendor,
  deleteVendor,
  getVendor,
  getVendorAgreements,
  getVendorExpenseSummary,
  listVendors,
  restoreVendor,
  updateVendor,
} from '@setout/api-client';
import { CountsService } from '../counts.service';
import { ChoiceStore } from '../ui/choice-store';
import { LoadTracker } from '../ui/request-status';
import { PAGE_SIZE, PICKER_PAGE_SIZE, offsetOf } from '../ui/paging';
import { detailOf } from '../api-error';

@Injectable({
  providedIn: 'root',
})
export class VendorService {
  private readonly api = inject(Api);
  private readonly counts = inject(CountsService);

  private readonly vendorsState = signal<VendorRead[]>([]);
  private readonly totalState = signal(0);
  private readonly pageState = signal(1);
  private readonly searchState = signal('');
  private readonly archivedState = signal(false);
  private readonly choiceStore = new ChoiceStore<VendorRead>((params) =>
    this.api.invoke(listVendors, params),
  );

  private readonly tracker = new LoadTracker();

  readonly vendors = this.vendorsState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly status = this.tracker.status;
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly page = this.pageState.asReadonly();
  readonly choices = this.choiceStore.items;
  readonly choicesTotal = this.choiceStore.total;
  readonly choicesHasMore = this.choiceStore.hasMore;
  readonly choicesLoading = this.choiceStore.loading;

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
      const rows = await this.api.invoke(listVendors, {
        search: this.searchState() || undefined,
        include_archived: this.archivedState(),
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      if (!this.tracker.settle(requestId, 'ready')) {
        return;
      }
      this.vendorsState.set(rows.items);
      this.totalState.set(rows.total);
      this.pageState.set(page);
    } catch {
      if (!this.tracker.settle(requestId, 'error')) {
        return;
      }
      this.error.set('Could not load the vendors.');
    } finally {
      if (this.tracker.isCurrent(requestId)) {
        this.loading.set(false);
      }
    }
  }

  private async refresh(): Promise<void> {
    const currentPage = this.pageState();
    await this.goTo(currentPage, true);
    if (this.vendorsState().length === 0 && currentPage > 1) {
      await this.goTo(currentPage - 1, true);
    }
  }

  async add(body: VendorCreate): Promise<VendorRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createVendor, { body });
      await this.goTo(this.pageState());
      this.choiceStore.prepend(created);
      void this.counts.load();
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not create the vendor.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async edit(vendorId: string, body: VendorUpdate): Promise<VendorRead | null> {
    if (this.saving()) return null;
    this.saving.set(true);
    this.error.set(null);
    try {
      const updated = await this.api.invoke(updateVendor, { vendor_id: vendorId, body });
      this.vendorsState.update((rows) => rows.map((row) => (row.id === vendorId ? updated : row)));
      return updated;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save the vendor.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async archive(vendorId: string): Promise<void> {
    await this.api.invoke(archiveVendor, { vendor_id: vendorId });
    await this.refresh();
    void this.counts.load();
  }

  async restore(vendorId: string): Promise<void> {
    await this.api.invoke(restoreVendor, { vendor_id: vendorId });
    await this.refresh();
    void this.counts.load();
  }

  async delete(vendorId: string): Promise<void> {
    await this.api.invoke(deleteVendor, { vendor_id: vendorId });
    await this.refresh();
    void this.counts.load();
  }

  async get(vendorId: string): Promise<VendorRead | null> {
    try {
      return await this.api.invoke(getVendor, { vendor_id: vendorId });
    } catch {
      this.error.set('Could not load the vendor.');
      return null;
    }
  }

  async expenseSummary(vendorId: string): Promise<VendorExpenseSummary | null> {
    try {
      return await this.api.invoke(getVendorExpenseSummary, { vendor_id: vendorId });
    } catch {
      return null;
    }
  }

  async agreements(vendorId: string): Promise<VendorAgreement[] | null> {
    try {
      const rows: VendorAgreement[] = [];
      let total = Infinity;
      while (rows.length < total) {
        const body = await this.api.invoke(getVendorAgreements, {
          vendor_id: vendorId,
          limit: PICKER_PAGE_SIZE,
          offset: rows.length,
        });
        total = body.total;
        rows.push(...body.agreements);
        if (body.agreements.length === 0) {
          break;
        }
      }
      return rows;
    } catch {
      return null;
    }
  }
}
