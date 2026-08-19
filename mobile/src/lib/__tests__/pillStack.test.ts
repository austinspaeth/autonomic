/**
 * The pill stack's ordering.
 *
 * Five overlays share one spot above the tab bar and they are not equally urgent, so
 * they stack. The ordering is what is worth pinning: a mistake here shows up as an
 * urgent, time-sensitive pill hidden behind a permanent button.
 */
import {
  PILL_RANK, RECEDE_MAX_DEPTH, depthOf, recedeStyle,
} from '../pillStack';

describe('ranking', () => {
  it('puts the transient pills above the waiting ones', () => {
    // A minimized reading is a measurement in progress the user set aside on
    // purpose, so it outranks everything; watch sync and health imports are
    // time-sensitive; what's new waits indefinitely; the Insights button is
    // permanent furniture on its own tab.
    expect([...PILL_RANK]).toEqual(['hrv', 'watchSync', 'health', 'whatsNew', 'ai']);
  });

  it('is depth 0 for everything while nothing is claimed', () => {
    PILL_RANK.forEach((k) => expect(depthOf(k, [])).toBe(0));
  });

  it('keeps a reading in front of every other pill', () => {
    expect(depthOf('hrv', ['hrv', 'watchSync', 'health', 'whatsNew'])).toBe(0);
    expect(depthOf('watchSync', ['hrv'])).toBe(1);
  });

  it('recedes the lower layers when a higher one claims', () => {
    expect(depthOf('health', ['health'])).toBe(0);
    expect(depthOf('whatsNew', ['health'])).toBe(1);
    expect(depthOf('ai', ['health'])).toBe(1);
  });

  it('stacks two deep when two pills outrank', () => {
    expect(depthOf('whatsNew', ['health', 'whatsNew'])).toBe(1);
    expect(depthOf('ai', ['health', 'whatsNew'])).toBe(2);
  });

  it('never counts a pill against itself', () => {
    // The bug this replaced: "is anything claimed" was true of the claimant, so a
    // pill receded behind itself the moment it started claiming. Only visible once a
    // third layer existed.
    expect(depthOf('ai', ['ai'])).toBe(0);
    expect(depthOf('whatsNew', ['whatsNew'])).toBe(0);
    expect(depthOf('ai', ['whatsNew', 'ai'])).toBe(1);
  });

  it('ignores a lower-ranked claim', () => {
    expect(depthOf('health', ['ai'])).toBe(0);
    expect(depthOf('whatsNew', ['ai'])).toBe(0);
  });

  it('treats an unregistered key as the bottom of the stack', () => {
    // A new pill that forgets to register should recede politely rather than cover
    // something urgent.
    expect(depthOf('somethingNew', ['health'])).toBe(1);
    expect(depthOf('somethingNew', PILL_RANK)).toBe(PILL_RANK.length);
  });

  it('counts three above the bottom layer when everything is up', () => {
    expect(depthOf('ai', ['watchSync', 'health', 'whatsNew'])).toBe(3);
  });
});

describe('recedeStyle', () => {
  it('is untouched at the front of the stack', () => {
    const front = recedeStyle(0);
    expect(front.opacity).toBe(1);
    expect(front.scale).toBe(1);
    expect(front.translateY).toBe(0);
  });

  it('shrinks, lifts and dims further back', () => {
    const one = recedeStyle(1);
    const two = recedeStyle(2);
    expect(one.scale).toBeLessThan(1);
    expect(two.scale).toBeLessThan(one.scale);
    expect(two.translateY).toBeLessThan(one.translateY);
    expect(two.opacity).toBeLessThan(one.opacity);
  });

  it('stops receding past the cap, so a buried pill is never invisible', () => {
    // Three pills up would otherwise fade the bottom layer to nothing, and an
    // invisible pill that still holds a slot is worse than one that reads as buried.
    expect(recedeStyle(RECEDE_MAX_DEPTH + 5)).toEqual(recedeStyle(RECEDE_MAX_DEPTH));
    expect(recedeStyle(99).opacity).toBeGreaterThan(0.4);
    expect(recedeStyle(99).scale).toBeGreaterThan(0.8);
  });

  it('clamps a negative depth rather than growing the pill', () => {
    expect(recedeStyle(-3)).toEqual(recedeStyle(0));
  });
});
