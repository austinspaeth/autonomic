/**
 * Trailing-debounce writer for the journal persist (wired in
 * src/store/store.ts). save() stays synchronous for in-memory state and React
 * notification, but the stringify + MMKV write is scheduled here and runs
 * once, `delayMs` after the burst of mutations ends — so a tap never pays for
 * serializing the whole journal. flush() forces a pending write immediately;
 * the store calls it whenever the app leaves the foreground (background,
 * app-switcher, lock), so the only way to lose a write is an outright crash
 * within the debounce window. Pure so it unit-tests with fake timers.
 */
export interface DebouncedWriter {
  /** (Re)start the countdown; the write fires once, delayMs after the last call. */
  schedule(): void;
  /** Run a pending write now (no-op when nothing is scheduled). */
  flush(): void;
  /** Whether a write is currently scheduled. */
  pending(): boolean;
}

export function createDebouncedWriter(write: () => void, delayMs = 400): DebouncedWriter {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        write();
      }, delayMs);
    },
    flush() {
      if (timer == null) return;
      clearTimeout(timer);
      timer = null;
      write();
    },
    pending() {
      return timer != null;
    },
  };
}
