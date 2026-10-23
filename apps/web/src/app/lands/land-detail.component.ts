import { formatNumber } from '../budget/money';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import type { LandDocumentKind, LandDocumentRead, LandRead } from '@setout/api-client';
import { ButtonComponent } from '../ui/button.component';
import { ChipGroupComponent, type Chip } from '../ui/chip-group.component';
import { ToastService } from '../toast.service';
import { LandService } from './land.service';
import { LandValuationsComponent } from './land-valuations.component';
import { LandMapComponent, type LandPoint } from './land-map.component';
import { TabsComponent, type Tab } from '../ui/tabs.component';
import { formatAreaIn, pointInRing, ringOf } from './land-geo';
import { DOCUMENT_KINDS, kindName, statedAreaLabel, unitName, valuationLabel } from './land-labels';

@Component({
  selector: 'app-land-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    ChipGroupComponent,
    LandMapComponent,
    LandValuationsComponent,
    TabsComponent,
    RouterLink,
  ],
  templateUrl: './land-detail.component.html',
  styleUrl: './land-detail.component.scss',
})
export class LandDetailComponent {
  readonly lands = inject(LandService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly title = inject(Title);
  private readonly filePicker = viewChild<ElementRef<HTMLInputElement>>('picker');

  readonly id = input.required<string>();

  readonly land = signal<LandRead | null>(null);
  readonly documents = signal<LandDocumentRead[]>([]);
  readonly loading = signal(true);
  readonly kind = signal<LandDocumentKind>('certificate_of_occupancy');
  readonly notes = signal('');
  readonly lastArchived = signal<LandDocumentRead | null>(null);
  readonly editing = signal<string | null>(null);
  readonly editNotes = signal('');
  readonly editKind = signal<LandDocumentKind>('other');

  readonly notSet = '—';

  readonly mapTab = signal<'pin' | 'boundary'>('pin');

  readonly kindChips: Chip[] = DOCUMENT_KINDS.map((value) => ({ value, label: kindName(value) }));

  readonly missing = computed(() => this.land()?.missing_kinds.map(kindName) ?? []);

  constructor() {
    effect(() => {
      this.id();
      void this.load();
    });
    effect(() => {
      const land = this.land();
      if (land) {
        this.title.setTitle(`${land.name} · Setout`);
      }
    });
  }

  async load(): Promise<void> {
    const [land, documents] = await Promise.all([
      this.lands.get(this.id()),
      this.lands.documents(this.id()),
    ]);
    this.land.set(land);
    this.documents.set(documents);
    this.loading.set(false);
  }

  /** Empty when the geocoded address matches the entered address. */
  mapAddress(land: LandRead): string {
    const geocoded = (land.geocoded_address ?? '').trim();
    return geocoded && geocoded !== (land.address ?? '').trim() ? geocoded : '';
  }

  pinPoint(land: LandRead): LandPoint | null {
    return land.latitude !== null && land.longitude !== null
      ? { lat: Number(land.latitude), lon: Number(land.longitude) }
      : null;
  }

  hasMap(land: LandRead): boolean {
    return this.pinPoint(land) !== null || land.boundary !== null;
  }

  pinIsOutside(land: LandRead): boolean {
    const pin = this.pinPoint(land);
    const ring = ringOf(land.boundary);
    return pin !== null && ring.length >= 3 && !pointInRing([pin.lon, pin.lat], ring);
  }

  mapTabs(land: LandRead): Tab[] {
    if (this.pinPoint(land) === null || land.boundary === null) {
      return [];
    }
    return [
      { value: 'pin', label: 'Location Pin' },
      { value: 'boundary', label: 'Boundary' },
    ];
  }

  shownMap(land: LandRead): 'pin' | 'boundary' {
    if (this.pinPoint(land) === null) {
      return 'boundary';
    }
    if (land.boundary === null) {
      return 'pin';
    }
    return this.mapTab();
  }

  measuredArea(land: LandRead): string {
    const sqm = land.boundary_area_sqm;
    if (sqm === null || sqm === undefined) {
      return this.notSet;
    }
    const unit = land.size_unit && land.size_unit !== 'plot' ? land.size_unit : 'sqm';
    const value = formatAreaIn(sqm, unit) ?? '0';
    return `${formatNumber(value)} ${unitName(unit, value)}`;
  }

  /** Percentage difference between the measured and stated areas. */
  areaDifferencePercent(land: LandRead): number | null {
    const sqm = land.boundary_area_sqm;
    if (!sqm || !land.size_value || !land.size_unit || land.size_unit === 'plot') {
      return null;
    }
    const measured = Number(formatAreaIn(sqm, land.size_unit));
    const stated = Number(land.size_value);
    if (!stated || Number.isNaN(measured)) {
      return null;
    }
    return Math.round(Math.abs((measured - stated) / stated) * 100);
  }

  async useMeasuredArea(land: LandRead): Promise<void> {
    const sqm = land.boundary_area_sqm;
    if (!sqm) {
      return;
    }
    const unit = land.size_unit && land.size_unit !== 'plot' ? land.size_unit : 'sqm';
    const saved = await this.lands.edit(land.id, {
      size_value: formatAreaIn(sqm, unit),
      size_unit: unit,
    });
    if (!saved) {
      this.toast.show(this.lands.error() ?? 'Could not save the area.', 'error');
      return;
    }
    this.toast.show('Stated area updated from the boundary.');
    await this.load();
  }

  statedArea(land: LandRead): string {
    return statedAreaLabel(land) || this.notSet;
  }

  kindLabel(document: LandDocumentRead): string {
    return kindName(document.kind);
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  valuation(land: LandRead): string {
    return valuationLabel(land) || this.notSet;
  }

  startEdit(document: LandDocumentRead): void {
    this.editing.set(document.id);
    this.editNotes.set(document.notes ?? '');
    this.editKind.set(document.kind);
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  async saveEdit(document: LandDocumentRead): Promise<void> {
    const saved = await this.lands.editDocument(document.id, {
      kind: this.editKind(),
      notes: this.editNotes().trim() || null,
    });
    if (!saved) {
      this.toast.show(this.lands.error() ?? 'Could not save the document.', 'error');
      return;
    }
    this.editing.set(null);
    await this.load();
  }

  fileDetails(document: LandDocumentRead): string {
    return `${this.formatFileSize(document.byte_size)} · stored on this server`;
  }

  formatFileSize(size: number): string {
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${Math.round(size / 1024)} KiB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MiB`;
  }

  missingDocumentsLabel(): string {
    const missing = this.missing();
    if (missing.length === 0) {
      return 'All required documents are present.';
    }
    return `Missing: ${missing.join(', ')}.`;
  }

  chooseFile(): void {
    this.filePicker()?.nativeElement.click();
  }

  async onPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const saved = await this.lands.createDocument(
      this.id(),
      this.kind(),
      file,
      this.notes().trim(),
    );
    if (!saved) {
      this.toast.show(this.lands.error() ?? 'Could not upload the document.', 'error');
      return;
    }
    this.notes.set('');
    this.toast.show(`${kindName(saved.kind)} uploaded.`);
    await this.load();
  }

  async archiveDocument(document: LandDocumentRead): Promise<void> {
    await this.lands.archiveDocument(document.id);
    this.lastArchived.set(document);
    await this.load();
  }

  async restoreLastArchived(): Promise<void> {
    const archived = this.lastArchived();
    if (!archived) {
      return;
    }
    await this.lands.restoreDocument(archived.id);
    this.lastArchived.set(null);
    await this.load();
  }

  href(document: LandDocumentRead): string {
    return this.lands.documentUrl(document.id);
  }

  edit(): void {
    void this.router.navigate(['/lands', this.id(), 'edit']);
  }

  async archive(): Promise<void> {
    await this.lands.archive(this.id());
    await this.load();
    this.toast.show('Land record archived. Its documents are archived with it.');
  }

  async restore(): Promise<void> {
    await this.lands.restore(this.id());
    await this.load();
    this.toast.show('Land record restored.');
  }
}
