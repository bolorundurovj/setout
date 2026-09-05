import {
  asSize,
  centroidOf,
  boundaryOf,
  closeRing,
  cornerText,
  degreesFrom,
  inMetres,
  parseBoundary,
  parseCoordinate,
  parseCorners,
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
  describe('a point against a ring', () => {
    const SQ: Position[] = [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ];

    it('knows the middle is inside', () => {
      expect(pointInRing([2, 2], SQ)).toBe(true);
    });

    it('knows what is outside', () => {
      expect(pointInRing([5, 2], SQ)).toBe(false);
      expect(pointInRing([-1, -1], SQ)).toBe(false);
    });

    it('does not care which way the ring was drawn', () => {
      expect(pointInRing([2, 2], [...SQ].reverse())).toBe(true);
    });

    it('encloses nothing with fewer than three corners', () => {
      expect(pointInRing([1, 1], SQ.slice(0, 2))).toBe(false);
    });

    it('finds the centre of a square', () => {
      expect(centroidOf(SQ)).toEqual([2, 2]);
    });

    it('has no centre to give for two corners', () => {
      expect(centroidOf(SQ.slice(0, 2))).toBeNull();
    });

    it('puts the centre of an L outside the L, which is why callers check', () => {
      const bent: Position[] = [
        [0, 0],
        [4, 0],
        [4, 1],
        [1, 1],
        [1, 4],
        [0, 4],
      ];

      const middle = centroidOf(bent);

      expect(middle).not.toBeNull();
      expect(pointInRing(middle as Position, bent)).toBe(false);
    });
  });

  it('closes a ring that was left open', () => {
    const closed = closeRing(SQUARE);
    expect(closed.length).toBe(5);
    expect(closed[4]).toEqual(closed[0]);
  });

  it('leaves a ring that already closes alone', () => {
    const closed = closeRing(SQUARE);
    expect(closeRing(closed)).toEqual(closed);
  });

  it('will not make a boundary out of two corners', () => {
    expect(boundaryOf(SQUARE.slice(0, 2))).toBeNull();
  });

  it('hands back the corners to draw, without the repeated one', () => {
    const boundary = boundaryOf(SQUARE);
    expect(ringOf(boundary).length).toBe(4);
    expect(ringOf(null)).toEqual([]);
  });

  it('converts an area into the unit that was asked for', () => {
    expect(inMetres(10_000, 'sqm')).toBe(10_000);
    expect(inMetres(10_000, 'hectare')).toBe(1);
    expect(inMetres(4046.8564224, 'acre')).toBeCloseTo(1, 9);
  });

  it('refuses to invent a figure in plots', () => {
    expect(inMetres(10_000, 'plot')).toBeNull();
    expect(asSize(10_000, 'plot')).toBeNull();
  });

  it('rounds a size the way the field stores it', () => {
    expect(asSize(648.5049, 'sqm')).toBe('648.5');
    expect(asSize(10_000, 'hectare')).toBe('1');
  });

  it('reads a bare polygon', () => {
    const { boundary, error } = parseBoundary(
      JSON.stringify({ type: 'Polygon', coordinates: [closeRing(SQUARE)] }),
    );
    expect(error).toBeUndefined();
    expect(ringOf(boundary).length).toBe(4);
  });

  it('reads what geojson.io hands you', () => {
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

  it('says so when it is not JSON at all', () => {
    expect(parseBoundary('a plot near the church').error).toBe('That is not JSON.');
  });

  it('says so when the shape is not a polygon', () => {
    const { error } = parseBoundary(
      JSON.stringify({ type: 'LineString', coordinates: [[3.3, 6.5]] }),
    );
    expect(error).toContain('Polygon');
  });

  it('catches coordinates given the wrong way round', () => {
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

  it('treats an empty box as nothing to save, not an error', () => {
    expect(parseBoundary('   ')).toEqual({ boundary: undefined });
  });

  describe('coordinates off a survey plan', () => {
    it('reads a plain decimal degree', () => {
      expect(degreesFrom('6.5244')).toBeCloseTo(6.5244, 6);
      expect(degreesFrom('-6.5244')).toBeCloseTo(-6.5244, 6);
    });

    it('reads degrees, minutes and seconds', () => {
      expect(degreesFrom(`6°31'27.8"N`)).toBeCloseTo(6.524389, 5);
      expect(degreesFrom(`3°22'45.1"E`)).toBeCloseTo(3.379194, 5);
    });

    it('takes the hemisphere as the sign', () => {
      expect(degreesFrom(`33°55'30"S`)).toBeCloseTo(-33.925, 5);
      expect(degreesFrom(`0°10'00"W`)).toBeCloseTo(-0.166667, 5);
      expect(degreesFrom('6.5244S')).toBeCloseTo(-6.5244, 6);
    });

    it('reads degrees and minutes with no seconds', () => {
      expect(degreesFrom(`6°31.5'N`)).toBeCloseTo(6.525, 5);
    });

    it('refuses a minus sign and a hemisphere at once', () => {
      expect(degreesFrom(`-6°31'27.8"N`)).toBeNull();
    });

    it('refuses what is not a coordinate at all', () => {
      expect(degreesFrom('beacon')).toBeNull();
      expect(degreesFrom('')).toBeNull();
    });

    it('reads a pair latitude first, however it is separated', () => {
      expect(parseCoordinate('6.5244, 3.3792')).toEqual([3.3792, 6.5244]);
      expect(parseCoordinate('6.5244 3.3792')).toEqual([3.3792, 6.5244]);
      expect(parseCoordinate('6.5244;3.3792')).toEqual([3.3792, 6.5244]);
    });

    it('reads a pair written in degrees minutes seconds', () => {
      const corner = parseCoordinate(`6°31'27.8"N 3°22'45.1"E`);
      expect(corner?.[1]).toBeCloseTo(6.524389, 5);
      expect(corner?.[0]).toBeCloseTo(3.379194, 5);
    });

    it('ignores the beacon label a plan puts in front', () => {
      expect(parseCoordinate('Beacon 3: 6.5244, 3.3792')).toEqual([3.3792, 6.5244]);
    });

    it('refuses a pair that is not on Earth', () => {
      expect(parseCoordinate('95.0, 3.3792')).toBeNull();
      expect(parseCoordinate('6.5244, 181')).toBeNull();
    });

    it('refuses a line with only one number', () => {
      expect(parseCoordinate('6.5244')).toBeNull();
    });

    it('builds a boundary out of a typed list', () => {
      const { boundary, error } = parseCorners(
        ['6.5244, 3.3792', '6.5251, 3.3792', '6.5251, 3.3799', '6.5244, 3.3799'].join('\n'),
      );
      expect(error).toBeUndefined();
      expect(ringOf(boundary).length).toBe(4);
      expect(ringOf(boundary)[0]).toEqual([3.3792, 6.5244]);
    });

    it('takes degrees and dms mixed in one list', () => {
      const { boundary, error } = parseCorners(
        ['6.5244, 3.3792', `6°31'30.4"N 3°22'48.0"E`, '6.5251, 3.3799'].join('\n'),
      );
      expect(error).toBeUndefined();
      expect(ringOf(boundary).length).toBe(3);
    });

    it('still takes GeoJSON in the same box', () => {
      const { boundary } = parseCorners(
        JSON.stringify({ type: 'Polygon', coordinates: [closeRing(SQUARE)] }),
      );
      expect(ringOf(boundary).length).toBe(4);
    });

    it('says which line it could not read', () => {
      const { error } = parseCorners(['6.5244, 3.3792', 'somewhere near the church 12'].join('\n'));
      expect(error).toBe('Line 2 does not read as a coordinate.');
    });

    it('says how many more corners it needs', () => {
      const { error } = parseCorners(['6.5244, 3.3792', '6.5251, 3.3792'].join('\n'));
      expect(error).toBe('1 more corner before it encloses anything.');
    });

    it('writes the corners back out latitude first', () => {
      const text = cornerText(boundaryOf(SQUARE));
      expect(text.split('\n').length).toBe(4);
      expect(text.split('\n')[0]).toBe('6.5, 3.3');
    });

    it('round trips a typed list', () => {
      const typed = ['6.5244, 3.3792', '6.5251, 3.3792', '6.5251, 3.3799'].join('\n');
      expect(cornerText(parseCorners(typed).boundary)).toBe(typed);
    });

    it('skips a heading with no numbers in it', () => {
      const { boundary, error } = parseCorners(
        ['SURVEY PLAN OF LAND AT EWURU', '6.5244, 3.3792', '6.5251, 3.3792', '6.5251, 3.3799'].join(
          '\n',
        ),
      );
      expect(error).toBeUndefined();
      expect(ringOf(boundary).length).toBe(3);
    });

    it('reads a survey plan copied out whole', () => {
      const plan = [
        'SURVEY PLAN OF LAND AT EWURU',
        `Beacon 1: 6°31'27.8"N 3°22'45.1"E`,
        `Beacon 2: 6°31'30.4"N 3°22'45.1"E`,
        `Beacon 3: 6°31'30.4"N 3°22'48.0"E`,
        `Beacon 4: 6°31'27.8"N 3°22'48.0"E`,
      ].join('\n');

      const { boundary, error } = parseCorners(plan);

      expect(error).toBeUndefined();
      expect(ringOf(boundary).length).toBe(4);
      expect(ringOf(boundary)[0][1]).toBeCloseTo(6.524389, 5);
      expect(ringOf(boundary)[0][0]).toBeCloseTo(3.379194, 5);
    });

    it('counts the corners it is short in plain words', () => {
      expect(parseCorners('6.5244, 3.3792').error).toBe(
        '2 more corners before it encloses anything.',
      );
    });
  });
});
