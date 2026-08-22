import { TestBed } from '@angular/core/testing';
import { Api } from '@setout/api-client';
import { AttachmentService } from './attachment.service';

function file(id: string, over: Record<string, unknown> = {}) {
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
    deleted_at: null,
    ...over,
  };
}

describe('AttachmentService', () => {
  let asked: Record<string, unknown>[];

  function configure(reply: (name: string, params: Record<string, unknown>) => unknown) {
    asked = [];
    TestBed.resetTestingModule();
    const api = {
      rootUrl: '',
      invoke: async (fn: { name?: string }, params: Record<string, unknown>) => {
        asked.push({ call: fn?.name ?? '', ...params });
        return reply(fn?.name ?? '', params ?? {});
      },
    };
    TestBed.configureTestingModule({ providers: [{ provide: Api, useValue: api }] });
    return TestBed.inject(AttachmentService);
  }

  it('keeps each expense to its own files', async () => {
    const service = configure((_name, params) =>
      params['expense_id'] === 'e1'
        ? { items: [file('a')], total: 1 }
        : { items: [file('b'), file('c')], total: 2 },
    );

    await service.load('e1');
    await service.load('e2');

    expect(service.forExpense('e1').map((row) => row.id)).toEqual(['a']);
    expect(service.forExpense('e2').map((row) => row.id)).toEqual(['b', 'c']);
    expect(service.forExpense('never asked')).toEqual([]);
  });

  it('sends the file itself rather than its name', async () => {
    const service = configure(() => file('a'));
    const photo = new File(['a receipt'], 'receipt.jpg', { type: 'image/jpeg' });

    await service.add('p1', 'e1', photo);

    expect((asked[0]['body'] as { file: unknown }).file).toBe(photo);
    expect(service.forExpense('e1').map((row) => row.id)).toEqual(['a']);
  });

  it('repeats what the server said when a file is refused', async () => {
    const service = configure(() => {
      throw { error: { detail: 'That file is larger than the 25 MB limit' } };
    });

    const added = await service.add('p1', 'e1', new File(['x'], 'big.jpg', { type: 'image/jpeg' }));

    expect(added).toBeNull();
    expect(service.error()).toBe('That file is larger than the 25 MB limit');
  });

  it('takes a removed file out of the list it was in', async () => {
    const service = configure((name) =>
      name === 'listAttachments' ? { items: [file('a'), file('b')], total: 2 } : undefined,
    );
    await service.load('e1');

    await service.remove('e1', 'a');

    expect(service.forExpense('e1').map((row) => row.id)).toEqual(['b']);
  });

  it('says so when the list cannot be read', async () => {
    const service = configure(() => {
      throw new Error('offline');
    });

    await service.load('e1');

    expect(service.error()).toBe('Could not read what is attached.');
    expect(service.forExpense('e1')).toEqual([]);
  });

  it('points at a link the browser can fetch with the session it already has', () => {
    const service = configure(() => undefined);
    expect(service.fileUrl('a1')).toBe('/api/attachments/a1/file');
  });

  it('says sizes the way a person would', () => {
    const service = configure(() => undefined);
    expect(service.size(900)).toBe('900 B');
    expect(service.size(2048)).toBe('2 KB');
    expect(service.size(1_258_291)).toBe('1.2 MB');
  });
});
