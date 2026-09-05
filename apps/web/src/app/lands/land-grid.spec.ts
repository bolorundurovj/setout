import { GRIDS, gridOf, toPositions } from './land-grid';
import { polygonAreaSqm } from './land-geo';
import { walk, type Leg } from './land-traverse';

// Invented, in the shape a survey plan comes in: a 40 by 90 rectangle.
const BEACON = { northing: 800000, easting: 750000 };
const PLAN: Leg[] = [
  { degrees: 30, minutes: 0, distance: 40 },
  { degrees: 120, minutes: 0, distance: 90 },
  { degrees: 210, minutes: 0, distance: 40 },
  { degrees: 300, minutes: 0, distance: 90.02 },
];

describe('land grid', () => {
  // proj4 is fetched on demand, and the first fetch is slower than a test's
  // patience. Pay for it once here rather than in whichever test ran first.
  beforeAll(async () => {
    await toPositions(gridOf('minna31'), [BEACON]);
  }, 30_000);

  it('offers latitude and longitude first, needing no projection', () => {
    expect(GRIDS[0].value).toBe('latlon');
    expect(GRIDS[0].definition).toBe('');
  });

  it('falls back to latitude and longitude for a grid it does not know', () => {
    expect(gridOf('nonsense').value).toBe('latlon');
    expect(gridOf('minna31').label).toBe('Minna / UTM 31N');
  });

  it('passes latitude and longitude through, longitude first', async () => {
    const out = await toPositions(gridOf('latlon'), [{ northing: 6.5244, easting: 3.3792 }]);
    expect(out).toEqual([[3.3792, 6.5244]]);
  });

  it('puts a plan on the earth where its grid says', async () => {
    const { corners } = walk(BEACON, PLAN);

    const ring = await toPositions(gridOf('minna31'), corners);

    expect(ring[0][1]).toBeCloseTo(7.2329, 3);
    expect(ring[0][0]).toBeCloseTo(5.2632, 3);
  });

  it('measures the plan at the size its sides say', async () => {
    const { corners } = walk(BEACON, PLAN);
    const ring = await toPositions(gridOf('minna31'), corners);

    // 40 by 90 metres on the grid, a shade more on the ground.
    expect(polygonAreaSqm(ring)).toBeCloseTo(3620, -1);
  });

  it('reads the same numbers 150m apart on Minna and on WGS84', async () => {
    const minna = await toPositions(gridOf('minna31'), [BEACON]);
    const wgs = await toPositions(gridOf('wgs31'), [BEACON]);

    const apart = Math.hypot(
      (minna[0][1] - wgs[0][1]) * 111_320,
      (minna[0][0] - wgs[0][0]) * 111_320 * Math.cos((7.23 * Math.PI) / 180),
    );
    expect(apart).toBeGreaterThan(100);
    expect(apart).toBeLessThan(200);
  });

  it('reads the same numbers in another zone hundreds of kilometres away', async () => {
    const here = await toPositions(gridOf('minna31'), [BEACON]);
    const there = await toPositions(gridOf('minna32'), [BEACON]);

    expect(Math.abs(here[0][0] - there[0][0])).toBeGreaterThan(5);
  });

  it('lands every Nigerian grid inside Nigeria', async () => {
    for (const grid of GRIDS.filter((g) => g.definition)) {
      const [[lon, lat]] = await toPositions(grid, [BEACON]);
      expect(lat, grid.label).toBeGreaterThan(3);
      expect(lat, grid.label).toBeLessThan(15);
      expect(lon, grid.label).toBeGreaterThan(2);
      expect(lon, grid.label).toBeLessThan(15);
    }
  });
});
