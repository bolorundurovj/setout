import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { AttachmentService } from './attachment.service';

function attachment(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    project_id: 'p1',
    expense_id: 'e1',
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

  it('caches attachments per expense', async () => {
    const service = configure((_name, params) =>
      params['expense_id'] === 'e1'
        ? { items: [attachment('a')], total: 1 }
        : { items: [attachment('b'), attachment('c')], total: 2 },
    );

    await service.load('e1');
    await service.load('e2');

    expect(service.forExpense('e1').map((row) => row.id)).toEqual(['a']);
    expect(service.forExpense('e2').map((row) => row.id)).toEqual(['b', 'c']);
    expect(service.forExpense('unknown')).toEqual([]);
  });

  it('uploads the File object in the request body', async () => {
    const service = configure(() => attachment('a'));
    const upload = new File(['a receipt'], 'receipt.jpg', { type: 'image/jpeg' });

    await service.add('p1', 'e1', upload);

    expect((invocations[0]['body'] as { file: unknown }).file).toBe(upload);
    expect(service.forExpense('e1').map((row) => row.id)).toEqual(['a']);
  });

  it('surfaces the server error detail when an upload is rejected', async () => {
    const service = configure(() => {
      throw { error: { detail: 'That file is larger than the 25 MB limit' } };
    });

    const added = await service.add('p1', 'e1', new File(['x'], 'big.jpg', { type: 'image/jpeg' }));

    expect(added).toBeNull();
    expect(service.error()).toBe('That file is larger than the 25 MB limit');
  });

  it('removes an archived attachment from the expense list', async () => {
    const service = configure((name) =>
      name === 'listAttachments'
        ? { items: [attachment('a'), attachment('b')], total: 2 }
        : undefined,
    );
    await service.load('e1');

    await service.remove('e1', 'a');

    expect(service.forExpense('e1').map((row) => row.id)).toEqual(['b']);
  });

  it('sets an error and clears the list when listing fails', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });

    await service.load('e1');

    expect(service.error()).toBe('Could not load the attachments.');
    expect(service.forExpense('e1')).toEqual([]);
  });

  it('builds the download URL', () => {
    const service = configure(() => undefined);
    expect(service.fileUrl('a1')).toBe('/api/attachments/a1/file');
  });

  it('formats byte sizes as B, KiB and MiB', () => {
    const service = configure(() => undefined);
    expect(service.size(900)).toBe('900 B');
    expect(service.size(2048)).toBe('2 KiB');
    expect(service.size(1_258_291)).toBe('1.2 MiB');
  });
});
