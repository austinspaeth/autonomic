import { bluetoothMessage } from '../devices';

describe('bluetoothMessage', () => {
  it('says nothing when the adapter is on', () => {
    // null is the signal to the caller that a scan may proceed.
    expect(bluetoothMessage('PoweredOn')).toBeNull();
  });

  it('names the fix for every state a user can act on', () => {
    expect(bluetoothMessage('PoweredOff')).toMatch(/turn it on/i);
    expect(bluetoothMessage('Unauthorized')).toMatch(/settings/i);
    expect(bluetoothMessage('Unsupported')).toMatch(/no bluetooth radio/i);
  });

  it('never leaves a blocked scan unexplained', () => {
    // The bug this guards: an unhandled state fell through to no copy at all,
    // so "Scan" looked like a dead button. Anything but PoweredOn must talk.
    for (const state of ['PoweredOff', 'Unauthorized', 'Unsupported', 'Resetting', 'Unknown', 'wat', '']) {
      expect(bluetoothMessage(state)).toBeTruthy();
    }
  });
});
