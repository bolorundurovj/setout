import { Injectable, computed, signal } from '@angular/core';

/** The dialogs of the drawers that are open, in the order they were opened. */
@Injectable({ providedIn: 'root' })
export class DrawerStack {
  private readonly open = signal<readonly HTMLElement[]>([]);

  /** The dialog of the drawer opened last, or null when none is open. */
  readonly top = computed(() => this.open().at(-1) ?? null);

  enter(dialog: HTMLElement): void {
    this.open.update((open) => [...open.filter((d) => d !== dialog), dialog]);
  }

  leave(dialog: HTMLElement): void {
    this.open.update((open) => open.filter((d) => d !== dialog));
  }
}
