// Articles folded into another one. Each old address (every topic it was ever
// filed under, plus its old /blog/ URL) prerenders as a permanent redirect to
// the article that now carries its content, so links and Google's record of
// the old page land somewhere useful instead of a 404.
export const MERGED: Record<string, { to: string; topics: string[] }> = {
  // Nov 12 2026: thin overlap of the HRV complete guide; its POTS section moved there.
  'what-is-hrv-and-why-it-matters-for-pots-recovery': {
    to: '/insights/hrv/hrv-complete-guide/',
    topics: ['hrv', 'pots', 'basics']
  },
  // Nov 12 2026: the histogram metrics are the inputs to Baevsky's stress index,
  // so they now live as a section of that article.
  'hrv-histogram-mode-amo50-mxdmn-cv': {
    to: '/insights/basics/pns-index-sns-index-stress-index-explained/',
    topics: ['basics', 'hrv']
  }
};
