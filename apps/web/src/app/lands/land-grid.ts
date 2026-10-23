import type { Position } from './land-geo';
import type { GridPoint } from './land-traverse';

/**
 * Grids used by Nigerian survey plans. The same northing and easting differ by
 * hundreds of kilometres between zones and about 150m between Minna and WGS84,
 * so the grid is always selected, never inferred.
 */
export interface Grid {
  value: string;
  label: string;
  /** A proj4 definition. Empty when the values are already latitude and longitude. */
  definition: string;
}

// Minna is the datum of most Nigerian plans. The WGS84 shift is in the towgs84 parameters.
const MINNA = '+ellps=clrk80 +towgs84=-92,-93,122,0,0,0,0 +units=m +no_defs';

export const GRIDS: Grid[] = [
  { value: 'latlon', label: 'Latitude and Longitude', definition: '' },
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
    value: 'minna_west_belt',
    label: 'Minna / Nigeria West Belt',
    definition: `+proj=tmerc +lat_0=4 +lon_0=4.5 +k=0.99975 +x_0=230738.26 +y_0=0 ${MINNA}`,
  },
  {
    value: 'minna_mid_belt',
    label: 'Minna / Nigeria Mid Belt',
    definition: `+proj=tmerc +lat_0=4 +lon_0=8.5 +k=0.99975 +x_0=670553.98 +y_0=0 ${MINNA}`,
  },
  {
    value: 'minna_east_belt',
    label: 'Minna / Nigeria East Belt',
    definition: `+proj=tmerc +lat_0=4 +lon_0=12.5 +k=0.99975 +x_0=1110369.7 +y_0=0 ${MINNA}`,
  },
];

export function gridOf(value: string): Grid {
  return GRIDS.find((grid) => grid.value === value) ?? GRIDS[0];
}

// proj4 is lazy-loaded to keep it out of the initial bundle.
type Proj4 = typeof import('proj4');

let proj4Module: Promise<Proj4> | null = null;

async function loadProj4(): Promise<Proj4> {
  // proj4 is CommonJS, so the export is either the module itself or its default.
  proj4Module ??= import('proj4').then((module) => {
    const loaded = module as unknown as { default?: Proj4 };
    return loaded.default ?? (module as unknown as Proj4);
  });
  return proj4Module;
}

/** Converts grid metres to GeoJSON positions, longitude first. */
export async function toPositions(grid: Grid, points: GridPoint[]): Promise<Position[]> {
  if (!grid.definition) {
    return points.map(({ northing, easting }) => [easting, northing]);
  }
  const proj4 = await loadProj4();
  return points.map(({ northing, easting }) => {
    const [longitude, latitude] = proj4(grid.definition, 'EPSG:4326', [easting, northing]);
    return [longitude, latitude];
  });
}
