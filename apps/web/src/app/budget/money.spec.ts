import { formatAmount, formatAmountInput, formatMoney, parseMoney } from './money';

describe('money', () => {
  it('formats minor units using the exponent', () => {
    expect(formatMoney(215000000, 'NGN', 2)).toContain('2,150,000');
    expect(formatMoney(1100000, 'NGN', 2)).toContain('11,000');
  });

  it('formats a currency with no decimals', () => {
    expect(formatMoney(5000, 'JPY', 0)).toContain('5,000');
  });

  it('parses input into minor units', () => {
    expect(parseMoney('11000', 2)).toBe(1100000);
    expect(parseMoney('11,000', 2)).toBe(1100000);
    expect(parseMoney('250.50', 2)).toBe(25050);
  });

  it('parses against a zero exponent currency', () => {
    expect(parseMoney('5000', 0)).toBe(5000);
  });

  it('returns null for non-numeric input', () => {
    expect(parseMoney('abc', 2)).toBeNull();
    expect(parseMoney('', 2)).toBeNull();
    expect(parseMoney('.', 2)).toBeNull();
  });

  it('formats an amount in whole major units without the currency symbol', () => {
    expect(formatAmount(215000050, 2)).toBe('2,150,001');
    expect(formatAmount(5000, 0)).toBe('5,000');
  });

  it('formats an input value in major units with the currency decimals', () => {
    expect(formatAmountInput(25050, 2)).toBe('250.50');
    expect(formatAmountInput(5000, 0)).toBe('5000');
  });
});
