import { budgetBar } from './budget-bar';

describe('budgetBar', () => {
  it('fills proportionally when spending is within budget', () => {
    const bar = budgetBar(100, 40);
    expect(bar.fill).toBe(40);
    expect(bar.over).toBe(0);
    expect(bar.mark).toBe(100);
  });

  it('scales against max(budget, spent) so 150 spent on 100 budget has a non-zero over segment', () => {
    const bar = budgetBar(100, 150);
    expect(bar.fill).toBeCloseTo(66.6667, 3);
    expect(bar.over).toBeCloseTo(33.3333, 3);
    expect(bar.fill + bar.over).toBeCloseTo(100, 6);
    expect(bar.mark).toBeCloseTo(66.6667, 3);
  });

  it('returns zero fill and over when no budget is set without an explicit scale', () => {
    expect(budgetBar(0, 500)).toEqual({ fill: 0, over: 0, mark: null });
  });

  it('supports a shared scale for multi-row comparisons', () => {
    const bar = budgetBar(100, 150, 300);
    expect(bar.fill).toBeCloseTo(33.3333, 3);
    expect(bar.over).toBeCloseTo(16.6667, 3);
    expect(bar.mark).toBeCloseTo(33.3333, 3);

    const unbudgeted = budgetBar(0, 150, 300);
    expect(unbudgeted).toEqual({ fill: 50, over: 0, mark: null });
  });
});
