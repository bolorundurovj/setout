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
import { asSize } from './land-geo';
import { DOCUMENT_KINDS, kindName, sizeLabel, worthLabel } from './land-labels';

@Component({
  selector: 'app-land-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonComponent,
    ChipGroupComponent,
    LandMapComponent,
    LandValuationsComponent,
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
  readonly note = signal('');
  readonly justRemoved = signal<LandDocumentRead | null>(null);
  readonly editing = signal<string | null>(null);
  readonly editNote = signal('');
  readonly editKind = signal<LandDocumentKind>('other');

  readonly notSet = '—';

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

  place(land: LandRead): LandPoint | null {
    return land.latitude !== null && land.longitude !== null
      ? { lat: Number(land.latitude), lon: Number(land.longitude) }
      : null;
  }

  hasMap(land: LandRead): boolean {
    return this.place(land) !== null || land.boundary !== null;
  }

  area(land: LandRead): string {
    const sqm = land.boundary_area_sqm;
    if (sqm === null || sqm === undefined) {
      return this.notSet;
    }
    const unit = land.size_unit && land.size_unit !== 'plot' ? land.size_unit : 'sqm';
    return `${asSize(sqm, unit)} ${unit === 'sqm' ? 'sqm' : unit + 's'}`;
  }

  /** How far the drawn edge is from what the survey said, when both exist. */
  areaGap(land: LandRead): number | null {
    const sqm = land.boundary_area_sqm;
    if (!sqm || !land.size_value || !land.size_unit || land.size_unit === 'plot') {
      return null;
    }
    const drawn = Number(asSize(sqm, land.size_unit));
    const stated = Number(land.size_value);
    if (!stated || Number.isNaN(drawn)) {
      return null;
    }
    return Math.round(Math.abs((drawn - stated) / stated) * 100);
  }

  async useDrawnSize(land: LandRead): Promise<void> {
    const sqm = land.boundary_area_sqm;
    if (!sqm) {
      return;
    }
    const unit = land.size_unit && land.size_unit !== 'plot' ? land.size_unit : 'sqm';
    const saved = await this.lands.edit(land.id, {
      size_value: asSize(sqm, unit),
      size_unit: unit,
    });
    if (!saved) {
      this.toast.show(this.lands.error() ?? 'Could not save that size.', 'error');
      return;
    }
    this.toast.show('Size taken from the boundary.');
    await this.load();
  }

  size(land: LandRead): string {
    return sizeLabel(land) || this.notSet;
  }

  kindLabel(document: LandDocumentRead): string {
    return kindName(document.kind);
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  worth(land: LandRead): string {
    return worthLabel(land) || this.notSet;
  }

  startEdit(document: LandDocumentRead): void {
    this.editing.set(document.id);
    this.editNote.set(document.note ?? '');
    this.editKind.set(document.kind);
  }

  cancelEdit(): void {
    this.editing.set(null);
  }

  async saveEdit(document: LandDocumentRead): Promise<void> {
    const saved = await this.lands.editDocument(document.id, {
      kind: this.editKind(),
      note: this.editNote().trim() || null,
    });
    if (!saved) {
      this.toast.show(this.lands.error() ?? 'Could not save that paper.', 'error');
      return;
    }
    this.editing.set(null);
    await this.load();
  }

  fileNote(document: LandDocumentRead): string {
    return `${this.bytes(document.byte_size)} · kept on your own server`;
  }

  bytes(size: number): string {
    if (size < 1024) {
      return `${size} B`;
    }
    if (size < 1024 * 1024) {
      return `${Math.round(size / 1024)} KB`;
    }
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  missingLine(): string {
    const missing = this.missing();
    if (missing.length === 0) {
      return 'Every paper worth chasing is here.';
    }
    return `Still to come: ${missing.join(', ')}.`;
  }

  pick(): void {
    this.filePicker()?.nativeElement.click();
  }

  async onPicked(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const saved = await this.lands.addDocument(this.id(), this.kind(), file, this.note().trim());
    if (!saved) {
      this.toast.show(this.lands.error() ?? 'Could not keep that file.', 'error');
      return;
    }
    this.note.set('');
    this.toast.show(`${kindName(saved.kind)} kept.`);
    await this.load();
  }

  async remove(document: LandDocumentRead): Promise<void> {
    await this.lands.removeDocument(document.id);
    this.justRemoved.set(document);
    await this.load();
  }

  async putBack(): Promise<void> {
    const gone = this.justRemoved();
    if (!gone) {
      return;
    }
    await this.lands.restoreDocument(gone.id);
    this.justRemoved.set(null);
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
    this.toast.show('Land archived. Its papers go with it.');
  }

  async restore(): Promise<void> {
    await this.lands.restore(this.id());
    await this.load();
    this.toast.show('Land taken out of the archive.');
  }
}
