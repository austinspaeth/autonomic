// One share card per feature page, mirroring its hero: the same name, tagline,
// badge and mockup. Keep in step with each page's <FeatureHero>.
export const CARDS: Record<string, { icon: string; badge: string; name: string; tagline: string; foot?: string; photo?: string }> = {
  features: { icon: '', badge: 'EVERY FEATURE', name: 'Everything Autonomic does', tagline: 'For POTS, long COVID and ME/CFS.' },
  'hrv-readings': { icon: 'journal', badge: 'FREE', name: 'Journal + HRV', tagline: 'Track your HRV in five minutes, on any device.' },
  'pacing-budget': { icon: 'pacing', badge: 'PRO', name: 'Pacing budget', tagline: 'An energy budget for how much today can take.' },
  insights: { icon: 'insights', badge: 'PRO', name: 'Insights', tagline: 'Find what helps your POTS and long COVID.' },
  'pots-stand-test': { icon: 'stand', badge: 'FREE TO CAPTURE', name: 'POTS stand test', tagline: 'Measure your heart rate rise at home.' },
  'cycle-tracking': { icon: 'cycle', badge: 'FREE', name: 'Cycle tracking', tagline: 'Read your HRV and symptoms against your cycle.' },
  'doctor-reports': { icon: 'doctor', badge: 'PRO', name: 'AI reports', tagline: 'Doctor summaries from your own data.' },
  conditions: { icon: '', badge: 'GUIDES AND TRACKING', name: 'POTS, long COVID, ME/CFS', tagline: 'Answers for the questions you live with.', photo: '/people/conditions-long-covid.webp' },
  'condition-pots': { icon: '', badge: 'FOR POTS', name: 'POTS app and tracker', tagline: 'Put numbers on what standing does to you.', photo: '/people/hero-pots.webp' },
  'condition-long-covid': { icon: '', badge: 'FOR LONG COVID', name: 'Long COVID tracker', tagline: 'See the crash coming. See the climb back.', photo: '/people/hero-long-covid.webp' },
  'condition-me-cfs': { icon: '', badge: 'FOR ME/CFS', name: 'ME/CFS pacing app', tagline: 'Pace by your body’s numbers, not by guesswork.', photo: '/people/hero-me-cfs.webp' },
  'condition-dysautonomia': { icon: '', badge: 'FOR DYSAUTONOMIA', name: 'Dysautonomia tracker', tagline: 'Your nervous system, measured every morning.', photo: '/people/hero-dysautonomia.webp' },
  'condition-chronic-illness': { icon: '', badge: 'FOR CHRONIC ILLNESS', name: 'Chronic illness tracker', tagline: 'Stop relying on memory to know what helps.', photo: '/people/hero-chronic-illness.webp' },
  compare: { icon: '', badge: 'COMPARE', name: 'Autonomic vs Visible, Welltory and Bearable', tagline: 'Honest side by sides, with sources.', photo: '/people/hero-recovery.webp' },
  'compare-visible': { icon: '', badge: 'COMPARE', name: 'Autonomic vs Visible', tagline: 'Pacing without buying a band.', photo: '/people/hero-me-cfs.webp' },
  'compare-welltory': { icon: '', badge: 'COMPARE', name: 'Autonomic vs Welltory', tagline: 'An HRV app built for POTS.', photo: '/people/hero-hrv.webp' },
  'compare-bearable': { icon: '', badge: 'COMPARE', name: 'Autonomic vs Bearable', tagline: 'A symptom journal that measures you too.', photo: '/people/hero-chronic-illness.webp' },
  'apple-watch': { icon: 'watch', badge: 'FREE · IPHONE', name: 'Apple Watch', tagline: 'POTS heart rate tools on your wrist.', foot: 'Free with the iPhone app' }
};
