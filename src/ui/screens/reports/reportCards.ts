// The 20 report-card catalog — ported verbatim from legacy docs/index.html
// REPORT_CARDS (~6454-6850). `sections` lists which data blocks to include;
// `focus` is the per-card framing; `context` is static framing (baselines,
// protocol, research); `instructions` is the analysis ask + citation guidance.
//
// Decoupling: legacy `icon: ICONS.<x>` (raw SVG string) -> `icon` is the
// IconName key (e.g. 'chart'), rendered via <Icon name={card.icon}/>.

import type { IconName } from '@ui/primitives';

export interface ReportCard {
  id: string;
  icon: IconName;
  title: string;
  desc: string;
  sections: string[];
  focus: string;
  context?: string;
  instructions?: string;
}

export const REPORT_CARDS: ReportCard[] = [
  {
    id: 'overall',
    icon: 'chart',
    title: 'Overall Health Summary',
    desc: 'Comprehensive analysis of all metrics for the period with trends, patterns, and recommendations.',
    sections: ['hrv', 'bp', 'ecg', 'rhr', 'spo2', 'sleep', 'activities', 'food', 'meds', 'supplements', 'hydration', 'bm', 'symptoms', 'orthostatic', 'scores', 'cleanDays'],
    focus: 'Provide a comprehensive analysis of all health metrics for this period. Look at HRV, blood pressure, sleep, activity, food choices, symptoms, and how they interact.',
    instructions: "Provide a complete picture analysis covering all systems and how they interact. Identify what's working and what isn't.",
  },
  {
    id: 'hrv',
    icon: 'heartPulse',
    title: 'HRV Deep Dive',
    desc: 'Detailed autonomic analysis focusing on RMSSD, power distribution, and frequency peaks.',
    sections: ['hrv', 'breathStyles', 'scores'],
    focus: 'Deep analysis of autonomic nervous system function based on HRV data. Examine all HRV metrics, frequency peaks, power distribution, and what they reveal about parasympathetic and sympathetic function.',
    context: `KEY METRICS TO EXAMINE:
- RMSSD trends (parasympathetic activity)
- pNN50 patterns (vagal depth)
- LF Peak Frequency progression (baroreflex training - target 0.08–0.10 Hz)
- HF Peak Frequency (respiratory peak alignment)
- LF/HF ratio dynamics (sympathovagal balance)
- VLF Power patterns (stress signal)
- Total Power trajectory (autonomic engagement)
- Coherence scores (heart–breath synchronization)

COMPARISON CONTEXT:
- Pre-illness best RMSSD: 36
- Pre-illness best LF Peak: 0.102 Hz
- Pre-illness best Power: 4770`,
    instructions: `Analyze:
- Current autonomic function level
- Trajectory of recovery
- Parasympathetic capacity development
- Baroreflex training progression
- Areas of concern or imbalance
- Comparison to pre-illness baseline
- Research-grounded interpretation of findings

Cite relevant research on HRV in long COVID recovery, baroreflex training, and autonomic rehabilitation.`,
  },
  {
    id: 'trajectory',
    icon: 'trendUp',
    title: 'Recovery Trajectory',
    desc: 'Where you are in recovery, comparison to baselines, and projected timeline.',
    sections: ['scores', 'hrv', 'rhr', 'sleep', 'symptoms', 'activities', 'cleanDays'],
    focus: 'Analyze where the user is in their long COVID recovery based on current data versus their documented progression history. Provide realistic projections for continued recovery.',
    context: `HISTORICAL CONTEXT:
- 3+ years into long COVID
- Recent major illness (adenovirus + bacterial complication) ~3 weeks ago
- Pre-illness baselines achieved before recent setback
- Current state: recovery phase

RESEARCH CONTEXT: Long COVID recovery research suggests autonomic dysfunction can persist 6+ months, recovery is non-linear with setbacks common, baroreflex training shows promise, and mast cell stabilization is important for the MCAS component.`,
    instructions: `Analyze:
- Current position in recovery (early/middle/late phase)
- Progress markers achieved
- Markers still needed
- Realistic timeline for full recovery
- Factors accelerating recovery
- Factors slowing recovery
- Projected milestones over next 1–3 months

Be honest about both progress and remaining work. Cite long COVID recovery research.`,
  },
  {
    id: 'triggers',
    icon: 'triangle',
    title: 'Trigger Analysis',
    desc: 'Identify foods, activities, and patterns causing setbacks based on your data.',
    sections: ['food', 'activities', 'symptoms', 'hrv', 'scores'],
    focus: 'Identify specific triggers causing setbacks based on data patterns. Look at correlations between events/foods/activities and metric drops, including HRV readings 24–48 hours before and after.',
    context: `DOCUMENTED HISTORICAL TRIGGERS:
- Pizza: severe MCAS reaction, multi-day HRV crash
- Chocolate: caffeine + histamine, consistent HRV suppression
- Processed meats (pepperoni, jerky): histamine reaction
- Late dinners (after 5pm): Roemheld and morning crash
- Caramelizer with sugar: HRV suppression
- Sex during illness: SVT triggers`,
    instructions: `Analyze:
- Specific triggers identified in this period
- Magnitude of impact per trigger
- Recovery time after each trigger
- Trigger frequency pattern
- Triggers the user may not be aware of
- Compound trigger effects (multiple stacking)
- Trigger avoidance recommendations

Cite mast cell activation, histamine intolerance, and autonomic trigger research.`,
  },
  {
    id: 'sleep',
    icon: 'moon',
    title: 'Sleep Impact Report',
    desc: 'How sleep patterns affect your autonomic function and recovery.',
    sections: ['sleep', 'hrv', 'scores'],
    focus: "Examine how sleep patterns affect autonomic function and recovery. Correlate each night's sleep with the next morning's HRV and the day's Autonomic Score.",
    context: `KEY PATTERNS TO IDENTIFY:
- Sleep duration vs morning RMSSD
- Bedtime consistency vs HRV stability
- Interruption impact
- Low HR during sleep (vagal indicator)
- Sleep position effects (elevated for ear/Roemheld)`,
    instructions: `Analyze:
- Sleep quality patterns
- Sleep impact on next-day autonomic function
- Optimal sleep parameters identified
- Sleep disruptions and their causes
- Sleep architecture inferences
- Recommendations for sleep optimization

Cite sleep and HRV research, sleep in chronic illness recovery, and circadian rhythm impacts on autonomic function.`,
  },
  {
    id: 'cardio',
    icon: 'heart',
    title: 'Cardiovascular Analysis',
    desc: 'Blood pressure, heart rate, and ECG patterns with cardiovascular health insights.',
    sections: ['bp', 'rhr', 'ecg', 'orthostatic', 'activities'],
    focus: 'Analyze cardiovascular system function based on BP, HR, and ECG data, including exercise HR responses and orthostatic responses.',
    context: `HISTORICAL CONTEXT:
- Clean cardiac workup: echo, bubble echo, MRI, CT - no structural abnormalities
- Documented rate-dependent ECG aberrancy
- History of SVT episodes during illness
- Labile hypertension during long COVID`,
    instructions: `Analyze:
- Cardiovascular stability in period
- BP regulation quality
- HR variability and response
- Orthostatic function
- Cardiac irritability indicators (ectopics)
- Exercise tolerance
- Areas of concern and recommendations

Cite POTS research, dysautonomia cardiovascular patterns, and long COVID cardiovascular findings.`,
  },
  {
    id: 'activity',
    icon: 'activity',
    title: 'Activity & Exercise Review',
    desc: 'Exercise tolerance, recovery between sessions, and activity recommendations.',
    sections: ['activities', 'hrv', 'scores', 'symptoms'],
    focus: 'Analyze exercise tolerance, recovery patterns, and activity recommendations. Examine HR responses during activity and HRV impact 24–48 hours after.',
    context: `CHOP PROTOCOL HISTORY:
- Interval training protocol followed
- Pre-illness best: avg 89 HR, peak 104, recovery 75
- Current recovery state requires gradual return`,
    instructions: `Analyze:
- Current exercise tolerance
- Recovery between sessions
- Appropriate intensity given current state
- Overdoing patterns
- Detraining indicators
- Progression readiness
- Specific exercise recommendations
- Activities to avoid in current state

Cite exercise prescription in dysautonomia, post-viral exercise intolerance, and graded exercise therapy research.`,
  },
  {
    id: 'adherence',
    icon: 'checklist',
    title: 'Protocol Adherence Audit',
    desc: 'How well you followed your protocol and impact on outcomes.',
    sections: ['meds', 'supplements', 'hydration', 'food', 'cleanDays', 'scores'],
    focus: 'Assess how well the user followed protocol and what the impact was. Compare adherence days vs non-adherence days, and clean days vs non-clean days.',
    context: `PROTOCOL ELEMENTS:
- Allegra 180mg daily (MCAS critical)
- Pepcid daily (MCAS critical)
- Magnesium glycinate 200mg evening
- B1 thiamine 100mg, CoQ10, Fish oil
- Liquid IV daily
- Dinner before 5pm, Bed by 10pm
- 4/5 breathing practice
- Sodium adequate, Hydration target`,
    instructions: `Analyze:
- Adherence rates per protocol element
- Most consistently followed elements
- Most frequently missed elements
- Impact of missed elements on outcomes
- Pattern of adherence failures
- Strategies to improve adherence
- Priority interventions to maintain

Note any patterns suggesting psychological barriers or practical obstacles to adherence.`,
  },
  {
    id: 'pots',
    icon: 'standing',
    title: 'POTS/Orthostatic Patterns',
    desc: 'Orthostatic events, HR responses, and patterns suggesting POTS severity.',
    sections: ['orthostatic', 'rhr', 'bp', 'symptoms', 'spo2'],
    focus: 'Examine orthostatic responses and POTS-related patterns, including position-change HR responses and documented severe events.',
    context: `POTS PATTERN INDICATORS:
- HR increase >30 bpm with standing
- Symptoms of cerebral hypoperfusion
- Cold extremities, compression shorts helpful
- Asymmetric perfusion: right hand PI consistently lower than left (asymmetric peripheral vasoconstriction)`,
    instructions: `Analyze:
- POTS severity in current period
- Orthostatic tolerance trends
- Triggers for severe events
- Recovery time from events
- Compensatory mechanisms working
- Areas of deterioration or improvement
- Treatment optimization opportunities

Cite POTS research (blood volume protocols, compression therapy, exercise rehabilitation, pharmacological options, long COVID POTS specifically). Medication suggestions should be discussed with a cardiologist or autonomic specialist.`,
  },
  {
    id: 'mcas',
    icon: 'cell',
    title: 'MCAS Pattern Analysis',
    desc: 'Histamine reactions, triggers, and MCAS-related symptom patterns.',
    sections: ['symptoms', 'food', 'meds', 'scores'],
    focus: 'Identify mast cell activation patterns and triggers - reactions with timing, potential food/environmental/stress triggers, and treatment effectiveness.',
    context: `CURRENT TREATMENT:
- Allegra 180mg (H1)
- Pepcid (H2)
- Mast cell stabilizer foods (rooibos, quercetin from onion)
- Avoiding high-histamine foods generally

MCAS SYMPTOMS TRACKED: histamine reactions, mucus production with triggers, skin reactions, GI symptoms, headaches, brain fog.`,
    instructions: `Analyze:
- Reaction frequency and severity
- Identified triggers (food, environmental)
- Treatment effectiveness
- Symptom pattern evolution
- Areas needing intervention
- Potential additional treatments to discuss with doctor

Discuss research on MCAS in long COVID, quercetin phytosome, DAO enzyme for dietary histamine, cromolyn sodium, LDN potential benefit, and dietary management. Strongly note that prescription interventions need physician guidance.`,
  },
  {
    id: 'gut',
    icon: 'gut',
    title: 'Gut Health Connection',
    desc: 'Bowel patterns, gut-vagus correlation, and digestive health impacts.',
    sections: ['bm', 'food', 'hrv', 'scores'],
    focus: 'Analyze gut function and its connection to autonomic recovery - bowel movement frequency/quality and correlation with HRV.',
    context: `GUT-VAGUS CONNECTION:
- Bowel movements strongly correlate with HRV improvement
- Caffeine sometimes the only motility trigger
- Roemheld syndrome documented
- Gut motility issues common in long COVID

CURRENT GUT PROTOCOL: Metamucil, prune juice, dandelion tea, rooibos tea, magnesium citrate, sometimes Caramelizer for motility.`,
    instructions: `Analyze:
- Gut motility patterns
- Gut–vagus correlation strength
- Trigger food gut impact
- Roemheld occurrences
- Optimization opportunities
- Patterns needing intervention

Discuss research on the vagus nerve and gut motility, enteric nervous system in long COVID, microbiome and autonomic function, and Roemheld syndrome management. Note prokinetics, nattokinase for microclots, and other interventions require physician discussion.`,
  },
  {
    id: 'balance',
    icon: 'scale',
    title: 'Autonomic Balance Report',
    desc: 'PNS/SNS dynamics, balance trends, and recovery indicators.',
    sections: ['hrv', 'breathStyles', 'scores'],
    focus: 'Detailed analysis of sympathetic vs parasympathetic balance using PNS/SNS indices, LF/HF ratio patterns, and the Baevsky stress index.',
    context: `KEY INDICATORS:
- PNS Index trends
- SNS Index trends
- HF dominance episodes
- LF dominance patterns
- VLF stress signal`,
    instructions: `Analyze:
- Current autonomic balance
- Sympathetic activation patterns
- Parasympathetic engagement quality
- Recovery indicators (HF emerging dominance)
- Stress accumulation patterns
- Balance restoration progress
- Optimization recommendations

Cite autonomic nervous system research relevant to long COVID and dysautonomia.`,
  },
  {
    id: 'symptom',
    icon: 'search',
    title: 'Symptom Investigation',
    desc: 'Deep dive into specific symptoms with potential causes and patterns.',
    sections: ['symptoms', 'hrv', 'bp', 'rhr', 'activities'],
    focus: 'Deep investigation of specific symptoms reported in the period - associated metrics when symptoms occurred and activities preceding them.',
    context: `POTENTIAL EXPLANATIONS TO CONSIDER: long COVID systemic manifestations, POTS-related symptoms, MCAS reactions, Roemheld (gastrocardiac), vestibular migraine, anxiety/sympathetic activation, sleep deprivation effects.`,
    instructions: `Analyze:
- Symptom pattern recognition
- Likely causes for each symptom
- Severity progression
- Triggers identified
- Concerning patterns warranting medical attention
- Self-management strategies
- When to escalate to medical care

Cite relevant research and clearly note when patterns suggest medical evaluation is appropriate.`,
  },
  {
    id: 'optimize',
    icon: 'bulb',
    title: 'Optimization Opportunities',
    desc: 'Evidence-based suggestions for improving your protocol and outcomes.',
    sections: ['meds', 'supplements', 'scores', 'symptoms', 'hrv'],
    focus: "Identify evidence-based opportunities to improve the current protocol and outcomes. Look at what's working, what isn't, and gaps not currently addressed.",
    context: `CONSIDER FOR ENHANCEMENT: quercetin phytosome (mast cell stabilization), DAO enzyme (dietary histamine), nattokinase (microclot research), LDN (low dose naltrexone), vagus nerve stimulation devices, cold/heat therapy protocols, breathing technique refinements, specific supplement adjustments.`,
    instructions: `Analyze:
- Highest-impact optimizations available
- Evidence-based interventions worth exploring
- Current gaps in protocol
- Risk/benefit of each suggestion
- Order of priority for implementation
- Which require physician consultation

Be specific about which interventions are OTC and lower risk, which need physician discussion before starting, which have strong research support, and which are more experimental but promising. Cite long COVID treatment research and dysautonomia management evidence.`,
  },
  {
    id: 'crash',
    icon: 'trendDown',
    title: 'Crash Pattern Analysis',
    desc: 'What precedes crashes and how to prevent them.',
    sections: ['scores', 'hrv', 'activities', 'food', 'symptoms', 'sleep'],
    focus: 'Identify what precedes crashes and how to prevent them. Examine major HRV crashes / bad days, the 24–48 hours of data before each, and recovery time.',
    context: `PATTERN INDICATORS: blue zone preceding crashes, accumulation patterns, single-trigger crashes, multi-trigger compound crashes.`,
    instructions: `Analyze:
- Crash frequency and severity
- Identifiable precipitants
- Warning signs that appear before crashes
- Recovery time patterns
- Prevention strategies
- Early intervention opportunities
- Specific patterns to watch for

Cite research on post-exertional malaise, crash patterns in long COVID, autonomic depletion mechanisms, and pacing strategies.`,
  },
  {
    id: 'bestdays',
    icon: 'star',
    title: 'Best Days Analysis',
    desc: 'What made your best days work and how to replicate them.',
    sections: ['scores', 'sleep', 'food', 'activities', 'hrv', 'cleanDays'],
    focus: 'Determine what made the best days possible and how to replicate them. Identify the top-scoring days and the conditions (sleep, food, activity) in the 48 hours prior.',
    instructions: `Analyze:
- Common factors across best days
- Sequence patterns leading to best days
- Replicable conditions
- Lessons for protocol optimization
- Specific behaviors to repeat
- A best-day formula for this user

Focus on actionable insights rather than just identifying that good days happened.`,
  },
  {
    id: 'meds',
    icon: 'pill',
    title: 'Medication & Supplement Review',
    desc: 'Adherence patterns and apparent effectiveness of current protocol.',
    sections: ['meds', 'supplements', 'scores', 'cleanDays'],
    focus: 'Effectiveness analysis of the current medication and supplement protocol - adherence per item and correlation with metric outcomes.',
    context: `CURRENT PROTOCOL: Allegra 180mg, Pepcid, Magnesium glycinate 200mg evening, B1, CoQ10, Fish oil, Liquid IV, and others as logged.`,
    instructions: `Analyze:
- Apparent effectiveness per item
- Items showing clear benefit
- Items potentially redundant
- Missing items worth considering
- Dosing optimization opportunities
- Timing adjustments worth trying
- Items to discuss with physician

Cite research on each major intervention's evidence base. Note clearly that medication changes need physician approval and supplement therapeutic doses warrant discussion with a healthcare provider.`,
  },
  {
    id: 'stress',
    icon: 'brain',
    title: 'Stress & Recovery Patterns',
    desc: 'Work stress, life events, and recovery capacity analysis.',
    sections: ['activities', 'symptoms', 'hrv', 'scores'],
    focus: 'Analyze how life stressors impact autonomic function and recovery patterns - stress events logged (stressful work, family events), their metric impact, and recovery time to baseline.',
    context: `PATTERNS TO EXAMINE: work stress impact, family obligation impact, social event recovery, stress accumulation, recovery practices effectiveness.`,
    instructions: `Analyze:
- Stress tolerance current level
- Recovery capacity
- Stress accumulation patterns
- Effective recovery practices
- Stress management gaps
- Recommendations for stress reduction

Cite research on chronic stress and autonomic function, particularly in chronic illness recovery.`,
  },
  {
    id: 'longcovid',
    icon: 'virus',
    title: 'Long COVID Recovery Insights',
    desc: 'Where you are in long COVID recovery based on research benchmarks.',
    sections: ['scores', 'hrv', 'symptoms', 'rhr', 'sleep', 'activities'],
    focus: 'Position the user within long COVID recovery research and benchmarks. Compare current state and recovery markers to typical long COVID trajectories.',
    context: `ILLNESS DURATION: 3+ years post-COVID.
RESEARCH BENCHMARKS to consider: median recovery time data, common persistent symptoms, recovery predictors, treatment response patterns.`,
    instructions: `Analyze:
- Position in long COVID recovery spectrum
- Comparison to typical trajectories
- Recovery indicators present
- Persistent issues common to long COVID
- Treatment response assessment
- Realistic outlook based on research
- Emerging treatments to monitor

Heavily cite long COVID research from 2023–2026.`,
  },
  {
    id: 'doctor',
    icon: 'clipboard',
    title: 'Medical Summary For Doctor',
    desc: 'Structured summary suitable for sharing with healthcare providers.',
    sections: ['hrv', 'bp', 'ecg', 'rhr', 'spo2', 'sleep', 'activities', 'symptoms', 'orthostatic', 'meds', 'supplements', 'scores'],
    focus: 'Generate a structured medical summary suitable for sharing with healthcare providers.',
    context: `DIAGNOSED CONDITIONS: Long COVID dysautonomia (3+ years), POTS, MCAS, Roemheld syndrome, suspected vestibular migraine.

CURRENT MEDICATIONS: Allegra 180mg daily; Pepcid as needed; Magnesium glycinate 200mg evening; B1, CoQ10, fish oil; recent: completed cefdinir course, 6 days prednisone 40mg.

RECENT MEDICAL HISTORY: adenovirus + bacterial complication (~3 weeks ago); BP labile event during prednisone (149/93 peak); SVT episode during illness with sexual activity; persistent ear plugging post-illness.`,
    instructions: `Generate a structured summary with:
- Chief complaints
- Relevant history
- Recent metrics with trends
- Symptoms persisting
- Areas of concern
- Questions for physician
- Treatment requests/discussions wanted

Format suitable for printing or sharing electronically with healthcare providers. Professional medical tone while remaining personal.`,
  },
];
