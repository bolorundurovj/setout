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

export interface Target {
  projectId: string | null;
  name: string;
  currencyCode: string;
}

export interface Answers {
  createMissingScopes: boolean;
  skipDuplicates: boolean;
  takeUnpaid: boolean;
  severalCodes: string;
}

@Injectable({
  providedIn: 'root',
})
export class ImportService {
  private readonly api = inject(Api);

  readonly working = signal(false);
  readonly error = signal<string | null>(null);

  async look(file: File, target: Target): Promise<ImportReport | null> {
    this.working.set(true);
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
      this.error.set(detailOf(e) ?? 'That file could not be read.');
      return null;
    } finally {
      this.working.set(false);
    }
  }

  async bringIn(file: File, target: Target, answers: Answers): Promise<ImportResult | null> {
    this.working.set(true);
    this.error.set(null);
    try {
      return await this.api.invoke(runImport, {
        body: {
          file: file as unknown as string,
          project_id: target.projectId,
          name: target.name,
          currency_code: target.currencyCode,
          create_missing_scopes: answers.createMissingScopes,
          skip_duplicates: answers.skipDuplicates,
          take_unpaid: answers.takeUnpaid,
          several_codes: answers.severalCodes,
        },
      });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Nothing was brought in.');
      return null;
    } finally {
      this.working.set(false);
    }
  }

  sampleUrl(kind: string): string {
    return `${this.api.rootUrl}${importSample.PATH}?kind=${kind}`;
  }
}
