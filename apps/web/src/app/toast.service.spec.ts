import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  function make() {
    TestBed.resetTestingModule();
    return TestBed.inject(ToastService);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('says nothing until something is shown', () => {
    expect(make().message()).toBe('');
  });

  it('shows a message as a success unless told otherwise', () => {
    const toast = make();

    toast.show('Saved.');

    expect(toast.message()).toBe('Saved.');
    expect(toast.type()).toBe('success');
  });

  it('carries the kind it was given', () => {
    const toast = make();
    toast.show('Could not save.', 'error');
    expect(toast.type()).toBe('error');
  });

  it('clears itself after a few seconds', () => {
    const toast = make();
    toast.show('Saved.');

    vi.advanceTimersByTime(4000);

    expect(toast.message()).toBe('');
  });

  it('gives a second message the full time rather than the remains of the first', () => {
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
