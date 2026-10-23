import { afterEach, beforeEach, vi } from 'vitest';
import { SEARCH_DEBOUNCE_MS, debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs once with the last value after rapid calls', () => {
    const seen: string[] = [];
    const typing = debounce<string>((text) => seen.push(text));

    typing.call('c');
    typing.call('ce');
    typing.call('cem');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(seen).toEqual(['cem']);
  });

  it('runs again for calls after the wait has passed', () => {
    const seen: string[] = [];
    const typing = debounce<string>((text) => seen.push(text));

    typing.call('nails');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    typing.call('sand');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);

    expect(seen).toEqual(['nails', 'sand']);
  });

  it('does not run before the wait has passed', () => {
    const seen: string[] = [];
    const typing = debounce<string>((text) => seen.push(text), 300);

    typing.call('sand');
    vi.advanceTimersByTime(299);
    expect(seen).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['sand']);
  });

  it('does not run a pending call after cancel', () => {
    const seen: string[] = [];
    const typing = debounce<string>((text) => seen.push(text));

    typing.call('sand');
    typing.cancel();
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 4);

    expect(seen).toEqual([]);
  });
});
