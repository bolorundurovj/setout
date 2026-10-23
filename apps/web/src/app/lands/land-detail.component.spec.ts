import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { LandDocumentRead, LandDocumentUpdate, LandRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { LandDetailComponent } from './land-detail.component';
import { LandService } from './land.service';

function land(over: Partial<LandRead> = {}): LandRead {
  return {
    id: 'l1',
    name: 'Ewuru',
    address: '14 Jacaranda Close',
    geocoded_address: null,
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
    archived_at: null,
    ...over,
  };
}

function landDocument(over: Partial<LandDocumentRead> = {}): LandDocumentRead {
  return {
    id: 'd1',
    land_id: 'l1',
    kind: 'certificate_of_occupancy',
    notes: null,
    filename: 'c-of-o.pdf',
    content_type: 'application/pdf',
    byte_size: 2048,
    checksum: 'abc',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    ...over,
  };
}

describe('LandDetailComponent', () => {
  let uploads: { kind: string; file: File; notes: string | null }[];
  let edited: { id: string; body: LandDocumentUpdate }[];
  let archived: string[];
  let restored: string[];
  let toasts: { message: string; type: string }[];
  let navigations: unknown[][];

  async function render(row: LandRead | null = land(), documents: LandDocumentRead[] = []) {
    uploads = [];
    edited = [];
    archived = [];
    restored = [];
    toasts = [];
    navigations = [];

    const lands = {
      saving: () => false,
      error: () => null,
      get: async () => row,
      documents: async () => documents,
      documentUrl: (id: string) => `http://api/api/land-documents/${id}/file`,
      createDocument: async (_landId: string, kind: string, file: File, notes?: string | null) => {
        uploads.push({ kind, file, notes: notes ?? null });
        return landDocument({ kind: kind as LandDocumentRead['kind'] });
      },
      editDocument: async (id: string, body: LandDocumentUpdate) => {
        edited.push({ id, body });
        return landDocument({ kind: body.kind ?? undefined, notes: body.notes });
      },
      valuations: async () => [],
      createValuation: async () => null,
      archiveValuation: async () => undefined,
      restoreValuation: async () => undefined,
      archiveDocument: async (id: string) => {
        archived.push(id);
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

  it('lists missing document types', async () => {
    const { component } = await render();
    expect(component.missingDocumentsLabel()).toBe(
      'Missing: Certificate of Occupancy, Survey Plan, Deed.',
    );
  });

  it('reports all required documents present', async () => {
    const { component } = await render(land({ missing_kinds: [] }));
    expect(component.missingDocumentsLabel()).toBe('All required documents are present.');
  });

  it('formats the stated area', async () => {
    const { component } = await render();
    expect(component.statedArea(land())).toBe('648.5 sqm');
  });

  it('shows a dash without a stated area', async () => {
    const { component } = await render();
    expect(component.statedArea(land({ size_value: null, size_unit: null }))).toBe('—');
  });

  it('uploads the file with the selected document type', async () => {
    const { component } = await render();
    component.kind.set('survey_plan');
    const file = new File(['a plan'], 'survey.pdf', { type: 'application/pdf' });

    await component.onPicked({
      target: { files: [file], value: '' },
    } as unknown as Event);

    expect(uploads).toEqual([{ kind: 'survey_plan', file, notes: '' }]);
    expect(toasts[0].message).toBe('Survey Plan uploaded.');
  });

  it('uploads nothing when the file picker is dismissed', async () => {
    const { component } = await render();

    await component.onPicked({ target: { files: [], value: '' } } as unknown as Event);

    expect(uploads).toEqual([]);
  });

  it('restores the last archived document', async () => {
    const { component } = await render(land(), [landDocument()]);

    await component.archiveDocument(landDocument());
    expect(archived).toEqual(['d1']);
    expect(component.lastArchived()?.filename).toBe('c-of-o.pdf');

    await component.restoreLastArchived();
    expect(restored).toEqual(['d1']);
    expect(component.lastArchived()).toBeNull();
  });

  it('builds the download URL from the API root', async () => {
    const { component } = await render(land(), [landDocument()]);
    expect(component.href(landDocument())).toBe('http://api/api/land-documents/d1/file');
  });

  it('formats file sizes in B, KiB and MiB', async () => {
    const { component } = await render();
    expect(component.formatFileSize(512)).toBe('512 B');
    expect(component.formatFileSize(2048)).toBe('2 KiB');
    expect(component.formatFileSize(3 * 1024 * 1024)).toBe('3.0 MiB');
  });

  it('lists the projects that reference the land record', async () => {
    const { element } = await render(
      land({
        projects: [{ id: 'p1', name: 'The house', status: 'active', archived_at: null }],
      }),
    );
    expect(element.textContent).toContain('The house');
  });

  it('hides the map without a pin or boundary', async () => {
    const { component } = await render();
    expect(component.hasMap(land())).toBe(false);
  });

  it('shows the map with a pin', async () => {
    const { component } = await render();
    expect(component.hasMap(land({ latitude: '6.52', longitude: '3.37' }))).toBe(true);
  });

  it('shows the measured area in the stated area unit, singular for one', async () => {
    const { component } = await render();
    expect(component.measuredArea(land({ boundary_area_sqm: 10000, size_unit: 'hectare' }))).toBe(
      '1 hectare',
    );
    expect(component.measuredArea(land({ boundary_area_sqm: 648.5, size_unit: null }))).toBe(
      '648.5 sqm',
    );
  });

  it('shows a dash without a boundary', async () => {
    const { component } = await render();
    expect(component.measuredArea(land())).toBe('—');
  });

  it('computes the percentage difference between measured and stated area', async () => {
    const { component } = await render();
    const difference = component.areaDifferencePercent(
      land({ boundary_area_sqm: 648.5, size_value: '600', size_unit: 'sqm' }),
    );
    expect(difference).toBe(8);
  });

  it('returns null when the stated area is in plots', async () => {
    const { component } = await render();
    expect(
      component.areaDifferencePercent(
        land({ boundary_area_sqm: 648.5, size_value: '1', size_unit: 'plot' }),
      ),
    ).toBeNull();
  });

  it('returns null without both areas', async () => {
    const { component } = await render();
    expect(
      component.areaDifferencePercent(
        land({ boundary_area_sqm: 648.5, size_value: null, size_unit: null }),
      ),
    ).toBeNull();
    expect(
      component.areaDifferencePercent(land({ size_value: '600', size_unit: 'sqm' })),
    ).toBeNull();
  });

  it('shows no tabs with only a boundary', async () => {
    const { component } = await render();
    const boundaryOnly = land({ boundary: { type: 'Polygon', coordinates: [[]] } });

    expect(component.mapTabs(boundaryOnly)).toEqual([]);
    expect(component.shownMap(boundaryOnly)).toBe('boundary');
  });

  it('shows no tabs with only a pin', async () => {
    const { component } = await render();
    const pinOnly = land({ latitude: '6.52', longitude: '3.37' });

    expect(component.mapTabs(pinOnly)).toEqual([]);
    expect(component.shownMap(pinOnly)).toBe('pin');
  });

  it('shows both tabs with a pin and a boundary', async () => {
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

  it('ignores the selected tab when its map is missing', async () => {
    const { component } = await render();
    component.mapTab.set('pin');

    expect(component.shownMap(land({ boundary: { type: 'Polygon', coordinates: [[]] } }))).toBe(
      'boundary',
    );
  });

  it('shows the map address when it differs from the address', async () => {
    const { component } = await render();
    const row = land({
      address: 'The farm past the church',
      geocoded_address: '14 Jacaranda Close, Ewuru',
    });

    expect(component.mapAddress(row)).toBe('14 Jacaranda Close, Ewuru');
  });

  it('hides the map address when it matches the address', async () => {
    const { component } = await render();
    const row = land({ address: '14 Jacaranda', geocoded_address: '  14 Jacaranda  ' });

    expect(component.mapAddress(row)).toBe('');
  });

  it('hides the map address when none is stored', async () => {
    const { component } = await render();
    expect(component.mapAddress(land())).toBe('');
  });

  describe('pin outside the boundary', () => {
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

    it('returns false without both a pin and a boundary', async () => {
      const { component } = await render();

      expect(component.pinIsOutside(land({ boundary: SQUARE }))).toBe(false);
      expect(component.pinIsOutside(land({ latitude: '6.505', longitude: '3.305' }))).toBe(false);
    });

    it('returns false when the pin is inside', async () => {
      const { component } = await render();
      const row = land({ latitude: '6.505', longitude: '3.305', boundary: SQUARE });

      expect(component.pinIsOutside(row)).toBe(false);
    });

    it('returns true when the pin is outside the boundary', async () => {
      const { component } = await render();
      const row = land({ latitude: '6.6', longitude: '3.4', boundary: SQUARE });

      expect(component.pinIsOutside(row)).toBe(true);
    });

    it('shows a banner with an Edit Land Record button', async () => {
      const { element } = await render(
        land({ latitude: '6.6', longitude: '3.4', boundary: SQUARE }),
      );

      const banner = element.querySelector('.banner.warn.pin-warning');
      expect(banner).not.toBeNull();
      expect(banner?.textContent).toContain('outside the boundary');
      expect(banner?.querySelector('button')?.textContent).toContain('Edit Land');
    });

    it('shows no button on an archived land record', async () => {
      const { element } = await render(
        land({
          latitude: '6.6',
          longitude: '3.4',
          boundary: SQUARE,
          archived_at: '2026-01-02T00:00:00Z',
        }),
      );

      const banner = element.querySelector('.banner.warn.pin-warning');
      expect(banner?.textContent).toContain('outside the boundary');
      expect(banner?.querySelector('button')).toBeNull();
    });

    it('navigates to the edit form', async () => {
      const { component } = await render(
        land({ latitude: '6.6', longitude: '3.4', boundary: SQUARE }),
      );

      component.edit();

      expect(navigations.at(-1)?.[0]).toEqual(['/lands', 'l1', 'edit']);
    });
  });
});
