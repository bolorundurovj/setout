import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
export interface Option {
  value: string;
  label: string;
  detail?: string | null;
}

let nextId = 0;

@Component({
  selector: 'app-option-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      #trigger
      type="button"
      class="input-field trigger"
      [id]="triggerId"
      [attr.aria-label]="label()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listId"
      (click)="toggle()"
      (keydown)="onTriggerKeydown($event)"
    >
      <span class="selected">
        <span class="selected-label">{{ selectedLabel() }}</span>
        @if (selectedDetail()) {
          <span class="selected-detail">{{ selectedDetail() }}</span>
        }
      </span>
      <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
        <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
      </svg>
    </button>

    @if (open()) {
      <div class="popup">
        <input
          #filter
          class="filter"
          type="text"
          autocomplete="off"
          placeholder="Filter"
          [attr.aria-label]="'Filter ' + label()"
          [attr.aria-controls]="listId"
          [attr.aria-activedescendant]="activeId()"
          [value]="filterText()"
          (input)="onFilter($event)"
          (keydown)="onFilterKeydown($event)"
        />

        @if (matches().length) {
          <ul class="options" role="listbox" [id]="listId" [attr.aria-label]="label()">
            @for (option of matches(); track option.value; let i = $index) {
              <li
                #option
                role="option"
                class="option"
                [id]="listId + '-' + i"
                [class.active]="i === activeIndex()"
                [class.selected]="option.value === value()"
                [attr.aria-selected]="option.value === value()"
                (mousedown)="choose(option.value)"
                (mouseenter)="activeIndex.set(i)"
              >
                <span class="option-label">{{ option.label }}</span>
                @if (option.detail) {
                  <span class="option-detail">{{ option.detail }}</span>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="empty t-small">No matches.</p>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }

      .trigger {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        width: 100%;
        text-align: left;
        cursor: pointer;
        color: var(--ink-2);
      }

      .selected {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .selected-label {
        font:
          400 14px/1.2 'DM Sans',
          sans-serif;
        color: var(--ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .selected-detail {
        font:
          400 11px/1.2 'DM Sans',
          sans-serif;
        color: var(--ink-3);
      }

      .popup {
        position: absolute;
        z-index: 30;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        padding: 6px;
        background: var(--surface);
        border: 1.5px solid var(--rule);
        border-radius: 10px;
        box-shadow: 0 8px 24px rgb(30 34 38 / 18%);
      }

      .filter {
        width: 100%;
        height: 38px;
        padding: 0 10px;
        background: var(--field);
        border: 1.5px solid var(--rule);
        border-radius: 8px;
        font:
          400 13px/1.2 'DM Sans',
          sans-serif;
        color: var(--ink);

        &:focus-visible {
          outline: none;
          box-shadow:
            0 0 0 2px var(--surface),
            0 0 0 4px var(--accent);
        }
      }

      .options {
        margin: 6px 0 0;
        padding: 0;
        list-style: none;
        max-height: 240px;
        overflow-y: auto;
      }

      .option {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 9px 10px;
        border-radius: 7px;
        cursor: pointer;
      }

      .option-label {
        font:
          400 13px/1.2 'DM Sans',
          sans-serif;
        color: var(--ink);
      }

      .option-detail {
        font:
          400 11px/1.2 'DM Sans',
          sans-serif;
        color: var(--ink-3);
      }

      .option.active {
        background: var(--field);
      }

      .option.selected {
        background: var(--accent);
      }

      .option.selected .option-label {
        font-weight: 500;
        color: var(--on-accent);
      }

      .option.selected .option-detail {
        color: var(--on-accent);
        opacity: 0.85;
      }

      .empty {
        margin: 10px;
        color: var(--ink-3);
      }
    `,
  ],
})
export class OptionPickerComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly filter = viewChild<ElementRef<HTMLInputElement>>('filter');
  private readonly optionEls = viewChildren<ElementRef<HTMLElement>>('option');

  readonly options = input.required<Option[]>();
  readonly value = input('');
  readonly label = input('');

  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);
  protected readonly filterText = signal('');
  protected readonly triggerId = `picker-trigger-${nextId}`;
  protected readonly listId = `picker-list-${nextId++}`;

  private readonly selected = computed(() =>
    this.options().find((option) => option.value === this.value()),
  );

  protected readonly selectedLabel = computed(() => this.selected()?.label ?? 'Select an option');
  protected readonly selectedDetail = computed(() => this.selected()?.detail ?? '');

  protected readonly matches = computed(() => {
    const filterText = this.filterText().trim().toLowerCase();
    const options = this.options();
    if (!filterText) {
      return options;
    }
    return options.filter((option) =>
      `${option.label} ${option.detail ?? ''}`.toLowerCase().includes(filterText),
    );
  });

  protected readonly activeId = computed(() =>
    this.matches().length ? `${this.listId}-${this.activeIndex()}` : null,
  );

  constructor() {
    // View queries resolve after render, so these effects run once the popup is in the DOM.
    effect(() => {
      if (this.open()) {
        this.filter()?.nativeElement.focus();
      }
    });
    effect(() => {
      const option = this.optionEls()[this.activeIndex()];
      // Optional call because jsdom does not implement scrollIntoView.
      option?.nativeElement.scrollIntoView?.({ block: 'nearest' });
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.filterText.set('');
    this.activeIndex.set(
      Math.max(
        0,
        this.options().findIndex((option) => option.value === this.value()),
      ),
    );
    this.open.set(true);
  }

  onFilter(event: Event): void {
    this.filterText.set((event.target as HTMLInputElement).value);
    this.activeIndex.set(0);
  }

  choose(value: string): void {
    this.valueChange.emit(value);
    this.close();
    this.trigger().nativeElement.focus();
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' && !this.open()) {
      event.preventDefault();
      this.toggle();
    }
  }

  onFilterKeydown(event: KeyboardEvent): void {
    const matches = this.matches();
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      this.trigger().nativeElement.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!matches.length) {
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex.update((i) => (i + step + matches.length) % matches.length);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.activeIndex.set(event.key === 'Home' ? 0 : matches.length - 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (matches.length) {
        this.choose(matches[this.activeIndex()].value);
      }
    }
  }

  private close(): void {
    this.open.set(false);
    this.filterText.set('');
  }
}
