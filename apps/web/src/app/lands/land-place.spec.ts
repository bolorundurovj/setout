import type { GeocodedPlace } from '@setout/api-client';
import { disagreementNote, placeDisagrees, type PlotPlace } from './land-place';

const PLOT: PlotPlace = { city: 'Ewuru', state: 'Ogun', countryCode: 'NG' };

function pin(over: Partial<GeocodedPlace> = {}): GeocodedPlace {
  return { address: null, city: 'Ewuru', state: 'Ogun', country_code: 'NG', ...over };
}

describe('a pin against what the plot says', () => {
  it('says nothing when they agree', () => {
    expect(placeDisagrees(pin(), PLOT)).toBeNull();
  });

  it('does not care about case or padding', () => {
    expect(placeDisagrees(pin({ city: '  ewuru ', state: 'OGUN' }), PLOT)).toBeNull();
  });

  it('reads Ogun and Ogun State as the same place', () => {
    expect(placeDisagrees(pin({ state: 'Ogun State' }), PLOT)).toBeNull();
  });

  it('drops the other words a geocoder tacks on', () => {
    for (const suffix of ['Province', 'Region', 'Territory', 'District', 'County']) {
      expect(placeDisagrees(pin({ state: `Ogun ${suffix}` }), PLOT)).toBeNull();
    }
  });

  it('catches a pin in another town', () => {
    expect(placeDisagrees(pin({ city: 'Ikeja' }), PLOT)).toBe('town');
  });

  it('catches a pin in another state', () => {
    expect(placeDisagrees(pin({ state: 'Lagos' }), PLOT)).toBe('state');
  });

  it('catches a pin in another country', () => {
    expect(placeDisagrees(pin({ country_code: 'GH' }), PLOT)).toBe('country');
  });

  it('says the coarsest thing that is wrong', () => {
    const abroad = pin({ city: 'Accra', state: 'Greater Accra', country_code: 'GH' });
    expect(placeDisagrees(abroad, PLOT)).toBe('country');

    const away = pin({ city: 'Ikeja', state: 'Lagos' });
    expect(placeDisagrees(away, PLOT)).toBe('state');
  });

  it('treats a blank on either side as unknown, not as a difference', () => {
    expect(placeDisagrees(pin({ city: null, state: null, country_code: null }), PLOT)).toBeNull();
    expect(placeDisagrees(pin(), { city: '', state: '', countryCode: '' })).toBeNull();
  });

  it('names what the map called it', () => {
    expect(disagreementNote('town', pin({ city: 'Ikeja' }))).toBe(
      'The pin is in a different town. The map calls it Ikeja.',
    );
    expect(disagreementNote('country', pin({ country_code: 'GH' }))).toContain('GH');
  });
});
