import { ArchiveConfirmComponent } from '../ui/archive-confirm.component';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { AttachmentRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { DeleteConfirmDirective, isDeleteConfirmed } from '../ui/delete-confirm.directive';
import { ToggleComponent } from '../ui/toggle.component';
import { AttachmentParent, AttachmentService } from './attachment.service';

@Component({
  selector: 'app-attachments',
  standalone: true,
  imports: [ArchiveConfirmComponent, DeleteConfirmDirective, ToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './attachments.component.html',
  styleUrl: './attachments.component.scss',
})
export class AttachmentsComponent {
  readonly parent = input.required<AttachmentParent>();
  readonly readonly = input(false);
  readonly initialIncludeArchived = input(false);

  readonly attachments = inject(AttachmentService);
  private readonly toast = inject(ToastService);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  private readonly archivedChoice = signal<boolean | null>(null);
  readonly includeArchived = computed(() => this.archivedChoice() ?? this.initialIncludeArchived());
  readonly pendingDelete = signal<string | null>(null);
  readonly deleteConfirmationText = signal('');

  readonly rows = computed(() => this.attachments.forParent(this.parent()));
  readonly status = computed(() => this.attachments.status(this.parent()));
  readonly addLabel = computed(() => {
    if (this.rows().length > 0) {
      return 'Another attachment';
    }
    switch (this.status()) {
      case 'ready':
        return 'No attachments';
      case 'error':
        return 'Attachments';
      default:
        return 'Loading attachments…';
    }
  });
  readonly lastArchived = signal<AttachmentRead | null>(null);

  constructor() {
    effect(() => {
      const parent = this.parent();
      const includeArchived = this.includeArchived();
      this.lastArchived.set(null);
      this.cancelDelete();
      void this.attachments.load(parent, includeArchived);
    });
  }

  archivedLabel(): string {
    return this.includeArchived() ? 'Hide archived' : 'Show archived';
  }

  setIncludeArchived(on: boolean): void {
    this.archivedChoice.set(on);
  }

  value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  fileUrl(file: AttachmentRead): string {
    return this.attachments.fileUrl(file.id);
  }

  isImage(file: AttachmentRead): boolean {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.content_type);
  }

  fileNote(file: AttachmentRead): string {
    const base = `${this.attachments.formatSize(file.byte_size)} · stored on your server`;
    return file.archived_at ? `${base} · archived` : base;
  }

  openFilePicker(): void {
    this.fileInput()?.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      return;
    }
    input.value = '';
    const added = await this.attachments.add(this.parent(), file);
    if (!added) {
      this.toast.show(this.attachments.error() ?? 'Could not attach that file.', 'error');
      return;
    }
    this.toast.show(`${added.filename} attached.`);
  }

  async archive(file: AttachmentRead): Promise<void> {
    await this.attachments.archive(this.parent(), file.id);
    this.lastArchived.set(file);
    this.toast.show(`${file.filename} archived.`);
  }

  async restore(file: AttachmentRead): Promise<void> {
    const restored = await this.attachments.restore(this.parent(), file.id);
    if (this.lastArchived()?.id === file.id) {
      this.lastArchived.set(null);
    }
    this.toast.show(
      restored
        ? `${restored.filename} restored.`
        : (this.attachments.error() ?? 'Could not restore the attachment.'),
      restored ? 'success' : 'error',
    );
  }

  async restoreLastArchived(): Promise<void> {
    const archived = this.lastArchived();
    if (!archived) {
      return;
    }
    await this.restore(archived);
  }

  requestDelete(id: string): void {
    this.pendingDelete.set(id);
    this.deleteConfirmationText.set('');
  }

  cancelDelete(): void {
    this.pendingDelete.set(null);
    this.deleteConfirmationText.set('');
  }

  canConfirmDelete(): boolean {
    return isDeleteConfirmed(this.deleteConfirmationText());
  }

  async deletePermanently(file: AttachmentRead): Promise<void> {
    if (!this.canConfirmDelete()) {
      return;
    }
    await this.attachments.delete(this.parent(), file.id);
    this.cancelDelete();
    this.toast.show(`${file.filename} deleted permanently.`);
  }
}
