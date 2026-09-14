import { offerCode, offerFailureBody, pingUrl } from '../ping';

describe('offer fall-through report', () => {
  it('names the two offers and the paywall, and nothing else', () => {
    expect(offerCode('annual')).toBe('A');
    expect(offerCode('founder')).toBe('F');
    // The paywall used to be excluded here on the grounds that it is not an
    // offer card, which is true and was the wrong call: `reportOfferOutcome`
    // reports only attempts carrying an origin, so excluding it left the app's
    // MAIN purchase door as the one path with no failure reporting at all.
    // It is a failure that is not an offer's failure, so it takes a letter on
    // this route and has no `osh`/`odm`/`oac` counterpart — which is why its
    // denominator is `pay` and `ofl / oac` stays a rate only for A and F.
    expect(offerCode('paywall')).toBe('P');
    // The set is still closed: anything else takes no letter rather than
    // fragmenting the route on a string nobody decided on.
    expect(offerCode('settings')).toBeUndefined();
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
