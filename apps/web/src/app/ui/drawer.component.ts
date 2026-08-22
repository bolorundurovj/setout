import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <button type="button" class="backdrop" aria-label="Close" (click)="closed.emit()"></button>
      <aside
        class="panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="title()"
        (keyup.escape)="closed.emit()"
      >
        <header class="panel-head">
          <div class="titles">
            <h2 class="t-heading">{{ title() }}</h2>
            @if (subtitle()) {
              <p class="t-small">{{ subtitle() }}</p>
            }
          </div>
          <button type="button" class="close t-mono" aria-label="Close" (click)="closed.emit()">
            Close
          </button>
        </header>
        <div class="panel-body">
          <ng-content />
        </div>
      </aside>
    }
  `,
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        background: rgb(0 0 0 / 35%);
        border: none;
        padding: 0;
        cursor: pointer;
        z-index: 40;
      }

      .panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: min(560px, 100vw);
        display: flex;
        flex-direction: column;
        background: var(--surface);
        border-left: 1.5px solid var(--rule);
        z-index: 41;
      }

      .panel-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 16px 20px;
        background: var(--field);
        border-bottom: 1px solid var(--hairline);
      }

      .titles {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .close {
        flex: none;
        background: none;
        border: none;
        padding: 6px 2px;
        font-size: 13px;
        color: var(--ink-2);
        cursor: pointer;

        &:hover {
          color: var(--ink);
        }

        &:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px var(--field),
            0 0 0 4px var(--accent);
          border-radius: 6px;
        }
      }

      .panel-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 18px 20px 26px;
      }

      @media (max-width: 599px) {
        .panel {
          width: 100vw;
          border-left: none;
        }
      }
    `,
  ],
})
export class DrawerComponent {
  readonly open = input(false);
  readonly title = input('');
  readonly subtitle = input('');

  readonly closed = output<void>();
}
