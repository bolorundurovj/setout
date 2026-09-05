import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { LandRead } from '@setout/api-client';
import { ToastService } from '../toast.service';
import { LandFormComponent } from './land-form.component';
import { LandService } from './land.service';
import { CountryService } from './country.service';

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
    notes: 'a note',
    document_count: 0,
    missing_kinds: [],
    projects: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over,
  };
}

describe('LandFormComponent', () => {
  let added: unknown[];
  let edited: unknown[];
  let navigations: unknown[][];
  let toasts: { message: string; type: string }[];

  async function render(id = '', existing: LandRead | null = land()) {
    added = [];
    edited = [];
    navigations = [];
    toasts = [];

    const lands = {
      saving: () => false,
      error: () => null,
      get: async () => existing,
      add: async (body: unknown) => {
        added.push(body);
        return land({ id: 'l9', name: 'Saved Plot' });
      },
      edit: async (_id: string, body: unknown) => {
        edited.push(body);
        return land({ id: 'l9', name: 'Saved Plot' });
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

  it('starts empty when adding a plot', async () => {
    const component = await render();
    expect(component.isEdit()).toBe(false);
    expect(component.title()).toBe('New Land');
    expect(component.name()).toBe('');
  });

  it('fills itself from the plot being edited', async () => {
    const component = await render('l1');
    expect(component.isEdit()).toBe(true);
    expect(component.name()).toBe('Ewuru plot');
    expect(component.city()).toBe('Ewuru');
    expect(component.sizeValue()).toBe('648.5');
    expect(component.sizeUnit()).toBe('sqm');
  });

  it('will not save a size with no unit', async () => {
    const component = await render();
    component.name.set('Ewuru plot');
    component.sizeValue.set('648');

    expect(component.sizeNote()).toBe('Say what the figure is measured in.');
    expect(component.isValid()).toBe(false);
  });

  it('will not save a unit with no size', async () => {
    const component = await render();
    component.name.set('Ewuru plot');
    component.sizeUnit.set('acre');

    expect(component.sizeNote()).toBe('Say how big it is, or clear the unit.');
    expect(component.isValid()).toBe(false);
  });

  it('will not save a size of nothing', async () => {
    const component = await render();
    component.name.set('Ewuru plot');
    component.sizeValue.set('0');
    component.sizeUnit.set('sqm');

    expect(component.isValid()).toBe(false);
  });

  it('saves a plot with its size and unit together', async () => {
    const component = await render();
    component.name.set('  Ewuru plot  ');
    component.city.set(' Ewuru ');
    component.sizeValue.set('648.5');
    component.sizeUnit.set('sqm');

    await component.save();

    expect(added[0]).toEqual({
      name: 'Ewuru plot',
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
    });
    expect(navigations[0][0]).toEqual(['/lands', 'l9']);
  });

  it('sends no size at all when the figure is cleared', async () => {
    const component = await render();
    component.name.set('Ewuru plot');

    await component.save();

    expect(added[0]).toMatchObject({ size_value: null, size_unit: null });
  });

  it('edits the plot it was opened on', async () => {
    const component = await render('l1');
    component.name.set('Renamed plot');

    await component.save();

    expect(edited.length).toBe(1);
    expect(added.length).toBe(0);
    expect(toasts[0].message).toBe('Land saved.');
  });

  it('leaves an older plot its free text state when no country is named', async () => {
    const component = await render('l1', land({ state: 'lagos state', country_code: null }));

    expect(component.state()).toBe('lagos state');
    expect(component.country()).toBe('');

    await component.save();

    expect(edited[0]).toMatchObject({ state: 'lagos state', country_code: null });
  });

  it('keeps a state the newly named country also has', async () => {
    const component = await render('l1', land({ state: 'Lagos', country_code: null }));

    await component.pickCountry('NG');

    expect(component.state()).toBe('Lagos');
  });

  it('clears a state the newly named country has never heard of', async () => {
    const component = await render('l1', land({ state: 'Ogun', country_code: null }));

    await component.pickCountry('GH');

    expect(component.state()).toBe('');
  });

  it('offers only the states of the country that was picked', async () => {
    const component = await render();

    await component.pickCountry('NG');

    expect(component.stateChips().map((chip) => chip.label)).toEqual(['Lagos', 'Ogun']);
  });

  it('sends the country and the day it was bought', async () => {
    const component = await render();
    component.name.set('Ewuru plot');
    await component.pickCountry('NG');
    component.state.set('Lagos');
    component.purchasedOn.set('2023-03-11');

    await component.save();

    expect(added[0]).toMatchObject({
      country_code: 'NG',
      state: 'Lagos',
      purchased_on: '2023-03-11',
    });
  });
});
