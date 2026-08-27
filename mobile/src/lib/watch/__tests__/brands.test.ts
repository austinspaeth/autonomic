import { brandNames, connectSteps, watchBrand, watchBrands, partitionStraps } from '../brands';

describe('watch brand registry', () => {
  it('lists only brands that are wired end to end', () => {
    // The list is what someone scans to find the watch on their own wrist, so
    // everything in it is a promise that it works. Garmin is the only brand a
    // reading has ever actually travelled through; the others keep their copy
    // in the registry, ready to be listed once each is tested.
    const ids = watchBrands().map((b) => b.id);
    expect(ids).toEqual(['garmin']);
  });

  it('flags a listed brand that is not proven yet', () => {
    // "Experimental" is the honest label while exactly one watch model has been
    // verified. Remove it when the likely list has been worked through, not
    // before.
    const garmin = watchBrands().find((b) => b.id === 'garmin');
    expect(garmin?.experimental).toBe(true);
    expect(garmin?.verified).toContain('Venu 4');
  });

  it('carries an Android store link for every brand', () => {
    for (const b of watchBrands()) {
      expect(b.store.android).toMatch(/^https:\/\//);
      // iOS may legitimately be empty (Samsung Health and the Pixel Watch's
      // Fitbit pairing have no iPhone path) — the setup card falls back to
      // saying the app isn't installed rather than opening a dead link.
      if (b.store.ios) expect(b.store.ios).toMatch(/^https:\/\//);
    }
  });

  it('gives every brand rows the setup card can render', () => {
    for (const b of watchBrands()) {
      // A listed brand needs SOMETHING to show; verified may legitimately be
      // empty for one we have not taken a reading on.
      expect(b.verified.length + b.likely.length).toBeGreaterThan(0);
      expect(b.caveat.length).toBeGreaterThan(0);
      expect(b.models.length).toBeGreaterThan(0);
      expect(b.short.length).toBeGreaterThan(0);
      expect(b.scheme).toMatch(/:\/\/$/);
    }
  });

  it('names the health store the steps actually route through', () => {
    const garmin = watchBrand('garmin')!;
    const steps = connectSteps(garmin, 'Health Connect');
    expect(steps).toHaveLength(3);
    // The whole path is watch → companion app → health store → here; naming the
    // wrong store is the one thing that makes these steps useless.
    expect(steps.some((s) => s.title.includes('Health Connect'))).toBe(true);
    expect(steps.every((s) => !s.title.includes('Apple Health') && !s.sub.includes('Apple Health'))).toBe(true);
    expect(steps[0].title).toContain('Garmin Connect');
  });

  it('falls back to the health-store steps when the direct link is not available', () => {
    const garmin = watchBrand('garmin')!;
    expect(garmin.transport).toBe('direct');
    // A brand can declare a direct link and still be on a platform that has no
    // module for it — the steps must not promise a route that isn't there.
    expect(connectSteps(garmin, 'Apple Health', false)).not.toEqual(garmin.directSteps);
    expect(connectSteps(garmin, 'Apple Health', true)).toEqual(garmin.directSteps);
    // And a brand with no direct steps ignores the flag entirely.
    const fitbit = watchBrand('fitbit')!;
    expect(connectSteps(fitbit, 'Apple Health', true)).toEqual(connectSteps(fitbit, 'Apple Health', false));
  });

  it('uses one-word names in the collapsed row', () => {
    // Four have to fit on one line under "Other watches".
    expect(brandNames()).toBe('Garmin, Samsung, Pixel, Fitbit');
  });
});

describe('partitionStraps', () => {
  const d = (name: string | null) => ({ name });

  it('keeps straps and pulls out watches', () => {
    const { straps, watches } = partitionStraps([
      d('Polar H10 1234'), d('Venu 4'), d('HRM-Dual:5678'), d('Apple Watch'),
    ]);
    expect(straps.map((s) => s.name)).toEqual(['Polar H10 1234', 'HRM-Dual:5678']);
    expect(watches.map((w) => w.name)).toEqual(['Venu 4', 'Apple Watch']);
  });

  // An unnamed advertisement is not evidence of a watch, and dropping it would
  // hide straps that advertise late.
  it('treats a nameless device as a strap', () => {
    expect(partitionStraps([d(null)]).straps).toHaveLength(1);
  });
});
