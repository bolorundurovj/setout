export const PAGE_SIZE = 10;

export const SCROLL_PAGE_SIZE = 20;

// Pickers load one page of at most 100 options, the API's maximum page size.
export const PICKER_PAGE_SIZE = 100;

// Remove once no module imports the old names.
export const SCROLL_SIZE = SCROLL_PAGE_SIZE;
export const CHOICE_LIMIT = PICKER_PAGE_SIZE;

export function pageCount(total: number, size = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size));
}

// Pages are 1-based in the UI.
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

/** Page numbers to display, with null where a range is omitted. */
export function pageNumbers(page: number, total: number, size = PAGE_SIZE): (number | null)[] {
  const last = pageCount(total, size);
  const current = clampPage(page, total, size);
  const candidates = new Set([1, last, current - 1, current, current + 1]);
  const pages = [...candidates].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);
  const numbers: (number | null)[] = [];
  pages.forEach((number, index) => {
    const before = pages[index - 1];
    if (before !== undefined && number - before > 1) {
      numbers.push(null);
    }
    numbers.push(number);
  });
  return numbers;
}
