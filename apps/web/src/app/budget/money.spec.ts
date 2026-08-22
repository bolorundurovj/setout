import { formatMoney, parseMoney } from './money';

describe('money', () => {
  it('formats minor units using the exponent', () => {
    expect(formatMoney(215000000, 'NGN', 2)).toContain('2,150,000');
    expect(formatMoney(1100000, 'NGN', 2)).toContain('11,000');
  });

  it('formats a currency with no decimals', () => {
    expect(formatMoney(5000, 'JPY', 0)).toContain('5,000');
  });

  it('parses what someone typed into minor units', () => {
    expect(parseMoney('11000', 2)).toBe(1100000);
    expect(parseMoney('11,000', 2)).toBe(1100000);
    expect(parseMoney('250.50', 2)).toBe(25050);
  });

  it('parses against a zero exponent currency', () => {
    expect(parseMoney('5000', 0)).toBe(5000);
  });

  it('refuses anything that is not a number', () => {
    expect(parseMoney('abc', 2)).toBeNull();
    expect(parseMoney('', 2)).toBeNull();
    expect(parseMoney('.', 2)).toBeNull();
  });
});
