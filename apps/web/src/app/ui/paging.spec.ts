import { PAGE_SIZE, clampPage, offsetOf, pageCount, pageOf, pageWindow } from './paging';

describe('paging', () => {
  it('shows ten rows a page', () => {
    expect(PAGE_SIZE).toBe(10);
  });

  it('counts the pages a total needs, and never fewer than one', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(10)).toBe(1);
    expect(pageCount(11)).toBe(2);
    expect(pageCount(47)).toBe(5);
  });

  it('turns a page into an offset', () => {
    expect(offsetOf(1)).toBe(0);
    expect(offsetOf(3)).toBe(20);
    expect(offsetOf(0)).toBe(0);
  });

  it('holds a page inside what there is', () => {
    expect(clampPage(0, 47)).toBe(1);
    expect(clampPage(9, 47)).toBe(5);
    expect(clampPage(2.7, 47)).toBe(2);
  });

  it('slices a page out of rows already in hand', () => {
    const rows = Array.from({ length: 23 }, (_, index) => index);
    expect(pageOf(rows, 1)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(pageOf(rows, 3)).toEqual([20, 21, 22]);
    expect(pageOf(rows, 9)).toEqual([20, 21, 22]);
  });

  it('offers every page while they still fit', () => {
    expect(pageWindow(1, 30)).toEqual([1, 2, 3]);
  });

  it('leaves out the runs it cannot show, keeping the ends and where you are', () => {
    expect(pageWindow(5, 200)).toEqual([1, null, 4, 5, 6, null, 20]);
    expect(pageWindow(1, 200)).toEqual([1, 2, null, 20]);
    expect(pageWindow(20, 200)).toEqual([1, null, 19, 20]);
  });

  it('offers one page when there is nothing to page', () => {
    expect(pageWindow(1, 0)).toEqual([1]);
  });
});
