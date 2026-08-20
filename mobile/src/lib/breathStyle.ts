/**
 * The paced-breathing style a training HRV reading was captured at.
 *
 * Only one pattern is offered now: 4s in, 6s out. Box breathing and 4/7/8 were
 * retired — they flatten RSA and break day-to-day comparability, and resonance
 * is the entire point of a training reading. The titles map keeps naming old
 * readings correctly.
 *
 * Lives in lib (not the HRV feature) so summary cards can name a style without
 * pulling in the live-capture screen.
 */
export const BREATH_STYLE = '4/6';

const STYLE_TITLES: Record<string, string> = {
  '4/6': '4 / 6 breathing',
  '4/4/4/4': 'Box breathing',
  '4/7/8': '4 / 7 / 8 breathing',
};

export const styleTitle = (val?: string) => (val ? STYLE_TITLES[val] || val : '');
