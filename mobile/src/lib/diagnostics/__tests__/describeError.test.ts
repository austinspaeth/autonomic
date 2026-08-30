/**
 * What a failure LOOKS LIKE once it reaches the log.
 *
 * This is the "what happened" half of every fault report and every support
 * dump — the tag says where, this says what — so it is worth pinning. In a
 * release build the stack is minified bytecode offsets and worth nothing, which
 * makes the error's TYPE and the call-site tag the whole of the diagnosis.
 */
import { describeError } from '../format';

describe('describeError', () => {
  it('keeps the error type, which is half the diagnosis', () => {
    expect(describeError(new TypeError('undefined is not a function')))
      .toBe('TypeError: undefined is not a function');
  });

  it('says the type once, not twice', () => {
    // `String(e)` on a real Error already reads "TypeError: ...".
    const e = new TypeError('x');
    expect(describeError(e)).toBe('TypeError: x');
  });

  it('omits a plain Error, which names nothing', () => {
    expect(describeError(new Error('disk full'))).toBe('disk full');
  });

  it('prefers a native code, which is more specific than a JS type', () => {
    // ble-plx
    expect(describeError({ errorCode: 601, message: 'device disconnected' }))
      .toBe('code 601: device disconnected');
    // VisionCamera
    expect(describeError({ code: 'session/camera-not-ready', message: 'not ready' }))
      .toBe('session/camera-not-ready: not ready');
  });

  it('carries a cause, which is usually the real failure', () => {
    const e = new Error('save failed');
    (e as Error & { cause?: unknown }).cause = new Error('ENOSPC');
    expect(describeError(e)).toBe('save failed (cause: ENOSPC)');
  });

  it('never throws on the shapes a catch block actually receives', () => {
    expect(describeError(null)).toBe('unknown');
    expect(describeError(undefined)).toBe('unknown');
    expect(describeError('a string')).toBe('a string');
    expect(describeError({ reason: 'refused' })).toBe('refused');
  });
});
