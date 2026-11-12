/* A topic page that reads as a GUIDE rather than a list: a short orientation,
   an ordered "start here" path, the topic's articles grouped by the question a
   reader arrives with, and then every article in the topic. Topics without an
   entry here keep the plain list. Slugs that do not resolve are dropped at
   render, so a renamed article costs a link, never the page. */

export type GuideGroup = {
  id: string;
  title: string;
  blurb: string;
  slugs: string[];
};

export type TopicGuide = {
  /** Heading over the orientation. Defaults to "What {short} actually is". */
  heading?: string;
  /** The orientation, one string per paragraph. Frames the topic; the depth lives in the articles. */
  intro: string[];
  /** Small facts set beside the intro. Only ones the site's own articles state. */
  facts?: { big: string; label: string }[];
  /** Title of the facts card. Defaults to "At a glance". */
  factsTitle?: string;
  /** Heading over the reading path. Defaults to "New to {short}? Read these N first." */
  startTitle?: string;
  /** The line under the path heading. Defaults to "Read them in order. Each one builds on the one before." */
  startSub?: string;
  /** Heading over the groups. Defaults to "{short}, by what you are dealing with". */
  groupsTitle?: string;
  /** The reading path, in order, each with why it is on the path. */
  start: { slug: string; why: string }[];
  groups: GuideGroup[];
};

export const TOPIC_GUIDES: Record<string, TopicGuide> = {
  pots: {
    startSub: 'In this order, they take you from "what is this" to knowing what to try first.',
    factsTitle: 'How it is diagnosed',
    intro: [
      'POTS (postural orthostatic tachycardia syndrome) means standing up is harder on your body than it should be. When you stand, gravity pulls blood down into your legs and belly. Normally your nervous system tightens your blood vessels and nudges your heart rate up a little, so your brain keeps getting what it needs. With POTS that correction falls short, so your heart races to make up the difference.',
      'That is why it can feel like so many unrelated things at once: dizziness, a pounding heart, brain fog, shaky legs, nausea, exhaustion that sleep does not fix. It often starts after a virus, surgery, pregnancy or another big strain on the body. It is not anxiety, and it is not in your head, even when every routine test comes back normal.',
      'There is no single cure, but most people get real relief from a mix of salt and fluids, compression, slowly rebuilt exercise, sometimes medication, and learning what sets their own body off. Many people improve a lot over time.'
    ],
    facts: [
      { big: '30+ bpm', label: 'heart rate rise within 10 minutes of standing (40+ in teens)' },
      { big: '3 months', label: 'of symptoms before a diagnosis can be made' },
      { big: 'No big drop', label: 'in blood pressure, which is what separates it from orthostatic hypotension' }
    ],
    start: [
      { slug: 'how-pots-is-diagnosed', why: 'What the criteria actually are, and what the tests feel like.' },
      { slug: 'the-orthostatic-stand-test-at-home', why: 'Check your own standing heart rate before an appointment.' },
      { slug: 'blood-pooling-in-pots-legs', why: 'The one mechanism behind most of the symptoms.' },
      { slug: 'pots-treatment-salt-fluids-compression-medication', why: 'The first-line treatments, and what each one does.' },
      { slug: 'pots-flare-up-triggers-and-recovery', why: 'Why some days are worse, and how to get through them.' }
    ],
    groups: [
      {
        id: 'diagnosis',
        title: 'Getting diagnosed',
        blurb: 'The criteria, the tests, and the conditions it gets mistaken for.',
        slugs: [
          'how-pots-is-diagnosed',
          'the-orthostatic-stand-test-at-home',
          'tilt-table-test-what-to-expect',
          'autonomic-function-tests-what-to-expect',
          'pots-subtypes-explained',
          'is-it-pots-or-anxiety',
          'orthostatic-hypotension-vs-pots',
          'inappropriate-sinus-tachycardia-vs-pots',
          'pots-vs-deconditioning',
          'is-it-long-covid-or-pots',
          'vasovagal-syncope-fainting',
          'normal-test-results-but-still-sick'
        ]
      },
      {
        id: 'symptoms',
        title: 'Why you feel this way',
        blurb: 'Symptom by symptom, what is going on and what helps.',
        slugs: [
          'dizziness-lightheadedness-pots-dysautonomia',
          'blood-pooling-in-pots-legs',
          'palpitations-ectopic-beats-pots-hrv',
          'adrenaline-dumps-pots',
          'why-am-i-so-tired-pots-long-covid-fatigue',
          'pots-symptoms-worse-in-the-morning',
          'coat-hanger-pain-pots-orthostatic-intolerance',
          'chest-pain-tightness-pots-dysautonomia',
          'air-hunger-long-covid-pots',
          'headaches-migraines-pots-dysautonomia',
          'blurry-vision-visual-symptoms-pots-dysautonomia',
          'nausea-in-pots-dysautonomia',
          'pots-insomnia-wired-but-tired',
          'cold-hands-and-feet-pots-dysautonomia',
          'sweating-and-dysautonomia',
          'internal-tremors-long-covid-dysautonomia',
          'tinnitus-dysautonomia-pots-long-covid',
          'frequent-urination-nocturia-pots-dysautonomia',
          'labile-blood-pressure-dysautonomia'
        ]
      },
      {
        id: 'treatment',
        title: 'What helps day to day',
        blurb: 'The things you can start without a prescription.',
        slugs: [
          'pots-treatment-salt-fluids-compression-medication',
          'science-of-salt-and-fluids-for-pots',
          'electrolyte-drinks-for-pots',
          'water-bolus-osmopressor-response-pots',
          'compression-garments-for-pots',
          'counterpressure-maneuvers-pots-orthostatic-intolerance',
          'exercise-for-pots-levine-protocol',
          'pacing-101-energy-envelope',
          'head-up-tilt-sleeping-pots',
          'low-blood-volume-pots-hypovolemia'
        ]
      },
      {
        id: 'medication',
        title: 'Medications',
        blurb: 'What each common drug does, and how it shows up in your numbers.',
        slugs: [
          'beta-blockers-and-hrv',
          'fludrocortisone-for-pots',
          'midodrine-for-pots',
          'ivabradine-for-pots',
          'pyridostigmine-mestinon-for-pots',
          'clonidine-guanfacine-hyperadrenergic-pots',
          'antihistamines-mcas-pots-long-covid',
          'ssris-snris-and-hrv'
        ]
      },
      {
        id: 'food',
        title: 'Food and digestion',
        blurb: 'Why meals can make it worse, and what to eat instead.',
        slugs: [
          'pots-diet-what-to-eat',
          'pots-worse-after-eating-postprandial-hypotension',
          'gastroparesis-pots-dysautonomia',
          'reactive-hypoglycemia-blood-sugar-pots',
          'sibo-histamine-gut-dysautonomia',
          'low-histamine-diet-mcas',
          'caffeine-and-pots-heart-rate-hrv',
          'alcohol-and-hrv-pots',
          'intermittent-fasting-pots-hrv'
        ]
      },
      {
        id: 'life',
        title: 'Living with it',
        blurb: 'Heat, travel, hormones, surgery and the rest of real life.',
        slugs: [
          'pots-flare-up-triggers-and-recovery',
          'heat-intolerance-and-pots',
          'hot-showers-pots',
          'barometric-pressure-weather-changes-pots',
          'flying-with-pots-air-travel-dysautonomia',
          'surgery-and-anesthesia-with-pots',
          'menstrual-cycle-hrv-pots',
          'pots-and-pregnancy',
          'menopause-hrv-dysautonomia',
          'pots-in-teenagers-and-adolescents',
          'nicotine-and-hrv-smoking-vaping-pouches',
          'cold-exposure-hrv-vagus-nerve'
        ]
      },
      {
        id: 'related',
        title: 'Conditions that travel with it',
        blurb: 'What often sits alongside POTS, and what can mimic it.',
        slugs: [
          'pots-long-covid-and-mcas-overlap',
          'hypermobility-eds-and-pots',
          'small-fiber-neuropathy-pots-long-covid',
          'iron-deficiency-ferritin-pots',
          'thyroid-hrv-pots',
          'long-covid-dysautonomia-symptoms',
          'autonomic-nervous-system-and-dysautonomia-guide'
        ]
      },
      {
        id: 'tracking',
        title: 'Tracking it',
        blurb: 'What to measure at home, and how to read it.',
        slugs: [
          'hrv-complete-guide',
          'best-tools-for-tracking-pots',
          'hrv-standing-vs-lying-down-posture',
          'non-dipping-blood-pressure-nocturnal-dip',
          'heart-rate-zones-explained',
          'baroreflex-sensitivity-orthostatic-intolerance',
          'recovery-from-post-viral-dysautonomia',
          'pulse-oximeter-spo2-long-covid-pots',
          'dehydration-and-hrv',
          'autonomic-vs-fitness-trackers',
          'from-daily-crashes-to-living-again'
        ]
      }
    ]
  },
  postviral: {
    startTitle: 'New to long COVID? Read these {n} first.',
    startSub: 'In this order, they take you from "what is happening to me" to how to stop making it worse.',
    heading: 'What long COVID actually is',
    intro: [
      'Long COVID is the name for symptoms that hang on, or show up, months after a COVID infection. For a lot of people the common thread is the autonomic nervous system, the part that runs your heart rate, blood pressure, digestion and temperature without you thinking about it. When an infection knocks that system off balance, you can get a racing heart when you stand, exhaustion that sleep does not fix, brain fog, and crashes that land a day or two after you did too much.',
      'The same pattern can follow other viruses, and it often overlaps with POTS and mast cell activation (MCAS). It can also be hard to prove: plenty of people feel awful while every routine test comes back normal.',
      'The biggest thing in your control early on is not making it worse, which means pacing your energy so you stay out of crashes. Recovery usually takes months to years, and it zig-zags rather than climbing in a straight line.'
    ],
    factsTitle: 'Worth knowing',
    facts: [
      { big: '12 to 48 hours', label: 'after too much effort is when a crash usually hits' },
      { big: 'Months to years', label: 'is the usual recovery timeline, and it zig-zags' },
      { big: 'Normal tests', label: 'are common, and do not mean nothing is wrong' }
    ],
    start: [
      { slug: 'long-covid-dysautonomia-symptoms', why: 'The symptoms that point to your nervous system.' },
      { slug: 'post-exertional-malaise-explained', why: 'Why effort can floor you a day later.' },
      { slug: 'pacing-101-energy-envelope', why: 'How to stay out of crashes.' },
      { slug: 'pots-long-covid-and-mcas-overlap', why: 'Why these three keep turning up together.' },
      { slug: 'what-recovery-looks-like', why: 'What getting better actually looks like.' }
    ],
    groups: [
      {
        id: 'understanding',
        title: 'Understanding it',
        blurb: 'What it is, what causes it, and what it gets mistaken for.',
        slugs: [
          'what-causes-long-covid',
          'long-covid-dysautonomia-symptoms',
          'long-covid-dysautonomia-research-2026',
          'pots-long-covid-and-mcas-overlap',
          'is-it-long-covid-or-pots',
          'is-it-pots-or-anxiety',
          'normal-test-results-but-still-sick',
          'autonomic-nervous-system-and-dysautonomia-guide'
        ]
      },
      {
        id: 'crashes',
        title: 'Crashes, fatigue and pacing',
        blurb: 'Why effort costs so much, and how to spend energy carefully.',
        slugs: [
          'post-exertional-malaise-explained',
          'pacing-101-energy-envelope',
          'why-am-i-so-tired-pots-long-covid-fatigue',
          'long-covid-brain-fog',
          'pacing-budget-know-how-much-today-can-take'
        ]
      },
      {
        id: 'symptoms',
        title: 'Why you feel this way',
        blurb: 'Symptom by symptom, what is going on and what helps.',
        slugs: [
          'air-hunger-long-covid-pots',
          'chest-pain-tightness-pots-dysautonomia',
          'internal-tremors-long-covid-dysautonomia',
          'headaches-migraines-pots-dysautonomia',
          'tinnitus-dysautonomia-pots-long-covid',
          'nausea-in-pots-dysautonomia',
          'cold-hands-and-feet-pots-dysautonomia',
          'sweating-and-dysautonomia',
          'frequent-urination-nocturia-pots-dysautonomia',
          'small-fiber-neuropathy-pots-long-covid',
          'respiratory-rate-normal-range-pots-long-covid',
          'pulse-oximeter-spo2-long-covid-pots'
        ]
      },
      {
        id: 'mcas',
        title: 'MCAS and the gut',
        blurb: 'Mast cells, histamine, and why digestion goes sideways.',
        slugs: [
          'antihistamines-mcas-pots-long-covid',
          'quercetin-mast-cells-evidence',
          'sibo-histamine-gut-dysautonomia',
          'why-you-feel-better-at-night-mcas',
          'mediterranean-diet-long-covid'
        ]
      },
      {
        id: 'treatment',
        title: 'Treatments people try',
        blurb: 'What the evidence says, and what to track if you try one.',
        slugs: ['low-dose-naltrexone-ldn-long-covid', 'coq10-long-covid-pots-fatigue', 'does-hrv-biofeedback-work-long-covid']
      },
      {
        id: 'recovering',
        title: 'Recovering',
        blurb: 'How getting better tends to go, from people who have done it.',
        slugs: ['recovery-from-post-viral-dysautonomia', 'what-recovery-looks-like', 'from-daily-crashes-to-living-again']
      }
    ]
  },
  mecfs: {
    startSub: 'In this order, they explain the crash and how to protect yourself from it.',
    heading: 'What ME/CFS actually is',
    intro: [
      'ME/CFS (myalgic encephalomyelitis, or chronic fatigue syndrome) is a long-term illness whose defining feature is post-exertional malaise: effort of any kind, physical, mental or emotional, is followed by a crash out of all proportion to what you did. The crash is often delayed, so you can feel fine at the time and pay for it a day or two later.',
      'It is far more than being tired. Sleep does not refresh you, thinking can feel like wading through mud, and standing up is often hard too, which is why it overlaps so much with POTS and long COVID. Many cases begin after a viral infection.',
      'There is no cure yet, so the work is protecting the energy you have. Pacing, staying inside your energy envelope and resting before you feel you need to, is the foundation, and your heart rate can warn you before you overdo it.'
    ],
    factsTitle: 'Worth knowing',
    facts: [
      { big: '12 to 48 hours', label: 'after effort is the usual delay before a crash' },
      { big: 'Days', label: 'is how long a single crash can last' },
      { big: 'Rest early', label: 'before you feel you need to, which is the core of pacing' }
    ],
    start: [
      { slug: 'post-exertional-malaise-explained', why: 'The crash that defines it, and why it is delayed.' },
      { slug: 'pacing-101-energy-envelope', why: 'How to find your limits and stay inside them.' },
      { slug: 'why-am-i-so-tired-pots-long-covid-fatigue', why: 'What is behind the exhaustion.' },
      { slug: 'heart-rate-zones-explained', why: 'Using heart rate as an early warning.' }
    ],
    groups: [
      {
        id: 'pacing',
        title: 'Crashes, energy and pacing',
        blurb: 'Why effort costs so much, and how to spend it carefully.',
        slugs: [
          'post-exertional-malaise-explained',
          'pacing-101-energy-envelope',
          'why-am-i-so-tired-pots-long-covid-fatigue',
          'heart-rate-zones-explained',
          'pacing-budget-know-how-much-today-can-take'
        ]
      },
      {
        id: 'treatment',
        title: 'Treatment, research and overlap',
        blurb: 'What is being tried, what the studies say, and what travels with it.',
        slugs: [
          'low-dose-naltrexone-ldn-long-covid',
          'coq10-long-covid-pots-fatigue',
          'long-covid-dysautonomia-research-2026',
          'pots-long-covid-and-mcas-overlap',
          'recovery-from-post-viral-dysautonomia'
        ]
      }
    ]
  },
  dysautonomia: {
    startTitle: 'New to dysautonomia? Read these {n} first.',
    startSub: 'In this order, they take you from how the system works to how to measure it yourself.',
    heading: 'What dysautonomia actually is',
    intro: [
      'Dysautonomia is the umbrella term for when the autonomic nervous system stops doing its job well. That system runs everything you never have to think about: heart rate, blood pressure, digestion, temperature and sweating. It has two halves, one that speeds things up for action and one that slows them down for rest, and they are meant to balance each other all day long.',
      'When that balance breaks, symptoms can land almost anywhere in the body, which is why dysautonomia so often looks like a dozen unrelated problems. POTS is the best known form. Others include orthostatic hypotension and fainting (vasovagal syncope), and it is common after viral illness, including long COVID.',
      'You cannot feel the regulation itself, so it helps to measure its fingerprints: your heart rate when you stand, your HRV in the morning, your blood pressure through the day. Those turn a vague sense of being unwell into something you and a doctor can work with.'
    ],
    factsTitle: 'Two halves',
    facts: [
      { big: 'Sympathetic', label: 'speeds you up: heart rate, blood pressure, alertness' },
      { big: 'Parasympathetic', label: 'slows you down: rest, digestion, recovery' },
      { big: 'Out of balance', label: 'symptoms can land almost anywhere, from heart rate to digestion' }
    ],
    start: [
      { slug: 'autonomic-nervous-system-and-dysautonomia-guide', why: 'The whole system, in plain language.' },
      { slug: 'nervous-system-dysregulation-signs-and-recovery', why: 'The signs, and how recovery is tracked.' },
      { slug: 'the-orthostatic-stand-test-at-home', why: 'The simplest test you can do yourself.' },
      { slug: 'autonomic-function-tests-what-to-expect', why: 'What happens at proper autonomic testing.' },
      { slug: 'what-recovery-looks-like', why: 'What getting better actually looks like.' }
    ],
    groups: [
      {
        id: 'understanding',
        title: 'Understanding it',
        blurb: 'How the system works, how it is tested, and what it gets mistaken for.',
        slugs: [
          'autonomic-nervous-system-and-dysautonomia-guide',
          'nervous-system-dysregulation-signs-and-recovery',
          'autonomic-function-tests-what-to-expect',
          'tilt-table-test-what-to-expect',
          'how-pots-is-diagnosed',
          'pots-subtypes-explained',
          'normal-test-results-but-still-sick',
          'is-it-pots-or-anxiety',
          'is-it-long-covid-or-pots',
          'long-covid-dysautonomia-symptoms',
          'what-causes-long-covid',
          'long-covid-dysautonomia-research-2026'
        ]
      },
      {
        id: 'symptoms',
        title: 'Why you feel this way',
        blurb: 'Symptom by symptom, what is going on and what helps.',
        slugs: [
          'dizziness-lightheadedness-pots-dysautonomia',
          'palpitations-ectopic-beats-pots-hrv',
          'adrenaline-dumps-pots',
          'why-am-i-so-tired-pots-long-covid-fatigue',
          'long-covid-brain-fog',
          'labile-blood-pressure-dysautonomia',
          'non-dipping-blood-pressure-nocturnal-dip',
          'coat-hanger-pain-pots-orthostatic-intolerance',
          'chest-pain-tightness-pots-dysautonomia',
          'headaches-migraines-pots-dysautonomia',
          'blurry-vision-visual-symptoms-pots-dysautonomia',
          'tinnitus-dysautonomia-pots-long-covid',
          'nausea-in-pots-dysautonomia',
          'gastroparesis-pots-dysautonomia',
          'frequent-urination-nocturia-pots-dysautonomia',
          'cold-hands-and-feet-pots-dysautonomia',
          'sweating-and-dysautonomia',
          'internal-tremors-long-covid-dysautonomia',
          'pots-insomnia-wired-but-tired',
          'pots-symptoms-worse-in-the-morning',
          'pulse-oximeter-spo2-long-covid-pots'
        ]
      },
      {
        id: 'daily',
        title: 'What helps day to day',
        blurb: 'Salt, fluids, food, heat and the habits that move your numbers.',
        slugs: [
          'counterpressure-maneuvers-pots-orthostatic-intolerance',
          'compression-garments-for-pots',
          'electrolyte-drinks-for-pots',
          'low-blood-volume-pots-hypovolemia',
          'pots-worse-after-eating-postprandial-hypotension',
          'reactive-hypoglycemia-blood-sugar-pots',
          'sibo-histamine-gut-dysautonomia',
          'intermittent-fasting-pots-hrv',
          'caffeine-and-pots-heart-rate-hrv',
          'alcohol-and-hrv-pots'
        ]
      },
      {
        id: 'triggers',
        title: 'Flares and triggers',
        blurb: 'Heat, weather, travel, surgery, and getting through a bad patch.',
        slugs: [
          'pots-flare-up-triggers-and-recovery',
          'heat-intolerance-and-pots',
          'hot-showers-pots',
          'barometric-pressure-weather-changes-pots',
          'flying-with-pots-air-travel-dysautonomia',
          'surgery-and-anesthesia-with-pots'
        ]
      },
      {
        id: 'treatment',
        title: 'Medications and supplements',
        blurb: 'What each one does, and how to tell whether it is working.',
        slugs: [
          'clonidine-guanfacine-hyperadrenergic-pots',
          'pyridostigmine-mestinon-for-pots',
          'low-dose-naltrexone-ldn-long-covid',
          'vitamin-b12-dysautonomia-pots',
          'vitamin-d-hrv-pots',
          'does-hrv-biofeedback-work-long-covid'
        ]
      },
      {
        id: 'hormones',
        title: 'Hormones and life stages',
        blurb: 'Periods, pregnancy, menopause and the teenage years.',
        slugs: ['menstrual-cycle-hrv-pots', 'pots-and-pregnancy', 'menopause-hrv-dysautonomia', 'pots-in-teenagers-and-adolescents']
      },
      {
        id: 'related',
        title: 'Conditions that travel with it',
        blurb: 'What often sits alongside it, and what can mimic it.',
        slugs: [
          'pots-long-covid-and-mcas-overlap',
          'hypermobility-eds-and-pots',
          'small-fiber-neuropathy-pots-long-covid',
          'iron-deficiency-ferritin-pots',
          'thyroid-hrv-pots',
          'sleep-apnea-and-hrv-dysautonomia'
        ]
      },
      {
        id: 'tracking',
        title: 'Tracking and recovery',
        blurb: 'What to measure, how recovery goes, and how to bring it to a doctor.',
        slugs: [
          'the-orthostatic-stand-test-at-home',
          'hrv-complete-guide',
          'heart-rate-zones-explained',
          'sleep-and-autonomic-recovery',
          'recovery-from-post-viral-dysautonomia',
          'what-recovery-looks-like',
          'from-daily-crashes-to-living-again',
          'turn-your-data-into-a-doctor-conversation',
          'see-your-nervous-system-recover',
          'autonomic-app-measure-analyze-monitor-act',
          'why-autonomic-is-offline-first'
        ]
      }
    ]
  },
  hrv: {
    startSub: 'In this order, they take you from what HRV is to reading your own numbers with confidence.',
    heading: 'What HRV actually is',
    intro: [
      'Heart rate variability is the tiny change in timing from one heartbeat to the next. A healthy heart is not a metronome: it speeds up slightly as you breathe in and slows as you breathe out, and that wobble is your nervous system steering in real time. More variability usually means the calming, recovery side of the system has a good grip.',
      'That makes HRV one of the few windows you have into a system you cannot feel. In POTS and post-viral illness it often runs low, and as people recover their numbers often improve before they feel any better.',
      'The catch is that it is personal and noisy. Comparing yourself to a chart of other people tells you little. What works is measuring the same way every morning, building your own baseline, and watching the trend over a week or two instead of reacting to any single day.'
    ],
    factsTitle: 'Reading it well',
    facts: [
      { big: 'Morning', label: 'right after you wake, before you get up or have coffee' },
      { big: '5 minutes', label: 'is the standard reading length, and keeping it the same every time is what makes readings comparable' },
      { big: '10 to 20%', label: 'day-to-day swing around your own average is normal' }
    ],
    groupsTitle: 'HRV, by what you want to know',
    start: [
      { slug: 'hrv-complete-guide', why: 'The whole picture in one place.' },
      { slug: 'best-time-of-day-to-measure-hrv', why: 'When to measure, and why it matters.' },
      { slug: 'hrv-baseline-how-to-build-and-use-it', why: 'The number every reading is judged against.' },
      { slug: 'hrv-day-to-day-fluctuation-normal-variation', why: 'Why one low morning is rarely news.' },
      { slug: 'rmssd-and-pnn50-vagal-tone-metrics', why: 'The metric worth watching daily.' }
    ],
    groups: [
      {
        id: 'basics',
        title: 'The basics',
        blurb: 'What it is, what a good number looks like, and why yours is low.',
        slugs: [
          'hrv-complete-guide',
          'hrv-vs-resting-heart-rate',
          'hrv-normal-range-by-age',
          'why-is-my-hrv-low',
          'hrv-day-to-day-fluctuation-normal-variation',
          'respiratory-sinus-arrhythmia-breathing-hrv',
          'nervous-system-dysregulation-signs-and-recovery'
        ]
      },
      {
        id: 'measuring',
        title: 'Measuring it well',
        blurb: 'When, how long, in what position, and with which device.',
        slugs: [
          'how-to-measure-hrv-accurately-at-home',
          'best-time-of-day-to-measure-hrv',
          'how-long-to-measure-hrv-reading-length',
          'hrv-standing-vs-lying-down-posture',
          'hrv-baseline-how-to-build-and-use-it',
          'how-to-measure-hrv-at-home-devices',
          'best-hrv-chest-strap-polar-h10-coospo-h808s',
          'how-accurate-are-hrv-wearables',
          'autonomic-vs-fitness-trackers',
          'how-autonomic-scores-your-readings'
        ]
      },
      {
        id: 'reading',
        title: 'Reading your numbers',
        blurb: 'What a drop, a score or a bad night is actually telling you.',
        slugs: [
          'hrv-dropped-overnight-how-to-read-it',
          'hrv-readiness-recovery-scores-explained',
          'hrv-drops-when-sick-early-warning',
          'sleep-stages-and-hrv-deep-sleep-rem',
          'heart-rate-recovery-after-exercise'
        ]
      },
      {
        id: 'metrics',
        title: 'The metrics, one by one',
        blurb: 'RMSSD, SDNN, frequency bands and the rest, in plain language.',
        slugs: [
          'rmssd-and-pnn50-vagal-tone-metrics',
          'what-is-sdnn-in-hrv',
          'resting-heart-rate-and-mean-rr',
          'rr-intervals-and-the-tachogram-explained',
          'hrv-frequency-domain-vlf-lf-hf-power',
          'lf-peak-hf-peak-coherence-resonance',
          'pns-index-sns-index-stress-index-explained',
          'poincare-plot-hrv-sd1-sd2'
        ]
      },
      {
        id: 'raising',
        title: 'Raising it',
        blurb: 'What genuinely moves HRV, and what is overhyped.',
        slugs: [
          'how-to-improve-hrv-what-works',
          'resonant-breathing-hrv-biofeedback',
          'does-hrv-biofeedback-work-long-covid',
          'how-to-stimulate-the-vagus-nerve',
          'meditation-and-hrv',
          'sleep-and-autonomic-recovery',
          'cold-exposure-hrv-vagus-nerve',
          'omega-3-fish-oil-and-hrv'
        ]
      },
      {
        id: 'moves',
        title: 'What pushes it around',
        blurb: 'Drinks, hormones, sleep and the body changes that show up in your numbers.',
        slugs: [
          'alcohol-and-hrv-pots',
          'caffeine-and-pots-heart-rate-hrv',
          'nicotine-and-hrv-smoking-vaping-pouches',
          'dehydration-and-hrv',
          'cortisol-and-hrv',
          'menstrual-cycle-hrv-pots',
          'menopause-hrv-dysautonomia',
          'thyroid-hrv-pots',
          'sleep-apnea-and-hrv-dysautonomia',
          'low-blood-volume-pots-hypovolemia',
          'palpitations-ectopic-beats-pots-hrv'
        ]
      },
      {
        id: 'medication',
        title: 'Medications',
        blurb: 'How common drugs change your HRV, so a shift is not misread.',
        slugs: [
          'beta-blockers-and-hrv',
          'ssris-snris-and-hrv',
          'clonidine-guanfacine-hyperadrenergic-pots',
          'pyridostigmine-mestinon-for-pots',
          'fludrocortisone-for-pots',
          'midodrine-for-pots',
          'ivabradine-for-pots'
        ]
      }
    ]
  },
  food: {
    startSub: 'The basics first, then what to do if your gut or mast cells are part of the picture.',
    heading: 'How food fits in',
    intro: [
      'Food is one of the few levers you can pull every day, and with dysautonomia it matters more than usual. Digestion pulls blood toward your gut, so a big meal can leave you dizzy and drained, and what you drink and how much salt you take in shape how much blood you have to work with in the first place.',
      'For a lot of people, small salty meals and steady fluids do more than any special diet. If mast cells are part of your picture (MCAS), some foods can also set off symptoms, and a low-histamine approach is worth a careful try.',
      'Supplements get a lot of attention online. The articles here go through what the evidence actually shows for each one, and how to tell from your own numbers whether it is doing anything.'
    ],
    startTitle: 'New here? Read these {n} first.',
    groupsTitle: 'Food, by what you are dealing with',
    start: [
      { slug: 'pots-diet-what-to-eat', why: 'The basics of eating with POTS.' },
      { slug: 'electrolyte-drinks-for-pots', why: 'Choosing one, or making your own.' },
      { slug: 'pots-worse-after-eating-postprandial-hypotension', why: 'Why meals can make you feel worse.' },
      { slug: 'low-histamine-diet-mcas', why: 'A practical food list if MCAS is in the picture.' }
    ],
    groups: [
      {
        id: 'pots',
        title: 'Eating with POTS',
        blurb: 'Salt, fluids, meal size, and why timing matters.',
        slugs: [
          'pots-diet-what-to-eat',
          'electrolyte-drinks-for-pots',
          'pots-worse-after-eating-postprandial-hypotension',
          'reactive-hypoglycemia-blood-sugar-pots',
          'intermittent-fasting-pots-hrv'
        ]
      },
      {
        id: 'gut',
        title: 'Gut, histamine and MCAS',
        blurb: 'When digestion and mast cells are part of the problem.',
        slugs: [
          'sibo-histamine-gut-dysautonomia',
          'low-histamine-diet-mcas',
          'low-histamine-pots-meal-ideas',
          'gastroparesis-pots-dysautonomia',
          'quercetin-mast-cells-evidence',
          'mediterranean-diet-long-covid'
        ]
      },
      {
        id: 'supplements',
        title: 'Supplements',
        blurb: 'What the evidence shows, and how to tell if one is working for you.',
        slugs: [
          'magnesium-hrv-pots',
          'vitamin-d-hrv-pots',
          'vitamin-b12-dysautonomia-pots',
          'omega-3-fish-oil-and-hrv',
          'coq10-long-covid-pots-fatigue'
        ]
      }
    ]
  },
  recovery: {
    startSub: 'The habits and the mindset that the rest of recovery is built on.',
    heading: 'How recovery actually goes',
    intro: [
      'Recovery from POTS, long COVID and other kinds of dysautonomia is real, but it rarely looks the way people expect. It usually takes months, sometimes a couple of years, and it moves in a zig-zag: good weeks, setbacks, and a slow overall climb that is hard to see from inside any single day.',
      'Most of what moves it is unglamorous and daily: pacing so you stay out of crashes, protecting sleep, the basics of salt, fluids and compression, and learning your own triggers. Pushing through tends to set things back rather than speed them up.',
      'Because how you feel day to day is such a noisy guide, measurements help. Your numbers often start improving before you feel it, and a trend over several weeks is the most honest way to see whether what you are doing is working.'
    ],
    factsTitle: 'Worth knowing',
    facts: [
      { big: 'Months to years', label: 'is the usual timeline, and it zig-zags' },
      { big: '1 to 2 weeks', label: 'is the trend worth watching, never a single day' },
      { big: 'Numbers first', label: 'your data often improves before your symptoms do' }
    ],
    startTitle: 'Read these {n} first.',
    groupsTitle: 'Recovery, by what you are working on',
    start: [
      { slug: 'what-recovery-looks-like', why: 'The real shape of getting better.' },
      { slug: 'pacing-101-energy-envelope', why: 'The habit that protects everything else.' },
      { slug: 'sleep-and-autonomic-recovery', why: 'Your biggest daily lever.' },
      { slug: 'find-your-triggers-symptom-journal', why: 'Working out what sets you back.' },
      { slug: 'recovery-from-post-viral-dysautonomia', why: 'Turning your data into decisions.' }
    ],
    groups: [
      {
        id: 'how',
        title: 'How recovery works',
        blurb: 'What to expect, and how to tell real progress from a good week.',
        slugs: [
          'what-recovery-looks-like',
          'recovery-from-post-viral-dysautonomia',
          'nervous-system-dysregulation-signs-and-recovery',
          'pots-vs-deconditioning',
          'pots-in-teenagers-and-adolescents',
          'from-daily-crashes-to-living-again',
          'see-your-nervous-system-recover'
        ]
      },
      {
        id: 'pacing',
        title: 'Pacing and crashes',
        blurb: 'Spending energy carefully, and getting through a flare.',
        slugs: [
          'pacing-101-energy-envelope',
          'post-exertional-malaise-explained',
          'heart-rate-zones-explained',
          'exercise-for-pots-levine-protocol',
          'pots-flare-up-triggers-and-recovery',
          'adrenaline-dumps-pots',
          'pacing-budget-know-how-much-today-can-take'
        ]
      },
      {
        id: 'sleep',
        title: 'Sleep',
        blurb: 'Why nights matter so much, and what gets in the way.',
        slugs: [
          'sleep-and-autonomic-recovery',
          'sleep-stages-and-hrv-deep-sleep-rem',
          'pots-insomnia-wired-but-tired',
          'overnight-heart-rate-while-you-sleep',
          'sleep-apnea-and-hrv-dysautonomia',
          'head-up-tilt-sleeping-pots',
          'pots-symptoms-worse-in-the-morning',
          'why-you-feel-better-at-night-mcas'
        ]
      },
      {
        id: 'helps',
        title: 'What helps',
        blurb: 'The treatments and practices with the best track record.',
        slugs: [
          'pots-treatment-salt-fluids-compression-medication',
          'compression-garments-for-pots',
          'counterpressure-maneuvers-pots-orthostatic-intolerance',
          'blood-pooling-in-pots-legs',
          'resonant-breathing-hrv-biofeedback',
          'how-to-improve-hrv-what-works',
          'how-to-stimulate-the-vagus-nerve',
          'meditation-and-hrv',
          'low-dose-naltrexone-ldn-long-covid'
        ]
      },
      {
        id: 'labs',
        title: 'Supplements and labs',
        blurb: 'Deficiencies worth ruling out, and what supplements can do.',
        slugs: [
          'iron-deficiency-ferritin-pots',
          'vitamin-b12-dysautonomia-pots',
          'vitamin-d-hrv-pots',
          'magnesium-hrv-pots',
          'low-histamine-pots-meal-ideas'
        ]
      },
      {
        id: 'life',
        title: 'Real life',
        blurb: 'Heat, weather, travel, illness, stress and other setbacks.',
        slugs: [
          'heat-intolerance-and-pots',
          'hot-showers-pots',
          'barometric-pressure-weather-changes-pots',
          'flying-with-pots-air-travel-dysautonomia',
          'surgery-and-anesthesia-with-pots',
          'pots-and-pregnancy',
          'hrv-drops-when-sick-early-warning',
          'cortisol-and-hrv',
          'long-covid-brain-fog'
        ]
      },
      {
        id: 'tracking',
        title: 'Tracking progress',
        blurb: 'Reading your numbers, finding triggers, and briefing your doctor.',
        slugs: [
          'find-your-triggers-symptom-journal',
          'hrv-complete-guide',
          'hrv-dropped-overnight-how-to-read-it',
          'hrv-readiness-recovery-scores-explained',
          'clean-days-and-protocol-streaks',
          'turn-your-data-into-a-doctor-conversation',
          'getting-started-with-autonomic',
          'autonomic-app-measure-analyze-monitor-act'
        ]
      }
    ]
  },
  research: {
    startSub: 'One for long COVID, one for POTS, one for the gadgets.',
    heading: 'How we cover the research',
    intro: [
      'New studies on POTS, long COVID and HRV come out all the time, and the headlines rarely match what the paper actually found. This section goes through the research that matters for people living with these conditions, in plain language.',
      'Each article says what was studied, how strong the evidence is, and what it does and does not mean for you. Small studies and early findings are called what they are.',
      'None of it replaces your own doctor, and a lot of it is early. But knowing what the evidence says makes it easier to ask good questions, and to spot a cure that is being oversold.'
    ],
    startTitle: 'Start with these {n}.',
    groupsTitle: 'Research, by subject',
    start: [
      { slug: 'what-causes-long-covid', why: 'The leading theories, and how far along each one is.' },
      { slug: 'science-of-salt-and-fluids-for-pots', why: 'What is proven about the first-line advice.' },
      { slug: 'how-accurate-are-hrv-wearables', why: 'How far to trust the device on your wrist.' }
    ],
    groups: [
      {
        id: 'longcovid',
        title: 'Long COVID',
        blurb: 'Causes, new findings, and what has been tested.',
        slugs: [
          'what-causes-long-covid',
          'long-covid-dysautonomia-research-2026',
          'mediterranean-diet-long-covid',
          'does-hrv-biofeedback-work-long-covid'
        ]
      },
      {
        id: 'pots',
        title: 'POTS',
        blurb: 'The evidence behind the everyday advice.',
        slugs: ['science-of-salt-and-fluids-for-pots', 'water-bolus-osmopressor-response-pots']
      },
      {
        id: 'hrv',
        title: 'HRV and devices',
        blurb: 'Breathing protocols, and how accurate the gadgets are.',
        slugs: ['resonant-breathing-hrv-biofeedback', 'how-accurate-are-hrv-wearables']
      }
    ]
  },
  basics: {
    startSub: 'Enough to make sense of almost every number you will see.',
    heading: 'Where to begin',
    intro: [
      'This is the vocabulary behind everything else on the blog. If words like HRV, RMSSD, orthostatic or baroreflex make your eyes glaze over, start here. Each article takes one idea and explains it in plain language, with what it means for you.',
      'The short version: your autonomic nervous system runs your heart rate, blood pressure and digestion on autopilot, and you cannot feel it working. What you can do is measure its fingerprints: how your heart rate changes when you stand, how much it varies from beat to beat, and how your blood pressure behaves through the day.',
      'You do not need to learn all of it. Read the few below, and come back to the rest when a number in your own data makes you curious.'
    ],
    startTitle: 'Read these {n} first.',
    groupsTitle: 'The basics, by subject',
    start: [
      { slug: 'autonomic-nervous-system-and-dysautonomia-guide', why: 'The system everything else is about.' },
      { slug: 'hrv-complete-guide', why: 'The measurement at the heart of it.' },
      { slug: 'the-orthostatic-stand-test-at-home', why: 'The simplest test you can do yourself.' },
      { slug: 'hrv-baseline-how-to-build-and-use-it', why: 'How to read any number against your own normal.' },
      { slug: 'blood-pressure-basics-systolic-diastolic-pulse', why: 'What the two numbers actually mean.' }
    ],
    groups: [
      {
        id: 'system',
        title: 'Your nervous system',
        blurb: 'How the autopilot works, and the reflexes that keep you upright.',
        slugs: [
          'autonomic-nervous-system-and-dysautonomia-guide',
          'nervous-system-dysregulation-signs-and-recovery',
          'baroreflex-sensitivity-orthostatic-intolerance',
          'respiratory-sinus-arrhythmia-breathing-hrv',
          'hrv-complete-guide'
        ]
      },
      {
        id: 'conditions',
        title: 'Conditions and tests',
        blurb: 'What the diagnoses mean, and what the tests involve.',
        slugs: [
          'how-pots-is-diagnosed',
          'pots-subtypes-explained',
          'orthostatic-hypotension-vs-pots',
          'inappropriate-sinus-tachycardia-vs-pots',
          'vasovagal-syncope-fainting',
          'hypermobility-eds-and-pots',
          'the-orthostatic-stand-test-at-home',
          'tilt-table-test-what-to-expect',
          'autonomic-function-tests-what-to-expect'
        ]
      },
      {
        id: 'symptoms',
        title: 'Symptoms explained',
        blurb: 'Why standing up does what it does.',
        slugs: [
          'dizziness-lightheadedness-pots-dysautonomia',
          'coat-hanger-pain-pots-orthostatic-intolerance',
          'blurry-vision-visual-symptoms-pots-dysautonomia',
          'labile-blood-pressure-dysautonomia',
          'non-dipping-blood-pressure-nocturnal-dip'
        ]
      },
      {
        id: 'hrv',
        title: 'HRV basics',
        blurb: 'What a good number is, and how to measure it the same way every time.',
        slugs: [
          'hrv-vs-resting-heart-rate',
          'hrv-normal-range-by-age',
          'why-is-my-hrv-low',
          'hrv-day-to-day-fluctuation-normal-variation',
          'hrv-baseline-how-to-build-and-use-it',
          'best-time-of-day-to-measure-hrv',
          'how-long-to-measure-hrv-reading-length',
          'how-to-measure-hrv-accurately-at-home'
        ]
      },
      {
        id: 'metrics',
        title: 'The metrics, one by one',
        blurb: 'Every number in an HRV reading, in plain language.',
        slugs: [
          'rmssd-and-pnn50-vagal-tone-metrics',
          'what-is-sdnn-in-hrv',
          'resting-heart-rate-and-mean-rr',
          'rr-intervals-and-the-tachogram-explained',
          'hrv-frequency-domain-vlf-lf-hf-power',
          'lf-peak-hf-peak-coherence-resonance',
          'pns-index-sns-index-stress-index-explained',
          'poincare-plot-hrv-sd1-sd2'
        ]
      },
      {
        id: 'heart',
        title: 'Heart rate, breathing and blood pressure',
        blurb: 'The other signals worth understanding.',
        slugs: [
          'blood-pressure-basics-systolic-diastolic-pulse',
          'mean-arterial-pressure-and-pulse-pressure',
          'autonomic-blood-pressure-indices-kerdo-robinson-kvas',
          'overnight-heart-rate-while-you-sleep',
          'heart-rate-recovery-after-exercise',
          'respiratory-rate-normal-range-pots-long-covid'
        ]
      },
      {
        id: 'using',
        title: 'Using your data',
        blurb: 'Making sense of a score, and bringing it to your doctor.',
        slugs: ['the-autonomic-score-and-grade-bands', 'turn-your-data-into-a-doctor-conversation']
      }
    ]
  },
  app: {
    startSub: 'From your first reading to your next doctor visit.',
    heading: 'What Autonomic does',
    intro: [
      'Autonomic is a private journal for your nervous system. Each morning you take a short heart reading with a chest strap, a watch or your phone’s camera, and the app grades it against medical thresholds and folds it into one daily score.',
      'Around that reading you can log sleep, symptoms, medications, food and activity. Over a few weeks it starts to show what tends to come before your good days and your bad ones, and when you see a doctor it turns months of entries into a short summary.',
      'Your health data stays on your phone. There is no account, and it is never uploaded. These articles show how each part works and how to get the most out of your first few weeks.'
    ],
    startTitle: 'New to the app? Read these {n} first.',
    groupsTitle: 'The app, by what you want to do',
    start: [
      { slug: 'getting-started-with-autonomic', why: 'Your first week, step by step.' },
      { slug: 'how-autonomic-scores-your-readings', why: 'Where the grades come from.' },
      { slug: 'how-to-measure-hrv-at-home-devices', why: 'Picking the right sensor for you.' },
      { slug: 'turn-your-data-into-a-doctor-conversation', why: 'Taking it to your next appointment.' }
    ],
    groups: [
      {
        id: 'start',
        title: 'Getting started',
        blurb: 'What the app is for, and how to set it up.',
        slugs: [
          'getting-started-with-autonomic',
          'autonomic-app-measure-analyze-monitor-act',
          'see-your-nervous-system-recover',
          'why-autonomic-is-offline-first'
        ]
      },
      {
        id: 'how',
        title: 'How it works',
        blurb: 'Scores, pacing, triggers and doctor summaries.',
        slugs: [
          'how-autonomic-scores-your-readings',
          'the-autonomic-score-and-grade-bands',
          'pacing-budget-know-how-much-today-can-take',
          'find-your-triggers-symptom-journal',
          'turn-your-data-into-a-doctor-conversation'
        ]
      },
      {
        id: 'gear',
        title: 'Devices and gear',
        blurb: 'Straps, watches, and what else is worth owning.',
        slugs: [
          'how-to-measure-hrv-at-home-devices',
          'best-hrv-chest-strap-polar-h10-coospo-h808s',
          'best-tools-for-tracking-pots',
          'autonomic-vs-fitness-trackers'
        ]
      }
    ]
  },
  'just-diagnosed': {
    startSub: 'What is going on, what to try first, and what to expect.',
    heading: 'Where to start',
    intro: [
      'A new diagnosis of POTS, long COVID, ME/CFS or dysautonomia can bring relief and a lot of questions at once. Relief, because there is finally a name for what has been happening. Questions, because the name does not come with a manual.',
      'The good news is that the first steps are well understood. For POTS that usually means more salt and fluids and compression garments, and for all of these conditions it means pacing to stay out of crashes and slowly rebuilding what your body can handle. Medication helps some people, and it works best on top of those basics.',
      'It also helps to start tracking early. A few weeks of morning readings and notes on how you feel give you and your doctor something solid to work from, and they make progress visible when it is hard to feel.'
    ],
    startTitle: 'Read these {n} first.',
    groupsTitle: 'Everything for your first months',
    start: [
      { slug: 'autonomic-nervous-system-and-dysautonomia-guide', why: 'What is actually going on in your body.' },
      { slug: 'pots-treatment-salt-fluids-compression-medication', why: 'The first treatments most people try.' },
      { slug: 'pacing-101-energy-envelope', why: 'How to stop the crash cycle.' },
      { slug: 'what-recovery-looks-like', why: 'What getting better tends to look like.' },
      { slug: 'turn-your-data-into-a-doctor-conversation', why: 'Making the most of your appointments.' }
    ],
    groups: [
      {
        id: 'diagnosis',
        title: 'Understanding the diagnosis',
        blurb: 'What it means, the tests, and the types.',
        slugs: [
          'autonomic-nervous-system-and-dysautonomia-guide',
          'how-pots-is-diagnosed',
          'pots-subtypes-explained',
          'tilt-table-test-what-to-expect',
          'autonomic-function-tests-what-to-expect',
          'pots-long-covid-and-mcas-overlap'
        ]
      },
      {
        id: 'first',
        title: 'First steps',
        blurb: 'Treatment basics, pacing, and starting to track.',
        slugs: [
          'pots-treatment-salt-fluids-compression-medication',
          'pacing-101-energy-envelope',
          'hrv-complete-guide',
          'turn-your-data-into-a-doctor-conversation'
        ]
      },
      {
        id: 'next',
        title: 'What comes next',
        blurb: 'How recovery tends to go, and how to steer it.',
        slugs: ['recovery-from-post-viral-dysautonomia', 'what-recovery-looks-like']
      }
    ]
  },
  'supporting-someone': {
    startSub: 'Why it is real, why pushing backfires, and how to help.',
    heading: 'What helps most',
    intro: [
      'If someone you love has POTS, long COVID, ME/CFS or dysautonomia, one of the hardest parts is that it often does not show. They can look completely fine and feel terrible, and their routine test results can come back normal. Neither of those means it is in their head.',
      'These illnesses also run on a delay. Doing too much on a good day can mean a crash a day or two later, which is why "just push through" or "you seemed fine yesterday" tends to backfire, however kindly it is meant.',
      'The most useful things you can do are believe them, help them pace instead of push, and take some of the load on bad days. Recovery is usually slow and uneven, so a setback is not the same as going backwards.'
    ],
    startTitle: 'Read these {n} first.',
    groupsTitle: 'Everything for the people around them',
    start: [
      { slug: 'normal-test-results-but-still-sick', why: 'Why normal tests do not mean nothing is wrong.' },
      { slug: 'post-exertional-malaise-explained', why: 'Why a good day can be followed by a crash.' },
      { slug: 'pacing-101-energy-envelope', why: 'How you can help them pace.' },
      { slug: 'what-recovery-looks-like', why: 'What the road back tends to look like.' }
    ],
    groups: [
      {
        id: 'understanding',
        title: 'What they are dealing with',
        blurb: 'Why it is real even when it does not show.',
        slugs: [
          'autonomic-nervous-system-and-dysautonomia-guide',
          'normal-test-results-but-still-sick',
          'is-it-pots-or-anxiety',
          'why-am-i-so-tired-pots-long-covid-fatigue',
          'pots-in-teenagers-and-adolescents'
        ]
      },
      {
        id: 'pacing',
        title: 'Crashes and pacing',
        blurb: 'Why pushing backfires, and how to help them pace.',
        slugs: ['post-exertional-malaise-explained', 'pacing-101-energy-envelope', 'pots-flare-up-triggers-and-recovery']
      },
      {
        id: 'road',
        title: 'The long road',
        blurb: 'What recovery looks like, from someone who has been through it.',
        slugs: ['what-recovery-looks-like', 'from-daily-crashes-to-living-again']
      }
    ]
  }

};

/** How many links a group shows before the rest fold behind "Show N more". */
export const GROUP_VISIBLE = 5;
