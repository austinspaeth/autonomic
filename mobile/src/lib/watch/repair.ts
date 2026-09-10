import { looksLikeWatchBroadcast } from './brands';
import { getState, save } from '../../store/store';

/**
 * Forget a WATCH that was saved as a Bluetooth strap.
 *
 * A watch broadcasting its heart rate advertises the standard heart-rate
 * service, so it appears in a strap scan and can be paired like one. The
 * picker now filters those out, but anyone who paired one before that landed
 * still has it stored — and it is worse than useless: broadcast mode sends a
 * pulse rate with no beat-to-beat intervals, so the strap source would run a
 * capture that can never produce an HRV reading.
 *
 * Clearing it is safe. The only thing lost is a remembered device that could
 * not have worked, and the real route (a Garmin watch app, or the health
 * store) is unaffected.
 */
export function repairWatchPairedAsStrap(): boolean {
  const s = getState().settings;
  if (!looksLikeWatchBroadcast(s.lastBleDeviceName)) return false;
  delete s.lastBleDeviceId;
  delete s.lastBleDeviceName;
  if (s.lastHrvSource === 'polar') delete s.lastHrvSource;
  save();
  return true;
}
