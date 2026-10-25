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
import { AttachmentParent, AttachmentService } from './attachment.service';

@Component({
  selector: 'app-attachments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './attachments.component.html',
  styleUrl: './attachments.component.scss',
})
export class AttachmentsComponent {
  readonly parent = input.required<AttachmentParent>();

  readonly attachments = inject(AttachmentService);
  private readonly toast = inject(ToastService);
  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  readonly rows = computed(() => this.attachments.forParent(this.parent()));
  readonly lastArchived = signal<AttachmentRead | null>(null);

  constructor() {
    effect(() => {
      this.lastArchived.set(null);
      void this.attachments.load(this.parent());
    });
  }

  fileUrl(file: AttachmentRead): string {
    return this.attachments.fileUrl(file.id);
  }

  isImage(file: AttachmentRead): boolean {
    return file.content_type.startsWith('image/');
  }

  fileNote(file: AttachmentRead): string {
    return `${this.attachments.formatSize(file.byte_size)} · stored on your server`;
  }

  openFilePicker(): void {
    this.fileInput().nativeElement.click();
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

  async restoreLastArchived(): Promise<void> {
    const archived = this.lastArchived();
    if (!archived) {
      return;
    }
    const restored = await this.attachments.restore(this.parent(), archived.id);
    this.lastArchived.set(null);
    this.toast.show(
      restored
        ? `${restored.filename} restored.`
        : (this.attachments.error() ?? 'Could not restore the attachment.'),
      restored ? 'success' : 'error',
    );
  }
}
