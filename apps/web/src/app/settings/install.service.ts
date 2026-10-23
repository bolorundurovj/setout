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

@Injectable({
  providedIn: 'root',
})
export class InstallService {
  private readonly api = inject(Api);

  private readonly installState = signal<Install | null>(null);

  readonly install = this.installState.asReadonly();
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly restoring = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.installState.set(await this.api.invoke(getInstall));
    } catch {
      this.installState.set(null);
      this.error.set('Could not load the server details.');
    } finally {
      this.loading.set(false);
    }
  }

  async export(): Promise<Backup | null> {
    this.exporting.set(true);
    this.error.set(null);
    try {
      return await this.api.invoke(exportBackup);
    } catch {
      this.error.set('Could not create the backup.');
      return null;
    } finally {
      this.exporting.set(false);
    }
  }

  async restore(backup: Backup, acceptVersionChange: boolean): Promise<RestoreResult | null> {
    this.restoring.set(true);
    this.error.set(null);
    try {
      return await this.api.invoke(restoreBackup, {
        body: { backup, accept_version_change: acceptVersionChange },
      });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not restore the backup.');
      return null;
    } finally {
      this.restoring.set(false);
    }
  }
}
