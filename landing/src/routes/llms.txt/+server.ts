// /llms.txt (https://llmstxt.org): a plain-text briefing for AI assistants and
// answer engines. Built at prerender from the same sources the site renders
// (pricing, the feature and condition registries, every published article), so
// a price or a new guide can never drift from what the pages say. The facts
// here follow CLAUDE.md's product rules; when one of those changes, change it
// here too.
import type { Article } from '../api/articles/types';
import { articleHref, pricing, priceLabel } from '$lib/site';
import { FEATURES } from '$lib/v2/features';
import { CONDITIONS } from '$lib/v2/conditions';
import { SOURCES, SOURCES_REVIEWED } from '$lib/v2/sources';
import { RIVALS, CHECKED } from '$lib/v2/compare';

export const prerender = true;

const BASE = 'https://autonomic.care';

// One line per feature page: what it does, in the facts an answer would need.
const FEATURE_FACTS: Record<string, string> = {
  'hrv-readings':
    'Five-minute HRV readings with the phone camera (fingertip on the lens), an Apple Watch, a Garmin watch or a Bluetooth chest strap. Unlimited and free on every plan. Reports RMSSD, SDNN, pNN50, heart rate and frequency-domain HRV, graded against the person’s own baseline rather than population norms, alongside a daily journal of sleep, symptoms, triggers, medications, water and bowel movements.',
  'pacing-budget':
    'A daily energy budget in hours and minutes of effort ("effort minutes"), set each morning from the person’s own HRV, resting heart rate and sleep. Spend is counted from steps, heart rate above their own exertion line and logged activity. Each day is judged on the two days after it, because post-exertional malaise is delayed. Shows no number on a day that is already sliding. Pro.',
  insights:
    'Tests what the person takes and does (supplements, medications, triggers, habits, their own custom types) against their HRV, sleep, symptoms and daily score. Uses rank statistics and a Benjamini–Hochberg false discovery rate correction so chance patterns are not reported, and needs about 14 days of logging before it reports anything. Findings are associations, never causes. Pro.',
  'pots-stand-test':
    'A guided at-home active stand test: five minutes lying down, then ten minutes standing still, with heart rate recorded throughout on an Apple Watch or a Bluetooth chest strap, or with no device at all: the app times the test and buzzes at 1, 3, 5 and 10 minutes for the heart rate (and optionally blood pressure) to be entered from any cuff or pulse oximeter. Reports the peak and the sustained rise in beats per minute. Capturing a test is free; reading the result is Pro. Also captures one-off POTS episodes (stairs, sit to stand).',
  'cycle-tracking':
    'Period, flow and cycle-symptom logging that the whole app reads: HRV grades, crash warnings and strain alerts are compared with the same phase of the person’s own past cycles, so a predictable premenstrual dip is not reported as a decline. Forecasts the next period after two cycles; ovulation is counted back 14 days or read from a sustained overnight temperature rise. Syncs with Apple Health and Health Connect. Free; the Insights card and Progress chart are Pro.',
  'doctor-reports':
    'Builds a structured prompt on the phone from the journal, which the person pastes into the AI they choose (Claude, Gemini or ChatGPT). Three options: a print-ready Medical Summary for Doctor, a Full Health Report across every tracked area, and Data for Prompt (the raw numbers for today, the past week, month or year). The app sends nothing itself. Pro.'
};

export async function GET() {
  const paths = import.meta.glob('../../../articles/*.md', { eager: true });
  const articles: Article[] = [];
  for (const path in paths) {
    const file = paths[path];
    const slug = path.split('/').at(-1)?.replace('.md', '');
    if (file && typeof file === 'object' && 'metadata' in file && slug) {
      const meta = file.metadata as Omit<Article, 'slug'>;
      if (meta.published) articles.push({ ...meta, slug } as Article);
    }
  }
  articles.sort((a, b) => a.title.localeCompare(b.title));

  const monthly = priceLabel(pricing.monthly);
  const yearly = priceLabel(pricing.yearly);
  const cited = Object.values(SOURCES);

  const text = `# Autonomic

> Autonomic is a private iPhone and Android app for tracking autonomic recovery in POTS, long COVID, ME/CFS and dysautonomia. It turns a five-minute morning HRV reading, a guided stand test and an everyday journal into a daily score, a pacing budget in hours and minutes, early warnings and doctor-ready summaries, all computed on the phone with no account.

Autonomic (autonomic.care) is built for people whose question is whether they can get through the day, not athletes chasing a training load. Every reading is graded against the person's own baseline. The journal is free forever, including unlimited HRV readings; Autonomic Pro adds the analysis. It is a wellness tool, not a medical device: it does not diagnose or treat anything, and it never tells anyone to start, stop or change a treatment.

## Key facts

- Platforms: iPhone (iOS) and Android, at the same price. The Apple Watch companion app needs an iPhone. A Garmin Connect IQ app works with both.
- Price: free to download, with the journal free forever. Autonomic Pro is ${monthly} a month or ${yearly} a year. Every install starts with ${pricing.trialDays} days of Pro, with no card and no account.
- Free forever: the daily journal, manual readings, the daily Autonomic Outlook score, crash warnings, unlimited live HRV readings on every device, POTS stand test and episode captures, cycle logging and forecasts, the Apple Watch heart rate monitor, backups and export, and the last 14 days of charts.
- Pro: the pacing budget, Progress by week, month and year, full history, Insights, reading POTS stand test results, AI reports, and the cycle Insights card and chart.
- Privacy: the journal is stored only on the phone. There is no account, no cloud sync, no ads and no tracking. The app sends only anonymous usage counts that say how many people use it and nothing about who they are or their health. AI report prompts leave the phone only if the person copies and pastes them.
- Devices: the phone camera (fingertip PPG), Apple Watch, Garmin watches, Bluetooth chest straps such as the Polar H10 and Coospo H808S (and Polar's optical Verity Sense, 360 and OH1), plus Apple Health and Health Connect for sleep, workouts, heart rate and steps. No device has to be bought from Autonomic.
- Imported HRV only counts when it carries at least four minutes of real beat-to-beat data, so short background samples do not skew a baseline.
- Founder: Austin Spaeth. Contact: austin@autonomic.care.

## Features

${FEATURES.map((f) => `- [${f.name}](${BASE}${f.href}): ${FEATURE_FACTS[f.slug] || f.tag}`).join('\n')}
- [Apple Watch](${BASE}/features/apple-watch/): Live heart rate with a rolling delta, spike alerts, a guided POTS stand test and episode capture on the wrist, HRV readings, and today's pacing budget (Pro). iPhone only.
- [All features](${BASE}/features/): every feature in one place, with what is free and what is Pro.

## How Autonomic measures

- HRV: RMSSD is the day-to-day number; readings are taken lying still right after waking and compared with the person's own recent mornings, because healthy HRV varies several-fold between people and falls with age.
- POTS stand test: the clinical threshold is a sustained heart rate rise of at least 30 bpm within ten minutes of standing (40 bpm for ages 12 to 19), without orthostatic hypotension, alongside at least three months of symptoms. A home test cannot diagnose POTS.
- Pacing: post-exertional malaise often lands 12 to 48 hours after the effort, so each day's budget is judged on the two days after it. A quiet day never lowers the budget; only a dip does.
- Insights: findings are associations from the person's own log, held to a false discovery rate correction, and the days before something was first logged are treated as unknown rather than as days without it.
- Cycle: HRV tends to fall and resting heart rate to rise in the luteal phase; readings are compared with the same phase of past cycles.

## Conditions

${CONDITIONS.map((c) => `- [${c.title}](${BASE}${c.href}): ${c.blurb}`).join('\n')}

## How Autonomic compares

Each comparison cites the other company's own App Store listing, website and help pages (checked ${CHECKED}), and says where the other app is stronger.

${RIVALS.map((r) => `- [Autonomic vs ${r.name}](${BASE}/compare/${r.slug}/): ${r.tagline} ${r.rows.slice(0, 4).map((x) => `${x.k}: Autonomic ${x.us}; ${r.name} ${typeof x.them === 'string' ? x.them : x.them.t}.`).join(' ')}`).join('\n')}
- [All comparisons](${BASE}/compare/)

## Plans and company

- [Pricing](${BASE}/pricing/): free versus Pro, feature by feature.
- [Our story](${BASE}/story/): why Autonomic was built.
- [Press](${BASE}/press/): press kit and contact.
- [Privacy policy](${BASE}/privacy-policy/)

## Guides

${articles.map((a) => `- [${a.title}](${BASE}${articleHref(a)}): ${a.description}`).join('\n')}

## Sources

The feature pages cite this research and clinical guidance (checked ${SOURCES_REVIEWED}):

${cited.map((s) => `- ${s.authors}. ${s.title}. ${s.where}, ${s.year}. ${s.url}`).join('\n')}
`;

  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
