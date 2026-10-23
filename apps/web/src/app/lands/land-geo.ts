import type { LandBoundary, LandSizeUnit } from '@setout/api-client';

/** Longitude first, as in GeoJSON. */
export type Position = [number, number];

const SQM_PER: Partial<Record<LandSizeUnit, number>> = {
  sqm: 1,
  hectare: 10_000,
  acre: 4046.8564224,
};

const WGS84_SEMI_MAJOR_AXIS_M = 6378137;

/** Spherical excess, as on the server, so a boundary's area shows before it is saved. */
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
  return Math.abs((total * WGS84_SEMI_MAJOR_AXIS_M * WGS84_SEMI_MAJOR_AXIS_M) / 2);
}

/** Ray casting: a point is inside when an eastward ray crosses an odd number of edges. */
export function pointInRing(point: Position, ring: Position[]): boolean {
  if (ring.length < 3) {
    return false;
  }
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Area-weighted centroid. Can fall outside a concave ring, so check it with pointInRing. */
export function centroidOf(ring: Position[]): Position | null {
  if (ring.length < 3) {
    return null;
  }
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = xj * yi - xi * yj;
    twiceArea += cross;
    x += (xj + xi) * cross;
    y += (yj + yi) * cross;
  }
  if (twiceArea === 0) {
    return null;
  }
  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

/** Excludes plot, whose size in square metres varies by region. */
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

/** Ring positions without the repeated closing position. */
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

export function fromSquareMetres(sqm: number, unit: LandSizeUnit): number | null {
  const per = SQM_PER[unit];
  return per === undefined ? null : sqm / per;
}

/** Two decimal places as a string, matching the stated area field. */
export function formatAreaIn(sqm: number, unit: LandSizeUnit): string | null {
  const value = fromSquareMetres(sqm, unit);
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
    return { error: 'Not valid JSON.' };
  }
  // geojson.io exports a Feature or a FeatureCollection.
  const geometry = findGeometry(parsed);
  if (!geometry) {
    return { error: 'No polygon found.' };
  }
  if (geometry.type !== 'Polygon') {
    return { error: `A boundary must be a Polygon, not a ${geometry.type}.` };
  }
  const ring = ringOf(geometry as LandBoundary);
  if (ring.length < 3) {
    return { error: 'A boundary needs at least three boundary points.' };
  }
  for (const [lon, lat] of ring) {
    if (typeof lon !== 'number' || typeof lat !== 'number' || Number.isNaN(lon + lat)) {
      return { error: 'Boundary point coordinates must be numbers.' };
    }
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return { error: 'Coordinates are out of range. Longitude comes first.' };
    }
  }
  return { boundary: boundaryOf(ring) ?? undefined };
}

function findGeometry(parsed: unknown): { type?: string; coordinates?: unknown } | null {
  const value = parsed as Record<string, unknown> | null;
  if (!value || typeof value !== 'object') {
    return null;
  }
  if (value['type'] === 'FeatureCollection') {
    const features = value['features'];
    return Array.isArray(features) && features.length ? findGeometry(features[0]) : null;
  }
  if (value['type'] === 'Feature') {
    return findGeometry(value['geometry']);
  }
  return 'coordinates' in value ? (value as { type?: string; coordinates?: unknown }) : null;
}

export function boundaryText(boundary: LandBoundary | null | undefined): string {
  return boundary ? JSON.stringify(boundary) : '';
}

/** Parses decimal degrees or degrees-minutes-seconds with a hemisphere letter on either side. */
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
    return null; // Negative degrees-minutes-seconds are rejected; use a hemisphere letter.
  }
  const magnitude = Math.abs(degrees) + (minutes ?? 0) / 60 + (seconds ?? 0) / 3600;
  if (Number.isNaN(magnitude)) {
    return null;
  }
  const negative = degrees < 0 || hemisphere === 'S' || hemisphere === 'W';
  return negative ? -magnitude : magnitude;
}

/** Parses one boundary point line, latitude first. */
export function parseCoordinate(line: string): Position | null {
  // Strips a label prefix, as in "Beacon 3: 6.5244, 3.3792".
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
  // A latitude hemisphere letter ends the first half, before or after its number.
  const marked = /^(.*?[NSns])[\s,]*(.*[EWew].*)$/.exec(text);
  if (marked) {
    return [marked[1], marked[2]];
  }
  const parts = text.split(/[,;\s]+/).filter(Boolean);
  return parts.length === 2 ? [parts[0], parts[1]] : null;
}

export function parseBoundaryPoints(text: string): { boundary?: LandBoundary; error?: string } {
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
    const point = parseCoordinate(line);
    if (!point) {
      return { error: `Line ${index + 1} is not a valid coordinate.` };
    }
    ring.push(point);
  }
  if (ring.length < 3) {
    const short = 3 - ring.length;
    return {
      error: `${short} more boundary point${short === 1 ? '' : 's'} needed to enclose an area.`,
    };
  }
  return { boundary: boundaryOf(ring) ?? undefined };
}

/** Formats boundary points latitude first, matching the input format. */
export function boundaryPointsText(boundary: LandBoundary | null | undefined): string {
  return ringOf(boundary)
    .map(([lon, lat]) => `${lat}, ${lon}`)
    .join('\n');
}
