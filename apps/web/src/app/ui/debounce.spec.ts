import { afterEach, beforeEach, vi } from 'vitest';
import { SEARCH_WAIT, debounce } from './debounce';

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs once for a burst of typing, with the last thing typed', () => {
    const seen: string[] = [];
    const typing = debounce<string>((text) => seen.push(text));

    typing.call('c');
    typing.call('ce');
    typing.call('cem');
    vi.advanceTimersByTime(SEARCH_WAIT);

    expect(seen).toEqual(['cem']);
  });

  it('runs again once the typing stops and starts', () => {
    const seen: string[] = [];
    const typing = debounce<string>((text) => seen.push(text));

    typing.call('nails');
    vi.advanceTimersByTime(SEARCH_WAIT);
    typing.call('sand');
    vi.advanceTimersByTime(SEARCH_WAIT);

    expect(seen).toEqual(['nails', 'sand']);
  });

  it('holds off until the wait has passed', () => {
    const seen: string[] = [];
    const typing = debounce<string>((text) => seen.push(text), 300);

    typing.call('sand');
    vi.advanceTimersByTime(299);
    expect(seen).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['sand']);
  });

  it('drops what is pending when it is cancelled', () => {
    const seen: string[] = [];
    const typing = debounce<string>((text) => seen.push(text));

    typing.call('sand');
    typing.cancel();
    vi.advanceTimersByTime(SEARCH_WAIT * 4);

    expect(seen).toEqual([]);
  });
});
