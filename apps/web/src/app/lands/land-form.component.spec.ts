import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { GeocodedPlace, LandRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { LandFormComponent } from './land-form.component';
import { LandService } from './land.service';
import { CountryService } from './country.service';

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
    notes: 'a note',
    document_count: 0,
    missing_kinds: [],
    projects: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    archived_at: null,
    ...over,
  };
}

describe('LandFormComponent', () => {
  let created: unknown[];
  let edited: unknown[];
  let navigations: unknown[][];
  let toasts: { message: string; type: string }[];

  let geocoded: GeocodedPlace | null = null;

  async function render(id = '', existing: LandRead | null = land()) {
    created = [];
    geocoded = null;
    edited = [];
    navigations = [];
    toasts = [];

    const lands = {
      saving: () => false,
      error: () => null,
      get: async () => existing,
      reverseGeocode: async () => geocoded,
      create: async (body: unknown) => {
        created.push(body);
        return land({ id: 'l9', name: 'Saved Land' });
      },
      edit: async (_id: string, body: unknown) => {
        edited.push(body);
        return land({ id: 'l9', name: 'Saved Land' });
      },
    };

    const countries = {
      all: () => [
        { code: 'NG', name: 'Nigeria' },
        { code: 'GH', name: 'Ghana' },
      ],
      load: async () => undefined,
      loadStates: async () => undefined,
      states: (code: string) =>
        code === 'NG'
          ? [
              { code: 'NG-LA', country_code: 'NG', name: 'Lagos' },
              { code: 'NG-OG', country_code: 'NG', name: 'Ogun' },
            ]
          : [{ code: 'GH-AA', country_code: 'GH', name: 'Greater Accra' }],
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LandFormComponent],
      providers: [
        provideRouter([]),
        { provide: LandService, useValue: lands },
        { provide: CountryService, useValue: countries },
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

    const fixture = TestBed.createComponent(LandFormComponent);
    fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    await component.load();
    return component;
  }

  it('starts empty for a new land record', async () => {
    const component = await render();
    expect(component.isEdit()).toBe(false);
    expect(component.title()).toBe('New Land Record');
    expect(component.name()).toBe('');
  });

  it('loads the land record being edited', async () => {
    const component = await render('l1');
    expect(component.isEdit()).toBe(true);
    expect(component.name()).toBe('Ewuru');
    expect(component.city()).toBe('Ewuru');
    expect(component.statedArea()).toBe('648.5');
    expect(component.areaUnit()).toBe('sqm');
  });

  it('rejects a stated area without a unit', async () => {
    const component = await render();
    component.name.set('Ewuru');
    component.statedArea.set('648');

    expect(component.statedAreaError()).toBe('Select a unit for the area.');
    expect(component.isValid()).toBe(false);
  });

  it('rejects a unit without a stated area', async () => {
    const component = await render();
    component.name.set('Ewuru');
    component.areaUnit.set('acre');

    expect(component.statedAreaError()).toBe('Enter an area, or clear the unit.');
    expect(component.isValid()).toBe(false);
  });

  it('rejects a zero stated area', async () => {
    const component = await render();
    component.name.set('Ewuru');
    component.statedArea.set('0');
    component.areaUnit.set('sqm');

    expect(component.isValid()).toBe(false);
  });

  it('saves the stated area with its unit', async () => {
    const component = await render();
    component.name.set('  Ewuru  ');
    component.city.set(' Ewuru ');
    component.statedArea.set('648.5');
    component.areaUnit.set('sqm');

    await component.save();

    expect(created[0]).toEqual({
      name: 'Ewuru',
      address: null,
      city: 'Ewuru',
      state: null,
      country_code: null,
      purchased_on: null,
      latitude: null,
      longitude: null,
      boundary: null,
      size_value: '648.5',
      size_unit: 'sqm',
      notes: null,
      geocoded_address: null,
    });
    expect(navigations[0][0]).toEqual(['/lands', 'l9']);
  });

  it('sends no stated area or unit when the value is cleared', async () => {
    const component = await render();
    component.name.set('Ewuru');

    await component.save();

    expect(created[0]).toMatchObject({ size_value: null, size_unit: null });
  });

  it('updates the land record being edited', async () => {
    const component = await render('l1');
    component.name.set('Renamed land');

    await component.save();

    expect(edited.length).toBe(1);
    expect(created.length).toBe(0);
    expect(toasts[0].message).toBe('Land record saved.');
  });

  it('keeps a free-text state when no country is selected', async () => {
    const component = await render('l1', land({ state: 'lagos state', country_code: null }));

    expect(component.state()).toBe('lagos state');
    expect(component.country()).toBe('');

    await component.save();

    expect(edited[0]).toMatchObject({ state: 'lagos state', country_code: null });
  });

  it('keeps a state that exists in the selected country', async () => {
    const component = await render('l1', land({ state: 'Lagos', country_code: null }));

    await component.pickCountry('NG');

    expect(component.state()).toBe('Lagos');
  });

  it('clears a state not in the selected country', async () => {
    const component = await render('l1', land({ state: 'Ogun', country_code: null }));

    await component.pickCountry('GH');

    expect(component.state()).toBe('');
  });

  it('lists only the states of the selected country', async () => {
    const component = await render();

    await component.pickCountry('NG');

    expect(component.stateChips().map((chip) => chip.label)).toEqual(['Lagos', 'Ogun']);
  });

  it('sends the country and purchase date', async () => {
    const component = await render();
    component.name.set('Ewuru');
    await component.pickCountry('NG');
    component.state.set('Lagos');
    component.purchasedOn.set('2023-03-11');

    await component.save();

    expect(created[0]).toMatchObject({
      country_code: 'NG',
      state: 'Lagos',
      purchased_on: '2023-03-11',
    });
  });

  it('parses boundary points into a boundary', async () => {
    const component = await render();

    component.onPointsInput(['6.5244, 3.3792', '6.5251, 3.3792', '6.5251, 3.3799'].join('\n'));

    expect(component.pointsError()).toBe('');
    expect(component.boundary()?.coordinates[0].length).toBe(4);
    // Latitude was pointsText first; GeoJSON stores longitude first.
    expect(component.boundary()?.coordinates[0][0]).toEqual([3.3792, 6.5244]);
  });

  it('keeps the boundary point text as entered', async () => {
    const component = await render();
    const pointsText = ['6.5244,3.3792', '6.5251,3.3792', '6.5251,3.3799'].join('\n');

    component.onPointsInput(pointsText);

    expect(component.pointsText()).toBe(pointsText);
  });

  it('reports the invalid line and keeps the last valid boundary', async () => {
    const component = await render();
    component.onPointsInput(['6.5244, 3.3792', '6.5251, 3.3792', '6.5251, 3.3799'].join('\n'));
    const lastValid = component.boundary();

    component.onPointsInput(['6.5244, 3.3792', 'beacon 4 by the road'].join('\n'));

    expect(component.pointsError()).toBe('Line 2 is not a valid coordinate.');
    expect(component.boundary()).toBe(lastValid);
  });

  it('fills the boundary point text from the saved boundary', async () => {
    const component = await render();
    component.onPointsInput(['6.5244, 3.3792', '6.5251, 3.3792', '6.5251, 3.3799'].join('\n'));
    component.editingPoints.set(false);

    component.openPointsEditor();

    expect(component.pointsText().split('\n').length).toBe(3);
    expect(component.pointsText().split('\n')[0]).toBe('6.5244, 3.3792');
  });

  it('shows the boundary as GeoJSON', async () => {
    const component = await render();
    component.onPointsInput(['6.5244, 3.3792', '6.5251, 3.3792', '6.5251, 3.3799'].join('\n'));

    component.showGeoJson();

    expect(component.pointsText().startsWith('{"type":"Polygon"')).toBe(true);
  });

  it('saves the boundary parsed from boundary point text', async () => {
    const component = await render();
    component.name.set('Ewuru');
    component.onPointsInput(['6.5244, 3.3792', '6.5251, 3.3792', '6.5251, 3.3799'].join('\n'));

    await component.save();

    expect(created[0]).toMatchObject({
      boundary: { type: 'Polygon' },
    });
  });

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

  describe('pin outside the boundary', () => {
    it('shows no warning without a pin', async () => {
      const component = await render();
      component.boundary.set(SQUARE);

      expect(component.pinIsOutside()).toBe(false);
    });

    it('shows no warning without a boundary', async () => {
      const component = await render();
      await component.setPin({ lat: 6.505, lon: 3.305 });

      expect(component.pinIsOutside()).toBe(false);
    });

    it('shows no warning when the pin is inside the boundary', async () => {
      const component = await render();
      component.boundary.set(SQUARE);
      await component.setPin({ lat: 6.505, lon: 3.305 });

      expect(component.pinIsOutside()).toBe(false);
    });

    it('warns when the pin is outside the boundary', async () => {
      const component = await render();
      component.boundary.set(SQUARE);
      await component.setPin({ lat: 6.6, lon: 3.4 });

      expect(component.pinIsOutside()).toBe(true);
    });

    it('moves the pin to the boundary centroid and clears the warning', async () => {
      const component = await render();
      component.boundary.set(SQUARE);
      await component.setPin({ lat: 6.6, lon: 3.4 });

      component.centrePin();

      expect(component.pinIsOutside()).toBe(false);
      expect(component.pin()?.lat).toBeCloseTo(6.505, 3);
      expect(component.pin()?.lon).toBeCloseTo(3.305, 3);
    });

    it('leaves the pin unchanged without a boundary', async () => {
      const component = await render();
      await component.setPin({ lat: 6.6, lon: 3.4 });

      component.centrePin();

      expect(component.pin()).toEqual({ lat: 6.6, lon: 3.4 });
    });
  });

  describe('map address against the location', () => {
    it('shows no mismatch without a map address', async () => {
      const component = await render();
      component.city.set('Ewuru');

      await component.setPin({ lat: 6.5, lon: 3.3 });

      expect(component.mismatchMessage()).toBe('');
    });

    it('shows no mismatch when the map address matches', async () => {
      const component = await render();
      geocoded = { address: '14 Jacaranda', city: 'Ewuru', state: 'Ogun', country_code: 'NG' };
      component.city.set('Ewuru');
      component.state.set('Ogun');
      component.country.set('NG');

      await component.setPin({ lat: 6.5, lon: 3.3 });

      expect(component.mismatchMessage()).toBe('');
    });

    it('reports a state mismatch when the pin is in another state', async () => {
      const component = await render();
      geocoded = { address: '2 Allen Avenue', city: 'Ikeja', state: 'Lagos', country_code: 'NG' };
      component.city.set('Ewuru');
      component.state.set('Ogun');
      component.country.set('NG');

      await component.setPin({ lat: 6.6, lon: 3.35 });

      expect(component.mismatchMessage()).toContain('different state');
    });

    it('stores the map address when it matches', async () => {
      const component = await render();
      geocoded = { address: '14 Jacaranda', city: 'Ewuru', state: 'Ogun', country_code: 'NG' };

      await component.setPin({ lat: 6.5, lon: 3.3 });

      expect(component.geocodedAddress()).toBe('14 Jacaranda');
    });

    it('fills the location fields from the map address', async () => {
      const component = await render();
      geocoded = { address: '2 Allen Avenue', city: 'Ikeja', state: null, country_code: null };

      await component.setPin({ lat: 6.6, lon: 3.35 });
      component.useMapAddress();

      expect(component.address()).toBe('2 Allen Avenue');
      expect(component.city()).toBe('Ikeja');
    });

    it('clears the map address when the pin is cleared', async () => {
      const component = await render();
      geocoded = { address: '14 Jacaranda', city: 'Ewuru', state: 'Ogun', country_code: 'NG' };
      await component.setPin({ lat: 6.5, lon: 3.3 });

      await component.setPin(null);

      expect(component.mismatchMessage()).toBe('');
    });

    it('saves the map address with the entered address', async () => {
      const component = await render();
      geocoded = { address: '14 Jacaranda', city: 'Ewuru', state: 'Ogun', country_code: 'NG' };
      component.name.set('Ewuru');
      await component.setPin({ lat: 6.5, lon: 3.3 });

      await component.save();

      expect(created[0]).toMatchObject({ geocoded_address: '14 Jacaranda' });
    });
  });
});
