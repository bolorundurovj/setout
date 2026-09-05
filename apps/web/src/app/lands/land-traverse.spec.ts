import { bearingOf, closureNote, isLeg, walk, type Leg } from './land-traverse';

// An invented plan in the shape a real one comes in: one beacon, then a bearing
// and a distance per side. A 40 by 90 rectangle, with the last leg 20mm long so
// it closes the way a good plan does rather than perfectly.
const BEACON = { northing: 800000, easting: 750000 };
const PLAN: Leg[] = [
  { degrees: 30, minutes: 0, distance: 40 },
  { degrees: 120, minutes: 0, distance: 90 },
  { degrees: 210, minutes: 0, distance: 40 },
  { degrees: 300, minutes: 0, distance: 90.02 },
];

describe('land traverse', () => {
  it('reads a bearing given in degrees and minutes', () => {
    expect(bearingOf({ degrees: 33, minutes: 41, distance: 1 })).toBeCloseTo(33.6833, 4);
    expect(bearingOf({ degrees: 302, minutes: 8, distance: 1 })).toBeCloseTo(302.1333, 4);
  });

  it('walks a plan back to its own beacon', () => {
    const { corners, misclosure } = walk(BEACON, PLAN);

    expect(corners.length).toBe(4);
    expect(misclosure).toBeLessThan(0.05);
  });

  it('puts each corner where the plan says', () => {
    const { corners } = walk(BEACON, PLAN);

    expect(corners[0]).toEqual(BEACON);
    expect(corners[1].northing).toBeCloseTo(800034.641, 2);
    expect(corners[1].easting).toBeCloseTo(750020, 2);
    expect(corners[2].northing).toBeCloseTo(799989.641, 2);
    expect(corners[3].easting).toBeCloseTo(750077.942, 2);
  });

  it('says so plainly when the plan closes', () => {
    const { misclosure } = walk(BEACON, PLAN);
    expect(closureNote(misclosure, PLAN)).toBe('Closes to 20mm.');
  });

  it('says how far out it is when a bearing was mistyped', () => {
    const wrong = [...PLAN];
    wrong[1] = { ...wrong[1], degrees: 132 };

    const { misclosure } = walk(BEACON, wrong);

    expect(misclosure).toBeGreaterThan(1);
    expect(closureNote(misclosure, wrong)).toContain('Check the bearings');
  });

  it('says nothing at all before any leg is entered', () => {
    expect(closureNote(0, [])).toBe('');
  });

  it('knows a leg that is not yet filled in', () => {
    expect(isLeg({ degrees: 30, minutes: 15, distance: 40 })).toBe(true);
    expect(isLeg({ degrees: 30, minutes: 15, distance: 0 })).toBe(false);
    expect(isLeg({ degrees: 360, minutes: 0, distance: 10 })).toBe(false);
    expect(isLeg({ degrees: 30, minutes: 60, distance: 10 })).toBe(false);
    expect(isLeg({ degrees: NaN, minutes: 0, distance: 10 })).toBe(false);
  });

  it('walks due north and due east exactly', () => {
    const { corners } = walk({ northing: 1000, easting: 2000 }, [
      { degrees: 0, minutes: 0, distance: 100 },
      { degrees: 90, minutes: 0, distance: 100 },
    ]);

    expect(corners[1].northing).toBeCloseTo(1100, 6);
    expect(corners[1].easting).toBeCloseTo(2000, 6);
    expect(corners[2].northing).toBeCloseTo(1100, 6);
    expect(corners[2].easting).toBeCloseTo(2100, 6);
  });
});
