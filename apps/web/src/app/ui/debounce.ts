export const SEARCH_DEBOUNCE_MS = 250;

export interface Debouncer<T> {
  call(value: T): void;
  cancel(): void;
}

export function debounce<T>(run: (value: T) => void, wait = SEARCH_DEBOUNCE_MS): Debouncer<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    call(value: T) {
      clearTimeout(timer);
      timer = setTimeout(() => run(value), wait);
    },
    cancel() {
      clearTimeout(timer);
    },
  };
}
