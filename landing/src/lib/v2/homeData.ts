/** Copy for the home page's interactive parts. Everything in the journal is the
 *  reader's; figures here are sample data and are labelled so where they show. */
/** "Are you actually getting better?": a sample journal's morning RMSSD at the
 *  app's own Progress ranges. Values are ms, read against rmssdU's
 *  breakpoints by RmssdChart; the delta is the last bucket against the first. */
const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
const days = Array.from({ length: 14 }, (_, i) => `10/${i + 1}`);
const weeks = ['7/21', '7/28', '8/4', '8/11', '8/18', '8/25', '9/1', '9/8', '9/15', '9/22', '9/29', '10/6'];
const range = (name: string, note: string, labels: string[], values: number[]) => {
  const d = values[values.length - 1] - values[0];
  return { name, note, labels, values, delta: `${d > 0 ? '+' : ''}${d} ms` };
};
export const RANGES = [
  range('Day', 'over 14 days', days, [24, 27, 22, 26, 29, 25, 23, 28, 30, 26, 27, 31, 26, 28]),
  range('Week', 'over 12 weeks', weeks, [18, 19, 17, 20, 21, 20, 23, 22, 24, 26, 25, 28]),
  range('Month', 'over 12 months', months, [15, 16, 15, 17, 18, 17, 19, 21, 20, 23, 25, 28]),
];

/** "Sound familiar?": each experience lists its matches, best first. Adding a
 *  question or a feature is a row here; the page and its script read only this.
 *  Selections stay in the browser and are never sent anywhere. */
export type Match = { id: string; feature: string; title: string; body: string; href: string; link: string; pro?: boolean; visual: string };

export const MATCHES: Match[] = [
  { id: 'stand', feature: 'POTS stand test', title: 'Put a number on what standing does.', body: 'A guided stand test measures how your heart rate changes from lying to standing, and keeps every result so you can follow your own pattern.', href: '/features/pots-stand-test/', link: 'Explore the stand test', visual: 'stand' },
  { id: 'watch', feature: 'Apple Watch', title: 'See your heart rate as it happens.', body: 'Follow your heart rate and how fast it is moving from your wrist, and capture an episode on the stairs or as you get up. Needs an iPhone.', href: '/features/apple-watch/', link: 'Explore Apple Watch', visual: 'watch' },
  { id: 'pacing', feature: 'Pacing budget', title: 'See how your activity adds up.', body: 'The pacing budget tracks estimated exertion against what your own history suggests you can absorb, and can alert you when today is running ahead of pace.', href: '/features/pacing-budget/', link: 'Explore pacing', pro: true, visual: 'pacing' },
  { id: 'today', feature: 'Autonomic Outlook', title: 'Start the day knowing where you stand.', body: 'A morning reading becomes a score and plain guidance, compared with your own baseline rather than a chart built for healthy people.', href: '/features/hrv-readings/', link: 'Explore Journal + HRV', visual: 'outlook' },
  { id: 'symptoms', feature: 'Symptom journal', title: 'See what your symptoms line up with.', body: 'Log symptoms, triggers, meals, water and digestion as they happen. Over time, Insights shows what tends to sit alongside your harder days. Linked, not proven.', href: '/features/insights/', link: 'Explore Insights', visual: 'insights' },
  { id: 'measures', feature: 'Journal + HRV', title: 'Build a record of how you actually are.', body: 'One reading each morning, with your phone camera, an Apple Watch, a Garmin or a chest strap, graded against your own normal. Something concrete to look at across weeks, not just on the day of a test.', href: '/features/hrv-readings/', link: 'Explore Journal + HRV', visual: 'reading' },
  { id: 'doctor', feature: 'AI reports', title: 'Bring data, not just a description.', body: 'Turn weeks of readings, stand tests and symptoms into a summary for your appointment, written by the AI you choose.', href: '/features/doctor-reports/', link: 'Explore AI reports', pro: true, visual: 'doctor' },
  { id: 'progress', feature: 'Progress', title: 'See the slow change you cannot feel day to day.', body: 'Your readings build a baseline of your own. Week, month and year views then show how now compares with before.', href: '/features/hrv-readings/', link: 'Explore Journal + HRV', pro: true, visual: 'analysis' },
  { id: 'warning', feature: 'Crash warnings', title: 'Hear about a slide before it lands.', body: 'The Journal flags when your score has been sliding for days, and earlier still when the numbers that move first, like resting and overnight heart rate, drift from your own normal. A notification can tell you when the slide starts.', href: '/features/hrv-readings/#crash-warnings', link: 'Explore crash warnings', visual: 'trend' },
  { id: 'sleep', feature: 'Sleep report', title: 'See what last night actually looked like.', body: 'Nights arrive from Apple Health or Health Connect with their stages and overnight heart rate, and the dip is measured against your own resting rate, not a population average.', href: '/insights/recovery/sleep-and-autonomic-recovery/', link: 'Read about sleep and recovery', visual: 'sleep' },
  { id: 'cycle', feature: 'Cycle-aware tracking', title: 'Read your numbers against your own cycle.', body: 'Log your period and the app knows where you are in your cycle, so the dip many people see before a period is compared with past cycles instead of being flagged as a decline.', href: '/insights/hrv/menstrual-cycle-hrv-pots/', link: 'Read about your cycle and HRV', visual: 'cycle' },
  { id: 'weather', feature: 'Barometric pressure', title: 'Find out if the weather is part of it.', body: 'Pressure is recorded quietly each time you open the app. If your own log ties low-pressure days to worse symptoms or readings, Insights tells you, and the Journal warns you on the next one.', href: '/insights/pots/barometric-pressure-weather-changes-pots/', link: 'Read about weather and POTS', pro: true, visual: 'pressure' },
  { id: 'health', feature: 'Apple Health & Health Connect', title: 'Track more without logging more.', body: 'Sleep, workouts, heart rate and steps come in on their own when you open the app, so the days you have no energy to log still count.', href: '/insights/app/getting-started-with-autonomic/', link: 'Read the getting started guide', visual: 'import' },
  { id: 'protocol', feature: 'Clean days', title: 'Stick with a routine, and see if it holds.', body: 'Set the daily protocol you are working on, from water and electrolytes to a morning reading. Each day that meets it builds a streak, and Progress shows how often you keep it.', href: '/insights/recovery/clean-days-and-protocol-streaks/', link: 'Read about clean days', visual: 'protocol' },
  { id: 'insights', feature: 'Insights', title: 'See what lines up with your better days.', body: 'Log what you take and do. Insights compares those days with your HRV, sleep and symptoms, and says what holds up, and when nothing does.', href: '/features/insights/', link: 'Explore Insights', pro: true, visual: 'insights' }
];

export const EXPERIENCES = [
  { id: 'stand', text: 'My heart races when I stand up', matches: ['stand', 'watch', 'doctor'], heading: "Your heart races when you stand. Here’s how to track what’s happening.", description: "Measure your heart-rate response, monitor changes, and bring a clearer record to your doctor." },
  { id: 'crash', text: 'I crash a day or two after doing too much', matches: ['pacing', 'warning', 'symptoms'], heading: "A good day shouldn’t leave you guessing about the next.", description: "See how your activity adds up, track your symptoms, and look for patterns around your difficult days." },
  { id: 'normal', text: 'My tests look normal, but I don’t feel normal', matches: ['measures', 'symptoms', 'doctor'], heading: "Your experience deserves more than a snapshot.", description: "Track symptoms and physiological changes over time, and build a clearer record to discuss with your clinician." },
  { id: 'better', text: 'I can’t tell if I’m getting better', matches: ['progress', 'today', 'protocol'], heading: "Progress can be hard to see day to day.", description: "Follow your personal baselines and long-term trends to see how your measurements change over time." },
  { id: 'helps', text: 'I’ve tried so many things, I can’t tell what helps', matches: ['insights', 'protocol', 'progress'], heading: "Stop relying on memory to figure out what helps.", description: "Track your routines, interventions, and symptoms together to identify possible associations with better or worse days." },
  { id: 'handle', text: 'I never know how much I can handle today', matches: ['pacing', 'today', 'warning'], heading: "Make more informed decisions about today’s activity.", description: "Use your personal readings and estimated pacing budget to see how exertion adds up throughout the day." },
  { id: 'cycle', text: 'My symptoms change with my cycle', matches: ['cycle', 'measures', 'symptoms'], heading: "Your cycle is part of the picture.", description: "Track your cycle alongside your readings and symptoms, so a predictable dip reads as part of your pattern, not a setback." },
  { id: 'weather', text: 'Weather changes seem to set me off', matches: ['weather', 'symptoms', 'warning'], heading: "Find out if the weather really is a trigger.", description: "Pressure is recorded alongside everything you log, and you only hear about it once your own data shows a link." },
  { id: 'sleep', text: 'I sleep and still wake up exhausted', matches: ['sleep', 'today', 'health'], heading: "See what your nights are really doing.", description: "Follow sleep stages and overnight heart rate night by night, next to the morning reading that tells you what you woke up with." }
];

/** Results copy for a selection of closely related experiences. */
export const COMBOS = [
  { ids: ['crash', 'handle'], heading: 'Understand your activity patterns and pace with more context.', description: 'Track estimated exertion, compare it with your personal baseline, and look for patterns around your difficult days.' },
  { ids: ['stand', 'normal'], heading: 'Capture the changes that are easy to miss.', description: 'Record your heart-rate response, track symptoms over time, and bring useful measurements to your next appointment.' },
  { ids: ['better', 'helps'], heading: "See what’s changing, and what might be helping.", description: "Compare long-term trends with the routines and interventions you’ve recorded to find possible associations." }
];

/** Any other mix: never a stack of single headlines. */
export const RESULTS_FALLBACK = {
  heading: 'Start with what you recognized.',
  description: 'These features can help you track what you’re experiencing and look for patterns over time.'
};

/** How many matches show before "Show more". */
export const MATCHES_SHOWN = 3;

export const STEPS = [
  { title: 'Take a morning reading', body: 'Five minutes lying still, with your finger on the camera, a watch or a strap.' },
  { title: 'Get today’s score', body: 'Your reading, sleep and resting heart rate become one number and plain guidance.' },
  { title: 'Pace the day', body: 'Your budget spends down as you move, so you can see the ceiling coming.' }
];

export const FREE_ROWS = ['Daily journal and every log', 'Unlimited HRV readings', 'Daily Autonomic score', 'POTS stand test capture', 'Backups and export'];
export const PRO_ROWS = ['Your daily pacing budget', 'Full history, every metric', 'Insights from your own log', 'POTS test results', 'AI reports for you and your doctor'];

/** The hero bubble's questions, cued off the hero loop's own clock. Times are
 *  After Effects timecode, seconds:frames at the video's 24 fps. Each cue also
 *  picks the phone screen at the same index in the hero markup. */
const tc = (sec: number, frames = 0) => sec + frames / 24;
export const HERO_CUES = [
  { at: tc(0), q: 'Am I going to crash today?' },
  { at: tc(4, 10), q: 'Can I manage the dishes?' },
  { at: tc(10), q: 'Is magnesium even helping?' },
  { at: tc(14, 12), q: 'Will my doctor believe me?' },
  { at: tc(19, 18), q: 'Am I even getting better?' },
];
