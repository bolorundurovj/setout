import {
  DOCUMENT_KINDS,
  kindName,
  sizeLabel,
  unitName,
  whereLabel,
  worthLabel,
} from './land-labels';

describe('land labels', () => {
  it('spells out what each paper is', () => {
    expect(kindName('certificate_of_occupancy')).toBe('Certificate of Occupancy');
    expect(kindName('survey_plan')).toBe('Survey plan');
  });

  it('hands back anything it does not know', () => {
    expect(kindName('something_new')).toBe('something_new');
  });

  it('offers every kind the server accepts', () => {
    expect(DOCUMENT_KINDS).toEqual([
      'certificate_of_occupancy',
      'survey_plan',
      'deed',
      'architectural_plan',
      'receipt',
      'other',
    ]);
  });

  it('keeps a single unit singular', () => {
    expect(unitName('plot', '1')).toBe('plot');
    expect(unitName('acre', '1.00')).toBe('acre');
  });

  it('makes the unit plural for anything else', () => {
    expect(unitName('plot', '2')).toBe('plots');
    expect(unitName('hectare', '0.5')).toBe('hectares');
  });

  it('says the size the way the survey put it', () => {
    expect(sizeLabel({ size_value: '648.5', size_unit: 'sqm' })).toBe('648.5 sqm');
  });

  it('says nothing when the size is not known yet', () => {
    expect(sizeLabel({ size_value: null, size_unit: null })).toBe('');
    expect(sizeLabel({ size_value: '648', size_unit: null })).toBe('');
  });

  it('prefers the town and state for where a plot is', () => {
    expect(whereLabel({ city: 'Ewuru', state: 'Ogun', address: '14 Jacaranda' })).toBe(
      'Ewuru, Ogun',
    );
  });

  it('falls back to the address when there is no town', () => {
    expect(whereLabel({ city: null, state: null, address: '14 Jacaranda Close' })).toBe(
      '14 Jacaranda Close',
    );
  });

  it('says nothing when the plot has no location at all', () => {
    expect(whereLabel({ city: null, state: null, address: null })).toBe('');
  });

  it('reads what it is worth in the currency it was valued in', () => {
    expect(
      worthLabel({ current_value: 450000000, currency_code: 'NGN', currency_exponent: 2 }),
    ).toContain('4,500,000.00');
  });

  it('says nothing about worth when nothing has been valued', () => {
    expect(worthLabel({ current_value: null, currency_code: null, currency_exponent: null })).toBe(
      '',
    );
  });

  it('reads the country last, after the town and the state', () => {
    expect(
      whereLabel({
        city: 'Ewuru',
        state: 'Ogun',
        address: '14 Jacaranda',
        country_name: 'Nigeria',
      }),
    ).toBe('Ewuru, Ogun, Nigeria');
  });

  it('leaves out a country the plot never named', () => {
    expect(whereLabel({ city: 'Ewuru', state: 'Ogun', address: null, country_name: null })).toBe(
      'Ewuru, Ogun',
    );
  });
});
