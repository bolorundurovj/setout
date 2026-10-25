import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { AttachmentParent, AttachmentService } from './attachment.service';

function attachment(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    project_id: 'p1',
    expense_id: 'e1',
    agreement_id: null,
    delivery_id: null,
    filename: 'receipt_16aug.jpg',
    content_type: 'image/jpeg',
    byte_size: 1_258_291,
    checksum: 'a'.repeat(64),
    created_at: '2026-08-16T00:00:00Z',
    updated_at: '2026-08-16T00:00:00Z',
    archived_at: null,
    ...over,
  };
}

function expense(id: string): AttachmentParent {
  return { attachedTo: 'expense', id, projectId: 'p1' };
}

describe('AttachmentService', () => {
  let invocations: Record<string, unknown>[];

  function configure(reply: (name: string, params: Record<string, unknown>) => unknown) {
    invocations = [];
    TestBed.resetTestingModule();
    const api = {
      rootUrl: '',
      invoke: async (fn: { name?: string }, params: Record<string, unknown>) => {
        invocations.push({ call: fn?.name ?? '', ...params });
        return reply(fn?.name ?? '', params ?? {});
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(AttachmentService);
  }

  it('caches attachments per parent', async () => {
    const service = configure((_name, params) =>
      params['expense_id'] === 'e1'
        ? { items: [attachment('a')], total: 1 }
        : { items: [attachment('b'), attachment('c')], total: 2 },
    );

    await service.load(expense('e1'));
    await service.load(expense('e2'));

    expect(service.forParent(expense('e1')).map((row) => row.id)).toEqual(['a']);
    expect(service.forParent(expense('e2')).map((row) => row.id)).toEqual(['b', 'c']);
    expect(service.forParent(expense('unknown'))).toEqual([]);
  });

  it('keeps parents of different types with the same id apart', async () => {
    const service = configure((name) =>
      name === 'listAgreementAttachments'
        ? { items: [attachment('a')], total: 1 }
        : { items: [], total: 0 },
    );
    const agreement: AttachmentParent = { attachedTo: 'agreement', id: 'x1', projectId: 'p1' };
    const delivery: AttachmentParent = { attachedTo: 'delivery', id: 'x1', projectId: 'p1' };

    await service.load(agreement);
    await service.load(delivery);

    expect(service.forParent(agreement).map((row) => row.id)).toEqual(['a']);
    expect(service.forParent(delivery)).toEqual([]);
  });

  it('lists and uploads through the operation for each parent type', async () => {
    const service = configure((name) =>
      name.startsWith('list') ? { items: [], total: 0 } : attachment('a'),
    );
    const file = new File(['a permit'], 'permit.pdf', { type: 'application/pdf' });
    const parents: AttachmentParent[] = [
      { attachedTo: 'project', id: 'p1', projectId: 'p1' },
      { attachedTo: 'expense', id: 'e1', projectId: 'p1' },
      { attachedTo: 'agreement', id: 'g1', projectId: 'p1' },
      { attachedTo: 'delivery', id: 'd1', projectId: 'p1' },
    ];

    for (const parent of parents) {
      await service.load(parent);
      await service.add(parent, file);
    }

    expect(invocations.map((row) => row['call'])).toEqual([
      'listProjectAttachments',
      'createProjectAttachment',
      'listAttachments',
      'createAttachment',
      'listAgreementAttachments',
      'createAgreementAttachment',
      'listDeliveryAttachments',
      'createDeliveryAttachment',
    ]);
    expect(invocations[5]).toMatchObject({ project_id: 'p1', agreement_id: 'g1' });
  });

  it('uploads the File object in the request body', async () => {
    const service = configure(() => attachment('a'));
    const upload = new File(['a receipt'], 'receipt.jpg', { type: 'image/jpeg' });

    await service.add(expense('e1'), upload);

    expect((invocations[0]['body'] as { file: unknown }).file).toBe(upload);
    expect(service.forParent(expense('e1')).map((row) => row.id)).toEqual(['a']);
  });

  it('sets the server error detail when an upload is rejected', async () => {
    const service = configure(() => {
      throw { error: { detail: 'That file is larger than the 25 MB limit' } };
    });

    const added = await service.add(
      expense('e1'),
      new File(['x'], 'big.jpg', { type: 'image/jpeg' }),
    );

    expect(added).toBeNull();
    expect(service.error()).toBe('That file is larger than the 25 MB limit');
  });

  it('takes an archived attachment out of the list', async () => {
    const service = configure((name) =>
      name === 'listAttachments'
        ? { items: [attachment('a'), attachment('b')], total: 2 }
        : undefined,
    );
    await service.load(expense('e1'));

    await service.archive(expense('e1'), 'a');

    expect(service.forParent(expense('e1')).map((row) => row.id)).toEqual(['b']);
  });

  it('sets an error and clears the list when listing fails', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });

    await service.load(expense('e1'));

    expect(service.error()).toBe('Could not load the attachments.');
    expect(service.forParent(expense('e1'))).toEqual([]);
  });

  it('builds the download URL', () => {
    const service = configure(() => undefined);
    expect(service.fileUrl('a1')).toBe('/api/attachments/a1/file');
  });

  it('formats byte sizes as B, KiB and MiB', () => {
    const service = configure(() => undefined);
    expect(service.formatSize(900)).toBe('900 B');
    expect(service.formatSize(2048)).toBe('2 KiB');
    expect(service.formatSize(1_258_291)).toBe('1.2 MiB');
  });
});
