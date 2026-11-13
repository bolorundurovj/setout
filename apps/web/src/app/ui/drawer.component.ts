import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  input,
  output,
  viewChild,
} from '@angular/core';

@Component({
  selector: 'app-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog
      #panel
      class="panel"
      tabindex="-1"
      [attr.aria-label]="title()"
      (cancel)="onCancel($event)"
      (click)="onBackdrop($event)"
      (keydown.escape)="onCancel($event)"
    >
      <header class="panel-head">
        <div class="titles">
          <h2 class="t-heading">{{ title() }}</h2>
          @if (subtitle()) {
            <p class="t-small">{{ subtitle() }}</p>
          }
        </div>
        <button
          type="button"
          class="close t-mono"
          aria-label="Close"
          (click)="closeRequested.emit()"
        >
          Close
        </button>
      </header>
      <div class="panel-body">
        <ng-content />
      </div>
    </dialog>
  `,
  styles: [
    `
      .panel {
        position: fixed;
        margin: 0 0 0 auto;
        padding: 0;
        max-height: 100vh;
        height: 100vh;
        max-width: 100vw;
        color: var(--ink);
        top: 0;
        right: 0;
        bottom: 0;
        width: min(560px, 100vw);
        display: none;
        flex-direction: column;
        background: var(--surface);
        border: 0;
        border-left: 1.5px solid var(--rule);
        z-index: 41;
      }

      .panel[open] {
        display: flex;
      }
      .panel::backdrop {
        background: rgb(0 0 0 / 35%);
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
  private readonly panel = viewChild.required<ElementRef<HTMLDialogElement>>('panel');

  constructor() {
    afterRenderEffect(() => {
      const panel = this.panel().nativeElement;
      if (this.open() && !panel.open) panel.showModal();
      if (!this.open() && panel.open) panel.close();
    });
  }

  onCancel(event: Event): void {
    event.preventDefault();
    this.closeRequested.emit();
  }

  onBackdrop(event: MouseEvent): void {
    if (event.target !== this.panel().nativeElement) return;
    const bounds = this.panel().nativeElement.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      this.closeRequested.emit();
  }

  readonly open = input(false);
  readonly title = input('');
  readonly subtitle = input('');

  readonly closeRequested = output<void>();
}
