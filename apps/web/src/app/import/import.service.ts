import { Injectable, inject, signal } from '@angular/core';
import { detailOf } from '../api-error';
import {
  Api,
  ImportReport,
  ImportResult,
  importSample,
  previewImport,
  runImport,
} from '@setout/api-client';

export interface ImportTarget {
  projectId: string | null;
  name: string;
  currencyCode: string;
}

export interface ImportOptions {
  createMissingCategories: boolean;
  skipDuplicates: boolean;
  includeUnpaid: boolean;
  multipleCodes: string;
}

@Injectable({
  providedIn: 'root',
})
export class ImportService {
  private readonly api = inject(Api);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async preview(file: File, target: ImportTarget): Promise<ImportReport | null> {
    this.busy.set(true);
    this.error.set(null);
    try {
      return await this.api.invoke(previewImport, {
        body: {
          file: file as unknown as string,
          project_id: target.projectId,
          name: target.name,
          currency_code: target.currencyCode,
        },
      });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not read the file.');
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  async runImport(
    file: File,
    target: ImportTarget,
    options: ImportOptions,
  ): Promise<ImportResult | null> {
    this.busy.set(true);
    this.error.set(null);
    try {
      return await this.api.invoke(runImport, {
        body: {
          file: file as unknown as string,
          project_id: target.projectId,
          name: target.name,
          currency_code: target.currencyCode,
          create_missing_categories: options.createMissingCategories,
          skip_duplicates: options.skipDuplicates,
          take_unpaid: options.includeUnpaid,
          several_codes: options.multipleCodes,
        },
      });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Nothing was imported.');
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  templateUrl(kind: string): string {
    return `${this.api.rootUrl}${importSample.PATH}?kind=${kind}`;
  }
}
