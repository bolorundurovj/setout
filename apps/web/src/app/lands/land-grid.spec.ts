import { GRIDS, gridOf, toPositions } from './land-grid';
import { polygonAreaSqm } from './land-geo';
import { runTraverse, type Leg } from './land-traverse';

// Sample survey plan: a 40 by 90 metre rectangle.
const BEACON = { northing: 800000, easting: 750000 };
const PLAN: Leg[] = [
  { degrees: 30, minutes: 0, distance: 40 },
  { degrees: 120, minutes: 0, distance: 90 },
  { degrees: 210, minutes: 0, distance: 40 },
  { degrees: 300, minutes: 0, distance: 90.02 },
];

describe('land grid', () => {
  // proj4 is lazy-loaded; loading it here keeps the first import out of individual test timeouts.
  beforeAll(async () => {
    await toPositions(gridOf('minna31'), [BEACON]);
  }, 30_000);

  it('lists latitude and longitude first, with no projection', () => {
    expect(GRIDS[0].value).toBe('latlon');
    expect(GRIDS[0].definition).toBe('');
  });

  it('falls back to latitude and longitude for an unknown grid', () => {
    expect(gridOf('nonsense').value).toBe('latlon');
    expect(gridOf('minna31').label).toBe('Minna / UTM 31N');
  });

  it('passes latitude and longitude through, longitude first', async () => {
    const out = await toPositions(gridOf('latlon'), [{ northing: 6.5244, easting: 3.3792 }]);
    expect(out).toEqual([[3.3792, 6.5244]]);
  });

  it('projects a Minna UTM 31N traverse to latitude and longitude', async () => {
    const { beacons } = runTraverse(BEACON, PLAN);

    const ring = await toPositions(gridOf('minna31'), beacons);

    expect(ring[0][1]).toBeCloseTo(7.2329, 3);
    expect(ring[0][0]).toBeCloseTo(5.2632, 3);
  });

  it('computes the traverse area from the projected beacons', async () => {
    const { beacons } = runTraverse(BEACON, PLAN);
    const ring = await toPositions(gridOf('minna31'), beacons);

    // 40 by 90 metres on the grid; slightly more on the ground because of the scale factor.
    expect(polygonAreaSqm(ring)).toBeCloseTo(3620, -1);
  });

  it('offsets Minna from WGS84 by about 150 m', async () => {
    const minna = await toPositions(gridOf('minna31'), [BEACON]);
    const wgs = await toPositions(gridOf('wgs31'), [BEACON]);

    const apart = Math.hypot(
      (minna[0][1] - wgs[0][1]) * 111_320,
      (minna[0][0] - wgs[0][0]) * 111_320 * Math.cos((7.23 * Math.PI) / 180),
    );
    expect(apart).toBeGreaterThan(100);
    expect(apart).toBeLessThan(200);
  });

  it('places the same coordinates in another zone hundreds of kilometres away', async () => {
    const zone31 = await toPositions(gridOf('minna31'), [BEACON]);
    const zone32 = await toPositions(gridOf('minna32'), [BEACON]);

    expect(Math.abs(zone31[0][0] - zone32[0][0])).toBeGreaterThan(5);
  });

  it('projects every Nigerian grid inside Nigeria', async () => {
    for (const grid of GRIDS.filter((g) => g.definition)) {
      const [[lon, lat]] = await toPositions(grid, [BEACON]);
      expect(lat, grid.label).toBeGreaterThan(3);
      expect(lat, grid.label).toBeLessThan(15);
      expect(lon, grid.label).toBeGreaterThan(2);
      expect(lon, grid.label).toBeLessThan(15);
    }
  });
});
