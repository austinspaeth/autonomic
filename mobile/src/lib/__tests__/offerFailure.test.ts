import { offerCode, offerFailureBody, pingUrl } from '../ping';

describe('offer fall-through report', () => {
  it('names the two offers and nothing else', () => {
    expect(offerCode('annual')).toBe('A');
    expect(offerCode('founder')).toBe('F');
    expect(offerCode('paywall')).toBeUndefined();
    expect(offerCode(undefined)).toBeUndefined();
  });

  it('rides the offer letter on the ofl route, with the usual tail', () => {
    expect(pingUrl('ofl', '2026-08-21', 'A', 'F', 'T', '1.28.0'))
      .toBe('https://api.autonomic.care/ping/ofl/D082126AF-TT-V1.28.0');
  });

  it('carries the store\'s own enumerations and words', () => {
    expect(offerFailureBody('failed', {
      code: 'network-error',
      message: 'Network unavailable',
      responseCode: 12,
      debugMessage: 'Timed out after 3012ms',
      subResponseCodeAndroid: 'payment-declined-due-to-insufficient-funds',
    }, true)).toEqual({
      outcome: 'failed',
      code: 'network-error',
      response: 12,
      sub: 'payment-declined-due-to-insufficient-funds',
      message: 'Network unavailable · Timed out after <n>ms',
      d: 1,
    });
  });

  it('sends only what the error actually had', () => {
    expect(offerFailureBody('timeout', undefined, false)).toEqual({ outcome: 'timeout' });
    expect(offerFailureBody('failed', 'boom', false)).toEqual({ outcome: 'failed', message: 'boom' });
    // Play often repeats the message as its debugMessage; saying it twice adds nothing.
    expect(offerFailureBody('failed', { message: 'Item unavailable', debugMessage: 'Item unavailable' }, false))
      .toEqual({ outcome: 'failed', message: 'Item unavailable' });
  });

  it('drops anything that is not shaped like an enumeration', () => {
    expect(offerFailureBody('failed', { code: 'Some Weird Code!', responseCode: 1.5 }, false))
      .toEqual({ outcome: 'failed' });
  });

  it('redacts the message before it leaves the phone', () => {
    expect(offerFailureBody('failed', { message: 'receipt for ada@example.com rejected' }, false).message)
      .toBe('receipt for <email> rejected');
  });
});
