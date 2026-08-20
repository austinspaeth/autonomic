/**
 * The support mail's budget and escaping.
 *
 * Both failures here are silent on a device: an over-long `mailto:` makes the tap
 * do nothing at all, and an unescaped body arrives truncated at the first `&`
 * with no sign anything is missing. Neither is visible in a simulator with no
 * mail account, so they are asserted here instead.
 */
import {
  MAX_BODY_CHARS, SUPPORT_EMAIL, supportBody, supportMailtoUrl, trimDiagnostics,
} from '../supportEmail';

const long = (n: number, ch = 'x') => ch.repeat(n);

describe('trimDiagnostics', () => {
  it('leaves a dump that already fits completely alone', () => {
    const text = 'AUTONOMIC — APP DIAGNOSTICS\nall good';
    expect(trimDiagnostics(text)).toBe(text);
  });

  it('keeps BOTH ends, because the errors are at the bottom', () => {
    // The head carries the notes and the build; the tail carries the error log.
    // A trim that kept only the head would throw away the half that says what
    // broke, which is the entire reason the mail is being sent.
    const text = `HEAD-MARKER${long(9000)}TAIL-MARKER`;
    const out = trimDiagnostics(text);
    expect(out).toContain('HEAD-MARKER');
    expect(out).toContain('TAIL-MARKER');
  });

  it('stays inside the budget it was given', () => {
    expect(trimDiagnostics(long(9000)).length).toBeLessThanOrEqual(MAX_BODY_CHARS);
    expect(trimDiagnostics(long(9000), 400).length).toBeLessThanOrEqual(400);
  });

  it('says that it trimmed, and where the whole one is', () => {
    const out = trimDiagnostics(long(9000));
    expect(out).toMatch(/trimmed/i);
    expect(out).toMatch(/Settings/);
  });

  it('handles an empty dump rather than composing "undefined"', () => {
    expect(trimDiagnostics('')).toBe('');
  });
});

describe('supportBody', () => {
  it('puts the user own message FIRST', () => {
    // Somebody writing to a person should not have to scroll past machine output
    // to find where they type. This is the difference between a report that gets
    // sent and one that gets abandoned.
    const body = supportBody('Hi Austin,', 'DIAGNOSTIC-MARKER');
    expect(body.indexOf('Hi Austin,')).toBeLessThan(body.indexOf('DIAGNOSTIC-MARKER'));
  });

  it('labels the dump so the reply does not quote it back', () => {
    expect(supportBody('hi', 'x')).toMatch(/diagnostic report/i);
  });
});

describe('supportMailtoUrl', () => {
  it('addresses the support inbox', () => {
    expect(SUPPORT_EMAIL).toBe('austin@autonomic.care');
    expect(supportMailtoUrl('s', 'b').startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
  });

  it('escapes the characters that would silently truncate the body', () => {
    // A real dump contains all three: `&` starts a new query param, `#` starts a
    // fragment, and a raw `+` decodes as a space.
    const url = supportMailtoUrl('Subject & thing', 'a & b # c + d');
    expect(url).toContain('%26');
    expect(url).toContain('%23');
    expect(url).toContain('%2B');
    // ONE raw `&` in the whole URL: the separator between subject and body. Any
    // other would open a parameter the mail client then drops the rest of.
    expect(url.split('&')).toHaveLength(2);
  });

  it('carries the subject and body back out again', () => {
    const url = supportMailtoUrl('Sub', 'Body line\nsecond');
    const body = decodeURIComponent(url.split('&body=')[1] ?? '');
    expect(decodeURIComponent(url.split('?subject=')[1].split('&body=')[0])).toBe('Sub');
    expect(body).toBe('Body line\nsecond');
  });
});
