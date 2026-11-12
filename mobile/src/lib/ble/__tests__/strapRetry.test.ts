import { STRAP_MAX_ATTEMPTS, strapRetryDelay } from '../strapRetry';

test('the wait doubles from 3 s and never passes 30 s', () => {
  expect(strapRetryDelay(1)).toBe(3000);
  expect(strapRetryDelay(2)).toBe(6000);
  expect(strapRetryDelay(3)).toBe(12000);
  expect(strapRetryDelay(4)).toBe(24000);
  expect(strapRetryDelay(5)).toBe(30000);
  expect(strapRetryDelay(STRAP_MAX_ATTEMPTS - 1)).toBe(30000);
});

test('it stops after the last attempt instead of retrying for ever', () => {
  expect(strapRetryDelay(STRAP_MAX_ATTEMPTS)).toBeNull();
  expect(strapRetryDelay(STRAP_MAX_ATTEMPTS + 5)).toBeNull();
});

test('a whole run of attempts is minutes, not the old 20 a minute', () => {
  let total = 0;
  for (let f = 1; f < STRAP_MAX_ATTEMPTS; f += 1) total += strapRetryDelay(f)!;
  expect(total).toBeGreaterThan(2 * 60 * 1000);
  expect(total).toBeLessThan(5 * 60 * 1000);
});
