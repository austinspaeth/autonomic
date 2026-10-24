import { otaSuffix, parseRevision, versionLabel } from '../otaRevision';

describe('otaRevision', () => {
  it('shows nothing on the store build', () => {
    expect(versionLabel('1.36.0', true, 4)).toBe('Autonomic v1.36.0');
    expect(versionLabel('1.36.0', true, null)).toBe('Autonomic v1.36.0');
  });

  it('numbers an OTA from 1', () => {
    expect(versionLabel('1.36.0', false, 1)).toBe('Autonomic v1.36.0 ∞1');
    expect(versionLabel('1.36.0', false, 12)).toBe('Autonomic v1.36.0 ∞12');
  });

  it('revision 0 is the release commit itself, so it shows nothing', () => {
    expect(otaSuffix(false, 0)).toBe('');
  });

  it('an update with no stamped revision still says it is not the store build', () => {
    expect(otaSuffix(false, null)).toBe('∞');
  });

  it('parses only whole numbers', () => {
    expect(parseRevision('3')).toBe(3);
    expect(parseRevision(' 7 ')).toBe(7);
    expect(parseRevision('')).toBeNull();
    expect(parseRevision(undefined)).toBeNull();
    expect(parseRevision('3a')).toBeNull();
    expect(parseRevision('-1')).toBeNull();
  });
});
