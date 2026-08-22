import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="toggle"
      role="switch"
      [attr.aria-checked]="checked()"
      (click)="toggled.emit(!checked())"
    >
      <span class="track" [class.on]="checked()">
        <span class="knob"></span>
      </span>
      <span class="label"><ng-content /></span>
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
      }

      .toggle {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 2px;
        background: none;
        border: none;
        cursor: pointer;
        font:
          400 13px/1.45 'DM Sans',
          sans-serif;
        color: var(--ink-2);

        &:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px var(--surface),
            0 0 0 4px var(--accent);
          border-radius: 6px;
        }
      }

      .track {
        position: relative;
        width: 36px;
        height: 20px;
        border-radius: 999px;
        flex: none;
        background: var(--rule);
        border: 1px solid var(--rule);
        transition: background 0.15s;

        &.on {
          background: var(--accent);
          border-color: var(--accent);
        }
      }

      .knob {
        position: absolute;
        top: 1px;
        left: 1px;
        width: 16px;
        height: 16px;
        border-radius: 999px;
        background: var(--surface);
        box-shadow: 0 1px 2px rgb(30 34 38 / 30%);
        transition: transform 0.15s;
      }

      .track.on .knob {
        transform: translateX(16px);
      }
    `,
  ],
})
export class ToggleComponent {
  readonly checked = input(false);
  readonly toggled = output<boolean>();
}
