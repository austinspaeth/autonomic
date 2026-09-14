import { PLAY_CODE, blockedMessage, classifyPlayCode } from '../billingCodes';

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
  it('names the obstacle each code actually describes', () => {
    const old = blockedMessage(PLAY_CODE.FEATURE_NOT_SUPPORTED)!;
    const acct = blockedMessage(PLAY_CODE.BILLING_UNAVAILABLE)!;
    expect(old).toMatch(/out of date/i);
    expect(old).toMatch(/Update Play Store/i);
    // The bug this fixes: an account that cannot buy was told to update an app
    // that is already current, which is both useless and false.
    expect(acct).not.toMatch(/out of date/i);
    expect(acct).toMatch(/signed in/i);
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
