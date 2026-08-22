import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type CurrencyPillTone = 'field' | 'surface';

export function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'narrowSymbol',
    }).formatToParts(0);
    return parts.find((part) => part.type === 'currency')?.value ?? code;
  } catch {
    return code;
  }
}

@Component({
  selector: 'app-currency-pill',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pill t-mono" [class]="tone()">{{ label() }}</span>`,
  styles: [
    `
      :host {
        display: inline-flex;
        flex: none;
      }

      .pill {
        font-size: 13px;
        line-height: 1.2;
        color: var(--ink-2);
        border: 1px solid var(--hairline);
        border-radius: 999px;
      }

      .field {
        background: var(--field);
        padding: 5px 9px;
      }

      .surface {
        background: var(--surface);
        padding: 6px 11px;
      }
    `,
  ],
})
export class CurrencyPillComponent {
  readonly code = input.required<string>();
  readonly tone = input<CurrencyPillTone>('field');

  // Currencies without a distinct symbol return their code, and "KWD KWD"
  // helps nobody.
  readonly label = computed(() => {
    const symbol = currencySymbol(this.code());
    return symbol === this.code() ? this.code() : `${symbol} ${this.code()}`;
  });
}
