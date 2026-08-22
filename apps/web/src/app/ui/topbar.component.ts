import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-topbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="topbar">
      <div class="topbar-row">
        <div class="titles">
          <span class="title">{{ title() }}</span>
          @if (subtitle()) {
            <span class="subtitle t-mono">{{ subtitle() }}</span>
          }
        </div>
        <div class="actions">
          <ng-content />
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .topbar {
        padding: 14px 24px;
        background: var(--field);
        border-bottom: 1px solid var(--hairline);
      }

      .topbar-row {
        width: 100%;
        max-width: var(--page-max);
        margin-inline: auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }

      .titles {
        display: flex;
        align-items: baseline;
        gap: 12px;
        min-width: 0;
      }

      .title {
        font:
          500 16px/1.2 'DM Sans',
          sans-serif;
        letter-spacing: -0.012em;
        color: var(--ink);
      }

      .subtitle {
        font-size: 13px;
        color: var(--ink-3);
      }

      .actions {
        display: flex;
        gap: 8px;
        flex: none;
      }

      @media (max-width: 599px) {
        .topbar {
          padding: 12px 16px;
        }

        .topbar-row {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `,
  ],
})
export class TopbarComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
}
