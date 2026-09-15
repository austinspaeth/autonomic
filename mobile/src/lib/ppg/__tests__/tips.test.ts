import {
  CAMERA_TIPS, STRAP_TIPS, leadTipId, tipsFor,
} from '../tips';

describe('trouble tips', () => {
  it('leads with pressure by default, because that is what people do wrong', () => {
    expect(CAMERA_TIPS[0].id).toBe('pressure');
  });

  it('says nothing about placement when the camera never produced a frame', () => {
    // A permission, a busy camera or a driver. "Warm your hands" would be noise.
    expect(leadTipId('camera', { frames: 0 })).toBeNull();
    expect(tipsFor('camera', { frames: 0 })).toEqual(CAMERA_TIPS);
  });

  it('leads with placement when frames arrived and the lens was never covered', () => {
    expect(leadTipId('camera', { frames: 900, fingerOn: false })).toBe('cover');
    expect(tipsFor('camera', { frames: 900, fingerOn: false })[0].id).toBe('cover');
  });

  it('leads with movement when the pulse locked and kept being lost', () => {
    expect(leadTipId('camera', { frames: 900, fingerOn: false, everLocked: true })).toBe('steady');
    expect(leadTipId('camera', { frames: 900, fingerOn: true, everLocked: true })).toBe('steady');
  });

  it('leads with pressure when a finger is there and no pulse comes through it', () => {
    expect(leadTipId('camera', { frames: 900, fingerOn: true })).toBe('pressure');
  });

  it('falls back to the fixed order when there is no evidence to read', () => {
    expect(leadTipId('camera', {})).toBeNull();
    expect(tipsFor('camera')).toEqual(CAMERA_TIPS);
  });

  it('never invents, drops or reorders beyond the promoted lead', () => {
    const got = tipsFor('camera', { frames: 900, fingerOn: false });
    expect(got).toHaveLength(CAMERA_TIPS.length);
    expect(new Set(got.map((t) => t.id))).toEqual(new Set(CAMERA_TIPS.map((t) => t.id)));
    // Everything after the lead keeps its original relative order.
    const rest = got.slice(1).map((t) => t.id);
    expect(rest).toEqual(CAMERA_TIPS.filter((t) => t.id !== 'cover').map((t) => t.id));
  });

  it('has no evidence-driven lead for a strap, and its own list', () => {
    expect(leadTipId('polar', { frames: 900, fingerOn: true })).toBeNull();
    expect(tipsFor('polar')).toEqual(STRAP_TIPS);
    expect(STRAP_TIPS[0].id).toBe('wet');
  });
});
