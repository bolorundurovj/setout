import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ToastService {
  message = signal('');
  type = signal<'success' | 'error' | 'info'>('info');
  private timeoutId?: ReturnType<typeof setTimeout>;

  show(message: string, type: 'success' | 'error' | 'info' = 'success') {
    this.message.set(message);
    this.type.set(type);

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }

    // An error stays until it is dismissed, so it cannot disappear before it is read.
    if (type !== 'error') {
      this.timeoutId = setTimeout(() => {
        this.message.set('');
      }, 4000);
    }
  }

  dismiss() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    this.message.set('');
  }
}
