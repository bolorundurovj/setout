import {
  DOCUMENT_KINDS,
  kindName,
  locationLabel,
  statedAreaLabel,
  unitName,
  valuationLabel,
} from './land-labels';

describe('land labels', () => {
  it('maps document kinds to labels', () => {
    expect(kindName('certificate_of_occupancy')).toBe('Certificate of Occupancy');
    expect(kindName('survey_plan')).toBe('Survey Plan');
  });

  it('returns unknown kinds unchanged', () => {
    expect(kindName('something_new')).toBe('something_new');
  });

  it('lists every document kind the API accepts', () => {
    expect(DOCUMENT_KINDS).toEqual([
      'certificate_of_occupancy',
      'survey_plan',
      'deed',
      'architectural_plan',
      'receipt',
      'other',
    ]);
  });

  it('uses the singular unit for a value of one', () => {
    expect(unitName('plot', '1')).toBe('plot');
    expect(unitName('acre', '1.00')).toBe('acre');
  });

  it('uses the plural unit for any other value', () => {
    expect(unitName('plot', '2')).toBe('plots');
    expect(unitName('hectare', '0.5')).toBe('hectares');
  });

  it('formats the stated area with its unit', () => {
    expect(statedAreaLabel({ size_value: '648.5', size_unit: 'sqm' })).toBe('648.5 sqm');
  });

  it('returns empty when the stated area or unit is missing', () => {
    expect(statedAreaLabel({ size_value: null, size_unit: null })).toBe('');
    expect(statedAreaLabel({ size_value: '648', size_unit: null })).toBe('');
  });

  it('uses the city and state for the location', () => {
    expect(locationLabel({ city: 'Ewuru', state: 'Ogun', address: '14 Jacaranda' })).toBe(
      'Ewuru, Ogun',
    );
  });

  it('falls back to the address without a city or state', () => {
    expect(locationLabel({ city: null, state: null, address: '14 Jacaranda Close' })).toBe(
      '14 Jacaranda Close',
    );
  });

  it('returns empty without any location', () => {
    expect(locationLabel({ city: null, state: null, address: null })).toBe('');
  });

  it('formats the valuation in its currency', () => {
    expect(
      valuationLabel({ current_value: 450000000, currency_code: 'NGN', currency_exponent: 2 }),
    ).toContain('4,500,000.00');
  });

  it('returns empty without a valuation', () => {
    expect(
      valuationLabel({ current_value: null, currency_code: null, currency_exponent: null }),
    ).toBe('');
  });

  it('puts the country after the city and state', () => {
    expect(
      locationLabel({
        city: 'Ewuru',
        state: 'Ogun',
        address: '14 Jacaranda',
        country_name: 'Nigeria',
      }),
    ).toBe('Ewuru, Ogun, Nigeria');
  });

  it('omits a missing country', () => {
    expect(locationLabel({ city: 'Ewuru', state: 'Ogun', address: null, country_name: null })).toBe(
      'Ewuru, Ogun',
    );
  });
});
