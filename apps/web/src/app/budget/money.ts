/** Amounts are integers in minor units. This is the only place that changes. */
export function formatMoney(minor: number, code: string, exponent: number): string {
  const major = minor / 10 ** exponent;
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

/** Parse what someone typed into minor units. Returns null when it is not a number. */
export function parseMoney(input: string, exponent: number): number | null {
  const cleaned = input.replace(/[\s,]/g, '');
  if (!/^\d*\.?\d*$/.test(cleaned) || cleaned === '' || cleaned === '.') {
    return null;
  }
  return Math.round(Number(cleaned) * 10 ** exponent);
}
