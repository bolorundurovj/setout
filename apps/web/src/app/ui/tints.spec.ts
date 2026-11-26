import { tintFor } from './tints';

describe('tintFor', () => {
  it('uses theme variables so dark mode applies', () => {
    const tint = tintFor('category-1');
    expect(tint.fill).toMatch(/^var\(--tint-[1-5]\)$/);
    expect(tint.ink).toBe(tint.fill.replace(')', '-ink)'));
  });

  it('gives the same id the same tint', () => {
    expect(tintFor('abc')).toEqual(tintFor('abc'));
  });
});
