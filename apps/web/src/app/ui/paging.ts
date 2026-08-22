export const PAGE_SIZE = 10;

export const SCROLL_SIZE = 20;

// Pickers need every choice at once, and 100 is the most the API will hand over.
export const CHOICE_LIMIT = 100;

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

// Pages are 1 based in the interface.
export function offsetOf(page: number, size = PAGE_SIZE): number {
  return Math.max(0, (page - 1) * size);
}

export function clampPage(page: number, total: number, size = PAGE_SIZE): number {
  return Math.min(Math.max(1, Math.trunc(page)), pageCount(total, size));
}

export function pageOf<T>(rows: T[], page: number, size = PAGE_SIZE): T[] {
  const from = offsetOf(clampPage(page, rows.length, size), size);
  return rows.slice(from, from + size);
}

/** Page numbers to offer, with nulls where a run has been left out. */
export function pageWindow(page: number, total: number, size = PAGE_SIZE): (number | null)[] {
  const last = pageCount(total, size);
  const here = clampPage(page, total, size);
  const wanted = new Set([1, last, here - 1, here, here + 1]);
  const pages = [...wanted].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const window: (number | null)[] = [];
  pages.forEach((number, index) => {
    const before = pages[index - 1];
    if (before !== undefined && number - before > 1) {
      window.push(null);
    }
    window.push(number);
  });
  return window;
}
