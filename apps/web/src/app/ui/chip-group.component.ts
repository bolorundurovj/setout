import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { OptionPickerComponent } from './option-picker.component';

export interface Chip {
  value: string;
  label: string;
  detail?: string | null;
}

// Past this many, a wrapping pill row is unreadable and the picker takes over.
const PILL_LIMIT = 8;

@Component({
  selector: 'app-chip-group',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OptionPickerComponent],
  template: `
    @if (chips().length > pillLimit) {
      <app-option-picker
        [chips]="chips()"
        [value]="value()"
        [label]="label()"
        (valueChange)="valueChange.emit($event)"
      />
    } @else {
      <div class="chips" role="group" [attr.aria-label]="label()">
        @for (chip of chips(); track chip.value) {
          <button
            type="button"
            class="chip"
            [class.on]="chip.value === value()"
            [attr.aria-pressed]="chip.value === value()"
            (click)="pick(chip.value)"
          >
            <span class="chip-label">{{ chip.label }}</span>
            @if (chip.detail) {
              <span class="chip-detail">{{ chip.detail }}</span>
            }
          </button>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }

      .chip {
        display: flex;
        flex-direction: column;
        gap: 2px;
        align-items: flex-start;
        padding: 9px 14px;
        min-height: 44px;
        justify-content: center;
        background: var(--field);
        border: 1.5px solid var(--rule);
        border-radius: 9px;
        cursor: pointer;
        text-align: left;

        &:hover {
          background: var(--hairline);
        }

        &:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px var(--surface),
            0 0 0 4px var(--accent);
        }
      }

      .chip.on {
        background: var(--accent);
        border-color: var(--accent);
      }

      .chip-label {
        font:
          400 13px/1.2 'DM Sans',
          sans-serif;
        color: var(--ink);
      }

      .chip.on .chip-label {
        font-weight: 500;
        color: var(--on-accent);
      }

      .chip-detail {
        font:
          400 11px/1.2 'DM Sans',
          sans-serif;
        color: var(--ink-3);
      }

      .chip.on .chip-detail {
        color: var(--on-accent);
        opacity: 0.85;
      }
    `,
  ],
})
export class ChipGroupComponent {
  readonly chips = input.required<Chip[]>();
  readonly value = input('');
  readonly label = input('');
  readonly clearable = input(false);

  readonly valueChange = output<string>();

  protected readonly pillLimit = PILL_LIMIT;

  pick(value: string): void {
    if (this.clearable() && value === this.value()) {
      this.valueChange.emit('');
      return;
    }
    this.valueChange.emit(value);
  }
}
