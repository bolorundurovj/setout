import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  function make() {
    TestBed.resetTestingModule();
    return TestBed.inject(ToastService);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('has no message initially', () => {
    expect(make().message()).toBe('');
  });

  it('defaults the type to success', () => {
    const toast = make();

    toast.show('Saved.');

    expect(toast.message()).toBe('Saved.');
    expect(toast.type()).toBe('success');
  });

  it('stores the given type', () => {
    const toast = make();
    toast.show('Could not save.', 'error');
    expect(toast.type()).toBe('error');
  });

  it('clears the message after four seconds', () => {
    const toast = make();
    toast.show('Saved.');

    vi.advanceTimersByTime(4000);

    expect(toast.message()).toBe('');
  });

  it('restarts the timeout for a new message', () => {
    const toast = make();
    toast.show('First.');

    vi.advanceTimersByTime(3000);
    toast.show('Second.');
    vi.advanceTimersByTime(3000);

    expect(toast.message()).toBe('Second.');

    vi.advanceTimersByTime(1000);
    expect(toast.message()).toBe('');
  });
});
