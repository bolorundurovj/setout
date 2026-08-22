import { Injectable, inject, signal } from '@angular/core';
import { detailOf } from '../api-error';
import {
  Api,
  DeliveryCreate,
  DeliveryRead,
  DeliveryUpdate,
  addDelivery,
  deleteDelivery,
  listAllDeliveries,
  listDeliveries,
  receiveDelivery,
  restoreDelivery,
  unreceiveDelivery,
  updateDelivery,
} from '@setout/api-client';
import { PAGE_SIZE, offsetOf } from '../ui/paging';

export interface DeliveryBucket {
  readonly rows: DeliveryRead[];
  readonly total: number;
  readonly owed: number;
}

const EMPTY: DeliveryBucket = { rows: [], total: 0, owed: 0 };

@Injectable({
  providedIn: 'root',
})
export class DeliveryService {
  private readonly api = inject(Api);

  private readonly state = signal<Record<string, DeliveryBucket>>({});

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  waiting(projectId: string): DeliveryBucket {
    return this.state()[`project:${projectId}:waiting`] ?? EMPTY;
  }

  arrived(projectId: string): DeliveryBucket {
    return this.state()[`project:${projectId}:arrived`] ?? EMPTY;
  }

  forVendor(vendorId: string): DeliveryBucket {
    return this.state()[`vendor:${vendorId}`] ?? EMPTY;
  }

  async loadWaiting(projectId: string, page = 1): Promise<void> {
    await this.load(`project:${projectId}:waiting`, page, {
      project_id: projectId,
      outstanding_only: true,
    });
  }

  async loadArrived(projectId: string, page = 1): Promise<void> {
    await this.load(`project:${projectId}:arrived`, page, {
      project_id: projectId,
      received_only: true,
    });
  }

  async loadForVendor(vendorId: string, page = 1): Promise<void> {
    await this.load(`vendor:${vendorId}`, page, { vendor_id: vendorId, outstanding_only: true });
  }

  async add(projectId: string, body: DeliveryCreate): Promise<DeliveryRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(addDelivery, { project_id: projectId, body });
      const key = `project:${projectId}:waiting`;
      const held = this.state()[key] ?? EMPTY;
      this.put(key, {
        rows: [created, ...held.rows],
        total: held.total + 1,
        owed: held.owed + created.amount,
      });
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not record what is owed.');
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
      this.swap(changed);
      return changed;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not change what is owed.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async receive(deliveryId: string): Promise<void> {
    this.swap(await this.api.invoke(receiveDelivery, { delivery_id: deliveryId }));
  }

  async unreceive(deliveryId: string): Promise<void> {
    this.swap(await this.api.invoke(unreceiveDelivery, { delivery_id: deliveryId }));
  }

  async remove(deliveryId: string): Promise<void> {
    await this.api.invoke(deleteDelivery, { delivery_id: deliveryId });
    this.state.update((all) =>
      Object.fromEntries(
        Object.entries(all).map(([key, bucket]) => {
          const gone = bucket.rows.find((row) => row.id === deliveryId);
          if (!gone) {
            return [key, bucket];
          }
          return [
            key,
            {
              rows: bucket.rows.filter((row) => row.id !== deliveryId),
              total: Math.max(0, bucket.total - 1),
              owed: gone.received_at ? bucket.owed : Math.max(0, bucket.owed - gone.amount),
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
      this.error.set(detailOf(e) ?? 'Could not put that back.');
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
    },
  ): Promise<void> {
    this.error.set(null);
    const query = { ...params, limit: PAGE_SIZE, offset: offsetOf(page) };
    const projectId = params.project_id;
    try {
      const answer =
        projectId === undefined
          ? await this.api.invoke(listAllDeliveries, query)
          : await this.api.invoke(listDeliveries, { ...query, project_id: projectId });
      this.put(key, { rows: answer.items, total: answer.total, owed: answer.owed_amount });
    } catch {
      this.error.set('Could not load what is still owed.');
      this.put(key, EMPTY);
    }
  }

  private put(key: string, bucket: DeliveryBucket): void {
    this.state.update((all) => ({ ...all, [key]: bucket }));
  }

  private swap(changed: DeliveryRead): void {
    this.state.update((all) =>
      Object.fromEntries(
        Object.entries(all).map(([key, bucket]) => {
          const before = bucket.rows.find((row) => row.id === changed.id);
          if (!before) {
            return [key, bucket];
          }
          const owedBefore = before.received_at ? 0 : before.amount;
          const owedNow = changed.received_at ? 0 : changed.amount;
          return [
            key,
            {
              rows: bucket.rows.map((row) => (row.id === changed.id ? changed : row)),
              total: bucket.total,
              owed: Math.max(0, bucket.owed - owedBefore + owedNow),
            },
          ];
        }),
      ),
    );
  }
}
