export interface CurrencyShape {
  symbol: string;
  position: string;
  decimals: string;
  separators: string;
}

export function currencyShape(code: string, exponent: number): CurrencyShape {
  const fallback = {
    symbol: code,
    position: 'before',
    decimals: String(exponent),
    separators: '—',
  };
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: exponent,
      maximumFractionDigits: exponent,
    }).formatToParts(1234.5);
    const symbol = parts.find((part) => part.type === 'currency')?.value;
    const group = parts.find((part) => part.type === 'group')?.value;
    const decimal = parts.find((part) => part.type === 'decimal')?.value;
    return {
      symbol: symbol ?? code,
      position: parts.findIndex((p) => p.type === 'currency') === 0 ? 'before' : 'after',
      decimals: String(exponent),
      separators: [group, decimal].filter(Boolean).join('   ') || 'none',
    };
  } catch {
    return fallback;
  }
}
