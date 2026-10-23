/**
 * Nigerian survey plans give one beacon and then a bearing and distance per side.
 * This file uses plane trigonometry on the grid; projection to latitude and
 * longitude is in land-grid.ts.
 */

/** Northing and easting in metres on the plan's grid. */
export interface GridPoint {
  northing: number;
  easting: number;
}

export interface Leg {
  degrees: number;
  minutes: number;
  distance: number;
}

export interface Traverse {
  beacons: GridPoint[];
  /** Distance in metres between the end of the last leg and the first beacon. */
  misclosure: number;
}

export function bearingOf(leg: Leg): number {
  return leg.degrees + leg.minutes / 60;
}

export function isValidLeg(leg: Leg): boolean {
  return (
    Number.isFinite(leg.degrees) &&
    Number.isFinite(leg.minutes) &&
    Number.isFinite(leg.distance) &&
    leg.degrees >= 0 &&
    leg.degrees < 360 &&
    leg.minutes >= 0 &&
    leg.minutes < 60 &&
    leg.distance > 0
  );
}

export function runTraverse(start: GridPoint, legs: Leg[]): Traverse {
  const beacons: GridPoint[] = [start];
  let current = start;
  for (const leg of legs) {
    const radians = (bearingOf(leg) * Math.PI) / 180;
    current = {
      northing: current.northing + leg.distance * Math.cos(radians),
      easting: current.easting + leg.distance * Math.sin(radians),
    };
    beacons.push(current);
  }
  const last = beacons[beacons.length - 1];
  const misclosure = Math.hypot(last.northing - start.northing, last.easting - start.easting);
  // A closed traverse ends on the first beacon, so its last beacon is dropped.
  // An incomplete traverse keeps every beacon.
  const closed = legs.length >= 3 && misclosure < 0.5;
  return { beacons: closed ? beacons.slice(0, -1) : beacons, misclosure };
}

export function closureNote(misclosure: number, legs: Leg[]): string {
  const perimeter = legs.reduce((total, leg) => total + leg.distance, 0);
  // Misclosure is only meaningful once at least three legs are entered.
  if (!perimeter || legs.length < 3) {
    return '';
  }
  if (misclosure < 0.05) {
    return `Closes to ${(misclosure * 1000).toFixed(0)}mm.`;
  }
  const ratio = Math.round(perimeter / misclosure);
  return `Misclosure ${misclosure.toFixed(2)}m, about 1 in ${ratio}. Check the bearings and distances.`;
}
