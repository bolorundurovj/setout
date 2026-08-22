import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

let nextId = 0;

@Component({
  selector: 'app-combobox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="field">
      <input
        #input
        class="input-field"
        type="text"
        role="combobox"
        autocomplete="off"
        [id]="inputId"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="listId"
        [attr.placeholder]="placeholder()"
        [attr.aria-label]="placeholder()"
        [value]="value()"
        (input)="onInput($event)"
        (focus)="open.set(true)"
        (keydown)="onKeydown($event)"
      />
      <button
        type="button"
        class="chevron"
        tabindex="-1"
        [attr.aria-label]="open() ? 'Hide suggestions' : 'Show suggestions'"
        (click)="toggle()"
      >
        <svg viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
          <path d="M1 1.5 6 6.5 11 1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </button>
    </div>

    @if (open() && filtered().length > 0) {
      <ul class="options" role="listbox" [id]="listId">
        @for (option of filtered(); track option; let i = $index) {
          <li
            role="option"
            class="option"
            [class.active]="i === active()"
            [attr.aria-selected]="option === value()"
            (mousedown)="choose(option)"
            (mouseenter)="active.set(i)"
          >
            {{ option }}
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
        flex: 1;
      }

      .field {
        position: relative;
      }

      .input-field {
        padding-right: 36px;
      }

      .chevron {
        position: absolute;
        top: 0;
        right: 0;
        height: 100%;
        width: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--ink-2);
      }

      .options {
        position: absolute;
        z-index: 30;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        margin: 0;
        padding: 4px;
        list-style: none;
        max-height: 240px;
        overflow-y: auto;
        background: var(--surface);
        border: 1.5px solid var(--rule);
        border-radius: 10px;
        box-shadow: 0 8px 24px rgb(30 34 38 / 18%);
      }

      .option {
        padding: 9px 10px;
        border-radius: 7px;
        cursor: pointer;
        font:
          400 13px/1.2 'DM Sans',
          sans-serif;
        color: var(--ink);
      }

      .option.active {
        background: var(--field);
      }
    `,
  ],
})
export class ComboboxComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  readonly options = input<string[]>([]);
  readonly value = input('');
  readonly placeholder = input('');

  readonly valueChange = output<string>();
  readonly submitted = output<void>();

  protected readonly open = signal(false);
  protected readonly active = signal(0);
  protected readonly inputId = `combobox-input-${nextId}`;
  protected readonly listId = `combobox-list-${nextId++}`;

  // Typing narrows the list, but never limits what can be entered.
  protected readonly filtered = computed(() => {
    const typed = this.value().trim().toLowerCase();
    const options = this.options();
    return typed ? options.filter((option) => option.toLowerCase().includes(typed)) : options;
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  toggle(): void {
    this.open.update((open) => !open);
  }

  onInput(event: Event): void {
    this.open.set(true);
    this.active.set(0);
    this.valueChange.emit((event.target as HTMLInputElement).value);
  }

  choose(option: string): void {
    this.valueChange.emit(option);
    this.open.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    const options = this.filtered();
    if (event.key === 'Escape') {
      this.open.set(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.open.set(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.active.update((i) =>
        options.length ? (i + step + options.length) % options.length : 0,
      );
      return;
    }
    if (event.key === 'Enter') {
      if (this.open() && options.length > 0) {
        event.preventDefault();
        this.choose(options[this.active()]);
        return;
      }
      this.submitted.emit();
    }
  }
}
