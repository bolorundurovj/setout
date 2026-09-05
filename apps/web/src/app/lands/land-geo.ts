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

/**
 * One coordinate, in whatever a survey plan wrote it: a decimal degree, or
 * degrees-minutes-seconds with a hemisphere on either end.
 */
export function degreesFrom(token: string): number | null {
  const text = token.trim();
  if (!text) {
    return null;
  }
  const hemisphere = /[NSEWnsew]/.exec(text)?.[0]?.toUpperCase();
  const numbers = text.match(/-?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0 || numbers.length > 3) {
    return null;
  }
  const [degrees, minutes, seconds] = numbers.map(Number);
  if (numbers.length > 1 && degrees < 0) {
    return null; // A sign and a hemisphere disagree about which way is down.
  }
  const size = Math.abs(degrees) + (minutes ?? 0) / 60 + (seconds ?? 0) / 3600;
  if (Number.isNaN(size)) {
    return null;
  }
  const negative = degrees < 0 || hemisphere === 'S' || hemisphere === 'W';
  return negative ? -size : size;
}

/** A line of a survey list: latitude first, then longitude. */
export function parseCoordinate(line: string): Position | null {
  // "Beacon 3: 6.5244, 3.3792" is how a plan is usually copied out.
  const body = line.includes(':') ? line.slice(line.lastIndexOf(':') + 1) : line;
  const text = body.trim();
  if (!text) {
    return null;
  }
  const halves = splitPair(text);
  if (!halves) {
    return null;
  }
  const latitude = degreesFrom(halves[0]);
  const longitude = degreesFrom(halves[1]);
  if (latitude === null || longitude === null) {
    return null;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return null;
  }
  return [longitude, latitude];
}

function splitPair(text: string): [string, string] | null {
  // A hemisphere letter ends its own half, whichever side of the number it sits.
  const marked = /^(.*?[NSns])[\s,]*(.*[EWew].*)$/.exec(text);
  if (marked) {
    return [marked[1], marked[2]];
  }
  const parts = text.split(/[,;\s]+/).filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

/** Every corner of a pasted list, in the order they were written. */
export function parseCorners(text: string): { boundary?: LandBoundary; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { boundary: undefined };
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return parseBoundary(trimmed);
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => /\d/.test(line));
  const ring: Position[] = [];
  for (const [index, line] of lines.entries()) {
    const corner = parseCoordinate(line);
    if (!corner) {
      return { error: `Line ${index + 1} does not read as a coordinate.` };
    }
    ring.push(corner);
  }
  if (ring.length < 3) {
    const short = 3 - ring.length;
    return {
      error: `${short} more corner${short === 1 ? '' : 's'} before it encloses anything.`,
    };
  }
  return { boundary: boundaryOf(ring) ?? undefined };
}

/** The corners written back out the way they were typed: latitude first. */
export function cornerText(boundary: LandBoundary | null | undefined): string {
  return ringOf(boundary)
    .map(([lon, lat]) => `${lat}, ${lon}`)
    .join('\n');
}
