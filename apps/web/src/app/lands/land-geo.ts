import type { LandBoundary, LandSizeUnit } from '@setout/api-client';

/** Longitude first, the way GeoJSON orders a position. */
export type Position = [number, number];

const SQM_PER: Partial<Record<LandSizeUnit, number>> = {
  sqm: 1,
  hectare: 10_000,
  acre: 4046.8564224,
};

// WGS84 semi-major axis, in metres.
const EARTH_RADIUS = 6378137;

/**
 * Spherical excess, the same formula the server measures with. Kept here as
 * well so a boundary being typed in shows its size before it is saved.
 */
export function polygonAreaSqm(ring: Position[]): number {
  if (ring.length < 3) {
    return 0;
  }
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[(i + 1) % ring.length];
    total += radians(lon2 - lon1) * (2 + Math.sin(radians(lat1)) + Math.sin(radians(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS * EARTH_RADIUS) / 2);
}

/** A plot is not measured in plots anywhere twice, so it is never offered. */
export const AREA_UNITS: LandSizeUnit[] = ['sqm', 'hectare', 'acre'];

export function closeRing(ring: Position[]): Position[] {
  if (ring.length < 3) {
    return ring;
  }
  const [first] = ring;
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
}

export function boundaryOf(ring: Position[]): LandBoundary | null {
  return ring.length < 3 ? null : { type: 'Polygon', coordinates: [closeRing(ring)] };
}

/** The corners to draw, without the repeated closing one. */
export function ringOf(boundary: LandBoundary | null | undefined): Position[] {
  const ring = boundary?.coordinates?.[0];
  if (!ring || ring.length < 3) {
    return [];
  }
  const [first] = ring;
  const last = ring[ring.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1];
  return (closed ? ring.slice(0, -1) : ring).map((position) => [position[0], position[1]]);
}

export function inMetres(sqm: number, unit: LandSizeUnit): number | null {
  const per = SQM_PER[unit];
  return per === undefined ? null : sqm / per;
}

/** Rounded the way the size field stores it: two places, as a string. */
export function asSize(sqm: number, unit: LandSizeUnit): string | null {
  const value = inMetres(sqm, unit);
  return value === null ? null : String(Math.round(value * 100) / 100);
}

export function parseBoundary(text: string): { boundary?: LandBoundary; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { boundary: undefined };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: 'That is not JSON.' };
  }
  // A Feature or a FeatureCollection is what geojson.io hands you.
  const geometry = geometryIn(parsed);
  if (!geometry) {
    return { error: 'No polygon in there.' };
  }
  if (geometry.type !== 'Polygon') {
    return { error: `A boundary has to be a Polygon, not a ${geometry.type}.` };
  }
  const ring = ringOf(geometry as LandBoundary);
  if (ring.length < 3) {
    return { error: 'A boundary needs three corners before it encloses anything.' };
  }
  for (const [lon, lat] of ring) {
    if (typeof lon !== 'number' || typeof lat !== 'number' || Number.isNaN(lon + lat)) {
      return { error: 'Those corners are not numbers.' };
    }
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return { error: 'That is not anywhere on Earth. Longitude comes first.' };
    }
  }
  return { boundary: boundaryOf(ring) ?? undefined };
}

function geometryIn(parsed: unknown): { type?: string; coordinates?: unknown } | null {
  const value = parsed as Record<string, unknown> | null;
  if (!value || typeof value !== 'object') {
    return null;
  }
  if (value['type'] === 'FeatureCollection') {
    const features = value['features'];
    return Array.isArray(features) && features.length ? geometryIn(features[0]) : null;
  }
  if (value['type'] === 'Feature') {
    return geometryIn(value['geometry']);
  }
  return 'coordinates' in value ? (value as { type?: string; coordinates?: unknown }) : null;
}

export function boundaryText(boundary: LandBoundary | null | undefined): string {
  return boundary ? JSON.stringify(boundary) : '';
}
