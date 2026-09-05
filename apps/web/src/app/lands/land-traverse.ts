/**
 * A survey plan of the common Nigerian sort gives one beacon and then walks the
 * plot as a bearing and a distance per side. Everything here is plane
 * trigonometry on the grid: turning the grid into latitude and longitude is a
 * separate job, in land-grid.ts.
 */

/** Northing and easting, in metres, on whatever grid the plan was drawn on. */
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
  corners: GridPoint[];
  /** How far the last leg lands from the first beacon. A surveyor's own check. */
  misclosure: number;
}

export function bearingOf(leg: Leg): number {
  return leg.degrees + leg.minutes / 60;
}

export function isLeg(leg: Leg): boolean {
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

/** Walk the legs from the beacon, one corner per leg, back round to the start. */
export function walk(start: GridPoint, legs: Leg[]): Traverse {
  const corners: GridPoint[] = [start];
  let here = start;
  for (const leg of legs) {
    const radians = (bearingOf(leg) * Math.PI) / 180;
    here = {
      northing: here.northing + leg.distance * Math.cos(radians),
      easting: here.easting + leg.distance * Math.sin(radians),
    };
    corners.push(here);
  }
  const last = corners[corners.length - 1];
  const misclosure = Math.hypot(last.northing - start.northing, last.easting - start.easting);
  // A finished plan walks all the way round, so its last corner is the beacon
  // again and is dropped. A half entered one has not got home yet, and every
  // corner it does have is real.
  const home = legs.length >= 3 && misclosure < 0.5;
  return { corners: home ? corners.slice(0, -1) : corners, misclosure };
}

export function closureNote(misclosure: number, legs: Leg[]): string {
  const walked = legs.reduce((total, leg) => total + leg.distance, 0);
  // Nothing is out of true until the plan has been walked all the way round.
  if (!walked || legs.length < 3) {
    return '';
  }
  if (misclosure < 0.05) {
    return `Closes to ${(misclosure * 1000).toFixed(0)}mm.`;
  }
  const ratio = Math.round(walked / misclosure);
  return `Out by ${misclosure.toFixed(2)}m, about 1 in ${ratio}. Check the bearings.`;
}
