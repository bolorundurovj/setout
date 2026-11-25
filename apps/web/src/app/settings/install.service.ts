import { Injectable, inject, signal } from '@angular/core';
import {
  Api,
  Backup,
  Install,
  RestoreResult,
  exportBackup,
  getInstall,
  restoreBackup,
} from '@setout/api-client';
import { detailOf } from '../api-error';
import { LoadTracker } from '../ui/request-status';

@Injectable({
  providedIn: 'root',
})
export class InstallService {
  private readonly api = inject(Api);

  private readonly installState = signal<Install | null>(null);

  private readonly tracker = new LoadTracker();

  readonly install = this.installState.asReadonly();
  readonly status = this.tracker.status;
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly restoring = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    const requestId = this.tracker.start();
    this.loading.set(true);
    this.error.set(null);
    try {
      const install = await this.api.invoke(getInstall);
      if (this.tracker.settle(requestId, 'ready')) {
        this.installState.set(install);
      }
    } catch {
      if (this.tracker.settle(requestId, 'error')) {
        this.installState.set(null);
        this.error.set('Could not load the server details.');
      }
    } finally {
      if (this.tracker.isCurrent(requestId)) {
        this.loading.set(false);
      }
    }
  }

  async export(passphrase: string): Promise<Backup | null> {
    this.exporting.set(true);
    this.error.set(null);
    try {
      return await this.api.invoke(exportBackup, { body: { passphrase } });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not create the backup.');
      return null;
    } finally {
      this.exporting.set(false);
    }
  }

  async restore(
    backup: Backup,
    acceptVersionChange: boolean,
    passphrase: string,
  ): Promise<RestoreResult | null> {
    this.restoring.set(true);
    this.error.set(null);
    try {
      return await this.api.invoke(restoreBackup, {
        body: { passphrase, backup, accept_version_change: acceptVersionChange },
      });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not restore the backup.');
      return null;
    } finally {
      this.restoring.set(false);
    }
  }
}
