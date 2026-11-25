import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-archive-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (confirming()) {
      <button type="button" (click)="confirming.set(false); confirmed.emit()">
        Confirm archive
      </button>
      <button type="button" (click)="confirming.set(false)">Cancel</button>
    } @else {
      <button type="button" [attr.aria-label]="label() || null" (click)="confirming.set(true)">
        {{ text() }}
      </button>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    button {
      background: none;
      color: var(--ink-2);
      border: 0;
      cursor: pointer;
      font: inherit;
      text-decoration: underline;
    }
  `,
})
export class ArchiveConfirmComponent {
  readonly label = input('');
  readonly text = input('Archive');
  readonly confirmed = output<void>();
  protected readonly confirming = signal(false);
}
