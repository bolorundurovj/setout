import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export type ButtonSize = 'compact' | 'major';

@Component({
  selector: 'app-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      [type]="type()"
      [class]="'btn btn-' + variant() + ' btn-' + size()"
      [disabled]="disabled() || loading()"
      [attr.aria-busy]="loading() ? 'true' : null"
      (click)="pressed.emit()"
    >
      <ng-content />
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }

      :host(.block) {
        display: block;
      }

      .btn {
        cursor: pointer;
        border: 1px solid transparent;
        transition: all 0.2s;

        &:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px var(--surface),
            0 0 0 4px var(--accent);
        }

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .btn-compact {
        padding: 11px 17px;
        border-radius: 9px;
        font:
          500 13px/1.2 'DM Sans',
          sans-serif;
      }

      .btn-major {
        display: block;
        width: 100%;
        text-align: center;
        padding: 16px 20px;
        border-radius: 10px;
        font:
          500 16px/1.2 'DM Sans',
          sans-serif;
      }

      .btn-primary {
        background: var(--accent);
        color: var(--on-accent);
      }

      .btn-secondary {
        background: var(--field);
        border-color: var(--rule);
        color: var(--ink);
        font-weight: 400;

        &:hover:not(:disabled) {
          background: var(--hairline);
        }
      }

      .btn-danger {
        background: var(--over-surface);
        border-color: var(--over-edge);
        color: var(--over-ink);
      }
    `,
  ],
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('compact');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);
  readonly loading = input(false);

  readonly pressed = output<void>();
}
