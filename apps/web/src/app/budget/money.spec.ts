import { formatAmount, formatAmountInput, formatMoney, moneyInputHint, parseMoney } from './money';

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

  it('accepts commas and spaces only between groups of three digits', () => {
    expect(parseMoney('1,250.50', 2)).toBe(125050);
    expect(parseMoney('1 250 000', 2)).toBe(125000000);
    expect(parseMoney(' 1,250 ', 0)).toBe(1250);
    expect(parseMoney('.5', 2)).toBe(50);
  });

  it('refuses a decimal comma instead of multiplying the amount by 100', () => {
    expect(parseMoney('12,50', 2)).toBeNull();
    expect(parseMoney('10,50', 2)).toBeNull();
    expect(parseMoney('1,25,000', 2)).toBeNull();
    expect(parseMoney('12 50', 2)).toBeNull();
    expect(parseMoney('1,250,', 2)).toBeNull();
  });

  it('refuses more decimal places than the currency has', () => {
    expect(parseMoney('250.505', 2)).toBeNull();
    expect(parseMoney('5000.5', 0)).toBeNull();
    expect(parseMoney('250.5', 2)).toBe(25050);
  });

  it('describes what an amount field will save', () => {
    expect(moneyInputHint('', 'NGN', 2)).toBeNull();
    expect(moneyInputHint('1,250.5', 'NGN', 2)).toEqual({
      text: expect.stringContaining('1,250.50'),
      valid: true,
    });
    expect(moneyInputHint('12,50', 'NGN', 2)).toEqual({
      text: expect.stringContaining('commas only to separate thousands'),
      valid: false,
    });
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
