const UNITS = ['KB', 'MB', 'GB'];

/** Decimal units, matching how storage limits such as 25 MB are written. */
export function fileSize(bytes: number): string {
  if (bytes < 1000) {
    return bytes === 1 ? '1 byte' : `${bytes} bytes`;
  }
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${Number(value.toFixed(value < 10 ? 1 : 0))} ${UNITS[unit]}`;
}
