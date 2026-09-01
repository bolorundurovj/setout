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
import type { Chip } from './chip-group.component';

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
      <span class="chosen">
        <span class="chosen-label">{{ chosenLabel() }}</span>
        @if (chosenDetail()) {
          <span class="chosen-detail">{{ chosenDetail() }}</span>
        }
      </span>
      <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
        <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
      </svg>
    </button>

    @if (open()) {
      <div class="popup">
        <input
          #search
          class="search"
          type="text"
          autocomplete="off"
          placeholder="Type to narrow"
          [attr.aria-label]="'Search ' + label()"
          [attr.aria-controls]="listId"
          [attr.aria-activedescendant]="activeId()"
          [value]="typed()"
          (input)="onSearch($event)"
          (keydown)="onSearchKeydown($event)"
        />

        @if (matches().length) {
          <ul class="options" role="listbox" [id]="listId" [attr.aria-label]="label()">
            @for (chip of matches(); track chip.value; let i = $index) {
              <li
                #option
                role="option"
                class="option"
                [id]="listId + '-' + i"
                [class.active]="i === active()"
                [class.on]="chip.value === value()"
                [attr.aria-selected]="chip.value === value()"
                (mousedown)="choose(chip.value)"
                (mouseenter)="active.set(i)"
              >
                <span class="option-label">{{ chip.label }}</span>
                @if (chip.detail) {
                  <span class="option-detail">{{ chip.detail }}</span>
                }
              </li>
            }
          </ul>
        } @else {
          <p class="empty t-small">Nothing matches that.</p>
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

      .chosen {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }

      .chosen-label {
        font:
          400 14px/1.2 'DM Sans',
          sans-serif;
        color: var(--ink);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .chosen-detail {
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

      .search {
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

      .option.on {
        background: var(--accent);
      }

      .option.on .option-label {
        font-weight: 500;
        color: var(--on-accent);
      }

      .option.on .option-detail {
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
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  private readonly optionEls = viewChildren<ElementRef<HTMLElement>>('option');

  readonly chips = input.required<Chip[]>();
  readonly value = input('');
  readonly label = input('');

  readonly valueChange = output<string>();

  protected readonly open = signal(false);
  protected readonly active = signal(0);
  protected readonly typed = signal('');
  protected readonly triggerId = `picker-trigger-${nextId}`;
  protected readonly listId = `picker-list-${nextId++}`;

  private readonly chosen = computed(() =>
    this.chips().find((chip) => chip.value === this.value()),
  );

  protected readonly chosenLabel = computed(() => this.chosen()?.label ?? 'Pick one');
  protected readonly chosenDetail = computed(() => this.chosen()?.detail ?? '');

  protected readonly matches = computed(() => {
    const typed = this.typed().trim().toLowerCase();
    const chips = this.chips();
    if (!typed) {
      return chips;
    }
    return chips.filter((chip) =>
      `${chip.label} ${chip.detail ?? ''}`.toLowerCase().includes(typed),
    );
  });

  protected readonly activeId = computed(() =>
    this.matches().length ? `${this.listId}-${this.active()}` : null,
  );

  constructor() {
    // Both view queries resolve after render, so these run once the popup is
    // actually in the DOM rather than racing change detection.
    effect(() => {
      if (this.open()) {
        this.search()?.nativeElement.focus();
      }
    });
    effect(() => {
      const option = this.optionEls()[this.active()];
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
    this.typed.set('');
    this.active.set(
      Math.max(
        0,
        this.chips().findIndex((chip) => chip.value === this.value()),
      ),
    );
    this.open.set(true);
  }

  onSearch(event: Event): void {
    this.typed.set((event.target as HTMLInputElement).value);
    this.active.set(0);
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

  onSearchKeydown(event: KeyboardEvent): void {
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
      this.active.update((i) => (i + step + matches.length) % matches.length);
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.active.set(event.key === 'Home' ? 0 : matches.length - 1);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (matches.length) {
        this.choose(matches[this.active()].value);
      }
    }
  }

  private close(): void {
    this.open.set(false);
    this.typed.set('');
  }
}
