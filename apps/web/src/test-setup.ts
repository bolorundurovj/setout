// Angular's test DOM does not provide storage, and Node 24's global storage is
// unavailable unless it is started with --localstorage-file.
class TestStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

Object.defineProperty(globalThis, 'Storage', {
  configurable: true,
  value: TestStorage,
});
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new TestStorage(),
});

// jsdom has no IntersectionObserver, which is what @defer (on viewport) waits on.
// Never intersecting is the right default: a deferred block stays at its
// placeholder unless a test asks for it.
// Deliberately not `implements IntersectionObserver`: the DOM interface keeps
// growing, and a stub that has to list every member breaks on each lib bump.
const ignore = (): void => undefined;

class TestIntersectionObserver {
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: readonly number[] = [];

  readonly disconnect = ignore;
  readonly observe = ignore;
  readonly unobserve = ignore;
  readonly takeRecords = (): IntersectionObserverEntry[] => [];
}

// Writable, because a spec that wants to watch the callback replaces it outright.
Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  writable: true,
  value: TestIntersectionObserver,
});
