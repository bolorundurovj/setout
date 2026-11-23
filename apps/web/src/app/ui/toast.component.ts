import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
} from '@angular/core';

import { ToastService } from '../toast.service';
import { DrawerStack } from './drawer-stack.service';

/**
 * The one place toasts are shown. An open drawer is a modal dialog, which makes everything
 * outside it inert, so while one is open this element moves inside it and moves back once it
 * closes. The host is a manual popover, so the browser draws the toast above the drawer.
 */
@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { popover: 'manual', 'aria-live': 'polite' },
  template: `
    @if (toast.message(); as message) {
      <div
        [class]="'toast ' + toast.type()"
        [attr.role]="toast.type() === 'error' ? 'alert' : 'status'"
      >
        <span>{{ message }}</span>
        <button type="button" class="toast-close" aria-label="Dismiss" (click)="toast.dismiss()">
          &times;
        </button>
      </div>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 16px 16px auto auto;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      overflow: visible;
      pointer-events: none;
    }

    .toast {
      pointer-events: auto;
      max-width: min(360px, calc(100vw - 32px));
      padding: 12px 16px;
      text-align: left;
      font:
        400 13px/1.45 'DM Sans',
        sans-serif;
      border: 1px solid var(--ok-edge);
      border-radius: 12px;
      background: var(--ok-surface);
      color: var(--ok-ink);
      box-shadow: 0 8px 24px rgb(30 34 38 / 18%);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .toast-close {
      flex: none;
      padding: 0;
      background: none;
      border: none;
      cursor: pointer;
      font:
        500 16px/1 'DM Sans',
        sans-serif;
      color: inherit;
      border-radius: 6px;

      &:hover {
        opacity: 0.7;
      }

      &:focus-visible {
        outline: none;
        box-shadow:
          0 0 0 2px var(--surface),
          0 0 0 4px var(--accent);
      }
    }

    .toast.error {
      background: var(--danger-surface);
      color: var(--danger-ink);
      border-color: var(--danger-edge);
    }

    .toast.info {
      background: var(--field);
      color: var(--ink);
      border-color: var(--rule);
    }
  `,
})
export class ToastComponent {
  readonly toast = inject(ToastService);
  private readonly drawers = inject(DrawerStack);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private home: Element | null = null;

  constructor() {
    afterRenderEffect(() => {
      const drawer = this.drawers.top();
      this.home ??= this.host.parentElement;
      const target = drawer ?? this.home;
      if (target && this.host.parentElement !== target) {
        target.appendChild(this.host);
      }
      // Kept open even when empty, so the live region is rendered before a message arrives.
      this.toast.message();
      this.raise();
    });
  }

  /** Reopening the popover moves it to the top of the top layer, above any drawer opened since. */
  private raise(): void {
    if (typeof this.host.showPopover !== 'function') {
      return;
    }
    if (this.host.matches(':popover-open')) {
      this.host.hidePopover();
    }
    this.host.showPopover();
  }
}
