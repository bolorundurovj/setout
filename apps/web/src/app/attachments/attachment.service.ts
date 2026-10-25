import { Injectable, inject, signal } from '@angular/core';
import { detailOf } from '../api-error';
import {
  Api,
  AttachmentPage,
  AttachmentRead,
  archiveAttachment,
  createAgreementAttachment,
  createAttachment,
  createDeliveryAttachment,
  createProjectAttachment,
  deleteAttachment,
  downloadAttachment,
  listAgreementAttachments,
  listAttachments,
  listDeliveryAttachments,
  listProjectAttachments,
  restoreAttachment,
} from '@setout/api-client';

const PAGE_SIZE = 20;

export type AttachedTo = 'project' | 'expense' | 'agreement' | 'delivery';

export interface AttachmentParent {
  attachedTo: AttachedTo;
  id: string;
  projectId: string;
}

@Injectable({
  providedIn: 'root',
})
export class AttachmentService {
  private readonly api = inject(Api);

  private readonly state = signal<Record<string, AttachmentRead[]>>({});

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  forParent(parent: AttachmentParent): AttachmentRead[] {
    return this.state()[this.key(parent)] ?? [];
  }

  async load(parent: AttachmentParent): Promise<void> {
    this.error.set(null);
    try {
      const page = await this.list(parent);
      this.set(parent, page.items);
    } catch {
      this.error.set('Could not load the attachments.');
      this.set(parent, []);
    }
  }

  async add(parent: AttachmentParent, file: File): Promise<AttachmentRead | null> {
    this.saving.set(true);
    this.error.set(null);
    try {
      const created = await this.create(parent, file);
      this.set(parent, [created, ...this.forParent(parent)]);
      return created;
    } catch (e: unknown) {
      this.error.set(detailOf(e) ?? 'Could not attach that file.');
      return null;
    } finally {
      this.saving.set(false);
    }
  }

  async archive(parent: AttachmentParent, attachmentId: string): Promise<void> {
    await this.api.invoke(archiveAttachment, { attachment_id: attachmentId });
    this.set(
      parent,
      this.forParent(parent).filter((row) => row.id !== attachmentId),
    );
  }

  async delete(parent: AttachmentParent, attachmentId: string): Promise<void> {
    await this.api.invoke(deleteAttachment, { attachment_id: attachmentId });
    this.set(
      parent,
      this.forParent(parent).filter((row) => row.id !== attachmentId),
    );
  }

  async restore(parent: AttachmentParent, attachmentId: string): Promise<AttachmentRead | null> {
    try {
      const restored = await this.api.invoke(restoreAttachment, { attachment_id: attachmentId });
      this.set(parent, [restored, ...this.forParent(parent)]);
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

  private list(parent: AttachmentParent): Promise<AttachmentPage> {
    switch (parent.attachedTo) {
      case 'project':
        return this.api.invoke(listProjectAttachments, {
          project_id: parent.id,
          limit: PAGE_SIZE,
        });
      case 'expense':
        return this.api.invoke(listAttachments, { expense_id: parent.id, limit: PAGE_SIZE });
      case 'agreement':
        return this.api.invoke(listAgreementAttachments, {
          agreement_id: parent.id,
          limit: PAGE_SIZE,
        });
      case 'delivery':
        return this.api.invoke(listDeliveryAttachments, {
          delivery_id: parent.id,
          limit: PAGE_SIZE,
        });
    }
  }

  private create(parent: AttachmentParent, file: File): Promise<AttachmentRead> {
    // The generated client types multipart file fields as string.
    const body = { file: file as unknown as string };
    const project_id = parent.projectId;
    switch (parent.attachedTo) {
      case 'project':
        return this.api.invoke(createProjectAttachment, { project_id, body });
      case 'expense':
        return this.api.invoke(createAttachment, { project_id, expense_id: parent.id, body });
      case 'agreement':
        return this.api.invoke(createAgreementAttachment, {
          project_id,
          agreement_id: parent.id,
          body,
        });
      case 'delivery':
        return this.api.invoke(createDeliveryAttachment, {
          project_id,
          delivery_id: parent.id,
          body,
        });
    }
  }

  private key(parent: AttachmentParent): string {
    return `${parent.attachedTo}:${parent.id}`;
  }

  private set(parent: AttachmentParent, rows: AttachmentRead[]): void {
    this.state.update((all) => ({ ...all, [this.key(parent)]: rows }));
  }
}
