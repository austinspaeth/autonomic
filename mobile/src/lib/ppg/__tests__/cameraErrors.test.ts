import { isNotActiveError } from '../cameraErrors';

describe('isNotActiveError', () => {
  it('matches the obfuscated release-build torch error', () => {
    expect(isNotActiveError('k90: Camera is not active.\n\tat ey0.v(r8-map-id-98b9:4)')).toBe(true);
  });
  it('matches an unobfuscated one', () => {
    expect(isNotActiveError('CameraNotActiveError: Camera is not active')).toBe(true);
  });
  it('leaves real bind failures to the ladder', () => {
    expect(isNotActiveError('session never initialized within 5000 ms')).toBe(false);
    expect(isNotActiveError('IllegalArgumentException: No supported surface combination')).toBe(false);
    expect(isNotActiveError('session initialized but delivered no frames within 4000 ms')).toBe(false);
  });
});
