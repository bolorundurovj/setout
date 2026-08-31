import { Injectable, inject, signal } from '@angular/core';
import {
  Api,
  LandCreate,
  LandDocumentKind,
  LandDocumentRead,
  LandRead,
  LandUpdate,
  addLandDocument,
  createLand,
  deleteLand,
  deleteLandDocument,
  downloadLandDocument,
  getLand,
  listLandDocuments,
  listLands,
  restoreLand,
  restoreLandDocument,
  updateLand,
} from '@setout/api-client';
import { CountsService } from '../counts.service';
import { CHOICE_LIMIT, PAGE_SIZE, offsetOf } from '../ui/paging';
import { detailOf } from '../api-error';

@Injectable({
  providedIn: 'root',
})
export class LandService {
  private readonly api = inject(Api);
  private readonly counts = inject(CountsService);

  private readonly state = signal<LandRead[]>([]);
  private readonly totalState = signal(0);
  private readonly pageState = signal(1);
  private readonly choiceState = signal<LandRead[]>([]);
  private readonly searchState = signal('');
  private readonly archivedState = signal(false);

  readonly lands = this.state.asReadonly();
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
      const rows = await this.api.invoke(listLands, { limit: CHOICE_LIMIT });
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
      const rows = await this.api.invoke(listLands, {
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
      this.error.set('Could not load the land.');
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

  async add(body: LandCreate): Promise<LandRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createLand, { body });
      await this.goTo(this.pageState());
      this.choiceState.update((rows) => [created, ...rows]);
      void this.counts.load();
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not add that land.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async edit(landId: string, body: LandUpdate): Promise<LandRead | null> {
    this.error.set(null);
    try {
      const updated = await this.api.invoke(updateLand, { land_id: landId, body });
      this.state.update((rows) => rows.map((row) => (row.id === landId ? updated : row)));
      return updated;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save that land.');
      return null;
    }
  }

  async archive(landId: string): Promise<void> {
    await this.api.invoke(deleteLand, { land_id: landId });
    await this.refresh();
    void this.counts.load();
  }

  async restore(landId: string): Promise<void> {
    await this.api.invoke(restoreLand, { land_id: landId });
    await this.refresh();
    void this.counts.load();
  }

  async get(landId: string): Promise<LandRead | null> {
    try {
      return await this.api.invoke(getLand, { land_id: landId });
    } catch {
      this.error.set('Could not load that land.');
      return null;
    }
  }

  async documents(landId: string): Promise<LandDocumentRead[]> {
    try {
      const body = await this.api.invoke(listLandDocuments, { land_id: landId });
      return body.items;
    } catch {
      return [];
    }
  }

  async addDocument(
    landId: string,
    kind: LandDocumentKind,
    file: File,
  ): Promise<LandDocumentRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      return await this.api.invoke(addLandDocument, {
        land_id: landId,
        // The generated body types the file as a string; the SDK wants the File.
        body: { file: file as unknown as string, kind },
      });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not keep that file.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  documentUrl(documentId: string): string {
    const path = downloadLandDocument.PATH.replace('{document_id}', documentId);
    return `${this.api.rootUrl}${path}`;
  }

  async removeDocument(documentId: string): Promise<void> {
    await this.api.invoke(deleteLandDocument, { document_id: documentId });
  }

  async restoreDocument(documentId: string): Promise<void> {
    await this.api.invoke(restoreLandDocument, { document_id: documentId });
  }
}
