import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PAGE_SIZE, clampPage, offsetOf, pageCount, pageWindow } from './paging';

@Component({
  selector: 'app-pagination',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pager">
      <span class="t-small count">{{ countLabel() }}</span>

      @if (pages() > 1) {
        <nav class="controls" [attr.aria-label]="label()">
          <button
            type="button"
            class="step t-mono"
            [disabled]="here() === 1"
            (click)="go(here() - 1)"
          >
            Previous
          </button>

          @for (number of window(); track $index) {
            @if (number === null) {
              <span class="gap t-mono" aria-hidden="true">&hellip;</span>
            } @else {
              <button
                type="button"
                class="number t-mono"
                [class.on]="number === here()"
                [attr.aria-current]="number === here() ? 'page' : null"
                [attr.aria-label]="'Page ' + number"
                (click)="go(number)"
              >
                {{ number }}
              </button>
            }
          }

          <button
            type="button"
            class="step t-mono"
            [disabled]="here() === pages()"
            (click)="go(here() + 1)"
          >
            Next
          </button>
        </nav>
      }
    </div>
  `,
  styles: [
    `
      .pager {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
        padding: 2px 0;
      }

      .count {
        color: var(--ink-3);
      }

      .controls {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .step,
      .number {
        min-height: 34px;
        min-width: 34px;
        padding: 0 10px;
        font-size: 13px;
        color: var(--ink-2);
        background: var(--surface);
        border: 1px solid var(--rule);
        border-radius: 8px;
        cursor: pointer;

        &:hover:not(:disabled) {
          color: var(--ink);
          background: var(--field);
        }

        &:disabled {
          color: var(--ink-3);
          cursor: default;
          opacity: 0.5;
        }

        &:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px var(--surface),
            0 0 0 4px var(--accent);
        }
      }

      .number.on {
        color: var(--on-accent);
        background: var(--accent);
        border-color: var(--accent);
      }

      .gap {
        padding: 0 2px;
        font-size: 13px;
        color: var(--ink-3);
      }

      @media (max-width: 599px) {
        .pager {
          justify-content: flex-start;
        }

        .number:not(.on) {
          display: none;
        }
      }
    `,
  ],
})
export class PaginationComponent {
  readonly total = input(0);
  readonly page = input(1);
  readonly size = input(PAGE_SIZE);
  readonly label = input('Pages');
  readonly noun = input('');

  readonly pageChange = output<number>();

  readonly pages = computed(() => pageCount(this.total(), this.size()));
  readonly here = computed(() => clampPage(this.page(), this.total(), this.size()));
  readonly window = computed(() => pageWindow(this.page(), this.total(), this.size()));

  readonly countLabel = computed(() => {
    const total = this.total();
    const noun = this.noun() ? ` ${this.noun()}` : '';
    if (total === 0) {
      return `Nothing to show`;
    }
    const from = offsetOf(this.here(), this.size()) + 1;
    const to = Math.min(total, from + this.size() - 1);
    if (total <= this.size()) {
      return `All ${total}${noun}`;
    }
    return `${from}-${to} of ${total}${noun}`;
  });

  go(page: number): void {
    const wanted = clampPage(page, this.total(), this.size());
    if (wanted !== this.here()) {
      this.pageChange.emit(wanted);
    }
  }
}
