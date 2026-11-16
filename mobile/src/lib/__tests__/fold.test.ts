import {
  contentInsets, navLayoutFor, parseFoldFacts, pillAnchor, RAIL_MIN_STRIP, sameFacts, sceneWidth, sheetFrame,
  SHEET_MAX_W, SIDEBAR_W, TOPBAR_RESERVE, topBarFor, type FoldFacts,
} from '../fold';

const NO_INSETS = { top: 0, left: 0, bottom: 0, right: 0 };
const closed: FoldFacts = { hinge: 'closed', hSize: 'compact', vSize: 'regular', occlusions: [] };
const open: FoldFacts = { hinge: 'open', hSize: 'regular', vSize: 'regular', occlusions: [] };

describe('parseFoldFacts', () => {
  it('reads nothing as not a foldable', () => {
    expect(parseFoldFacts(null)).toBeNull();
    expect(parseFoldFacts({})).toBeNull();
    // A phone with no hinge sends size classes and no hinge: still not a foldable.
    expect(parseFoldFacts({ hSize: 'regular', vSize: 'regular' })).toBeNull();
    expect(parseFoldFacts({ hinge: 'ajar' })).toBeNull();
  });

  it('keeps valid occlusions and drops malformed ones', () => {
    const f = parseFoldFacts({
      hinge: 'closed', hSize: 'compact', vSize: 'regular',
      occlusions: [{ x: 300, y: 10, w: 60, h: 40 }, { x: 'a' }, { x: 1, y: 1, w: 0, h: 5 }, null],
    });
    expect(f).toEqual({ ...closed, occlusions: [{ x: 300, y: 10, w: 60, h: 40 }] });
  });

  it('reads an unknown size class as unspecified rather than refusing', () => {
    expect(parseFoldFacts({ hinge: 'open', hSize: 'huge' })?.hSize).toBe('unspecified');
  });
});

describe('navLayoutFor', () => {
  it('is the bottom bar with no facts where nothing may be inferred (Android)', () => {
    expect(navLayoutFor(null, { width: 900, height: 600 }, { ...NO_INSETS, right: 84 })).toEqual({ kind: 'bar' });
    expect(navLayoutFor(null, { width: 420, height: 900 }, { ...NO_INSETS, right: 84 })).toEqual({ kind: 'bar' });
  });

  it('infers the open phone in landscape from the window alone on iOS', () => {
    expect(navLayoutFor(null, { width: 1000, height: 700 }, { ...NO_INSETS, right: 30 }, true))
      .toEqual({ kind: 'sidebar', width: SIDEBAR_W + 30 });
  });

  it('never infers a rail on the inner display in portrait', () => {
    expect(navLayoutFor(null, { width: 700, height: 980 }, { ...NO_INSETS, right: 60 }, true)).toEqual({ kind: 'bar' });
  });

  it('recognises the closed phone from the safe area alone when there are no facts', () => {
    // An older binary: no module, so no facts. Portrait with a side strip is
    // the closed phone; no other iPhone has a side inset in portrait.
    expect(navLayoutFor(null, { width: 420, height: 900 }, { top: 50, left: 0, bottom: 30, right: 84 }, true))
      .toEqual({ kind: 'rail', edge: 'right', width: 84 });
    // An ordinary iPhone in portrait: no side inset, the bar.
    expect(navLayoutFor(null, { width: 402, height: 874 }, { top: 62, left: 0, bottom: 34, right: 0 }, true)).toEqual({ kind: 'bar' });
  });

  it('stands a rail in the strip of the closed phone', () => {
    const l = navLayoutFor(closed, { width: 420, height: 900 }, { top: 50, left: 0, bottom: 30, right: 84 });
    expect(l).toEqual({ kind: 'rail', edge: 'right', width: 84 });
  });

  it('keeps the bar on a closed phone with no strip to stand in', () => {
    expect(navLayoutFor(closed, { width: 420, height: 900 }, { ...NO_INSETS, right: RAIL_MIN_STRIP - 1 })).toEqual({ kind: 'bar' });
  });

  it('follows the strip to the left edge when that is where it is', () => {
    expect(navLayoutFor(closed, { width: 900, height: 420 }, { ...NO_INSETS, left: 84 })).toMatchObject({ kind: 'rail', edge: 'left' });
  });

  it('keeps the bar on the open phone in portrait', () => {
    expect(navLayoutFor(open, { width: 760, height: 900 }, NO_INSETS)).toEqual({ kind: 'bar' });
  });

  it('opens the sidebar on the open phone in landscape, right inset included', () => {
    expect(navLayoutFor(open, { width: 900, height: 760 }, { ...NO_INSETS, right: 20 }))
      .toEqual({ kind: 'sidebar', width: SIDEBAR_W + 20 });
  });

  it('refuses a sidebar that would leave the content too narrow', () => {
    expect(navLayoutFor(open, { width: 600, height: 500 }, NO_INSETS)).toEqual({ kind: 'bar' });
  });

  it('decides open vs closed by size class, not by the hinge word', () => {
    // Partially open but still reporting the outer display's size classes.
    const partial: FoldFacts = { ...closed, hinge: 'partial' };
    expect(navLayoutFor(partial, { width: 420, height: 900 }, { ...NO_INSETS, right: 84 }).kind).toBe('rail');
  });
});

describe('the geometry around the layout', () => {
  const ins = { top: 50, left: 10, bottom: 30, right: 84 };
  const sidebar = { kind: 'sidebar' as const, width: 280 };
  const rail = { kind: 'rail' as const, edge: 'right' as const, width: 84 };

  it('pads scene content by the safe sides, except the side the sidebar already covers', () => {
    expect(contentInsets({ kind: 'bar' }, ins)).toEqual({ left: 10, right: 84 });
    expect(contentInsets(rail, ins)).toEqual({ left: 10, right: 84 });
    expect(contentInsets(sidebar, ins)).toEqual({ left: 10, right: 0 });
  });

  it('floats pills above the bar, and over the content when there is none', () => {
    expect(pillAnchor({ kind: 'bar' }, ins)).toEqual({ bottom: 118, left: 0, right: 0 });
    expect(pillAnchor(rail, ins)).toEqual({ bottom: 46, left: 10, right: 84 });
    expect(pillAnchor(sidebar, ins)).toEqual({ bottom: 46, left: 10, right: 280 });
  });

  it('centres a sheet on a wide window and keeps it out of the strip', () => {
    const wide = sheetFrame(sidebar, { width: 1000, height: 700 }, ins);
    expect(wide.left).toBe(wide.right);
    expect(1000 - wide.left - wide.right).toBe(SHEET_MAX_W);
    expect(sheetFrame(rail, { width: 420, height: 900 }, ins)).toEqual({ left: 10, right: 84 });
    expect(sheetFrame({ kind: 'bar' }, { width: 400, height: 900 }, ins)).toEqual({ left: 0, right: 0 });
  });

  it('lays scenes out beside the sidebar', () => {
    expect(sceneWidth(sidebar, { width: 1000, height: 700 })).toBe(720);
    expect(sceneWidth(rail, { width: 420, height: 900 })).toBe(420);
  });
});

describe('sameFacts', () => {
  it('treats an identical snapshot as no news', () => {
    expect(sameFacts(closed, { ...closed, occlusions: [] })).toBe(true);
    expect(sameFacts(closed, open)).toBe(false);
    expect(sameFacts(null, closed)).toBe(false);
    expect(sameFacts(null, null)).toBe(true);
  });
});

describe('topBarFor', () => {
  it('moves the header into the status bar row on the open phone in portrait', () => {
    const tb = topBarFor(open, { width: 669, height: 951 });
    expect(tb).not.toBeNull();
    // The band (58pt, 6pt below its top) is centred on the status bar row.
    expect(tb!.top + 6 + 29).toBe(48);
    expect(tb!.right).toBe(TOPBAR_RESERVE);
  });

  it('places it from the camera region when there is one', () => {
    const f = { ...open, occlusions: [{ x: 590, y: 30, w: 60, h: 40 }] };
    const tb = topBarFor(f, { width: 669, height: 951 })!;
    expect(tb.top + 6 + 29).toBe(50);
    expect(tb.right).toBe(Math.max(TOPBAR_RESERVE, 669 - 590 + 76));
  });

  it('leaves landscape, the closed phone and other phones alone', () => {
    expect(topBarFor(open, { width: 951, height: 669 })).toBeNull();
    expect(topBarFor(closed, { width: 420, height: 900 })).toBeNull();
    expect(topBarFor(null, { width: 402, height: 874 }, true)).toBeNull();
    // No facts and nothing to infer from (Android): nothing moves.
    expect(topBarFor(null, { width: 669, height: 951 })).toBeNull();
  });

  it('infers the open phone in portrait from its width on iOS', () => {
    expect(topBarFor(null, { width: 669, height: 951 }, true)).not.toBeNull();
  });
});
