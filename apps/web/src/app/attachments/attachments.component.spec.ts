import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AttachmentRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import type { RequestStatus } from '../ui/request-status';
import { AttachmentParent, AttachmentService } from './attachment.service';
import { AttachmentsComponent } from './attachments.component';

const PARENT: AttachmentParent = { attachedTo: 'agreement', id: 'g1', projectId: 'p1' };

function attachment(id: string, over: Partial<AttachmentRead> = {}): AttachmentRead {
  return {
    id,
    project_id: 'p1',
    expense_id: null,
    agreement_id: 'g1',
    delivery_id: null,
    filename: 'contract.pdf',
    content_type: 'application/pdf',
    byte_size: 2048,
    checksum: 'a'.repeat(64),
    created_at: '2026-08-16T00:00:00Z',
    updated_at: '2026-08-16T00:00:00Z',
    archived_at: null,
    ...over,
  };
}

describe('AttachmentsComponent', () => {
  let rows: ReturnType<typeof signal<AttachmentRead[]>>;
  let status: ReturnType<typeof signal<RequestStatus>>;
  let loaded: { parent: AttachmentParent; includeArchived: boolean }[];
  let uploads: File[];
  let archived: string[];
  let deleted: string[];
  let toasts: string[];

  function render() {
    rows = signal<AttachmentRead[]>([]);
    status = signal<RequestStatus>('ready');
    loaded = [];
    uploads = [];
    archived = [];
    deleted = [];
    toasts = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AttachmentsComponent],
      providers: [
        {
          provide: AttachmentService,
          useValue: {
            saving: () => false,
            error: () => null,
            forParent: () => rows(),
            status: () => status(),
            load: async (parent: AttachmentParent, includeArchived = false) =>
              void loaded.push({ parent, includeArchived }),
            add: async (_parent: AttachmentParent, file: File) => {
              uploads.push(file);
              const created = attachment('a2', { filename: file.name });
              rows.update((all) => [created, ...all]);
              return created;
            },
            archive: async (_parent: AttachmentParent, id: string) => {
              archived.push(id);
              rows.update((all) => all.filter((row) => row.id !== id));
            },
            delete: async (_parent: AttachmentParent, id: string) => {
              deleted.push(id);
              rows.update((all) => all.filter((row) => row.id !== id));
            },
            restore: async (_parent: AttachmentParent, id: string) => attachment(id),
            fileUrl: (id: string) => `/api/attachments/${id}/file`,
            formatSize: (bytes: number) => `${bytes} B`,
          },
        },
        { provide: ToastService, useValue: { show: (message: string) => toasts.push(message) } },
      ],
    });
    const fixture = TestBed.createComponent(AttachmentsComponent);
    fixture.componentRef.setInput('parent', PARENT);
    fixture.detectChanges();
    return fixture;
  }

  it('loads the attachments of its parent', () => {
    render();
    expect(loaded).toEqual([{ parent: PARENT, includeArchived: false }]);
  });

  it('toggles archived attachments and permanently deletes after DELETE confirmation', async () => {
    const fixture = render();
    fixture.componentInstance.setIncludeArchived(true);
    fixture.detectChanges();
    expect(loaded.at(-1)).toEqual({ parent: PARENT, includeArchived: true });

    const old = attachment('a9', { archived_at: '2026-08-17T00:00:00Z' });
    rows.set([old]);
    fixture.detectChanges();

    fixture.componentInstance.requestDelete('a9');
    fixture.componentInstance.deleteConfirmationText.set('delete');
    await fixture.componentInstance.deletePermanently(old);
    expect(deleted).toEqual(['a9']);
  });

  it('shows No attachments when the parent has none', () => {
    const element = render().nativeElement as HTMLElement;
    expect(element.querySelector('.add')?.textContent).toContain('No attachments');
  });

  it('lists each attachment with its size', () => {
    const fixture = render();
    rows.set([attachment('a1')]);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.attached').length).toBe(1);
    expect(element.textContent).toContain('2048 B · stored on your server');
  });

  it('uploads the selected file and reports it', async () => {
    const fixture = render();
    const file = new File(['%PDF'], 'permit.pdf', { type: 'application/pdf' });
    const input = { files: [file], value: 'permit.pdf' } as unknown as HTMLInputElement;

    await fixture.componentInstance.onFileSelected({ target: input } as unknown as Event);

    expect(uploads).toEqual([file]);
    expect(input.value).toBe('');
    expect(toasts).toEqual(['permit.pdf attached.']);
  });

  it('offers Undo after an archive and restores the attachment', async () => {
    const fixture = render();
    rows.set([attachment('a1')]);
    fixture.detectChanges();

    await fixture.componentInstance.archive(attachment('a1'));
    fixture.detectChanges();
    expect(archived).toEqual(['a1']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'contract.pdf was archived.',
    );

    await fixture.componentInstance.restoreLastArchived();
    expect(fixture.componentInstance.lastArchived()).toBeNull();
    expect(toasts.at(-1)).toBe('contract.pdf restored.');
  });

  it('says there are no attachments only once the load succeeds', () => {
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;
    status.set('loading');
    fixture.detectChanges();
    expect(element.textContent).toContain('Loading attachments…');
    expect(element.textContent).not.toContain('No attachments');

    status.set('ready');
    fixture.detectChanges();
    expect(element.textContent).toContain('No attachments');
  });

  it('shows the load error instead of the empty state', () => {
    const fixture = render();
    status.set('error');
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.banner.warn')?.textContent).toContain(
      'Could not load the attachments.',
    );
    expect(element.textContent).not.toContain('No attachments');
  });
});
