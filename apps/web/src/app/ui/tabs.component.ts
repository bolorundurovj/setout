import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface Tab {
  value: string;
  label: string;
}

@Component({
  selector: 'app-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tabs" role="tablist" [attr.aria-label]="label()">
      @for (tab of tabs(); track tab.value; let i = $index) {
        <button
          type="button"
          class="tab"
          role="tab"
          [id]="tab.value + '-tab'"
          [class.on]="tab.value === value()"
          [attr.aria-selected]="tab.value === value()"
          [attr.aria-controls]="tab.value + '-panel'"
          [attr.tabindex]="tab.value === value() ? 0 : -1"
          (click)="valueChange.emit(tab.value)"
          (keydown)="onKey($event, i)"
        >
          {{ tab.label }}
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .tabs {
        display: flex;
        gap: 2px;
        border-bottom: 1.5px solid var(--rule);
      }

      .tab {
        appearance: none;
        background: none;
        border: 0;
        border-bottom: 2px solid transparent;
        margin-bottom: -1.5px;
        padding: 10px 14px;
        min-height: 44px;
        font: inherit;
        font-size: 14px;
        color: var(--ink-2);
        cursor: pointer;

        &:hover {
          color: var(--ink);
        }

        &:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px var(--surface),
            0 0 0 4px var(--accent);
          border-radius: 6px 6px 0 0;
        }
      }

      .tab.on {
        color: var(--ink);
        border-bottom-color: var(--accent);
        font-weight: 500;
      }
    `,
  ],
})
export class TabsComponent {
  readonly tabs = input<Tab[]>([]);
  readonly value = input('');
  readonly label = input('');

  readonly valueChange = output<string>();

  onKey(event: KeyboardEvent, index: number): void {
    const tabs = this.tabs();
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const to =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : step === 0
            ? -1
            : (index + step + tabs.length) % tabs.length;
    if (to < 0) {
      return;
    }
    event.preventDefault();
    this.valueChange.emit(tabs[to].value);
    // The tab that takes selection takes focus with it, as the pattern expects.
    const strip = (event.target as HTMLElement).parentElement;
    (strip?.children[to] as HTMLElement | undefined)?.focus();
  }
}
