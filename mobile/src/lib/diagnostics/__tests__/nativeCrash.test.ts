import {
  NATIVE_CRASH_TAG, NATIVE_HANG_TAG, type NativeCrash, describeNativeCrash, parseNativeCrashes, tagForNativeCrash,
} from '../nativeCrash';
import { redactMessage } from '../../errorReport';

/** What CrashLog.swift writes for a signal crash and for a hang. */
const IOS_CRASH: NativeCrash = {
  at: 1760400000000,
  kind: 'crash',
  source: 'metrickit',
  type: 'SIGSEGV',
  message: 'Namespace SIGNAL, Code 0xb | libswiftCore +0x1a2b < Autonomic +0x3c4d',
  frame: 'libswiftCore +0x1a2b < Autonomic +0x3c4d',
  version: '1.33.0',
};
const IOS_HANG: NativeCrash = {
  at: 1760400000000,
  kind: 'hang',
  source: 'metrickit',
  type: 'Hang',
  message: 'main thread hung 6s | Autonomic +0x3c4d',
  version: '1.33.0',
};

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

  it('reads an Android row as a Java crash, which is what every older build wrote', () => {
    const [c] = parseNativeCrashes(JSON.stringify([GARMIN_CRASH]));
    expect(c.kind).toBe('crash');
    expect(c.source).toBe('java');
    expect(c.version).toBeUndefined();
    expect(tagForNativeCrash(c)).toBe(NATIVE_CRASH_TAG);
  });

  it('reads the rows the iOS module writes from MetricKit', () => {
    const list = parseNativeCrashes(JSON.stringify([IOS_CRASH, IOS_HANG]));
    expect(list).toHaveLength(2);
    expect(list[0].source).toBe('metrickit');
    expect(list[0].kind).toBe('crash');
    expect(list[0].version).toBe('1.33.0');
    expect(tagForNativeCrash(list[0])).toBe(NATIVE_CRASH_TAG);
    expect(list[1].kind).toBe('hang');
    expect(tagForNativeCrash(list[1])).toBe(NATIVE_HANG_TAG);
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

  it('names the build that crashed, which is not the build that reports it', () => {
    expect(describeNativeCrash(IOS_CRASH))
      .toBe('SIGSEGV: Namespace SIGNAL, Code 0xb | libswiftCore +0x1a2b < Autonomic +0x3c4d [v1.33.0]');
  });

  it('keeps a signal row and an ObjC exception row whole through redaction', () => {
    // Hex offsets have letters in them and the version is short: neither reads
    // as an id or a digit run to the fault redaction.
    const signal = redactMessage(describeNativeCrash(IOS_CRASH));
    expect(signal).toBe(describeNativeCrash(IOS_CRASH));
    // An ObjC exception's own words LEAD the message (CrashLog.swift orders
    // the parts that way), so the 140-character cap eats the frame and the
    // version before it can eat the finding.
    const objc = redactMessage(describeNativeCrash({
      ...IOS_CRASH, type: 'SIGABRT',
      causeType: 'NSInvalidArgumentException',
      message: '-[__NSCFString objectForKey:]: unrecognized selector sent to instance 0x12 | Namespace SIGNAL, Code 0x6 | libobjc +0x1a2b < Autonomic +0x3c4d',
    }));
    expect(objc).toContain('SIGABRT');
    expect(objc).toContain('unrecognized selector');
    expect(objc).toContain('Namespace SIGNAL');
  });

  it('keeps a long exception class whole: it is a name, not an id', () => {
    // The Fabric mounting crash reached the dashboard as `<id>: Unable to find
    // viewState…` because its 31-letter class tripped the long-token rule.
    const line = describeNativeCrash({
      type: 'com.facebook.react.bridge.RetryableMountingLayerException',
      message: 'Unable to find viewState for tag 118. Surface stopped: false',
    });
    expect(redactMessage(line)).toBe('RetryableMountingLayerException: Unable to find viewState for tag 118. Surface stopped: false');
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
