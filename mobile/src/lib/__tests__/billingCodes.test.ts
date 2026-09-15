import { PLAY_CODE, blockedMessage, classifyPlayCode, inappVerdict } from '../billingCodes';

describe('classifyPlayCode', () => {
  it('reconnects on a dropped or unavailable binding', () => {
    expect(classifyPlayCode(PLAY_CODE.SERVICE_DISCONNECTED)).toBe('transient');
    expect(classifyPlayCode(PLAY_CODE.SERVICE_UNAVAILABLE)).toBe('transient');
  });

  // The two that were missing, and the whole reason this module exists. A
  // phone with no signal must not be told its device can never buy anything.
  it('treats a timeout and a network error as transient', () => {
    expect(classifyPlayCode(PLAY_CODE.SERVICE_TIMEOUT)).toBe('transient');
    expect(classifyPlayCode(PLAY_CODE.NETWORK_ERROR)).toBe('transient');
  });

  // NETWORK_ERROR is 12 and Play's debugMessage for it reads "An internal
  // error occurred.", which is what ERROR (6) actually is. Reading the text
  // instead of the number gets this exactly backwards, so pin both.
  it('separates NETWORK_ERROR (12) from ERROR (6)', () => {
    expect(PLAY_CODE.NETWORK_ERROR).toBe(12);
    expect(PLAY_CODE.ERROR).toBe(6);
    expect(classifyPlayCode(PLAY_CODE.NETWORK_ERROR)).toBe('transient');
    expect(classifyPlayCode(PLAY_CODE.ERROR)).toBe('other');
  });

  it('blocks on the two codes no retry can fix', () => {
    expect(classifyPlayCode(PLAY_CODE.FEATURE_NOT_SUPPORTED)).toBe('blocked');
    expect(classifyPlayCode(PLAY_CODE.BILLING_UNAVAILABLE)).toBe('blocked');
  });

  it('never blocks on a transient code', () => {
    for (const c of [PLAY_CODE.SERVICE_DISCONNECTED, PLAY_CODE.SERVICE_UNAVAILABLE,
      PLAY_CODE.SERVICE_TIMEOUT, PLAY_CODE.NETWORK_ERROR]) {
      expect(blockedMessage(c)).toBeNull();
    }
  });

  it('has no verdict on an absent or unknown code', () => {
    expect(classifyPlayCode(undefined)).toBe('other');
    expect(classifyPlayCode(PLAY_CODE.OK)).toBe('other');
    expect(classifyPlayCode(PLAY_CODE.ITEM_ALREADY_OWNED)).toBe('other');
    expect(classifyPlayCode(999)).toBe('other');
  });
});

describe('blockedMessage', () => {
  it('names the one obstacle FEATURE_NOT_SUPPORTED actually describes', () => {
    const old = blockedMessage(PLAY_CODE.FEATURE_NOT_SUPPORTED)!;
    expect(old).toMatch(/out of date/i);
    expect(old).toMatch(/Update Play Store/i);
    // One cause, so it may not hedge about accounts or countries.
    expect(old).not.toMatch(/signed in|country/i);
  });

  // BILLING_UNAVAILABLE is five conditions wearing one number, and the copy has
  // now been wrong in both directions: first it named only the Play Store
  // version, then the correction named only the account. Google lists the
  // out-of-date Play Store FIRST, so dropping it sent the likeliest reader away
  // with the one instruction that would have worked missing.
  it('names every cause of BILLING_UNAVAILABLE the user can act on', () => {
    const acct = blockedMessage(PLAY_CODE.BILLING_UNAVAILABLE)!;
    expect(acct).toMatch(/updating|update/i);
    expect(acct).toMatch(/signed in/i);
    expect(acct).toMatch(/country/i);
  });

  // Both messages send the user out of the app to change something, so both
  // have to end somewhere they can come back to. The retry is a real control
  // (StoreBlockedNotice), and copy that said "come back" pointed at nothing.
  it('ends each message on the retry the notice actually offers', () => {
    for (const c of Object.values(PLAY_CODE)) {
      const m = blockedMessage(c);
      if (m) expect(m).toMatch(/try again/i);
    }
  });

  it('says nothing for a code that is not terminal', () => {
    expect(blockedMessage(undefined)).toBeNull();
    expect(blockedMessage(PLAY_CODE.OK)).toBeNull();
    expect(blockedMessage(PLAY_CODE.ERROR)).toBeNull();
  });

  // Every blocked code must have copy, or the latch sets `blocked` to
  // undefined and the buy button silently comes back.
  it('has a message for every blocked code', () => {
    for (const c of Object.values(PLAY_CODE)) {
      if (classifyPlayCode(c) === 'blocked') expect(blockedMessage(c)).toBeTruthy();
    }
  });

  // Austin's copy rule: no em dashes anywhere in app copy.
  it('carries no em dashes', () => {
    for (const c of Object.values(PLAY_CODE)) {
      expect(blockedMessage(c) ?? '').not.toMatch(/—/);
    }
  });
});

describe('inappVerdict', () => {
  // THE ONE THAT MATTERS. No one-time product exists in the Play Console, so a
  // healthy device answers the probe with nothing at all. If an empty list read
  // as a refusal, every device would report as terminal and the population the
  // probe exists to measure would be invisible.
  it('reads an empty product list as served', () => {
    expect(inappVerdict({ threw: false })).toBe('ok');
    expect(inappVerdict({ threw: true, code: PLAY_CODE.OK })).toBe('ok');
    expect(inappVerdict({ threw: true, code: undefined })).toBe('ok');
  });

  it('reads a second blocking code as blocked', () => {
    expect(inappVerdict({ threw: true, code: PLAY_CODE.FEATURE_NOT_SUPPORTED })).toBe('blocked');
    expect(inappVerdict({ threw: true, code: PLAY_CODE.BILLING_UNAVAILABLE })).toBe('blocked');
  });

  // Play answering at all is the finding, whatever it answered. Only the two
  // codes that refuse the DEVICE mean a one-time product wouldn't sell either.
  it('treats any other failure as Play having answered', () => {
    for (const c of [PLAY_CODE.ITEM_UNAVAILABLE, PLAY_CODE.DEVELOPER_ERROR,
      PLAY_CODE.ERROR, PLAY_CODE.NETWORK_ERROR]) {
      expect(inappVerdict({ threw: true, code: c })).toBe('ok');
    }
  });

  // Never guess from a probe that never came back: an unanswered probe is not
  // evidence that one-time products would work.
  it('never reports a timeout as served', () => {
    expect(inappVerdict({ threw: false, timedOut: true })).toBe('timeout');
    expect(inappVerdict({ threw: true, code: PLAY_CODE.OK, timedOut: true })).toBe('timeout');
  });
});
