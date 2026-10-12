import { elapsedBand, feedWord, garminDiagMessage, garminReadingMessage, parseGarminDiag, signalWord } from '../diag';
import { redactMessage } from '../../errorReport';

const base = {
  type: 'diag', schemaVersion: 1, reason: 'nosignal', elapsedSec: 75, measuredSec: 0, count: 0,
  callbacks: 74, emptyCallbacks: 74, nullCallbacks: 0, hrSeen: true, rearms: 2,
  device: '006-B4440-00', firmware: [15, 23], ciq: [5, 1, 1],
};

describe('Garmin diag payload', () => {
  it('parses the watch shape and nothing else', () => {
    const d = parseGarminDiag(base)!;
    expect(d.firmware).toBe('15.23');
    expect(d.ciq).toBe('5.1.1');
    expect(d.hrSeen).toBe(true);
    expect(parseGarminDiag({ ...base, type: 'hrv' })).toBeNull();
    expect(parseGarminDiag({ ...base, schemaVersion: 2 })).toBeNull();
  });

  it('names what the sensor did, which decides the fix', () => {
    expect(signalWord(parseGarminDiag(base)!)).toBe('nobeats');
    expect(signalWord(parseGarminDiag({ ...base, hrSeen: false })!)).toBe('nopulse');
    expect(signalWord(parseGarminDiag({ ...base, count: 12 })!)).toBe('thin');
  });

  it('tells a dead listener from a sensor returning empty arrays', () => {
    expect(feedWord(parseGarminDiag(base)!)).toBe('feed:empty');
    expect(feedWord(parseGarminDiag({ ...base, callbacks: 0, emptyCallbacks: 0 })!)).toBe('feed:none');
    expect(feedWord(parseGarminDiag({ ...base, emptyCallbacks: 10 })!)).toBe('feed:ok');
  });

  it('bands the duration so the user-stopped and app-stopped cases separate', () => {
    expect(elapsedBand(12)).toBe('dur<30');
    expect(elapsedBand(45)).toBe('dur30-60');
    expect(elapsedBand(75)).toBe('dur60+');
    expect(elapsedBand(NaN)).toBe('dur?');
  });

  it('leads with the model when known and survives redaction intact', () => {
    const msg = garminDiagMessage(parseGarminDiag(base)!, 'fenix 7 Pro');
    expect(msg).toBe('fenix 7 Pro fw15.23 nobeats feed:empty nosignal rearm2 dur60+');
    expect(redactMessage(msg)).toBe(msg);
  });

  it('falls back to the part number, whose digit run the redactor masks', () => {
    const msg = garminDiagMessage(parseGarminDiag(base)!, null);
    expect(msg.startsWith('006-B4440-00 ')).toBe(true);
    expect(redactMessage(msg)).toContain('<n>');
    // The rest of the signature is untouched, so rows still group by shape.
    expect(redactMessage(msg)).toContain('nobeats feed:empty nosignal rearm2 dur60+');
  });
});

describe('Garmin reading event', () => {
  it('leads with the same watch name as the failure, so the two group together', () => {
    const msg = garminReadingMessage('Venu 4', '006-B4440-00', 0, false);
    expect(msg).toBe('Venu 4 ok rearm0');
    expect(redactMessage(msg)).toBe(msg);
    expect(msg.split(' ').slice(0, 2).join(' ')).toBe(garminDiagMessage(parseGarminDiag(base)!, 'Venu 4').split(' ').slice(0, 2).join(' '));
  });

  it('marks a reading delivered after its own day and caps the re-arm count', () => {
    expect(garminReadingMessage(null, '006-B4440-00', 14, true)).toBe('006-B4440-00 ok rearm9 late');
    expect(garminReadingMessage('', '', undefined, false)).toBe('? ok rearm0');
  });
});
