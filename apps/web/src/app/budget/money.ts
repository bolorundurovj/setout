/** Amounts are stored as integers in minor units; convert to major units only through this module. */
export function toMajor(minor: number, exponent: number): number {
  return minor / 10 ** exponent;
}

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let result = formatters.get(key);
  if (!result) {
    result = new Intl.NumberFormat('en', options);
    formatters.set(key, result);
  }
  return result;
}

export function formatMoney(minor: number, code: string, exponent: number): string {
  const major = toMajor(minor, exponent);
  try {
    return formatter(`currency-${code}-${exponent}`, {
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

/** Displays major units with the precision of the project currency. */
export function formatAmount(minor: number, exponent: number): string {
  return formatter(`amount-${exponent}`, { maximumFractionDigits: exponent }).format(
    toMajor(minor, exponent),
  );
}

export function formatAmountInput(minor: number, exponent: number): string {
  return toMajor(minor, exponent).toFixed(exponent);
}

export function formatNumber(value: number | string, maxDecimals = 2): string {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }
  return formatter(`amount-${maxDecimals}`, { maximumFractionDigits: maxDecimals }).format(parsed);
}

// Commas and spaces are accepted only between groups of three digits, so "12,50"
// is refused rather than read as 1250.
const GROUPED = /^\d{1,3}([,\s]\d{3})+(\.\d*)?$/;
const PLAIN = /^(\d+\.?\d*|\.\d+)$/;

/** Parses user input into minor units; returns null for anything that is not a clear amount. */
export function parseMoney(input: string, exponent: number): number | null {
  const trimmed = input.trim();
  if (!PLAIN.test(trimmed) && !GROUPED.test(trimmed)) {
    return null;
  }
  const cleaned = trimmed.replace(/[,\s]/g, '');
  const decimals = cleaned.split('.')[1] ?? '';
  if (decimals.length > exponent) {
    return null;
  }
  return Math.round(Number(cleaned) * 10 ** exponent);
}

/** Describes what an amount field will save, or why the input is invalid. Returns null for an empty field. */
export function moneyInputHint(
  input: string,
  code: string,
  exponent: number,
): { text: string; valid: boolean } | null {
  if (input.trim() === '') {
    return null;
  }
  const minor = parseMoney(input, exponent);
  if (minor === null) {
    const decimals =
      exponent === 0
        ? 'with no decimal places (for example, 1,250)'
        : `and no more than ${exponent} decimal ${exponent === 1 ? 'place' : 'places'} ` +
          `(for example, 1,250.${'5'.padEnd(exponent, '0')})`;
    return {
      text: `Not a valid amount. Use commas only to separate thousands, ${decimals}.`,
      valid: false,
    };
  }
  return { text: `Will be saved as ${formatMoney(minor, code, exponent)}`, valid: true };
}
