import {
  boundaryOf,
  boundaryPointsText,
  centroidOf,
  closeRing,
  degreesFrom,
  formatAreaIn,
  fromSquareMetres,
  parseBoundary,
  parseBoundaryPoints,
  parseCoordinate,
  pointInRing,
  ringOf,
} from './land-geo';
import type { Position } from './land-geo';

const SQUARE: Position[] = [
  [3.3, 6.5],
  [3.3009, 6.5],
  [3.3009, 6.5009],
  [3.3, 6.5009],
];

describe('land geo', () => {
  describe('pointInRing and centroidOf', () => {
    const SQ: Position[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];

    it('returns true for a point inside the ring', () => {
      expect(pointInRing([2, 2], SQ)).toBe(true);
    });

    it('returns false for a point outside the ring', () => {
      expect(pointInRing([5, 2], SQ)).toBe(false);
      expect(pointInRing([-1, -1], SQ)).toBe(false);
    });

    it('ignores ring winding order', () => {
      expect(pointInRing([2, 2], [...SQ].reverse())).toBe(true);
    });

    it('returns false for a ring with fewer than three points', () => {
      expect(pointInRing([1, 1], SQ.slice(0, 2))).toBe(false);
    });

    it('returns the centroid of a square', () => {
      expect(centroidOf(SQ)).toEqual([2, 2]);
    });

    it('returns null centroid for two points', () => {
      expect(centroidOf(SQ.slice(0, 2))).toBeNull();
    });

    it('returns a centroid outside a concave L shape', () => {
      const lShape: Position[] = [
        [0, 0],
        [4, 0],
        [4, 1],
        [1, 1],
        [1, 4],
        [0, 4],
      ];

      const middle = centroidOf(lShape);

      expect(middle).not.toBeNull();
      expect(pointInRing(middle as Position, lShape)).toBe(false);
    });
  });

  it('closes an open ring', () => {
    const closed = closeRing(SQUARE);
    expect(closed.length).toBe(5);
    expect(closed[4]).toEqual(closed[0]);
  });

  it('leaves a closed ring unchanged', () => {
    const closed = closeRing(SQUARE);
    expect(closeRing(closed)).toEqual(closed);
  });

  it('returns null boundary for two points', () => {
    expect(boundaryOf(SQUARE.slice(0, 2))).toBeNull();
  });

  it('returns ring points without the closing point', () => {
    const boundary = boundaryOf(SQUARE);
    expect(ringOf(boundary).length).toBe(4);
    expect(ringOf(null)).toEqual([]);
  });

  it('converts square metres into the given unit', () => {
    expect(fromSquareMetres(10_000, 'sqm')).toBe(10_000);
    expect(fromSquareMetres(10_000, 'hectare')).toBe(1);
    expect(fromSquareMetres(4046.8564224, 'acre')).toBeCloseTo(1, 9);
  });

  it('returns null for plot units', () => {
    expect(fromSquareMetres(10_000, 'plot')).toBeNull();
    expect(formatAreaIn(10_000, 'plot')).toBeNull();
  });

  it('rounds to two decimal places', () => {
    expect(formatAreaIn(648.5049, 'sqm')).toBe('648.5');
    expect(formatAreaIn(10_000, 'hectare')).toBe('1');
  });

  it('parses a bare Polygon', () => {
    const { boundary, error } = parseBoundary(
      JSON.stringify({ type: 'Polygon', coordinates: [closeRing(SQUARE)] }),
    );
    expect(error).toBeUndefined();
    expect(ringOf(boundary).length).toBe(4);
  });

  it('parses a geojson.io FeatureCollection', () => {
    const { boundary } = parseBoundary(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [closeRing(SQUARE)] },
          },
        ],
      }),
    );
    expect(ringOf(boundary).length).toBe(4);
  });

  it('rejects text that is not JSON', () => {
    expect(parseBoundary('land near the church').error).toBe('Not valid JSON.');
  });

  it('rejects a geometry that is not a Polygon', () => {
    const { error } = parseBoundary(
      JSON.stringify({ type: 'LineString', coordinates: [[3.3, 6.5]] }),
    );
    expect(error).toContain('Polygon');
  });

  it('rejects out-of-range GeoJSON coordinates', () => {
    const { error } = parseBoundary(
      JSON.stringify({
        type: 'Polygon',
        coordinates: [
          [
            [6.5, 190],
            [6.5, 191],
            [6.6, 191],
          ],
        ],
      }),
    );
    expect(error).toContain('Longitude comes first');
  });

  it('returns no boundary and no error for empty text', () => {
    expect(parseBoundary('   ')).toEqual({ boundary: undefined });
  });

  describe('boundary point text', () => {
    it('parses decimal degrees', () => {
      expect(degreesFrom('6.5244')).toBeCloseTo(6.5244, 6);
      expect(degreesFrom('-6.5244')).toBeCloseTo(-6.5244, 6);
    });

    it('parses degrees, minutes and seconds', () => {
      expect(degreesFrom(`6°31'27.8"N`)).toBeCloseTo(6.524389, 5);
      expect(degreesFrom(`3°22'45.1"E`)).toBeCloseTo(3.379194, 5);
    });

    it('applies the hemisphere letter as the sign', () => {
      expect(degreesFrom(`33°55'30"S`)).toBeCloseTo(-33.925, 5);
      expect(degreesFrom(`0°10'00"W`)).toBeCloseTo(-0.166667, 5);
      expect(degreesFrom('6.5244S')).toBeCloseTo(-6.5244, 6);
    });

    it('parses degrees and minutes without seconds', () => {
      expect(degreesFrom(`6°31.5'N`)).toBeCloseTo(6.525, 5);
    });

    it('rejects a minus sign with degrees, minutes and seconds', () => {
      expect(degreesFrom(`-6°31'27.8"N`)).toBeNull();
    });

    it('rejects non-numeric input', () => {
      expect(degreesFrom('beacon')).toBeNull();
      expect(degreesFrom('')).toBeNull();
    });

    it('parses a latitude-first pair with any separator', () => {
      expect(parseCoordinate('6.5244, 3.3792')).toEqual([3.3792, 6.5244]);
      expect(parseCoordinate('6.5244 3.3792')).toEqual([3.3792, 6.5244]);
      expect(parseCoordinate('6.5244;3.3792')).toEqual([3.3792, 6.5244]);
    });

    it('parses a pair in degrees, minutes and seconds', () => {
      const position = parseCoordinate(`6°31'27.8"N 3°22'45.1"E`);
      expect(position?.[1]).toBeCloseTo(6.524389, 5);
      expect(position?.[0]).toBeCloseTo(3.379194, 5);
    });

    it('strips a beacon label prefix', () => {
      expect(parseCoordinate('Beacon 3: 6.5244, 3.3792')).toEqual([3.3792, 6.5244]);
    });

    it('rejects out-of-range coordinates', () => {
      expect(parseCoordinate('95.0, 3.3792')).toBeNull();
      expect(parseCoordinate('6.5244, 181')).toBeNull();
    });

    it('rejects a line with one number', () => {
      expect(parseCoordinate('6.5244')).toBeNull();
    });

    it('parses boundary points into a boundary', () => {
      const { boundary, error } = parseBoundaryPoints(
        ['6.5244, 3.3792', '6.5251, 3.3792', '6.5251, 3.3799', '6.5244, 3.3799'].join('\n'),
      );
      expect(error).toBeUndefined();
      expect(ringOf(boundary).length).toBe(4);
      expect(ringOf(boundary)[0]).toEqual([3.3792, 6.5244]);
    });

    it('accepts decimal degrees and degrees, minutes and seconds in one list', () => {
      const { boundary, error } = parseBoundaryPoints(
        ['6.5244, 3.3792', `6°31'30.4"N 3°22'48.0"E`, '6.5251, 3.3799'].join('\n'),
      );
      expect(error).toBeUndefined();
      expect(ringOf(boundary).length).toBe(3);
    });

    it('accepts GeoJSON in the same text', () => {
      const { boundary } = parseBoundaryPoints(
        JSON.stringify({ type: 'Polygon', coordinates: [closeRing(SQUARE)] }),
      );
      expect(ringOf(boundary).length).toBe(4);
    });

    it('reports the line number that is not a coordinate', () => {
      const { error } = parseBoundaryPoints(
        ['6.5244, 3.3792', 'somewhere near the church 12'].join('\n'),
      );
      expect(error).toBe('Line 2 is not a valid coordinate.');
    });

    it('reports how many more boundary points are needed', () => {
      const { error } = parseBoundaryPoints(['6.5244, 3.3792', '6.5251, 3.3792'].join('\n'));
      expect(error).toBe('1 more boundary point needed to enclose an area.');
    });

    it('formats boundary points latitude first', () => {
      const text = boundaryPointsText(boundaryOf(SQUARE));
      expect(text.split('\n').length).toBe(4);
      expect(text.split('\n')[0]).toBe('6.5, 3.3');
    });

    it('round-trips boundary point text', () => {
      const typed = ['6.5244, 3.3792', '6.5251, 3.3792', '6.5251, 3.3799'].join('\n');
      expect(boundaryPointsText(parseBoundaryPoints(typed).boundary)).toBe(typed);
    });

    it('skips lines without numbers', () => {
      const { boundary, error } = parseBoundaryPoints(
        ['SURVEY PLAN OF LAND AT EWURU', '6.5244, 3.3792', '6.5251, 3.3792', '6.5251, 3.3799'].join(
          '\n',
        ),
      );
      expect(error).toBeUndefined();
      expect(ringOf(boundary).length).toBe(3);
    });

    it('parses a pasted survey plan', () => {
      const plan = [
        'SURVEY PLAN OF LAND AT EWURU',
        `Beacon 1: 6°31'27.8"N 3°22'45.1"E`,
        `Beacon 2: 6°31'30.4"N 3°22'45.1"E`,
        `Beacon 3: 6°31'30.4"N 3°22'48.0"E`,
        `Beacon 4: 6°31'27.8"N 3°22'48.0"E`,
      ].join('\n');

      const { boundary, error } = parseBoundaryPoints(plan);

      expect(error).toBeUndefined();
      expect(ringOf(boundary).length).toBe(4);
      expect(ringOf(boundary)[0][1]).toBeCloseTo(6.524389, 5);
      expect(ringOf(boundary)[0][0]).toBeCloseTo(3.379194, 5);
    });

    it('pluralises the missing boundary point count', () => {
      expect(parseBoundaryPoints('6.5244, 3.3792').error).toBe(
        '2 more boundary points needed to enclose an area.',
      );
    });
  });
});
