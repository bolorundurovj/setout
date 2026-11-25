import { KeyedLoadTracker, LoadTracker } from './request-status';

describe('LoadTracker', () => {
  it('moves from idle to loading to ready or error', () => {
    const tracker = new LoadTracker();
    expect(tracker.status()).toBe('idle');

    const first = tracker.start();
    expect(tracker.status()).toBe('loading');
    expect(tracker.settle(first, 'ready')).toBe(true);
    expect(tracker.status()).toBe('ready');

    const second = tracker.start();
    expect(tracker.settle(second, 'error')).toBe(true);
    expect(tracker.status()).toBe('error');
  });

  it('does not let a superseded load settle', () => {
    const tracker = new LoadTracker();
    const stale = tracker.start();
    const current = tracker.start();

    expect(tracker.settle(stale, 'error')).toBe(false);
    expect(tracker.status()).toBe('loading');
    expect(tracker.settle(current, 'ready')).toBe(true);
    expect(tracker.status()).toBe('ready');
  });

  it('keeps the settled status during a quiet load', () => {
    const tracker = new LoadTracker();
    tracker.settle(tracker.start(), 'ready');

    const quiet = tracker.start(true);
    expect(tracker.status()).toBe('ready');
    tracker.settle(quiet, 'error');
    expect(tracker.status()).toBe('error');
  });

  it('shows loading for a quiet first load', () => {
    const tracker = new LoadTracker();
    tracker.start(true);
    expect(tracker.status()).toBe('loading');
  });

  it('returns to idle and drops the pending load on reset', () => {
    const tracker = new LoadTracker();
    const pending = tracker.start();
    tracker.reset();

    expect(tracker.status()).toBe('idle');
    expect(tracker.settle(pending, 'ready')).toBe(false);
  });
});

describe('KeyedLoadTracker', () => {
  it('tracks each key on its own', () => {
    const tracker = new KeyedLoadTracker();
    const a = tracker.start('a');
    tracker.start('b');

    tracker.settle('a', a, 'ready');

    expect(tracker.status('a')).toBe('ready');
    expect(tracker.status('b')).toBe('loading');
    expect(tracker.status('c')).toBe('idle');
  });

  it('does not let a superseded load for the same key settle', () => {
    const tracker = new KeyedLoadTracker();
    const stale = tracker.start('a');
    const current = tracker.start('a');

    expect(tracker.settle('a', stale, 'error')).toBe(false);
    expect(tracker.settle('a', current, 'ready')).toBe(true);
    expect(tracker.status('a')).toBe('ready');
  });

  it('keeps the settled status during a quiet load', () => {
    const tracker = new KeyedLoadTracker();
    tracker.settle('a', tracker.start('a'), 'ready');
    tracker.start('a', true);
    expect(tracker.status('a')).toBe('ready');
  });
});
