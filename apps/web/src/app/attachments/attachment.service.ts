import { Injectable, inject, signal } from '@angular/core';
import { detailOf } from '../api-error';
import {
  Api,
  AttachmentRead,
  archiveAttachment,
  createAttachment,
  downloadAttachment,
  listAttachments,
  restoreAttachment,
} from '@setout/api-client';

const PAGE_SIZE = 20;

@Injectable({
  providedIn: 'root',
})
export class AttachmentService {
  private readonly api = inject(Api);

  private readonly state = signal<Record<string, AttachmentRead[]>>({});

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  forExpense(expenseId: string): AttachmentRead[] {
    return this.state()[expenseId] ?? [];
  }

  async load(expenseId: string): Promise<void> {
    this.error.set(null);
    try {
      const page = await this.api.invoke(listAttachments, {
        expense_id: expenseId,
        limit: PAGE_SIZE,
      });
      this.setForExpense(expenseId, page.items);
    } catch {
      this.error.set('Could not load the attachments.');
      this.setForExpense(expenseId, []);
    }
  }

  async add(projectId: string, expenseId: string, file: File): Promise<AttachmentRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.api.invoke(createAttachment, {
        project_id: projectId,
        expense_id: expenseId,
        body: { file: file as unknown as string },
      });
      this.setForExpense(expenseId, [created, ...this.forExpense(expenseId)]);
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not attach that file.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async archive(expenseId: string, attachmentId: string): Promise<void> {
    await this.api.invoke(archiveAttachment, { attachment_id: attachmentId });
    this.setForExpense(
      expenseId,
      this.forExpense(expenseId).filter((row) => row.id !== attachmentId),
    );
  }

  async remove(expenseId: string, attachmentId: string): Promise<void> {
    return this.archive(expenseId, attachmentId);
  }

  async restore(expenseId: string, attachmentId: string): Promise<AttachmentRead | null> {
    try {
      const restored = await this.api.invoke(restoreAttachment, { attachment_id: attachmentId });
      this.setForExpense(expenseId, [restored, ...this.forExpense(expenseId)]);
      return restored;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not restore the attachment.');
      return null;
    }
  }

  fileUrl(attachmentId: string): string {
    const path = downloadAttachment.PATH.replace('{attachment_id}', attachmentId);
    return `${this.api.rootUrl}${path}`;
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KiB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  }

  size(bytes: number): string {
    return this.formatSize(bytes);
  }

  private setForExpense(expenseId: string, rows: AttachmentRead[]): void {
    this.state.update((all) => ({ ...all, [expenseId]: rows }));
  }
}
