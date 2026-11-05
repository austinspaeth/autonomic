// The app as structured data, one definition for every page that describes it
// (the feature, condition and comparison heads, and the blog home), so a price
// or the rating changes in site.ts and every page says the same thing.
import { appStoreUrl, playStoreUrl, pricing, rating } from '$lib/site';

export const APP_ID = 'https://autonomic.care/#app';

export const appLd = () => ({
  '@type': 'SoftwareApplication',
  '@id': APP_ID,
  name: 'Autonomic',
  applicationCategory: 'HealthApplication',
  operatingSystem: 'iOS, Android',
  downloadUrl: [appStoreUrl, playStoreUrl],
  offers: [
    { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: pricing.currency },
    { '@type': 'Offer', name: 'Autonomic Pro, monthly', price: pricing.monthly.toFixed(2), priceCurrency: pricing.currency },
    { '@type': 'Offer', name: 'Autonomic Pro, yearly', price: pricing.yearly.toFixed(2), priceCurrency: pricing.currency, description: `Every install starts with ${pricing.trialDays} days of Pro, with no card.` }
  ],
  publisher: { '@id': 'https://autonomic.care/#organization' },
  // Only with a real count from App Store Connect; Google rejects a rating without one.
  ...(rating.reviews ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: rating.stars, bestRating: 5, ratingCount: rating.reviews } } : {})
});
