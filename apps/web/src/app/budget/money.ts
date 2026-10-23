/** Amounts are stored as integers in minor units; convert to major units only through this module. */
export function toMajor(minor: number, exponent: number): number {
  return minor / 10 ** exponent;
}

export function formatMoney(minor: number, code: string, exponent: number): string {
  const major = toMajor(minor, exponent);
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).format(major);
  } catch {
    return `${code} ${major.toFixed(exponent)}`;
  }
}

/** Rounds to whole major units and omits the currency symbol. */
export function formatAmount(minor: number, exponent: number): string {
  return new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(toMajor(minor, exponent));
}

export function formatAmountInput(minor: number, exponent: number): string {
  return toMajor(minor, exponent).toFixed(exponent);
}

export function formatNumber(value: number | string, maxDecimals = 2): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }
  return new Intl.NumberFormat('en', { maximumFractionDigits: maxDecimals }).format(parsed);
}

/** Parses user input into minor units; returns null for non-numeric input. */
export function parseMoney(input: string, exponent: number): number | null {
  const cleaned = input.replace(/[\s,]/g, '');
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') {
    return null;
  }
  return Math.round(Number(cleaned) * 10 ** exponent);
}
