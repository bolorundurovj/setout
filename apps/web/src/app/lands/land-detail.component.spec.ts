import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { LandDocumentRead, LandDocumentUpdate, LandRead } from '@setout/api-client';
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
    country_code: null,
    country_name: null,
    purchased_on: null,
    latitude: null,
    longitude: null,
    boundary: null,
    boundary_area_sqm: null,
    currency_code: null,
    currency_exponent: null,
    purchase_amount: null,
    current_value: null,
    valuation_count: 0,
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
    note: null,
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
  let uploads: { kind: string; file: File; note: string | null }[];
  let edited: { id: string; body: LandDocumentUpdate }[];
  let removed: string[];
  let restored: string[];
  let toasts: { message: string; type: string }[];
  let navigations: unknown[][];

  async function render(row: LandRead | null = land(), papers: LandDocumentRead[] = []) {
    uploads = [];
    edited = [];
    removed = [];
    restored = [];
    toasts = [];
    navigations = [];

    const lands = {
      saving: () => false,
      error: () => null,
      get: async () => row,
      documents: async () => papers,
      documentUrl: (id: string) => `http://api/api/land-documents/${id}/file`,
      addDocument: async (_landId: string, kind: string, file: File, note?: string | null) => {
        uploads.push({ kind, file, note: note ?? null });
        return paper({ kind: kind as LandDocumentRead['kind'] });
      },
      editDocument: async (id: string, body: LandDocumentUpdate) => {
        edited.push({ id, body });
        return paper({ kind: body.kind ?? undefined, note: body.note });
      },
      valuations: async () => [],
      addValuation: async () => null,
      removeValuation: async () => undefined,
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
    const router = TestBed.inject(Router);
    router.navigate = (...args: unknown[]) => {
      navigations.push(args);
      return Promise.resolve(true);
    };

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

    expect(uploads).toEqual([{ kind: 'survey_plan', file, note: '' }]);
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

  it('shows no map for a plot with neither a pin nor an edge', async () => {
    const { component } = await render();
    expect(component.hasMap(land())).toBe(false);
  });

  it('shows a map once there is a pin', async () => {
    const { component } = await render();
    expect(component.hasMap(land({ latitude: '6.52', longitude: '3.37' }))).toBe(true);
  });

  it('reads the boundary area in the unit the size uses', async () => {
    const { component } = await render();
    expect(component.area(land({ boundary_area_sqm: 10000, size_unit: 'hectare' }))).toBe(
      '1 hectares',
    );
    expect(component.area(land({ boundary_area_sqm: 648.5, size_unit: null }))).toBe('648.5 sqm');
  });

  it('says a dash when nothing has been drawn', async () => {
    const { component } = await render();
    expect(component.area(land())).toBe('—');
  });

  it('works out how far the drawn edge is from the recorded size', async () => {
    const { component } = await render();
    const gap = component.areaGap(
      land({ boundary_area_sqm: 648.5, size_value: '600', size_unit: 'sqm' }),
    );
    expect(gap).toBe(8);
  });

  it('compares nothing when the size is in plots', async () => {
    const { component } = await render();
    expect(
      component.areaGap(land({ boundary_area_sqm: 648.5, size_value: '1', size_unit: 'plot' })),
    ).toBeNull();
  });

  it('compares nothing when only one of the two figures exists', async () => {
    const { component } = await render();
    expect(
      component.areaGap(land({ boundary_area_sqm: 648.5, size_value: null, size_unit: null })),
    ).toBeNull();
    expect(component.areaGap(land({ size_value: '600', size_unit: 'sqm' }))).toBeNull();
  });

  it('offers no switch when the plot has only a boundary', async () => {
    const { component } = await render();
    const boundaryOnly = land({ boundary: { type: 'Polygon', coordinates: [[]] } });

    expect(component.mapTabs(boundaryOnly)).toEqual([]);
    expect(component.shownMap(boundaryOnly)).toBe('boundary');
  });

  it('offers no switch when the plot has only a pin', async () => {
    const { component } = await render();
    const pinOnly = land({ latitude: '6.52', longitude: '3.37' });

    expect(component.mapTabs(pinOnly)).toEqual([]);
    expect(component.shownMap(pinOnly)).toBe('pin');
  });

  it('offers both once the plot has a pin and an edge', async () => {
    const { component } = await render();
    const both = land({
      latitude: '6.52',
      longitude: '3.37',
      boundary: { type: 'Polygon', coordinates: [[]] },
    });

    expect(component.mapTabs(both).map((tab) => tab.value)).toEqual(['pin', 'boundary']);
    expect(component.shownMap(both)).toBe('pin');

    component.mapTab.set('boundary');

    expect(component.shownMap(both)).toBe('boundary');
  });

  it('ignores the chosen tab when that half is missing', async () => {
    const { component } = await render();
    component.mapTab.set('pin');

    expect(component.shownMap(land({ boundary: { type: 'Polygon', coordinates: [[]] } }))).toBe(
      'boundary',
    );
  });

  describe('a pin outside the edge', () => {
    const SQUARE = {
      type: 'Polygon' as const,
      coordinates: [
        [
          [3.3, 6.5],
          [3.31, 6.5],
          [3.31, 6.51],
          [3.3, 6.51],
          [3.3, 6.5],
        ] as [number, number][],
      ],
    };

    it('says nothing without both a pin and an edge', async () => {
      const { component } = await render();

      expect(component.pinIsOutside(land({ boundary: SQUARE }))).toBe(false);
      expect(component.pinIsOutside(land({ latitude: '6.505', longitude: '3.305' }))).toBe(false);
    });

    it('says nothing when the pin is inside', async () => {
      const { component } = await render();
      const plot = land({ latitude: '6.505', longitude: '3.305', boundary: SQUARE });

      expect(component.pinIsOutside(plot)).toBe(false);
    });

    it('catches a pin outside the edge', async () => {
      const { component } = await render();
      const plot = land({ latitude: '6.6', longitude: '3.4', boundary: SQUARE });

      expect(component.pinIsOutside(plot)).toBe(true);
    });

    it('shows it as a banner with a button to fix it', async () => {
      const { element } = await render(
        land({ latitude: '6.6', longitude: '3.4', boundary: SQUARE }),
      );

      const banner = element.querySelector('.banner.warn.pin-warning');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('outside the edge');
      expect(banner?.querySelector('button')?.textContent).toContain('Fix it on the form');
    });

    it('offers nothing to press on an archived plot', async () => {
      const { element } = await render(
        land({
          latitude: '6.6',
          longitude: '3.4',
          boundary: SQUARE,
          deleted_at: '2026-01-02T00:00:00Z',
        }),
      );

      const banner = element.querySelector('.banner.warn.pin-warning');
      expect(banner?.textContent).toContain('outside the edge');
      expect(banner?.querySelector('button')).toBeNull();
    });

    it('takes you to the form to fix it', async () => {
      const { component } = await render(
        land({ latitude: '6.6', longitude: '3.4', boundary: SQUARE }),
      );

      component.edit();

      expect(navigations.at(-1)?.[0]).toEqual(['/lands', 'l1', 'edit']);
    });
  });
});
