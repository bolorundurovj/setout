export const SEARCH_DEBOUNCE_MS = 250;

// Remove once no module imports the old name.
export const SEARCH_WAIT = SEARCH_DEBOUNCE_MS;

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
