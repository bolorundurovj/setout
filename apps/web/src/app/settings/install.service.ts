import { Injectable, inject, signal } from '@angular/core';
import {
  Api,
  Backup,
  Install,
  RestoreResult,
  exportRecord,
  getInstall,
  restoreRecord,
} from '@setout/api-client';
import { detailOf } from '../api-error';

@Injectable({
  providedIn: 'root',
})
export class InstallService {
  private readonly api = inject(Api);

  private readonly state = signal<Install | null>(null);

  readonly install = this.state.asReadonly();
  readonly reading = signal(false);
  readonly writing = signal(false);
  readonly restoring = signal(false);
  readonly error = signal<string | null>(null);

  async load(): Promise<void> {
    this.reading.set(true);
    this.error.set(null);
    try {
      this.state.set(await this.api.invoke(getInstall));
    } catch {
      this.state.set(null);
      this.error.set('The server did not answer.');
    } finally {
      this.reading.set(false);
    }
  }

  async export(): Promise<Backup | null> {
    this.writing.set(true);
    this.error.set(null);
    try {
      return await this.api.invoke(exportRecord);
    } catch {
      this.error.set('Could not write a copy.');
      return null;
    } finally {
      this.writing.set(false);
    }
  }

  async restore(backup: Backup, acceptVersionChange: boolean): Promise<RestoreResult | null> {
    this.restoring.set(true);
    this.error.set(null);
    try {
      return await this.api.invoke(restoreRecord, {
        body: { backup, accept_version_change: acceptVersionChange },
      });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not read that file back.');
      return null;
    } finally {
      this.restoring.set(false);
    }
  }
}
