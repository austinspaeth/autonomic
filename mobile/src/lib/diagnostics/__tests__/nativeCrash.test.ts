import { describeNativeCrash, parseNativeCrashes } from '../nativeCrash';
import { redactMessage } from '../../errorReport';

/** The crash this whole path was built for, exactly as Android words it. */
const GARMIN_CRASH = {
  at: 1757371482764,
  thread: 'main',
  type: 'android.os.BadParcelableException',
  message: 'ClassNotFoundException when unmarshalling: com.garmin.android.connectiq.IQDevice',
  causeType: 'java.lang.ClassNotFoundException',
  causeMessage: 'com.garmin.android.connectiq.IQDevice',
  frame: 'android.os.Parcel.readParcelableCreator(Parcel.java:3164)',
};

describe('parseNativeCrashes', () => {
  it('reads the rows the native handler writes', () => {
    const list = parseNativeCrashes(JSON.stringify([GARMIN_CRASH]));
    expect(list).toHaveLength(1);
    expect(list[0].type).toBe('android.os.BadParcelableException');
    expect(list[0].causeType).toBe('java.lang.ClassNotFoundException');
    expect(list[0].at).toBe(1757371482764);
  });

  it('never throws on anything the file could actually contain', () => {
    // A process dying mid-write, an older build's format, an empty read.
    expect(parseNativeCrashes('')).toEqual([]);
    expect(parseNativeCrashes(null)).toEqual([]);
    expect(parseNativeCrashes(undefined)).toEqual([]);
    expect(parseNativeCrashes('[{"type":"a.B","message":"x"')).toEqual([]);
    expect(parseNativeCrashes('{"type":"a.B"}')).toEqual([]);
    expect(parseNativeCrashes('[null,3,"x",[]]')).toEqual([]);
  });

  it('drops rows with nothing identifying in them', () => {
    // Would report as "unknown native crash", which is a dashboard row nobody
    // can ever act on.
    expect(parseNativeCrashes('[{"at":1,"thread":"main"}]')).toEqual([]);
  });

  it('ignores fields of the wrong type rather than carrying them', () => {
    const list = parseNativeCrashes('[{"type":"a.B","message":42,"at":"nope"}]');
    expect(list).toHaveLength(1);
    expect(list[0].message).toBeUndefined();
    expect(list[0].at).toBeUndefined();
  });
});

describe('describeNativeCrash', () => {
  it('leads with the exception and keeps the root cause', () => {
    expect(describeNativeCrash(GARMIN_CRASH)).toBe(
      'BadParcelableException: ClassNotFoundException when unmarshalling: '
      + 'com.garmin.android.connectiq.IQDevice '
      + '(cause: ClassNotFoundException: com.garmin.android.connectiq.IQDevice)',
    );
  });

  it('drops the package from class names but never from the message', () => {
    // The package is noise on the exception type and IS the finding inside the
    // message — that asymmetry is the whole point of the formatting.
    const line = describeNativeCrash(GARMIN_CRASH);
    expect(line).not.toContain('android.os.BadParcelableException');
    expect(line).toContain('com.garmin.android.connectiq.IQDevice');
  });

  it('survives redaction with the diagnosis intact', () => {
    // The one guard that matters for the /fault route: this message is the
    // entire bug report, so if redaction ate the class name the row would be
    // useless. Dotted names break into segments too short for the id rule and
    // carry no digit runs, so they pass through whole.
    const redacted = redactMessage(describeNativeCrash(GARMIN_CRASH));
    expect(redacted).toContain('BadParcelableException');
    expect(redacted).toContain('com.garmin.android.connectiq.IQDevice');
    expect(redacted).not.toContain('<id>');
  });

  it('copes with a crash carrying no message and no cause', () => {
    expect(describeNativeCrash({ type: 'java.lang.NullPointerException' }))
      .toBe('NullPointerException');
    expect(describeNativeCrash({})).toBe('unknown native crash');
  });

  it('truncates a pathological native string', () => {
    const line = describeNativeCrash({ type: 'a.B', message: 'x'.repeat(5000) });
    expect(line.length).toBeLessThanOrEqual(220);
    expect(line.endsWith('…')).toBe(true);
  });
});
