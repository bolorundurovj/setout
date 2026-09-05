import { asSize, boundaryOf, closeRing, inMetres, parseBoundary, ringOf } from './land-geo';
import type { Position } from './land-geo';

const SQUARE: Position[] = [
  [3.3, 6.5],
  [3.3009, 6.5],
  [3.3009, 6.5009],
  [3.3, 6.5009],
];

describe('land geo', () => {
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
});
