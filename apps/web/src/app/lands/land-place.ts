import type { GeocodedPlace } from '@setout/api-client';

/** Location fields as held by the land form. */
export interface LandLocation {
  city: string;
  state: string;
  countryCode: string;
}

export type LocationMismatch = 'country' | 'state' | 'city';

// Stored states use the ISO name ("Ogun"); geocoders often return "Ogun State",
// so the suffix is stripped before comparing.
const SUFFIXES = /\s+(state|province|region|territory|district|county)$/i;

function matchesOrUnknown(
  one: string | null | undefined,
  other: string | null | undefined,
): boolean {
  const a = (one ?? '').trim().replace(SUFFIXES, '').toLowerCase();
  const b = (other ?? '').trim().replace(SUFFIXES, '').toLowerCase();
  return !a || !b || a === b;
}

/** Returns the coarsest mismatch between the pin and the form: country, state, then city. */
export function findLocationMismatch(
  geocoded: GeocodedPlace,
  location: LandLocation,
): LocationMismatch | null {
  if (!matchesOrUnknown(geocoded.country_code, location.countryCode)) {
    return 'country';
  }
  if (!matchesOrUnknown(geocoded.state, location.state)) {
    return 'state';
  }
  if (!matchesOrUnknown(geocoded.city, location.city)) {
    return 'city';
  }
  return null;
}

export function locationMismatchMessage(
  mismatch: LocationMismatch,
  geocoded: GeocodedPlace,
  countryName: (code: string) => string = (code) => code,
): string {
  const geocodedValue = {
    country: countryName(geocoded.country_code ?? ''),
    state: geocoded.state,
    city: geocoded.city,
  }[mismatch];
  return `The location pin is in a different ${mismatch}: ${geocodedValue}.`;
}
