import { formatAppDiagnostics, type AppDiagnostics } from '../appReport';

const base = (over: Partial<AppDiagnostics> = {}): AppDiagnostics => ({
  at: '2026-08-05T10:00:00.000Z',
  app: { 'app version': '1.4.0', 'native build': '42' },
  platform: { os: 'ios', 'os version': '18.5', model: 'iPhone16,1' },
  distribution: { 'ios sandbox receipt': false },
  subscription: { tier: 'pro', entitled: true, 'active plan': 'com.autonomic.journal.yearly' },
  permissions: { camera: 'granted', 'apple health read': 'unknown' },
  capabilities: { 'vision-camera': 'loaded', 'worklets-core': 'loaded' },
  health: { app: 'Apple Health', available: true, 'connected in settings': true },
  watch: { paired: true, 'watch app installed': true, reachable: false },
  bluetooth: { 'native module': true, 'adapter state': 'PoweredOn', 'can scan now': true },
  notifications: { granted: true, scheduled: 1 },
  storage: { encrypted: true, 'journal size': '412 KB' },
  journal: { 'days logged': 90, readings: 240 },
  settings: { theme: 'dark', 'reminder enabled': true },
  errors: [],
  notes: [],
  ...over,
});

describe('formatAppDiagnostics', () => {
  it('prints every section with its rows', () => {
    const out = formatAppDiagnostics(base());
    for (const heading of ['APP', 'PLATFORM', 'DISTRIBUTION', 'SUBSCRIPTION', 'PERMISSIONS',
      'CAPABILITIES', 'HEALTH', 'APPLE WATCH', 'BLUETOOTH', 'NOTIFICATIONS', 'STORAGE',
      'JOURNAL (counts only)', 'SETTINGS', 'ERRORS']) {
      expect(out).toContain(heading);
    }
    expect(out).toMatch(/app version\s+1\.4\.0/);
    expect(out).toMatch(/adapter state\s+PoweredOn/);
  });

  it('omits the watch block entirely off iOS', () => {
    expect(formatAppDiagnostics(base({ watch: null }))).not.toContain('APPLE WATCH');
  });

  it('leads with the notes, so the answer is at the top', () => {
    const out = formatAppDiagnostics(base({ notes: ['Camera permission is refused.'] }));
    expect(out.indexOf('WORTH LOOKING AT FIRST')).toBeLessThan(out.indexOf('APP\n'));
    expect(out).toContain('· Camera permission is refused.');
  });

  it('says so when nothing has failed', () => {
    expect(formatAppDiagnostics(base())).toContain('none recorded');
  });

  it('prints errors with their tag, repeat count and fatal marker', () => {
    const out = formatAppDiagnostics(base({
      errors: [
        { at: '2026-08-05T09:00:00.000Z', tag: 'store.persist', msg: 'disk full', n: 3, first: '2026-08-05T08:00:00.000Z' },
        { at: '2026-08-05T09:30:00.000Z', tag: 'uncaught.fatal', msg: 'undefined is not an object', fatal: true },
      ],
    }));
    expect(out).toContain('ERRORS (2, oldest first)');
    expect(out).toContain('store.persist ×3');
    expect(out).toContain('first seen 2026-08-05T08:00:00.000Z');
    expect(out).toContain('FATAL  uncaught.fatal');
    expect(out).toContain('undefined is not an object');
  });

  it('renders a missing value as an em-dash rather than "null"', () => {
    const out = formatAppDiagnostics(base({ subscription: { 'active plan': null } }));
    expect(out).toMatch(/active plan\s+—/);
    expect(out).not.toContain('null');
  });
});
