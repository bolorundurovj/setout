import type { GeocodedPlace } from '@setout/api-client';

/** What the plot says about where it is, as the form holds it. */
export interface PlotPlace {
  city: string;
  state: string;
  countryCode: string;
}

export type Disagreement = 'country' | 'state' | 'town';

// A plot's state is the canonical ISO name, "Ogun". A geocoder usually returns
// "Ogun State". Neither is wrong, so the suffix is dropped before comparing.
const SUFFIXES = /\s+(state|province|region|territory|district|county)$/i;

function same(one: string | null | undefined, other: string | null | undefined): boolean {
  const a = (one ?? '').trim().replace(SUFFIXES, '').toLowerCase();
  const b = (other ?? '').trim().replace(SUFFIXES, '').toLowerCase();
  // An empty side is unknown, not a disagreement.
  return !a || !b || a === b;
}

/**
 * Where the pin and the record fall out, coarsest first: a pin in the wrong
 * country is worth saying before a pin in the wrong street.
 */
export function placeDisagrees(pin: GeocodedPlace, plot: PlotPlace): Disagreement | null {
  if (!same(pin.country_code, plot.countryCode)) {
    return 'country';
  }
  if (!same(pin.state, plot.state)) {
    return 'state';
  }
  if (!same(pin.city, plot.city)) {
    return 'town';
  }
  return null;
}

export function disagreementNote(where: Disagreement, pin: GeocodedPlace): string {
  const said = {
    country: pin.country_code,
    state: pin.state,
    town: pin.city,
  }[where];
  const noun = where === 'town' ? 'town' : where;
  return `The pin is in a different ${noun}. The map calls it ${said}.`;
}
