import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { LandDocumentRead, LandRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { LandDetailComponent } from './land-detail.component';
import { LandService } from './land.service';

function land(over: Partial<LandRead> = {}): LandRead {
  return {
    id: 'l1',
    name: 'Ewuru plot',
    address: '14 Jacaranda Close',
    city: 'Ewuru',
    state: 'Ogun',
    size_value: '648.5',
    size_unit: 'sqm',
    notes: null,
    document_count: 0,
    missing_kinds: ['certificate_of_occupancy', 'survey_plan', 'deed'],
    projects: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

function paper(over: Partial<LandDocumentRead> = {}): LandDocumentRead {
  return {
    id: 'd1',
    land_id: 'l1',
    kind: 'certificate_of_occupancy',
    filename: 'c-of-o.pdf',
    content_type: 'application/pdf',
    byte_size: 2048,
    checksum: 'abc',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

describe('LandDetailComponent', () => {
  let uploads: { kind: string; file: File }[];
  let removed: string[];
  let restored: string[];
  let toasts: { message: string; type: string }[];

  async function render(row: LandRead | null = land(), papers: LandDocumentRead[] = []) {
    uploads = [];
    removed = [];
    restored = [];
    toasts = [];

    const lands = {
      saving: () => false,
      error: () => null,
      get: async () => row,
      documents: async () => papers,
      documentUrl: (id: string) => `http://api/api/land-documents/${id}/file`,
      addDocument: async (_landId: string, kind: string, file: File) => {
        uploads.push({ kind, file });
        return paper({ kind: kind as LandDocumentRead['kind'] });
      },
      removeDocument: async (id: string) => {
        removed.push(id);
      },
      restoreDocument: async (id: string) => {
        restored.push(id);
      },
      archive: async () => undefined,
      restore: async () => undefined,
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LandDetailComponent],
      providers: [
        provideRouter([]),
        { provide: LandService, useValue: lands },
        {
          provide: ToastService,
          useValue: { show: (message: string, type = 'success') => toasts.push({ message, type }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(LandDetailComponent);
    fixture.componentRef.setInput('id', 'l1');
    fixture.detectChanges();
    const component = fixture.componentInstance;
    await component.load();
    fixture.detectChanges();
    return { component, fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('names the papers that have not arrived yet', async () => {
    const { component } = await render();
    expect(component.missingLine()).toBe(
      'Still to come: Certificate of Occupancy, Survey plan, Deed.',
    );
  });

  it('says so plainly once every paper is in', async () => {
    const { component } = await render(land({ missing_kinds: [] }));
    expect(component.missingLine()).toBe('Every paper worth chasing is here.');
  });

  it('shows the size the way it was recorded', async () => {
    const { component } = await render();
    expect(component.size(land())).toBe('648.5 sqm');
  });

  it('says a dash when the size was never taken', async () => {
    const { component } = await render();
    expect(component.size(land({ size_value: null, size_unit: null }))).toBe('—');
  });

  it('sends the chosen kind along with the file', async () => {
    const { component } = await render();
    component.kind.set('survey_plan');
    const file = new File(['a plan'], 'survey.pdf', { type: 'application/pdf' });

    await component.onPicked({
      target: { files: [file], value: '' },
    } as unknown as Event);

    expect(uploads).toEqual([{ kind: 'survey_plan', file }]);
    expect(toasts[0].message).toBe('Survey plan kept.');
  });

  it('does nothing when the picker is dismissed', async () => {
    const { component } = await render();

    await component.onPicked({ target: { files: [], value: '' } } as unknown as Event);

    expect(uploads).toEqual([]);
  });

  it('offers to put back the paper it just removed', async () => {
    const { component } = await render(land(), [paper()]);

    await component.remove(paper());
    expect(removed).toEqual(['d1']);
    expect(component.justRemoved()?.filename).toBe('c-of-o.pdf');

    await component.putBack();
    expect(restored).toEqual(['d1']);
    expect(component.justRemoved()).toBeNull();
  });

  it('points at the file through the api root, not a bare path', async () => {
    const { component } = await render(land(), [paper()]);
    expect(component.href(paper())).toBe('http://api/api/land-documents/d1/file');
  });

  it('says how big a file is in a way a person reads', async () => {
    const { component } = await render();
    expect(component.bytes(512)).toBe('512 B');
    expect(component.bytes(2048)).toBe('2 KB');
    expect(component.bytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('lists what is being built on the plot', async () => {
    const { element } = await render(
      land({
        projects: [{ id: 'p1', name: 'The house', status: 'active', deleted_at: null }],
      }),
    );
    expect(element.textContent).toContain('The house');
  });
});
