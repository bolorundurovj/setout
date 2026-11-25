import { signal, untracked } from '@angular/core';

export type RequestStatus = 'idle' | 'loading' | 'error' | 'ready';

/**
 * Status of the latest load. A quiet load, such as a refresh after a change,
 * keeps the current status until it settles. Superseded loads cannot settle.
 */
export class LoadTracker {
  private readonly state = signal<RequestStatus>('idle');
  private seq = 0;

  readonly status = this.state.asReadonly();

  start(quiet = false): number {
    if (!quiet || untracked(this.state) === 'idle') {
      this.state.set('loading');
    }
    return ++this.seq;
  }

  isCurrent(token: number): boolean {
    return token === this.seq;
  }

  settle(token: number, status: 'ready' | 'error'): boolean {
    if (!this.isCurrent(token)) {
      return false;
    }
    this.state.set(status);
    return true;
  }

  reset(): void {
    this.seq++;
    this.state.set('idle');
  }
}

/** A {@link LoadTracker} per key, for lists cached by parent record. */
export class KeyedLoadTracker {
  private readonly state = signal<Record<string, RequestStatus>>({});
  private readonly seqs = new Map<string, number>();

  status(key: string): RequestStatus {
    return this.state()[key] ?? 'idle';
  }

  start(key: string, quiet = false): number {
    if (!quiet || untracked(() => this.status(key)) === 'idle') {
      this.set(key, 'loading');
    }
    const token = (this.seqs.get(key) ?? 0) + 1;
    this.seqs.set(key, token);
    return token;
  }

  isCurrent(key: string, token: number): boolean {
    return this.seqs.get(key) === token;
  }

  settle(key: string, token: number, status: 'ready' | 'error'): boolean {
    if (!this.isCurrent(key, token)) {
      return false;
    }
    this.set(key, status);
    return true;
  }

  private set(key: string, status: RequestStatus): void {
    this.state.update((all) => ({ ...all, [key]: status }));
  }
}
