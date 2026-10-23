import { bearingOf, closureNote, isValidLeg, runTraverse, type Leg } from './land-traverse';

// Sample plan: one beacon, then a bearing and distance per side. A 40 by 90 m
// rectangle whose last leg is 20 mm too long, so it does not close exactly.
const BEACON = { northing: 800000, easting: 750000 };
const PLAN: Leg[] = [
  { degrees: 30, minutes: 0, distance: 40 },
  { degrees: 120, minutes: 0, distance: 90 },
  { degrees: 210, minutes: 0, distance: 40 },
  { degrees: 300, minutes: 0, distance: 90.02 },
];

describe('land traverse', () => {
  it('converts degrees and minutes to a bearing', () => {
    expect(bearingOf({ degrees: 33, minutes: 41, distance: 1 })).toBeCloseTo(33.6833, 4);
    expect(bearingOf({ degrees: 302, minutes: 8, distance: 1 })).toBeCloseTo(302.1333, 4);
  });

  it('closes the sample traverse on its first beacon', () => {
    const { beacons, misclosure } = runTraverse(BEACON, PLAN);

    expect(beacons.length).toBe(4);
    expect(misclosure).toBeLessThan(0.05);
  });

  it('computes each beacon from bearing and distance', () => {
    const { beacons } = runTraverse(BEACON, PLAN);

    expect(beacons[0]).toEqual(BEACON);
    expect(beacons[1].northing).toBeCloseTo(800034.641, 2);
    expect(beacons[1].easting).toBeCloseTo(750020, 2);
    expect(beacons[2].northing).toBeCloseTo(799989.641, 2);
    expect(beacons[3].easting).toBeCloseTo(750077.942, 2);
  });

  it('reports closure in millimetres within 50 mm', () => {
    const { misclosure } = runTraverse(BEACON, PLAN);
    expect(closureNote(misclosure, PLAN)).toBe('Closes to 20mm.');
  });

  it('reports the misclosure and ratio for a wrong bearing', () => {
    const wrong = [...PLAN];
    wrong[1] = { ...wrong[1], degrees: 132 };

    const { misclosure } = runTraverse(BEACON, wrong);

    expect(misclosure).toBeGreaterThan(1);
    expect(closureNote(misclosure, wrong)).toContain('Check the bearings');
  });

  it('returns empty with fewer than three legs', () => {
    expect(closureNote(0, [])).toBe('');
  });

  it('rejects incomplete or out-of-range legs', () => {
    expect(isValidLeg({ degrees: 30, minutes: 15, distance: 40 })).toBe(true);
    expect(isValidLeg({ degrees: 30, minutes: 15, distance: 0 })).toBe(false);
    expect(isValidLeg({ degrees: 360, minutes: 0, distance: 10 })).toBe(false);
    expect(isValidLeg({ degrees: 30, minutes: 60, distance: 10 })).toBe(false);
    expect(isValidLeg({ degrees: NaN, minutes: 0, distance: 10 })).toBe(false);
  });

  it('computes due north and due east legs exactly', () => {
    const { beacons } = runTraverse({ northing: 1000, easting: 2000 }, [
      { degrees: 0, minutes: 0, distance: 100 },
      { degrees: 90, minutes: 0, distance: 100 },
    ]);

    expect(beacons[1].northing).toBeCloseTo(1100, 6);
    expect(beacons[1].easting).toBeCloseTo(2000, 6);
    expect(beacons[2].northing).toBeCloseTo(1100, 6);
    expect(beacons[2].easting).toBeCloseTo(2100, 6);
  });
});
