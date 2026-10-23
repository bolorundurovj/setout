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

// jsdom has no IntersectionObserver, which @defer (on viewport) requires. The stub never
// intersects, so deferred blocks show their placeholder unless a test triggers them.
// Not declared as `implements IntersectionObserver`, because the DOM interface gains
// members with each lib update.
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

// Writable so specs can replace the callback.
Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  writable: true,
  value: TestIntersectionObserver,
});
