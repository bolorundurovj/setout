import type { GeocodedPlace } from '@setout/api-client';
import { findLocationMismatch, locationMismatchMessage, type LandLocation } from './land-place';

const LOCATION: LandLocation = { city: 'Ewuru', state: 'Ogun', countryCode: 'NG' };

function geocoded(over: Partial<GeocodedPlace> = {}): GeocodedPlace {
  return { address: null, city: 'Ewuru', state: 'Ogun', country_code: 'NG', ...over };
}

describe('findLocationMismatch', () => {
  it('returns null when the map address matches the location', () => {
    expect(findLocationMismatch(geocoded(), LOCATION)).toBeNull();
  });

  it('ignores case and whitespace', () => {
    expect(
      findLocationMismatch(geocoded({ city: '  ewuru ', state: 'OGUN' }), LOCATION),
    ).toBeNull();
  });

  it('matches Ogun and Ogun State', () => {
    expect(findLocationMismatch(geocoded({ state: 'Ogun State' }), LOCATION)).toBeNull();
  });

  it('strips administrative suffixes', () => {
    for (const suffix of ['Province', 'Region', 'Territory', 'District', 'County']) {
      expect(findLocationMismatch(geocoded({ state: `Ogun ${suffix}` }), LOCATION)).toBeNull();
    }
  });

  it('reports a city mismatch', () => {
    expect(findLocationMismatch(geocoded({ city: 'Ikeja' }), LOCATION)).toBe('city');
  });

  it('reports a state mismatch', () => {
    expect(findLocationMismatch(geocoded({ state: 'Lagos' }), LOCATION)).toBe('state');
  });

  it('reports a country mismatch', () => {
    expect(findLocationMismatch(geocoded({ country_code: 'GH' }), LOCATION)).toBe('country');
  });

  it('returns the coarsest mismatch', () => {
    const otherCountry = geocoded({ city: 'Accra', state: 'Greater Accra', country_code: 'GH' });
    expect(findLocationMismatch(otherCountry, LOCATION)).toBe('country');

    const otherState = geocoded({ city: 'Ikeja', state: 'Lagos' });
    expect(findLocationMismatch(otherState, LOCATION)).toBe('state');
  });

  it('treats an empty value on either side as unknown, not a mismatch', () => {
    expect(
      findLocationMismatch(geocoded({ city: null, state: null, country_code: null }), LOCATION),
    ).toBeNull();
    expect(findLocationMismatch(geocoded(), { city: '', state: '', countryCode: '' })).toBeNull();
  });
});

describe('locationMismatchMessage', () => {
  it('names the mismatched value from the map address', () => {
    expect(locationMismatchMessage('city', geocoded({ city: 'Ikeja' }))).toBe(
      'The location pin is in a different city: Ikeja.',
    );
  });

  it('shows the country name when a lookup is given', () => {
    const name = (code: string) => (code === 'GH' ? 'Ghana' : code);
    expect(locationMismatchMessage('country', geocoded({ country_code: 'GH' }), name)).toBe(
      'The location pin is in a different country: Ghana.',
    );
  });
});
