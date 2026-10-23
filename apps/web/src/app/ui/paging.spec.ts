import { PAGE_SIZE, clampPage, offsetOf, pageCount, pageOf, pageNumbers } from './paging';

describe('paging', () => {
  it('uses ten rows per page', () => {
    expect(PAGE_SIZE).toBe(10);
  });

  it('returns the page count, at least one', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
    expect(pageCount(47)).toBe(5);
  });

  it('converts a page to a row offset', () => {
    expect(offsetOf(1)).toBe(0);
    expect(offsetOf(3)).toBe(20);
    expect(offsetOf(0)).toBe(0);
  });

  it('clamps a page to the valid range', () => {
    expect(clampPage(0, 47)).toBe(1);
    expect(clampPage(9, 47)).toBe(5);
    expect(clampPage(2.7, 47)).toBe(2);
  });

  it('slices one page from loaded rows', () => {
    const rows = Array.from({ length: 23 }, (_, index) => index);
    expect(pageOf(rows, 1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pageOf(rows, 3)).toEqual([20, 21, 22]);
    expect(pageOf(rows, 9)).toEqual([20, 21, 22]);
  });

  it('lists every page when there are few', () => {
    expect(pageNumbers(1, 30)).toEqual([1, 2, 3]);
  });

  it('elides ranges and keeps first, last and adjacent pages', () => {
    expect(pageNumbers(5, 200)).toEqual([1, null, 4, 5, 6, null, 20]);
    expect(pageNumbers(1, 200)).toEqual([1, 2, null, 20]);
    expect(pageNumbers(20, 200)).toEqual([1, null, 19, 20]);
  });

  it('returns one page for zero rows', () => {
    expect(pageNumbers(1, 0)).toEqual([1]);
  });
});
