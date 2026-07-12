/**
 * The debounced journal writer (src/lib/persist.ts) is what makes save()
 * cheap per tap. These tests pin its durability contract: a burst coalesces
 * to one write, flush() forces a pending write out immediately (the
 * leave-foreground path), and nothing writes when nothing is pending.
 */
import { createDebouncedWriter } from '../persist';

describe('createDebouncedWriter', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('coalesces a burst of schedules into one trailing write', () => {
    const write = jest.fn();
    const w = createDebouncedWriter(write, 400);
    w.schedule();
    jest.advanceTimersByTime(200);
    w.schedule(); // restarts the countdown
    w.schedule();
    jest.advanceTimersByTime(399);
    expect(write).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(w.pending()).toBe(false);
  });

  it('does not write before the delay elapses', () => {
    const write = jest.fn();
    const w = createDebouncedWriter(write, 400);
    w.schedule();
    expect(w.pending()).toBe(true);
    jest.advanceTimersByTime(399);
    expect(write).not.toHaveBeenCalled();
  });

  it('flush() writes a pending change immediately and cancels the timer', () => {
    const write = jest.fn();
    const w = createDebouncedWriter(write, 400);
    w.schedule();
    w.flush();
    expect(write).toHaveBeenCalledTimes(1);
    expect(w.pending()).toBe(false);
    // The cancelled timer must not fire a second write.
    jest.advanceTimersByTime(1000);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('flush() is a no-op when nothing is pending', () => {
    const write = jest.fn();
    const w = createDebouncedWriter(write, 400);
    w.flush();
    expect(write).not.toHaveBeenCalled();
  });

  it('schedule after a write starts a fresh cycle', () => {
    const write = jest.fn();
    const w = createDebouncedWriter(write, 400);
    w.schedule();
    jest.advanceTimersByTime(400);
    w.schedule();
    jest.advanceTimersByTime(400);
    expect(write).toHaveBeenCalledTimes(2);
  });
});
