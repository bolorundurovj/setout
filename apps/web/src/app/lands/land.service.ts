import { Injectable, inject, signal } from '@angular/core';
import {
  Api,
  GeocodedPlace,
  LandCreate,
  LandDocumentKind,
  LandDocumentRead,
  LandDocumentUpdate,
  LandRead,
  LandUpdate,
  LandValuationCreate,
  LandValuationRead,
  LandValuationUpdate,
  archiveLand,
  archiveLandDocument,
  archiveLandValuation,
  createLand,
  createLandDocument,
  createLandValuation,
  deleteLand,
  deleteLandDocument,
  deleteLandValuation,
  downloadLandDocument,
  getLand,
  listLandDocuments,
  listLandValuations,
  listLands,
  restoreLand,
  restoreLandDocument,
  restoreLandValuation,
  reverseGeocode,
  updateLand,
  updateLandDocument,
  updateLandValuation,
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
  // Up to CHOICE_LIMIT rows for the pickers, which cannot use a single page of results.
  readonly choices = this.choiceState.asReadonly();

  private latestRequest = 0;

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
    const requestId = ++this.latestRequest;
    this.loading.set(true);
    this.error.set(null);
    try {
      const rows = await this.api.invoke(listLands, {
        search: this.searchState() || undefined,
        include_archived: this.archivedState(),
        limit: PAGE_SIZE,
        offset: offsetOf(page),
      });
      if (requestId !== this.latestRequest) {
        return;
      }
      this.state.set(rows.items);
      this.totalState.set(rows.total);
      this.pageState.set(page);
    } catch {
      if (requestId !== this.latestRequest) {
        return;
      }
      this.error.set('Could not load the land records.');
    } finally {
      if (requestId === this.latestRequest) {
        this.loading.set(false);
      }
    }
  }

  private async refresh(): Promise<void> {
    const currentPage = this.pageState();
    await this.goTo(currentPage);
    if (this.state().length === 0 && currentPage > 1) {
      await this.goTo(currentPage - 1);
    }
  }

  async create(body: LandCreate): Promise<LandRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createLand, { body });
      await this.goTo(this.pageState());
      this.choiceState.update((rows) => [created, ...rows]);
      void this.counts.load();
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not create the land record.');
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
      this.error.set(detailOf(e) ?? 'Could not save the land record.');
      return null;
    }
  }

  async archive(landId: string): Promise<void> {
    await this.api.invoke(archiveLand, { land_id: landId });
    await this.refresh();
    void this.counts.load();
  }

  async restore(landId: string): Promise<void> {
    await this.api.invoke(restoreLand, { land_id: landId });
    await this.refresh();
    void this.counts.load();
  }

  async delete(landId: string): Promise<void> {
    await this.api.invoke(deleteLand, { land_id: landId });
    await this.refresh();
    void this.counts.load();
  }

  async get(landId: string): Promise<LandRead | null> {
    try {
      return await this.api.invoke(getLand, { land_id: landId });
    } catch {
      this.error.set('Could not load the land record.');
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

  async createDocument(
    landId: string,
    kind: LandDocumentKind,
    file: File,
    notes?: string | null,
  ): Promise<LandDocumentRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      return await this.api.invoke(createLandDocument, {
        land_id: landId,
        // The generated body types the file as a string; the SDK wants the File.
        body: { file: file as unknown as string, kind, notes: notes ?? undefined },
      });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not upload the document.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  documentUrl(documentId: string): string {
    const path = downloadLandDocument.PATH.replace('{document_id}', documentId);
    return `${this.api.rootUrl}${path}`;
  }

  async archiveDocument(documentId: string): Promise<void> {
    await this.api.invoke(archiveLandDocument, { document_id: documentId });
  }

  async restoreDocument(documentId: string): Promise<void> {
    await this.api.invoke(restoreLandDocument, { document_id: documentId });
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.api.invoke(deleteLandDocument, { document_id: documentId });
  }

  async editDocument(
    documentId: string,
    body: LandDocumentUpdate,
  ): Promise<LandDocumentRead | null> {
    this.error.set(null);
    try {
      return await this.api.invoke(updateLandDocument, { document_id: documentId, body });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save the document.');
      return null;
    }
  }

  async valuations(landId: string): Promise<LandValuationRead[]> {
    try {
      const body = await this.api.invoke(listLandValuations, { land_id: landId });
      return body.items;
    } catch {
      return [];
    }
  }

  async createValuation(
    landId: string,
    body: LandValuationCreate,
  ): Promise<LandValuationRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      return await this.api.invoke(createLandValuation, { land_id: landId, body });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save the valuation.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async editValuation(
    valuationId: string,
    body: LandValuationUpdate,
  ): Promise<LandValuationRead | null> {
    this.error.set(null);
    try {
      return await this.api.invoke(updateLandValuation, { valuation_id: valuationId, body });
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not save the valuation.');
      return null;
    }
  }

  async archiveValuation(valuationId: string): Promise<void> {
    await this.api.invoke(archiveLandValuation, { valuation_id: valuationId });
  }

  async restoreValuation(valuationId: string): Promise<void> {
    await this.api.invoke(restoreLandValuation, { valuation_id: valuationId });
  }

  async deleteValuation(valuationId: string): Promise<void> {
    await this.api.invoke(deleteLandValuation, { valuation_id: valuationId });
  }

  /** Reverse geocodes a point; null when the geocoder is disabled or unreachable. */
  async reverseGeocode(latitude: number, longitude: number): Promise<GeocodedPlace | null> {
    try {
      return await this.api.invoke(reverseGeocode, { latitude, longitude });
    } catch {
      // Geocoding is advisory, so failures are not shown.
      return null;
    }
  }
}
