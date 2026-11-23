import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { moneyInputHint } from '../budget/money';

/** Shows what an amount field will save, so a mistyped separator is caught before saving. */
@Component({
  selector: 'app-money-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="t-small hint" [class.invalid]="hint() && !hint()!.valid" aria-live="polite">
      {{ hint()?.text }}
    </span>
  `,
  styles: `
    :host {
      display: block;
      min-height: 1.4em;
    }

    .hint {
      color: var(--ink-3);
    }

    .hint.invalid {
      color: var(--over-ink);
    }
  `,
})
export class MoneyHintComponent {
  readonly value = input.required<string>();
  readonly code = input.required<string>();
  readonly exponent = input.required<number>();

  readonly hint = computed(() => moneyInputHint(this.value(), this.code(), this.exponent()));
}
