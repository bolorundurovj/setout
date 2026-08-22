import { Injectable, inject, signal } from '@angular/core';
import {
  Api,
  VendorCreate,
  VendorRead,
  VendorAgreement,
  VendorSpend,
  VendorUpdate,
  createVendor,
  deleteVendor,
  getVendor,
  getVendorAgreements,
  getVendorSpend,
  listVendors,
  restoreVendor,
  updateVendor,
} from '@setout/api-client';
import { CountsService } from '../counts.service';
import { CHOICE_LIMIT, PAGE_SIZE, offsetOf } from '../ui/paging';
import { detailOf } from '../api-error';

@Injectable({
  providedIn: 'root',
})
export class VendorService {
  private readonly api = inject(Api);
  private readonly counts = inject(CountsService);

  private readonly state = signal<VendorRead[]>([]);
  private readonly totalState = signal(0);
  private readonly pageState = signal(1);
  private readonly choiceState = signal<VendorRead[]>([]);
  private readonly searchState = signal('');
  private readonly archivedState = signal(false);

  readonly vendors = this.state.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly page = this.pageState.asReadonly();
  // Every choice for the pickers, which cannot work off one page of the table.
  readonly choices = this.choiceState.asReadonly();

  private asked = 0;

  async load(search?: string, includeArchived = false): Promise<void> {
    this.searchState.set(search ?? '');
    this.archivedState.set(includeArchived);
    await this.goTo(1);
  }

  async loadChoices(): Promise<void> {
    try {
      const rows = await this.api.invoke(listVendors, { limit: CHOICE_LIMIT });
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
      const rows = await this.api.invoke(listVendors, {
        search: this.searchState() || undefined,
        include_archived: this.archivedState(),
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
      this.error.set('Could not load the vendors.');
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

  async add(body: VendorCreate): Promise<VendorRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createVendor, { body });
      await this.goTo(this.pageState());
      this.choiceState.update((rows) => [created, ...rows]);
      void this.counts.load();
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not add that vendor.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async edit(vendorId: string, body: VendorUpdate): Promise<VendorRead | null> {
    this.error.set(null);
    try {
      const updated = await this.api.invoke(updateVendor, { vendor_id: vendorId, body });
      this.state.update((rows) => rows.map((row) => (row.id === vendorId ? updated : row)));
      return updated;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save that vendor.');
      return null;
    }
  }

  async archive(vendorId: string): Promise<void> {
    await this.api.invoke(deleteVendor, { vendor_id: vendorId });
    await this.refresh();
    void this.counts.load();
  }

  async restore(vendorId: string): Promise<void> {
    await this.api.invoke(restoreVendor, { vendor_id: vendorId });
    await this.refresh();
    void this.counts.load();
  }

  async get(vendorId: string): Promise<VendorRead | null> {
    try {
      return await this.api.invoke(getVendor, { vendor_id: vendorId });
    } catch {
      this.error.set('Could not load that vendor.');
      return null;
    }
  }

  async spend(vendorId: string): Promise<VendorSpend | null> {
    try {
      return await this.api.invoke(getVendorSpend, { vendor_id: vendorId });
    } catch {
      return null;
    }
  }

  async agreements(vendorId: string): Promise<VendorAgreement[]> {
    try {
      const body = await this.api.invoke(getVendorAgreements, { vendor_id: vendorId });
      return body.agreements;
    } catch {
      return [];
    }
  }
}
