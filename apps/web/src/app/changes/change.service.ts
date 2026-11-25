import { Injectable, inject, signal } from '@angular/core';
import { Api, ChangePage, ChangeRead, listChanges, listProjectChanges } from '@setout/api-client';
import { KeyedLoadTracker, type RequestStatus } from '../ui/request-status';

const PAGE_SIZE = 20;

export type ChangeTarget = { entity: string; id: string } | { projectId: string };

export interface ChangeList {
  rows: ChangeRead[];
  total: number;
  loading: boolean;
}

const EMPTY: ChangeList = { rows: [], total: 0, loading: false };

@Injectable({
  providedIn: 'root',
})
export class ChangeService {
  private readonly api = inject(Api);

  private readonly state = signal<Record<string, ChangeList>>({});
  private readonly tracker = new KeyedLoadTracker();

  readonly error = signal<string | null>(null);

  forTarget(target: ChangeTarget): ChangeList {
    return this.state()[this.key(target)] ?? EMPTY;
  }

  status(target: ChangeTarget): RequestStatus {
    return this.tracker.status(this.key(target));
  }

  async load(target: ChangeTarget): Promise<void> {
    const requestId = this.tracker.start(this.key(target));
    this.set(target, { ...this.forTarget(target), loading: true });
    await this.fetch(target, 0, [], requestId);
  }

  async loadMore(target: ChangeTarget): Promise<void> {
    const current = this.forTarget(target);
    if (current.loading || current.rows.length >= current.total) {
      return;
    }
    this.set(target, { ...current, loading: true });
    await this.fetch(target, current.rows.length, current.rows);
  }

  private async fetch(
    target: ChangeTarget,
    offset: number,
    kept: ChangeRead[],
    requestId?: number,
  ): Promise<void> {
    const key = this.key(target);
    this.error.set(null);
    try {
      const page = await this.page(target, offset);
      if (requestId !== undefined && !this.tracker.settle(key, requestId, 'ready')) {
        return;
      }
      this.set(target, { rows: [...kept, ...page.items], total: page.total, loading: false });
    } catch {
      if (requestId !== undefined && !this.tracker.settle(key, requestId, 'error')) {
        return;
      }
      this.error.set('Could not load the change history.');
      this.set(target, { rows: kept, total: kept.length, loading: false });
    }
  }

  private page(target: ChangeTarget, offset: number): Promise<ChangePage> {
    if ('projectId' in target) {
      return this.api.invoke(listProjectChanges, {
        project_id: target.projectId,
        limit: PAGE_SIZE,
        offset,
      });
    }
    return this.api.invoke(listChanges, {
      entity: target.entity,
      entity_id: target.id,
      limit: PAGE_SIZE,
      offset,
    });
  }

  private key(target: ChangeTarget): string {
    return 'projectId' in target ? `project:${target.projectId}` : `${target.entity}:${target.id}`;
  }

  private set(target: ChangeTarget, list: ChangeList): void {
    this.state.update((all) => ({ ...all, [this.key(target)]: list }));
  }
}
