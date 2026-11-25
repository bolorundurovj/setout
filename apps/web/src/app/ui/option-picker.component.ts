import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import { debounce } from './debounce';
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
          <ul
            class="options"
            role="listbox"
            [id]="listId"
            [attr.aria-label]="label()"
            (scroll)="onScroll($event)"
          >
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
        } @else if (loading()) {
          <p class="empty t-small">Searching…</p>
        } @else {
          <p class="empty t-small">No matches.</p>
        }

        @if (truncated()) {
          <div class="truncation">
            <span class="t-small truncation-note">
              @if (total() !== null) {
                Showing {{ shownCount() }} of {{ total() }}
              } @else {
                More options available
              }
            </span>
            <button
              type="button"
              class="more-btn t-mono"
              [disabled]="loading()"
              (mousedown)="onLoadMore($event)"
            >
              {{ loading() ? 'Loading…' : 'Load more' }}
            </button>
          </div>
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

      .truncation {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 6px;
        padding: 6px 8px 2px;
        border-top: 1px solid var(--hairline);
      }

      .truncation-note {
        color: var(--ink-3);
      }

      .more-btn {
        background: none;
        border: none;
        padding: 4px 6px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        color: var(--accent);

        &:hover:not(:disabled) {
          background: var(--field);
        }

        &:disabled {
          opacity: 0.6;
          cursor: default;
        }
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
  readonly selectedOption = input<Option | null>(null);
  readonly serverFilter = input(false);
  readonly total = input<number | null>(null);
  readonly hasMore = input(false);
  readonly loading = input(false);

  readonly valueChange = output<string>();
  readonly searchChange = output<string>();
  readonly loadMore = output<void>();

  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);
  protected readonly filterText = signal('');
  protected readonly triggerId = `picker-trigger-${nextId}`;
  protected readonly listId = `picker-list-${nextId++}`;
  private readonly remembered = signal<Option | null>(null);
  private readonly debouncedSearch = debounce<string>((text) => this.searchChange.emit(text));

  private readonly selected = computed(() => {
    const val = this.value();
    const fromList = this.options().find((option) => option.value === val);
    if (fromList) {
      return fromList;
    }
    const explicit = this.selectedOption();
    if (explicit && explicit.value === val) {
      return explicit;
    }
    const last = this.remembered();
    return last && last.value === val ? last : undefined;
  });

  protected readonly selectedLabel = computed(() => this.selected()?.label ?? 'Select an option');
  protected readonly selectedDetail = computed(() => this.selected()?.detail ?? '');

  protected readonly matches = computed(() => {
    const options = this.options();
    if (this.serverFilter()) {
      return options;
    }
    const filterText = this.filterText().trim().toLowerCase();
    if (!filterText) {
      return options;
    }
    return options.filter((option) =>
      `${option.label} ${option.detail ?? ''}`.toLowerCase().includes(filterText),
    );
  });

  protected readonly shownCount = computed(() => {
    const opts = this.options();
    const hasBlank = opts.some((option) => option.value === '');
    return hasBlank ? Math.max(0, opts.length - 1) : opts.length;
  });

  protected readonly truncated = computed(
    () => this.hasMore() || (this.total() !== null && this.shownCount() < (this.total() ?? 0)),
  );

  protected readonly activeId = computed(() => {
    const count = this.matches().length;
    if (!count) {
      return null;
    }
    const index = Math.min(this.activeIndex(), count - 1);
    return `${this.listId}-${index}`;
  });

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
    inject(DestroyRef).onDestroy(() => this.debouncedSearch.cancel());
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
    const text = (event.target as HTMLInputElement).value;
    this.filterText.set(text);
    this.activeIndex.set(0);
    if (this.serverFilter()) {
      this.debouncedSearch.call(text.trim());
    }
  }

  onScroll(event: Event): void {
    if (!this.truncated() || this.loading()) {
      return;
    }
    const list = event.target as HTMLElement;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 24) {
      this.loadMore.emit();
    }
  }

  onLoadMore(event: MouseEvent): void {
    event.preventDefault();
    if (!this.loading()) {
      this.loadMore.emit();
    }
  }

  choose(value: string): void {
    const picked = this.matches().find((option) => option.value === value);
    if (picked) {
      this.remembered.set(picked);
    }
    this.valueChange.emit(value);
    this.close();
    this.trigger().nativeElement.focus();
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.open()) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key === 'ArrowDown' && !this.open()) {
      event.preventDefault();
      this.toggle();
    }
  }

  onFilterKeydown(event: KeyboardEvent): void {
    const matches = this.matches();
    if (event.key === 'Escape' && this.open()) {
      event.stopPropagation();
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
        const index = Math.min(this.activeIndex(), matches.length - 1);
        this.choose(matches[index].value);
      }
    }
  }

  private close(): void {
    const hadSearch = this.filterText().trim().length > 0;
    this.open.set(false);
    this.filterText.set('');
    this.debouncedSearch.cancel();
    if (this.serverFilter() && hadSearch) {
      this.searchChange.emit('');
    }
  }
}
