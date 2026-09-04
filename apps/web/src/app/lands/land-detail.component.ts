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
import { DOCUMENT_KINDS, kindName, sizeLabel } from './land-labels';

@Component({
  selector: 'app-land-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent, ChipGroupComponent, RouterLink],
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

  size(land: LandRead): string {
    return sizeLabel(land) || this.notSet;
  }

  kindLabel(document: LandDocumentRead): string {
    return kindName(document.kind);
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
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
