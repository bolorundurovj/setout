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
    }

    this.timeoutId = setTimeout(() => {
      this.message.set('');
    }, 4000);
  }

  dismiss() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = undefined;
    }
    this.message.set('');
  }
}
