import { Injectable, inject, signal } from '@angular/core';
import { detailOf } from '../api-error';
import {
  Api,
  DeliveryCreate,
  DeliveryRead,
  DeliveryUpdate,
  archiveDelivery,
  createDelivery,
  listAllDeliveries,
  listDeliveries,
  receiveDelivery,
  restoreDelivery,
  unreceiveDelivery,
  updateDelivery,
} from '@setout/api-client';
import { PAGE_SIZE, offsetOf } from '../ui/paging';

export interface DeliveryList {
  readonly rows: DeliveryRead[];
  readonly total: number;
  readonly outstandingAmount: number;
}

const EMPTY: DeliveryList = { rows: [], total: 0, outstandingAmount: 0 };

@Injectable({
  providedIn: 'root',
})
export class DeliveryService {
  private readonly api = inject(Api);

  private readonly state = signal<Record<string, DeliveryList>>({});

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  outstanding(projectId: string): DeliveryList {
    return this.state()[`project:${projectId}:outstanding`] ?? EMPTY;
  }

  received(projectId: string): DeliveryList {
    return this.state()[`project:${projectId}:received`] ?? EMPTY;
  }

  forVendor(vendorId: string): DeliveryList {
    return this.state()[`vendor:${vendorId}`] ?? EMPTY;
  }

  async loadOutstanding(projectId: string, page = 1, includeArchived = false): Promise<void> {
    await this.load(`project:${projectId}:outstanding`, page, {
      project_id: projectId,
      outstanding_only: true,
      include_archived: includeArchived,
    });
  }

  async loadReceived(projectId: string, page = 1, includeArchived = false): Promise<void> {
    await this.load(`project:${projectId}:received`, page, {
      project_id: projectId,
      received_only: true,
      include_archived: includeArchived,
    });
  }

  async loadForVendor(vendorId: string, page = 1): Promise<void> {
    await this.load(`vendor:${vendorId}`, page, { vendor_id: vendorId, outstanding_only: true });
  }

  async add(projectId: string, body: DeliveryCreate): Promise<DeliveryRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createDelivery, { project_id: projectId, body });
      const key = `project:${projectId}:outstanding`;
      const current = this.state()[key] ?? EMPTY;
      this.put(key, {
        rows: [created, ...current.rows],
        total: current.total + 1,
        outstandingAmount: current.outstandingAmount + created.amount,
      });
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save the delivery.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async update(deliveryId: string, body: DeliveryUpdate): Promise<DeliveryRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const changed = await this.api.invoke(updateDelivery, { delivery_id: deliveryId, body });
      this.replaceRow(changed);
      return changed;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not update the delivery.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async markReceived(deliveryId: string): Promise<void> {
    this.replaceRow(await this.api.invoke(receiveDelivery, { delivery_id: deliveryId }));
  }

  async markOutstanding(deliveryId: string): Promise<void> {
    this.replaceRow(await this.api.invoke(unreceiveDelivery, { delivery_id: deliveryId }));
  }

  async archive(deliveryId: string): Promise<void> {
    await this.api.invoke(archiveDelivery, { delivery_id: deliveryId });
    this.state.update((all) =>
      Object.fromEntries(
        Object.entries(all).map(([key, list]) => {
          const archived = list.rows.find((row) => row.id === deliveryId);
          if (!archived) {
            return [key, list];
          }
          return [
            key,
            {
              rows: list.rows.filter((row) => row.id !== deliveryId),
              total: Math.max(0, list.total - 1),
              outstandingAmount: archived.received_at
                ? list.outstandingAmount
                : Math.max(0, list.outstandingAmount - archived.amount),
            },
          ];
        }),
      ),
    );
  }

  async restore(deliveryId: string): Promise<DeliveryRead | null> {
    try {
      return await this.api.invoke(restoreDelivery, { delivery_id: deliveryId });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not restore that delivery.');
      return null;
    }
  }

  private async load(
    key: string,
    page: number,
    params: {
      project_id?: string;
      vendor_id?: string;
      outstanding_only?: boolean;
      received_only?: boolean;
      include_archived?: boolean;
    },
  ): Promise<void> {
    this.error.set(null);
    const query = { ...params, limit: PAGE_SIZE, offset: offsetOf(page) };
    const projectId = params.project_id;
    try {
      const response =
        projectId === undefined
          ? await this.api.invoke(listAllDeliveries, query)
          : await this.api.invoke(listDeliveries, { ...query, project_id: projectId });
      this.put(key, {
        rows: response.items,
        total: response.total,
        outstandingAmount: response.outstanding_amount,
      });
    } catch {
      this.error.set('Could not load the deliveries.');
      this.put(key, EMPTY);
    }
  }

  private put(key: string, list: DeliveryList): void {
    this.state.update((all) => ({ ...all, [key]: list }));
  }

  private replaceRow(changed: DeliveryRead): void {
    this.state.update((all) =>
      Object.fromEntries(
        Object.entries(all).map(([key, list]) => {
          const before = list.rows.find((row) => row.id === changed.id);
          if (!before) {
            return [key, list];
          }
          const outstandingBefore = before.received_at ? 0 : before.amount;
          const outstandingAfter = changed.received_at ? 0 : changed.amount;
          return [
            key,
            {
              rows: list.rows.map((row) => (row.id === changed.id ? changed : row)),
              total: list.total,
              outstandingAmount: Math.max(
                0,
                list.outstandingAmount - outstandingBefore + outstandingAfter,
              ),
            },
          ];
        }),
      ),
    );
  }
}
