import type { Position } from './land-geo';
import type { GridPoint } from './land-traverse';

/**
 * The grids Nigerian survey plans are drawn on. A northing and an easting mean
 * nothing without one: the same pair reads hundreds of kilometres apart between
 * zones, and about 150m apart between Minna and WGS84. So it is always chosen,
 * never guessed.
 */
export interface Grid {
  value: string;
  label: string;
  /** A proj4 definition. Empty means the numbers are already latitude and longitude. */
  definition: string;
}

// Minna is the datum most Nigerian plans are drawn on. The shift to WGS84 is
// carried in the definition rather than applied by hand.
const MINNA = '+ellps=clrk80 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs';

export const GRIDS: Grid[] = [
  { value: 'latlon', label: 'Latitude and longitude', definition: '' },
  { value: 'minna31', label: 'Minna / UTM 31N', definition: `+proj=utm +zone=31 ${MINNA}` },
  { value: 'minna32', label: 'Minna / UTM 32N', definition: `+proj=utm +zone=32 ${MINNA}` },
  {
    value: 'wgs31',
    label: 'WGS84 / UTM 31N',
    definition: '+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs',
  },
  {
    value: 'wgs32',
    label: 'WGS84 / UTM 32N',
    definition: '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs',
  },
  {
    value: 'west',
    label: 'Minna / Nigeria West Belt',
    definition: `+proj=tmerc +lat_0=4 +lon_0=4.5 +k=0.99975 +x_0=230738.26 +y_0=0 ${MINNA}`,
  },
  {
    value: 'mid',
    label: 'Minna / Nigeria Mid Belt',
    definition: `+proj=tmerc +lat_0=4 +lon_0=8.5 +k=0.99975 +x_0=670553.98 +y_0=0 ${MINNA}`,
  },
  {
    value: 'east',
    label: 'Minna / Nigeria East Belt',
    definition: `+proj=tmerc +lat_0=4 +lon_0=12.5 +k=0.99975 +x_0=1110369.7 +y_0=0 ${MINNA}`,
  },
];

export function gridOf(value: string): Grid {
  return GRIDS.find((grid) => grid.value === value) ?? GRIDS[0];
}

// proj4 is only wanted once somebody actually has a survey in front of them, so
// it is fetched then rather than shipped in the first load.
type Proj4 = typeof import('proj4');

let loading: Promise<Proj4> | null = null;

async function projector(): Promise<Proj4> {
  // It is a CommonJS module, so it arrives either bare or under default.
  loading ??= import('proj4').then((module) => {
    const loaded = module as unknown as { default?: Proj4 };
    return loaded.default ?? (module as unknown as Proj4);
  });
  return loading;
}

/** Grid metres to GeoJSON positions, longitude first. */
export async function toPositions(grid: Grid, points: GridPoint[]): Promise<Position[]> {
  if (!grid.definition) {
    return points.map(({ northing, easting }) => [easting, northing]);
  }
  const proj4 = await projector();
  return points.map(({ northing, easting }) => {
    const [longitude, latitude] = proj4(grid.definition, 'EPSG:4326', [easting, northing]);
    return [longitude, latitude];
  });
}
