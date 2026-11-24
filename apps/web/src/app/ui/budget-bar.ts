export interface BudgetBar {
  /** Within-budget fill percentage (0-100). */
  readonly fill: number;
  /** Overspend percentage beyond the budget (0-100); non-zero when spent > budget > 0. */
  readonly over: number;
  /** Budget marker position (0-100), or null when no budget is set. */
  readonly mark: number | null;
}

/**
 * Computes bar fill, overspend segment, and budget marker percentages against
 * `scale` (defaulting to `max(budget, spent)` so over-budget bars split into
 * `fill` + `over` = 100%).
 */
export function budgetBar(budget: number, spent: number, scale?: number): BudgetBar {
  const positiveBudget = Math.max(0, budget);
  const positiveSpent = Math.max(0, spent);

  if (scale !== undefined) {
    const denominator = Math.max(1, scale);
    const inBudget = positiveBudget > 0 ? Math.min(positiveSpent, positiveBudget) : positiveSpent;
    const overspend = positiveBudget > 0 ? Math.max(0, positiveSpent - positiveBudget) : 0;
    return {
      fill: (inBudget / denominator) * 100,
      over: (overspend / denominator) * 100,
      mark: positiveBudget > 0 ? (positiveBudget / denominator) * 100 : null,
    };
  }

  if (positiveBudget <= 0) {
    return { fill: 0, over: 0, mark: null };
  }

  const denominator = Math.max(positiveBudget, positiveSpent);
  const inBudget = Math.min(positiveSpent, positiveBudget);
  const overspend = Math.max(0, positiveSpent - positiveBudget);
  return {
    fill: (inBudget / denominator) * 100,
    over: (overspend / denominator) * 100,
    mark: (positiveBudget / denominator) * 100,
  };
}
