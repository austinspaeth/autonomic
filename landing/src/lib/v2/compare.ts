// The comparison pages (/compare/<slug>/): Autonomic against the apps people
// search for an alternative to. Every claim about another app carries the
// number of the source it came from (`c`, 1-based into that rival's
// `sources`), and every source was read on the date in CHECKED. Re-read them
// before a release: prices and features move, and a stale claim about someone
// else's product is the worst kind of wrong. Their screenshots are theirs, so
// the pages show their icon and link to their listing, never their screens.
import { pricing, priceLabel, rating } from '$lib/site';
import type { Source } from './sources';

export const CHECKED = '2026-11-04';

/** A cell with the sources behind it. */
export type Cell = string | { t: string; c: number[] };
export interface Row { k: string; us: string; them: Cell }
export interface Diff { key: 'pacing' | 'stand' | 'insights' | 'hrv' | 'privacy' | 'reports'; t: string; b: string; them?: Cell; href: string }
export interface Rival {
  slug: string;
  name: string;
  icon: string;
  /** Where people can read about it themselves. */
  storeUrl: string;
  title: string;
  description: string;
  tagline: string;
  lead: string;
  photo: string;
  pos: string;
  /** A redrawn screen of theirs to stand beside ours in the hero. */
  heroMock?: 'visible-gauge' | 'welltory-today' | 'bearable-today';
  /** Which of our screens leads the hero; the pacing sheet unless set. */
  ourMock?: 'pacing' | 'journal' | 'insights' | 'progress';
  /** Three cards under the hero: the honest headline numbers. */
  glance: { b: string; em: string; span: Cell }[];
  rows: Row[];
  /** What each app gives you without paying, for a free-vs-free table. */
  free?: Row[];
  /** Two years of each app, for the cost chart; null skips it. */
  cost: { us: number; them: number; themNote: string; c: number[] } | null;
  strong: { t: string; b: Cell }[];
  diffs: Diff[];
  fitsUs: string[];
  fitsThem: string[];
  faq: { q: string; a: string }[];
  sources: Source[];
}

const web = (authors: string, title: string, where: string, url: string, note: string): Source => ({ authors, title, where, year: 2026, url, note, kind: 'WebPage' });
const us = { yearly: priceLabel(pricing.yearly), monthly: priceLabel(pricing.monthly) };
const ourRating = `${rating.label} from ${rating.reviews} ratings`;

const VISIBLE_SOURCES = [
  web('Visible Health Inc.', 'Visible: Pacing for illness', 'App Store listing', 'https://apps.apple.com/us/app/visible-pacing-for-illness/id1624474919', 'Rating, the band requirement, the camera check-in and the privacy label.'),
  web('Visible', 'Why can’t I use my Apple Watch, Garmin, or Fitbit?', 'Visible help center', 'https://help.makevisible.com/en/articles/8311626-why-can-t-i-use-my-apple-watch-garmin-or-fitbit', 'Why other wearables are not supported.'),
  web('Visible', 'Where is the Visible membership available?', 'Visible help center', 'https://help.makevisible.com/en/articles/9615091-where-is-the-visible-membership-available', 'The US and the UK.'),
  web('Visible', 'Data export', 'Visible help center', 'https://help.makevisible.com/en/articles/9583077-data-export', 'What the CSV export holds, and leaves out.'),
  web('Visible', 'How it works', 'makevisible.com', 'https://www.makevisible.com/how-it-works', 'PacePoints, exertion alerts, the clinician dashboard and the member study.'),
  web('Aelivra', 'Visible Band review: pacing for ME/CFS and long COVID', 'aelivra.co, prices checked 29 July 2026', 'https://aelivra.co/explore/compare/visible-review', 'Membership and band prices.'),
  web('Juno', 'The best pacing apps for chronic illness (2026)', 'junocompanion.com, prices checked 9 October 2026', 'https://junocompanion.com/blog/pacing-and-energy/best-pacing-apps', 'Membership and band prices, and devices.'),
  web('Visible', 'Visible buying guide', 'Visible help center', 'https://help.makevisible.com/en/articles/12995632-visible-buying-guide', 'Membership works with the Visible Band 2.0 or a Polar Verity Sense.'),
  web('Visible', 'Visible: pacing for chronic illness', 'makevisible.com', 'https://www.makevisible.com/', 'The free app, member numbers and HSA/FSA eligibility.')
];

const WELLTORY_SOURCES = [
  web('Welltory Inc.', 'Welltory: Stress & Heart Rate', 'App Store listing', 'https://apps.apple.com/us/app/welltory-stress-heart-rate/id1074367771', 'Prices, rating, devices, camera HRV and the privacy label.'),
  web('Juno', 'The best pacing apps for chronic illness (2026)', 'junocompanion.com, checked 9 October 2026', 'https://junocompanion.com/blog/pacing-and-energy/best-pacing-apps', 'What the free plan includes.'),
  web('Welltory Inc.', 'Privacy Policy', 'welltory.com', 'https://welltory.com/privacy-policy/', 'Data held in cloud data centers: Amazon Web Services and Google’s Firebase database, mainly in the US.')
];

const BEARABLE_SOURCES = [
  web('Bearable Ltd', 'Bearable: Symptom Tracker', 'App Store listing', 'https://apps.apple.com/us/app/bearable-symptom-tracker/id1482581097', 'Rating, Apple Health sync, export and the privacy label.'),
  web('Bearable', 'Pricing', 'bearable.app', 'https://bearable.app/pricing', 'Monthly and yearly prices, and the free plan.'),
  web('Juno', 'The best pacing apps for chronic illness (2026)', 'junocompanion.com, checked 9 October 2026', 'https://junocompanion.com/blog/pacing-and-energy/best-pacing-apps', 'What the free plan includes, and what it does not.'),
  web('Bearable', 'Privacy Policy', 'bearable.app', 'https://bearable.app/privacy-policy', 'With an account, data is also stored and backed up, encrypted, on its servers in Frankfurt.')
];

export const RIVALS: Rival[] = [
  {
    slug: 'visible',
    name: 'Visible',
    icon: '/visible.png',
    storeUrl: 'https://apps.apple.com/us/app/visible-pacing-for-illness/id1624474919',
    title: 'Autonomic vs Visible: Pacing Without the Band (2026) | Autonomic',
    description: `Autonomic vs Visible for ME/CFS and long COVID pacing: price, the band, devices and privacy compared, with sources. ${us.yearly} a year, no band to buy.`,
    tagline: 'Pacing for ME/CFS and long COVID, without buying a band.',
    lead: 'Visible made pacing by heart rate mainstream, and it is a good app. It also asks for its own band and a membership that costs more each year than many people can spare. Here is an honest side by side, so you can decide what fits your body and your budget.',
    photo: '/people/hero-me-cfs.webp',
    pos: '10% 40%',
    heroMock: 'visible-gauge',
    glance: [
      { b: us.yearly, em: 'a year for Autonomic Pro', span: { t: `Against $179.88 a year for a Visible membership, before its $79.70 band.`, c: [6, 7] } },
      { b: 'No band', em: 'use what you already own', span: { t: 'Your phone camera, an Apple Watch, a Garmin or any Bluetooth strap. Visible works only with its own band.', c: [2, 8] } },
      { b: 'Your phone', em: 'is where your journal lives', span: 'No account, and no health data on anyone’s server. Every score is worked out on the device.' }
    ],
    rows: [
      { k: 'Price', us: `${us.yearly} a year, or ${us.monthly} a month`, them: { t: '$179.88 a year, or $19.99 a month', c: [6, 7] } },
      { k: 'Hardware to buy', us: 'None', them: { t: 'Visible Band 2.0, $79.70', c: [6, 7] } },
      { k: 'First year, all in', us: us.yearly, them: { t: '$259.58', c: [6] } },
      { k: 'Works with Apple Watch or Garmin', us: 'Yes, plus your phone camera and any Bluetooth strap', them: { t: 'No, by design', c: [2] } },
      { k: 'Daily pacing', us: 'A budget in hours and minutes, judged on the two days after each day', them: { t: 'PacePoints from the band', c: [5] } },
      { k: 'Exertion alerts', us: 'Yes, from the heart rate your watch writes to Apple Health or Health Connect', them: { t: 'Yes, streamed from the band', c: [5] } },
      { k: 'Morning HRV', us: 'Camera, watch, Garmin or strap, unlimited and free', them: { t: 'Phone camera check-in, or overnight with the band', c: [1] } },
      { k: 'Guided POTS stand test', us: 'Yes, with a watch, a strap or by hand', them: { t: 'Not listed in its app description', c: [1] } },
      { k: 'What actually helps', us: 'Tests what you log against your readings, corrected for chance', them: { t: 'Trends and a health report', c: [5] } },
      { k: 'Sharing with your doctor', us: 'A summary written by the AI you choose', them: { t: 'A clinician dashboard link and a PDF report', c: [5] } },
      { k: 'Where your data lives', us: 'On your phone, with no account', them: { t: 'Their encrypted database; health data linked to you', c: [1] } },
      { k: 'Export', us: 'Your whole journal, anytime', them: { t: 'A CSV of daily scores and check-ins, without continuous heart rate', c: [4] } },
      { k: 'Where it is sold', us: 'iPhone and Android', them: { t: 'Membership in the US and UK only', c: [3] } },
      { k: 'App Store rating', us: ourRating, them: { t: '4.8 from 3.7K ratings', c: [1] } }
    ],
    cost: { us: pricing.yearly * 2, them: 79.7 + 179.88 * 2, themNote: 'Band plus two years of membership', c: [6, 7] },
    strong: [
      { t: 'A band built for pacing', b: { t: 'The band streams heart rate all day, where Visible says most watches sample every 5 to 10 minutes outside a workout. Autonomic reads what your watch writes to Apple Health, so on an iPhone an alert can land a little later.', c: [2] } },
      { t: 'An established community', b: { t: 'Visible reports more than 100,000 users and a peer-reviewed study of 1,301 of its members.', c: [9, 5] } },
      { t: 'Reports for your clinician', b: { t: 'A private dashboard link and a downloadable health report.', c: [5] } },
      { t: 'A free symptom app', b: { t: 'Symptom tracking without a band, at no cost, and memberships are HSA/FSA eligible in the US.', c: [9] } }
    ],
    diffs: [
      { key: 'pacing', t: 'Pace with the watch you already wear.', b: 'Each morning your HRV, resting heart rate and sleep set a budget in hours and minutes that spends down as you move. Every day is judged on the two days after it, because that is when a crash shows up, and on a bad day the app holds the number back rather than inviting you to spend it.', them: { t: 'Visible works only with its own band.', c: [2] }, href: '/features/pacing-budget/' },
      { key: 'stand', t: 'A stand test for the POTS that so often comes with it.', b: 'A guided ten-minute stand test measures your heart rate rise the way clinicians do, on an Apple Watch, a chest strap, or by hand with no device at all, and keeps every result so you can watch it move over months.', href: '/features/pots-stand-test/' },
      { key: 'insights', t: 'Find out what is actually helping.', b: 'Log the supplements, salt, meds and rest. Insights tests each one against your own readings, corrects for testing many things at once, and says when nothing holds up, so a pattern found by luck is never reported as a finding.', href: '/features/insights/' },
      { key: 'privacy', t: 'Your journal never leaves your phone.', b: 'There is no account to make and nothing to sync. Your readings, symptoms and scores are stored and worked out on the device, and a doctor summary only leaves it if you paste it into the AI you choose.', them: { t: 'Visible keeps data in an encrypted database, with health data linked to you.', c: [1] }, href: '/features/doctor-reports/' }
    ],
    fitsUs: ['You want pacing without buying, charging and wearing another band.', 'You already own an Apple Watch, a Garmin or a chest strap.', 'You also live with POTS, and want a stand test beside your pacing.', 'You want your health data on your phone and nowhere else.', `You want to pay ${us.yearly} a year, not $259.58 in year one.`],
    fitsThem: ['You want a band that streams heart rate all day with nothing else to set up.', 'You value a large members’ community and its research.', 'You live in the US or UK and the cost is not a barrier.'],
    faq: [
      { q: 'Is Autonomic a good alternative to Visible?', a: `For many people, yes. Autonomic gives you a daily pacing budget in hours and minutes, set by your own HRV, resting heart rate and sleep and judged on the two days after each day, using the phone, watch or strap you already own. It adds a guided POTS stand test, Insights into what helps and doctor summaries, and keeps everything on your phone, for ${us.yearly} a year with no band to buy. If you want a dedicated band streaming heart rate all day, Visible does that well.` },
      { q: 'Can I use my Polar Verity Sense from Visible with Autonomic?', a: 'Yes. Autonomic pairs with the Polar Verity Sense directly for HRV readings, so the armband Visible used to ship keeps working. We have not tested the Visible Band 2.0, so we cannot promise it pairs.' },
      { q: 'Do I need a band or watch for Autonomic?', a: 'No. Your phone camera takes the morning HRV reading, the pacing budget works from your steps and what you log, and the stand test can be done by hand. A watch or strap makes the budget sharper, and the app says so in words when an estimate is thin.' },
      { q: 'How much does Visible cost compared with Autonomic?', a: `Visible membership is $19.99 a month or $179.88 a year, and pacing needs its Visible Band 2.0 at $79.70, so the first year is about $259.58 (US prices, checked in 2026). Autonomic Pro is ${us.monthly} a month or ${us.yearly} a year with no hardware, the journal is free forever, and every install starts with ${pricing.trialDays} days of Pro.` },
      { q: 'Which is better for ME/CFS?', a: 'Both are built around pacing for post-exertional malaise. Visible measures with a dedicated band; Autonomic fits a budget from what you already wear and judges every day on the two days after, which is when PEM lands. If you also have POTS, Autonomic adds the stand test. Try Autonomic free for two weeks and see which you trust.' },
      { q: 'Is my data private in Autonomic?', a: 'Yes. Your journal lives only on your phone. There is no account, no ads and no tracking, and the app only sends anonymous counts of how many people use it.' }
    ],
    sources: VISIBLE_SOURCES
  },
  {
    slug: 'welltory',
    name: 'Welltory',
    icon: '/welltory.png',
    storeUrl: 'https://apps.apple.com/us/app/welltory-stress-heart-rate/id1074367771',
    title: 'Autonomic vs Welltory: HRV App for POTS (2026) | Autonomic',
    description: `Autonomic vs Welltory for POTS and long COVID: HRV, pacing, the stand test, privacy and price compared, with sources. Every HRV reading free, Pro ${us.yearly} a year.`,
    tagline: 'An HRV app built for POTS, not for stress scores.',
    lead: 'Welltory is one of the best known HRV apps in the world, and it now speaks to POTS and long COVID too. Autonomic was built for them from the first line. Here is how the two compare, from the reading itself to where your data goes.',
    photo: '/people/hero-hrv.webp',
    pos: '58% 40%',
    heroMock: 'welltory-today',
    ourMock: 'journal',
    glance: [
      { b: 'Unlimited', em: 'free HRV readings', span: { t: 'Every reading, every day, on every device. Welltory’s free plan includes one reading a day.', c: [2] } },
      { b: us.yearly, em: 'a year for Pro', span: { t: 'Welltory Premium is $99.99 to $119.99 a year, and its AI coach is sold separately.', c: [1] } },
      { b: 'No tracking', em: 'and no account', span: { t: 'Welltory’s App Store label lists location and contact info as data used to track you, and it stores your data on its cloud servers.', c: [1, 3] } }
    ],
    rows: [
      { k: 'Built for', us: 'POTS, long COVID, ME/CFS and dysautonomia', them: { t: 'Stress, energy and wellbeing, with chronic illness among its uses', c: [1] } },
      { k: 'Price', us: `${us.yearly} a year, or ${us.monthly} a month`, them: { t: '$99.99 to $119.99 a year, or $299.99 for life', c: [1] } },
      { k: 'Free HRV readings', us: 'Unlimited, on every device', them: { t: 'One a day on the free plan', c: [2] } },
      { k: 'AI', us: 'Use Claude, Gemini or ChatGPT, included in Pro', them: { t: 'Its own AI coach, sold as a separate $99.99 a year', c: [1] } },
      { k: 'Daily pacing', us: 'A budget in hours and minutes, judged on the two days after each day', them: { t: 'A daily energy battery', c: [1] } },
      { k: 'Guided POTS stand test', us: 'Yes, with a watch, a strap or by hand', them: { t: 'Not listed in its app description', c: [1] } },
      { k: 'Grading', us: 'Against your own normal, with thresholds written for recovery', them: 'General HRV and stress scores' },
      { k: 'Devices', us: 'Phone camera, Apple Watch, Garmin and Bluetooth straps', them: { t: 'Phone camera, Apple Watch and 1,000+ integrations', c: [1] } },
      { k: 'Where your data lives', us: 'On your phone, with no account', them: { t: 'On its cloud servers (Amazon Web Services and Google Firebase)', c: [3] } },
      { k: 'Tracking', us: 'None, and no ads', them: { t: 'Location and contact info used to track you', c: [1] } },
      { k: 'App Store rating', us: ourRating, them: { t: '4.7 from 135K ratings', c: [1] } }
    ],
    cost: { us: pricing.yearly * 2, them: 99.99 * 2, themNote: 'Two years of Premium at its lowest listed price', c: [1] },
    strong: [
      { t: 'Huge reach', b: { t: 'More than 20 million users, a 4.7 rating from 135,000 reviews, and research partnerships it lists with 30+ universities.', c: [1] } },
      { t: 'Integrations', b: { t: 'It connects to 1,000+ devices, wearables and apps, including Oura.', c: [1] } },
      { t: 'More than HRV', b: { t: 'Sleep programs, stress tracking and a migraine tracker.', c: [1] } }
    ],
    diffs: [
      { key: 'hrv', t: 'Every reading is free, every day.', b: 'Take a five-minute reading with your phone camera, an Apple Watch, a Garmin or a chest strap as often as you like, graded against your own recent mornings rather than a population average.', them: { t: 'Welltory’s free plan includes one reading a day.', c: [2] }, href: '/features/hrv-readings/' },
      { key: 'stand', t: 'A stand test, because POTS is a standing problem.', b: 'A guided ten-minute stand test measures your heart rate rise minute by minute, the way clinicians do, and keeps every result so you can follow it for months. No stress score can tell you that.', href: '/features/pots-stand-test/' },
      { key: 'pacing', t: 'A budget that knows a crash comes later.', b: 'Your budget is set each morning and every day is judged on the two days after it, because post-exertional malaise lands 12 to 48 hours later. On a bad day it shows no number at all, so it can never read as permission.', href: '/features/pacing-budget/' },
      { key: 'reports', t: 'Bring your own AI.', b: 'Doctor summaries and full health reports are written by Claude, Gemini or ChatGPT from a prompt built on your phone, included in Pro. Nothing leaves your phone unless you paste it.', them: { t: 'Welltory sells its AI coach separately, for $99.99 a year.', c: [1] }, href: '/features/doctor-reports/' }
    ],
    fitsUs: ['You live with POTS, long COVID, ME/CFS or dysautonomia and want an app built for it.', 'You want unlimited HRV readings without paying.', 'You want a stand test and a pacing budget, not a stress score.', 'You want no account and no tracking.'],
    fitsThem: ['You want a general stress and wellbeing app for days you are already well.', 'You rely on a device Autonomic does not read, like Oura.', 'You want guided sleep and audio programs in the same app.'],
    faq: [
      { q: 'Is Autonomic a good alternative to Welltory?', a: `If you live with POTS, long COVID, ME/CFS or dysautonomia, yes. Autonomic grades HRV against your own normal for recovery rather than stress, adds a guided POTS stand test and a pacing budget judged on the two days after each day, makes every HRV reading free and unlimited, and keeps your data on your phone, for ${us.yearly} a year.` },
      { q: 'Does Autonomic measure HRV with the phone camera like Welltory?', a: 'Yes. Rest a fingertip lightly on the rear camera for a five-minute reading. An Apple Watch, a Garmin or a Bluetooth chest strap work too, and a strap gives the cleanest signal.' },
      { q: 'Is Welltory good for POTS?', a: 'Welltory now mentions POTS, long COVID and ME/CFS, and its HRV and energy tracking can help. It does not list a guided stand test, which is the measurement POTS is defined by. Autonomic has one, on a watch, a strap or by hand.' },
      { q: 'How much does Welltory cost compared with Autonomic?', a: `On the US App Store, Welltory Premium is listed at $99.99 to $119.99 a year or $299.99 for life, with its AI coach as a separate $99.99 a year (checked 2026). Autonomic Pro is ${us.monthly} a month or ${us.yearly} a year, the journal and every HRV reading are free forever, and every install starts with ${pricing.trialDays} days of Pro.` },
      { q: 'Can I move my data from Welltory?', a: 'Autonomic reads sleep, heart rate and workouts from Apple Health or Health Connect, so anything Welltory wrote there arrives on its own. HRV comes in from Apple Health when the reading carries at least four minutes of real beat-to-beat data. Health Connect on Android has no beat-to-beat data, so on Android your HRV readings start fresh in Autonomic.' }
    ],
    sources: WELLTORY_SOURCES
  },
  {
    slug: 'bearable',
    name: 'Bearable',
    icon: '/bearable.png',
    storeUrl: 'https://apps.apple.com/us/app/bearable-symptom-tracker/id1482581097',
    title: 'Autonomic vs Bearable: Symptom Trackers Compared | Autonomic',
    description: 'Autonomic vs Bearable for chronic illness, POTS and long COVID: symptom tracking, HRV, pacing, finding triggers, privacy and price compared, with sources.',
    tagline: 'A symptom journal that measures your body too.',
    lead: 'Bearable is a lovely, flexible symptom tracker. Its paid plan costs less than ours, but the symptom journal is free in both apps, and Autonomic’s free journal also measures your nervous system every morning. If you live with POTS, long COVID or ME/CFS, here is the difference.',
    photo: '/people/hero-chronic-illness.webp',
    pos: '44% 40%',
    heroMock: 'bearable-today',
    ourMock: 'progress',
    glance: [
      { b: '$0', em: 'for the symptom journal, and more', span: { t: 'Bearable’s free plan tracks symptoms too. Autonomic’s free journal adds unlimited HRV readings, a daily score and crash warnings.', c: [3] } },
      { b: 'Measures', em: 'your nervous system itself', span: { t: 'A five-minute HRV reading, a stand test and a pacing budget. Bearable syncs steps, sleep and heart rate from Apple Health.', c: [1] } },
            { b: 'No tracking', em: 'and no account', span: { t: 'Bearable’s App Store label lists contact info and identifiers as data used to track you, and with an account it stores your data on its servers.', c: [1, 4] } }
    ],
    rows: [
      { k: 'Price', us: `${us.yearly} a year, or ${us.monthly} a month`, them: { t: '$34.99 a year, often $18.99, or $6.99 a month', c: [2] } },
      { k: 'Free plan', us: 'The journal, unlimited HRV readings, your daily score and crash warnings', them: { t: 'Unlimited energy, mood, sleep and symptom tracking', c: [3] } },
      { k: 'Measures HRV itself', us: 'Yes, with the camera, a watch, a Garmin or a strap', them: { t: 'Syncs steps, sleep and heart rate from Apple Health and Fitbit', c: [1] } },
      { k: 'Pacing budget and alerts', us: 'Yes, in hours and minutes', them: { t: 'No energy budget or live alerts', c: [3] } },
      { k: 'Guided POTS stand test', us: 'Yes, with a watch, a strap or by hand', them: { t: 'Not listed in its app description', c: [1] } },
      { k: 'Finding what helps', us: 'Tested against your readings, corrected for chance and the calendar', them: { t: 'Correlations, with full reports on premium', c: [3] } },
      { k: 'Mood and mental health', us: 'Log as your own symptom types', them: { t: 'Built in, in depth', c: [1] } },
      { k: 'Where your data lives', us: 'On your phone, with no account', them: { t: 'On your phone, and with an account also on its servers, encrypted', c: [4] } },
      { k: 'Tracking', us: 'None, and no ads', them: { t: 'Contact info and identifiers used to track you', c: [1] } },
      { k: 'Export', us: 'Your whole journal, anytime', them: { t: 'Export or delete in the app', c: [1] } },
      { k: 'App Store rating', us: ourRating, them: { t: '4.8 from 6.6K ratings', c: [1] } }
    ],
    free: [
      { k: 'Symptom, trigger and medication journal', us: 'Free, unlimited', them: { t: 'Free, unlimited', c: [3] } },
      { k: 'Mood and energy', us: 'Free, as your own symptom types', them: { t: 'Free, built in', c: [3] } },
      { k: 'HRV reading', us: 'Free and unlimited, with the camera, a watch or a strap', them: { t: 'Not measured; syncs heart rate from Apple Health', c: [1] } },
      { k: 'A daily score from your own readings', us: 'Free', them: 'Not offered' },
      { k: 'Crash warnings', us: 'Free', them: { t: 'No live alerts', c: [3] } },
      { k: 'POTS stand test', us: 'Free to capture, with a watch, a strap or by hand', them: { t: 'Not listed', c: [1] } },
      { k: 'Charts', us: 'The last 14 days', them: { t: '30 days of trends', c: [3] } },
      { k: 'Finding what helps', us: 'Insights, part of Pro', them: { t: 'Correlation reports, part of Premium', c: [3] } }
    ],
    cost: null,
    strong: [
      { t: 'A cheaper paid plan', b: { t: 'Premium is $34.99 a year, often $18.99, and the Bearable Heroes program sponsors people who cannot pay.', c: [2] } },
      { t: 'A generous free plan', b: { t: 'Unlimited energy, mood, sleep and symptom tracking at no cost.', c: [3] } },
      { t: 'Mood and mental health', b: { t: 'In-depth mood, anxiety and mental health tracking, used for many conditions beyond chronic illness.', c: [1] } }
    ],
    diffs: [
      { key: 'hrv', t: 'Measure your nervous system, not only describe it.', b: 'A five-minute morning reading with your phone camera, a watch or a strap becomes a daily score against your own normal. It is the steadiest thing Insights has to test your days against, and it is free and unlimited.', them: { t: 'Bearable syncs heart rate, steps and sleep from Apple Health and Fitbit.', c: [1] }, href: '/features/hrv-readings/' },
      { key: 'pacing', t: 'A budget for today, before the crash.', b: 'Your morning readings set a budget in hours and minutes that spends down as you move and warns you before the ceiling. Every day is judged on the two days after it, because a crash lands late.', them: { t: 'Bearable has no energy budget or live alerts.', c: [3] }, href: '/features/pacing-budget/' },
      { key: 'insights', t: 'Patterns that hold up, not patterns found by luck.', b: 'Test enough things against each other and something always looks linked. Insights corrects for that, checks a link holds within its own month, and tells you when a supplement you have logged for weeks shows no detected impact.', href: '/features/insights/' },
      { key: 'stand', t: 'A stand test for POTS.', b: 'A guided ten-minute stand test puts a number on what standing does to you, on an Apple Watch, a strap or by hand, and keeps every result.', href: '/features/pots-stand-test/' }
    ],
    fitsUs: ['You live with POTS, long COVID, ME/CFS or dysautonomia.', 'You want a morning reading and a pacing budget, not only a diary.', 'You want findings that are corrected for chance.', 'You want no account and no tracking.'],
    fitsThem: ['You mainly want a mood, mental health and symptom diary.', 'You do not want to take a morning reading.', 'You want the cheaper paid plan: Bearable Premium costs less than Autonomic Pro.'],
    faq: [
      { q: 'Is Autonomic a good alternative to Bearable?', a: 'If you live with POTS, long COVID, ME/CFS or dysautonomia, yes. Autonomic keeps a symptom, trigger and medication journal like Bearable, and adds a five-minute HRV reading, a guided stand test, a pacing budget and Insights corrected for chance, with your data kept on your phone. If you want a mood and mental health diary above all, Bearable is excellent and cheaper.' },
      { q: 'Can I track my own symptoms in Autonomic?', a: 'Yes. Built-in lists cover POTS, long COVID, ME/CFS and MCAS, and you can create your own symptoms, triggers, activities and medications. Each one is tested by Insights like any other.' },
      { q: 'Is Bearable cheaper than Autonomic?', a: `For the paid plans, yes. Bearable Premium is $6.99 a month or $34.99 a year, often discounted to $18.99 (checked 2026). For free, Autonomic gives you more: the symptom journal is free in both, and Autonomic’s free journal adds unlimited HRV readings, a daily score, crash warnings and stand test captures. Autonomic Pro is ${us.monthly} a month or ${us.yearly} a year, the journal and every HRV reading are free forever, and every install starts with ${pricing.trialDays} days of Pro.` },
      { q: 'Does Bearable measure HRV?', a: 'Bearable syncs steps, sleep and heart rate from Apple Health and Fitbit. Autonomic takes the HRV reading itself, with your phone camera, a watch, a Garmin or a strap, and grades it against your own normal.' }
    ],
    sources: BEARABLE_SOURCES
  }
];

export const rivalBySlug = (slug: string) => RIVALS.find((r) => r.slug === slug);
