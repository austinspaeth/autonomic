/**
 * AI Insights — ported from the PWA's report catalog + buildPrompt. Generates a
 * copyable analysis prompt from the user's data over a range. Pure text, no
 * network. Sections are rendered as the same [stamp]-prefixed lines.
 */
import { addDays, dateFromKey, fmtNum, fmtTime12, keyOf } from '../dates';
import type { AppState, CustomTypes, DayRecord, Entry } from '../types';
import type { Downturn } from '../scoring/downturn';
import { blueZone, dayCleanliness, scoreSet, sleepHours, type DaysMap } from '../scoring/day';
import { ACTIVITY_TYPES, MED_TYPES, SYMPTOM_TYPES, TRIGGER_TYPES, bmLabel, isDivider } from '../registry';
import { bpBce, bpKerdo, bpKvas, bpMap, bpPP, bpRobinson, numOr, orthoMaxDelta, type ScoreContext } from '../scoring';

export type ReportRange = 'day' | 'week' | 'month' | 'year';

const MED_KEYS = new Set(['allegra', 'pepsidAc', 'gaviscon', 'melatonin']);
const rv = (o: unknown, k: string): unknown => { if (!o || typeof o !== 'object') return null; const x = (o as Record<string, unknown>)[k]; return x === undefined || x === null || x === '' ? null : x; };
const stamp = (k: string, t?: string) => `[${k}${t ? ' ' + fmtTime12(t) : ''}]`;
const noteSuffix = (r: { note?: unknown }) => (r && r.note ? ` | Note: ${r.note}` : '');
/** Optional " | Label: value" segment — emitted only when the field is filled. */
const kv = (o: unknown, label: string, k: string, unit = '') => { const v = rv(o, k); return v == null ? '' : ` | ${label}: ${v}${unit}`; };
const orNone = (lines: string[]) => (lines.length ? lines.join('\n') : '(none recorded)');

export function reportDateRange(range: ReportRange, currentKey: string): { keys: string[]; rangeText: string } {
  const tk = keyOf(new Date());
  const longFmt = (k: string) => dateFromKey(k).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  if (range === 'day') return { keys: [currentKey], rangeText: (currentKey === tk ? 'Today, ' : '') + longFmt(currentKey) };
  const span = range === 'week' ? 7 : range === 'month' ? 30 : 365;
  const start = new Date(); start.setDate(start.getDate() - (span - 1));
  const keys: string[] = [];
  for (let i = 0; i < span; i++) { const d = new Date(start); d.setDate(d.getDate() + i); keys.push(keyOf(d)); }
  const rangeText = range === 'week' ? `Week of ${longFmt(keys[0])} to ${longFmt(tk)}` : range === 'month' ? `Past 30 days (${longFmt(keys[0])} to ${longFmt(tk)})` : `Past 12 months (${longFmt(keys[0])} to ${longFmt(tk)})`;
  return { keys, rangeText };
}

export function entryCount(days: DaysMap, keys: string[]): number {
  let n = 0;
  keys.forEach((k) => { const d = days[k]; if (!d) return; n += (d.readings || []).length + (d.activities || []).length + (d.meds || []).length + (d.symptoms || []).length; if (d.food && d.food.triggers) n += Object.values(d.food.triggers).filter((v) => v > 0).length; n += ((d.digestion && d.digestion.movements) || []).length; if (d.sleep && (d.sleep.bed || d.sleep.wake)) n += 1; });
  return n;
}
export const hasAnyData = (days: DaysMap, keys: string[]) => entryCount(days, keys) > 0;

function eachEntry(days: DaysMap, keys: string[], pick: (d: DayRecord, k: string) => string[]): string[] {
  const out: string[] = [];
  keys.forEach((k) => { const d = days[k]; if (!d) return; pick(d, k).forEach((s) => out.push(s)); });
  return out;
}

/* ---------- section formatters (subset most reports use) ---------- */
function secHRV(days: DaysMap, keys: string[]) {
  // Rare time-domain metrics + the reading period are appended only when filled.
  const hrvExtras = (r: unknown) => kv(r, 'Mean RR', 'meanRr', ' ms') + kv(r, 'MxDMn', 'mxdmn', ' s') + kv(r, 'Mode', 'mode', ' ms') + kv(r, 'AMo50', 'amo50', '%') + kv(r, 'CV', 'cv', '%') + kv(r, 'Reading type', 'period');
  return orNone(eachEntry(days, keys, (d, k) => {
    const out: string[] = [];
    (d.readings || []).forEach((r) => {
      if (r.type !== 'hrv' && r.type !== 'breathHrv') return;
      const vlf = rv(r, 'vlowPower'), lf = rv(r, 'lowPower'), hf = rv(r, 'highPower');
      const total = [vlf, lf, hf].map(Number).filter((n) => !isNaN(n)).reduce((s, n) => s + n, 0);
      const lfn = Number(lf), hfn = Number(hf);
      const lfhf = lf != null && hf != null && !isNaN(lfn) && !isNaN(hfn) && hfn !== 0 ? (lfn / hfn).toFixed(2) : null;
      const head = r.type === 'breathHrv'
        ? `Type: Structured (${rv(r, 'style') ?? '?'}) | HR: ${rv(r, 'hr') ?? '-'}`
        : `Type: ${r.source === 'watch' ? 'Apple Watch' : r.source === 'health' ? 'Imported' : 'Unstructured'} | HR: ${rv(r, 'avgHr') ?? '-'}`;
      out.push(`${stamp(k, r.time as string)} ${head} | RMSSD: ${rv(r, 'rmssd') ?? '-'} | pNN50: ${rv(r, 'pnn50') ?? '-'}% | SDNN: ${rv(r, 'sdnn') ?? '-'} | PNS: ${rv(r, 'pns') ?? '-'} | SNS: ${rv(r, 'sns') ?? '-'} | Stress: ${rv(r, 'stressIndex') ?? '-'} | Power: ${total || '-'} | VLF: ${vlf ?? '-'} | LF: ${lf ?? '-'} | HF: ${hf ?? '-'} | LF/HF: ${lfhf ?? '-'} | LF Peak: ${rv(r, 'lfPeak') ?? '-'} Hz | HF Peak: ${rv(r, 'hfPeak') ?? '-'} Hz${hrvExtras(r)}${noteSuffix(r)}`);
    });
    return out;
  }));
}
const secBP = (days: DaysMap, keys: string[]) => orNone(eachEntry(days, keys, (d, k) => (d.readings || []).filter((r) => r.type === 'bp').map((r) => {
  // Derived circulation indexes (same formulas the reading summary shows),
  // emitted only when their raw inputs are filled.
  const sys = rv(r, 'sys'), dia = rv(r, 'dia'), pulse = rv(r, 'pulse');
  let derived = '';
  if (sys != null && dia != null) derived += ` | MAP: ${fmtNum(bpMap(r))} | Pulse pressure: ${fmtNum(bpPP(r))}`;
  if (dia != null && pulse != null) derived += ` | Kerdo: ${fmtNum(bpKerdo(r))}`;
  if (sys != null && pulse != null) derived += ` | Robinson: ${fmtNum(bpRobinson(r))}`;
  if (sys != null && dia != null && pulse != null) derived += ` | BCE: ${fmtNum(bpBce(r))} | Kvas: ${fmtNum(bpKvas(r))}`;
  return `${stamp(k, r.time as string)} BP: ${sys ?? '-'}/${dia ?? '-'} | Pulse: ${pulse ?? '-'} | Type: ${rv(r, 'period') ?? '-'}${derived}${noteSuffix(r)}`;
})));
const secRHR = (days: DaysMap, keys: string[]) => orNone(eachEntry(days, keys, (d, k) => (d.readings || []).filter((r) => r.type === 'restingHr').map((r) => `${stamp(k, r.time as string)} Position: ${rv(r, 'position') ?? '-'} | HR: ${rv(r, 'hr') ?? '-'}${noteSuffix(r)}`)));
function secSleep(days: DaysMap, keys: string[]) {
  const lines: string[] = [];
  keys.forEach((k) => { const d = days[k]; if (!d || !d.sleep) return; const s = d.sleep; const bed = s.bed || ''; if (!bed && !s.wake && !rv(s, 'hrLow') && !rv(s, 'hrHigh')) return; const hrs = sleepHours(days, k); const st = s.stages; const stages = st ? ` | Stages: Deep ${st.deep}m, REM ${st.rem}m, Core ${st.core}m, Awake ${st.awake}m` : ''; lines.push(`[${k}] Bed last night: ${bed ? fmtTime12(bed) : '-'} | Woke this morning: ${s.wake ? fmtTime12(s.wake) : '-'} | Duration: ${hrs != null ? hrs.toFixed(1) + ' hrs' : '-'} | Quality: ${s.quality === 'interrupted' ? 'Interrupted' : 'Good'} | Low HR: ${rv(s, 'hrLow') ?? '-'} | High HR: ${rv(s, 'hrHigh') ?? '-'}${stages}`); });
  return orNone(lines);
}
const secActivities = (days: DaysMap, keys: string[], custom?: CustomTypes) => orNone(eachEntry(days, keys, (d, k) => (d.activities || []).map((a) => { const def = custom?.activities?.[a.type] || ACTIVITY_TYPES[a.type]; const label = def ? def.label : a.type; const parts: string[] = []; if (def && def.custom === 'bike') { ([['Duration', 'duration', ' min'], ['Distance', 'distance', ' mi'], ['Avg HR', 'avgHr'], ['Max HR', 'maxHr'], ['Min HR', 'minHr'], ['Resistance', 'resistance'], ['HR @60s rest', 'hr60']] as [string, string, string?][]).forEach(([l, key, unit]) => { const v = rv(a, key); if (v != null) parts.push(`${l}: ${v}${unit || ''}`); }); const ivs = (a.intervals as { length?: string; resistance?: string; avgHr?: string; maxHr?: string }[]) || []; if (a.interval && ivs.length) parts.push(`Intervals: ${ivs.map((iv, i) => `#${i + 1} ${iv.length || '-'} min, resistance ${iv.resistance || '-'}, avg HR ${iv.avgHr || '-'}, max HR ${iv.maxHr || '-'}`).join('; ')}`); } else if (def) { (def.fields || []).forEach((f) => { if (isDivider(f) || f.type === 'time' || f.type === 'check' || f.key === 'note') return; const val = rv(a, f.key!); if (val != null) parts.push(`${f.label}: ${val}${f.unit ? f.unit : ''}`); }); (def.fields || []).filter((f) => f.type === 'check' && a[f.key!]).forEach((f) => parts.push(f.label!)); } if (a.note) parts.push(`Note: ${a.note}`); return `${stamp(k, a.time as string)} ${label}${parts.length ? ' | ' + parts.join(' | ') : ''}`; })));
function secTriggers(days: DaysMap, keys: string[], custom?: CustomTypes) {
  const lines: string[] = [];
  const trigLabel = (t: string) => custom?.triggers?.[t]?.label || TRIGGER_TYPES[t]?.label;
  keys.forEach((k) => { const d = days[k]; if (!d || !d.food) return; const trigs = d.food.triggers || {}; const tlist = Object.keys(trigs).filter((t) => trigs[t] > 0 && trigLabel(t)).map((t) => `${trigLabel(t)}${trigs[t] > 1 ? ` x${trigs[t]}` : ''}`); if (tlist.length) lines.push(`[${k}] Triggers: ${tlist.join(', ')}`); const water = d.food.water; if (water > 0) lines.push(`[${k}] Water: ${water} L`); });
  return orNone(lines);
}
const secMeds = (days: DaysMap, keys: string[], supplements: boolean, custom?: CustomTypes) => orNone(eachEntry(days, keys, (d, k) => (d.meds || []).filter((m) => (supplements ? !MED_KEYS.has(m.type) : MED_KEYS.has(m.type))).map((m) => { const label = custom?.meds?.[m.type]?.label || MED_TYPES[m.type]?.label || m.type; const bits: string[] = []; if (m.amount) bits.push(String(m.amount)); if (m.note) bits.push(m.note); return `${stamp(k, m.time as string)} ${label}${bits.length ? ' | ' + bits.join(' | ') : ''}`; })));
const secSymptoms = (days: DaysMap, keys: string[], custom?: CustomTypes) => orNone(eachEntry(days, keys, (d, k) => (d.symptoms || []).map((s) => { const def = custom?.symptoms?.[s.type] || SYMPTOM_TYPES[s.type]; const label = def ? def.label : s.type; const parts: string[] = []; if (def) { (def.fields || []).forEach((f) => { if (isDivider(f) || f.type === 'time' || f.type === 'check' || f.key === 'note') return; const v = rv(s, f.key!); if (v != null) parts.push(`${f.label}: ${v}${f.unit ? f.unit : ''}`); }); (def.fields || []).filter((f) => f.type === 'check' && s[f.key!]).forEach((f) => parts.push(f.label!)); } if (s.note) parts.push(`Note: ${s.note}`); return `${stamp(k, s.time as string)} ${label}${parts.length ? ' | ' + parts.join(' | ') : ''}`; })));
const secNotes = (days: DaysMap, keys: string[]) => orNone(eachEntry(days, keys, (d, k) => (d.notes && d.notes.trim() ? [`[${k}] ${d.notes.trim()}`] : [])));
const secDigestion = (days: DaysMap, keys: string[]) => orNone(eachEntry(days, keys, (d, k) => ((d.digestion && d.digestion.movements) || []).map((m) => `${stamp(k, m.time)} ${bmLabel(m)}${noteSuffix(m)}`)));
const secOrthostatic = (days: DaysMap, keys: string[]) => orNone(eachEntry(days, keys, (d, k) => { const out: string[] = []; (d.readings || []).filter((r) => r.type === 'orthostatic').forEach((r) => out.push(`${stamp(k, r.time as string)} ${rv(r, 'transition') ?? 'Position change'} | Before HR: ${rv(r, 'beforeHr') ?? '-'} | After HR: ${rv(r, 'afterHr') ?? '-'} | HR @1min: ${rv(r, 'hr1min') ?? '-'}${noteSuffix(r)}`)); (d.readings || []).filter((r) => r.type === 'standTest').forEach((r) => out.push(`${stamp(k, r.time as string)} POTS stand test | Baseline HR: ${rv(r, 'baselineHr') ?? '-'} | Peak HR: ${rv(r, 'peakHr') ?? '-'} | Peak Δ: ${rv(r, 'peakDelta') ?? '-'} | Sustained Δ: ${rv(r, 'sustainedDelta') ?? '-'} | Sustained rise ≥30 bpm: ${r.metThreshold ? 'Yes' : 'No'}${kv(r, 'Max HR reached', 'maxHrReached')}${r.endedEarly ? ' | Ended early' : ''}${r.baselineUnstable ? ' | Short resting phase (baseline may be unreliable)' : ''}${noteSuffix(r)}`)); (d.symptoms || []).filter((s) => s.type === 'labileHr').forEach((s) => out.push(`${stamp(k, s.time as string)} High HR event | HR: ${rv(s, 'hr') ?? '-'} | Position: ${rv(s, 'position') ?? '-'}${kv(s, 'HR after 5 min rest', 'hr5')}${noteSuffix(s)}`)); return out; }));

export function makeSectionRenderer(state: AppState, ctx: ScoreContext) {
  const days = state.days;
  const custom = state.customTypes;
  const secScores = (keys: string[]) => { const lines: string[] = []; keys.forEach((k) => { const d = days[k]; if (!d) return; const ss = scoreSet(d.readings || [], d, k, days, ctx); if (ss.score == null) return; lines.push(`[${k}] Autonomic Score: ${ss.score}/100 (confidence ${ss.confidence}%)${blueZone(d.readings || [], ctx) ? ' [BLUE ZONE]' : ''}`); }); return orNone(lines); };
  const secCleanDays = (keys: string[]) => { const lines: string[] = []; keys.forEach((k) => { const c = dayCleanliness(days, k, ctx.protocol, custom); if (!c) return; const missed = c.criteria.filter((x: { pending?: boolean; pass: boolean }) => !x.pending && !x.pass).map((x: { label: string }) => x.label); lines.push(`[${k}] Clean day: ${c.clean ? 'YES' : 'NO'}${missed.length ? ` (missed: ${missed.join(', ')})` : ''}`); }); return orNone(lines); };
  const DEFS: Record<string, [string, (keys: string[]) => string]> = {
    hrv: ['HRV READINGS (structured + unstructured)', (k) => secHRV(days, k)],
    bp: ['BLOOD PRESSURE READINGS', (k) => secBP(days, k)],
    rhr: ['RESTING HEART RATE', (k) => secRHR(days, k)],
    sleep: ['SLEEP DATA', (k) => secSleep(days, k)],
    activities: ['ACTIVITIES', (k) => secActivities(days, k, custom)],
    triggers: ['TRIGGERS & HYDRATION', (k) => secTriggers(days, k, custom)],
    meds: ['MEDICATIONS TAKEN', (k) => secMeds(days, k, false, custom)],
    supplements: ['SUPPLEMENTS TAKEN', (k) => secMeds(days, k, true, custom)],
    symptoms: ['SYMPTOMS NOTED', (k) => secSymptoms(days, k, custom)],
    digestion: ['BOWEL MOVEMENTS', (k) => secDigestion(days, k)],
    orthostatic: ['ORTHOSTATIC / HR EVENTS', (k) => secOrthostatic(days, k)],
    scores: ['DAILY AUTONOMIC SCORES', secScores],
    cleanDays: ['CLEAN DAY STATUS', secCleanDays],
    notes: ['DAILY NOTES', (k) => secNotes(days, k)],
  };
  return (keys: string[], list: string[]) => list.map((key) => { const def = DEFS[key]; return def ? `${def[0]}:\n${def[1](keys)}` : ''; }).filter(Boolean).join('\n\n');
}

export function universalHeader(_state: AppState, rangeText: string): string {
  return `You are analyzing autonomic and recovery health data logged by a person using Autonomic (autonomic.care), a personal health-tracking app for autonomic recovery. Base every observation on the data provided below. Do not assume a diagnosis, age, sex, or medical history that is not present in the data.

Approach this analysis as an honest friend examining the data carefully - direct and accurate without unnecessary softening or cruelty.

REQUIREMENTS: Be concise, accurate, honest, specific (use actual numbers), research-grounded, and careful with recommendations (note doctor consultation for medications, therapeutic-dose supplements, or major protocol changes). Do not use em dashes anywhere in your response; use commas, colons, parentheses, or separate sentences instead.

STRUCTURE YOUR RESPONSE: Analysis; Trends Identified; Recovery Position; Projections; Recommendations; Citations.

PERIOD ANALYZED: ${rangeText}`;
}

export interface ReportCard { id: string; icon: string; title: string; desc: string; sections: string[]; focus: string; context?: string; instructions?: string }

export const REPORT_CARDS: ReportCard[] = [
  { id: 'overall', icon: 'chart', title: 'Overall Health Report', desc: 'One complete report covering every tracked area, with trends and recommendations.', sections: ['hrv', 'bp', 'rhr', 'sleep', 'activities', 'triggers', 'meds', 'supplements', 'symptoms', 'digestion', 'orthostatic', 'scores', 'cleanDays'], focus: 'Provide a comprehensive, well-structured analysis covering every tracked area of health for this period and how they interact.', instructions: 'Produce one well-organized report that addresses each of these areas as its own clearly labeled section, in this order: (1) HRV and autonomic function; (2) Recovery trajectory and realistic timeline; (3) Triggers and setbacks; (4) Sleep and its next-day impact; (5) Cardiovascular function (BP, resting HR, orthostatic response); (6) POTS and orthostatic patterns; (7) MCAS and histamine patterns; (8) Crash patterns and how to prevent them; (9) Best days and what made them work; (10) Long COVID recovery position versus research benchmarks. For each area, use the actual numbers, note the trend, and give specific recommendations. Skip any area that has no supporting data rather than speculating. Close with an integrated summary of what is working, what is not, and the top priorities.' },
  { id: 'hrv', icon: 'heartPulse', title: 'HRV Deep Dive', desc: 'Autonomic analysis: RMSSD, power distribution, frequency peaks.', sections: ['hrv', 'scores'], focus: 'Deep analysis of autonomic nervous system function based on HRV data.', context: 'General reference: the LF (baroreflex) peak is typically targeted around 0.08–0.10 Hz.', instructions: 'Analyze current autonomic function, recovery trajectory, baroreflex training, imbalances. Cite HRV research.' },
  { id: 'trajectory', icon: 'trendUp', title: 'Recovery Trajectory', desc: 'Where you are in recovery and projected timeline.', sections: ['scores', 'hrv', 'rhr', 'sleep', 'symptoms', 'activities', 'cleanDays'], focus: 'Analyze position in long COVID recovery and provide realistic projections.', instructions: 'Position in recovery, markers achieved/needed, realistic timeline, accelerating/slowing factors. Cite recovery research.' },
  { id: 'triggers', icon: 'triangle', title: 'Trigger Analysis', desc: 'Trigger exposures, activities and patterns causing setbacks.', sections: ['triggers', 'activities', 'symptoms', 'digestion', 'hrv', 'scores'], focus: 'Identify specific triggers causing setbacks based on data patterns.', instructions: 'Identify triggers, magnitude, recovery time, compound effects. Cite relevant histamine/MCAS research where the data supports it.' },
  { id: 'sleep', icon: 'moon', title: 'Sleep Impact Report', desc: 'How sleep patterns affect autonomic function.', sections: ['sleep', 'hrv', 'scores'], focus: 'Correlate each night with the next morning HRV and the day score.', instructions: 'Sleep quality patterns, next-day impact, optimal parameters. Cite sleep/HRV research.' },
  { id: 'cardio', icon: 'heart', title: 'Cardiovascular Analysis', desc: 'BP, HR and orthostatic patterns.', sections: ['bp', 'rhr', 'orthostatic', 'activities'], focus: 'Analyze cardiovascular function from BP, HR and orthostatic responses.', instructions: 'BP regulation, HR response, orthostatic function, exercise tolerance. Cite POTS/dysautonomia research.' },
  { id: 'pots', icon: 'standing', title: 'POTS/Orthostatic Patterns', desc: 'Orthostatic events and POTS severity.', sections: ['orthostatic', 'rhr', 'bp', 'symptoms'], focus: 'Examine orthostatic responses and POTS-related patterns.', context: 'POTS indicators: HR increase >30 bpm standing; asymmetric perfusion.', instructions: 'POTS severity, tolerance trends, triggers, recovery time. Cite POTS research; medication suggestions need a specialist.' },
  { id: 'mcas', icon: 'cell', title: 'MCAS Pattern Analysis', desc: 'Histamine reactions and MCAS symptom patterns.', sections: ['symptoms', 'triggers', 'digestion', 'meds', 'scores'], focus: 'Identify mast cell activation patterns and triggers.', instructions: 'Reaction frequency/severity, triggers, and any treatment effectiveness visible in the data. Discuss MCAS research; prescriptions need physician guidance.' },
  { id: 'crash', icon: 'trendDown', title: 'Crash Pattern Analysis', desc: 'What precedes crashes and how to prevent them.', sections: ['scores', 'hrv', 'activities', 'triggers', 'symptoms', 'sleep'], focus: 'Identify what precedes crashes and how to prevent them.', instructions: 'Crash precipitants, warning signs, recovery time, prevention. Cite PEM/pacing research.' },
  { id: 'bestdays', icon: 'star', title: 'Best Days Analysis', desc: 'What made your best days work.', sections: ['scores', 'sleep', 'triggers', 'activities', 'hrv', 'cleanDays'], focus: 'Determine what made the best days possible and how to replicate them.', instructions: 'Common factors, replicable conditions, a best-day formula. Focus on actionable insights.' },
  { id: 'longcovid', icon: 'virus', title: 'Long COVID Recovery Insights', desc: 'Where you are vs research benchmarks.', sections: ['scores', 'hrv', 'symptoms', 'rhr', 'sleep', 'activities'], focus: 'Position within long COVID recovery research and benchmarks.', instructions: 'Position in spectrum, comparison to trajectories, outlook. Heavily cite 2023–2026 research.' },
  { id: 'doctor', icon: 'clipboard', title: 'Medical Summary For Doctor', desc: 'A print-ready clinical document (PDF) with your data in tables, ready to share with your doctor.', sections: ['hrv', 'bp', 'rhr', 'sleep', 'symptoms', 'digestion', 'orthostatic', 'meds', 'supplements', 'scores'], focus: 'Generate a structured medical summary suitable for sharing with providers.', instructions: 'Summarize recent metrics/trends, persisting symptoms, and notable concerns from the data, plus questions for a physician. Professional tone; do not assert diagnoses not present in the data.' },
];

/** Every data section, in a stable order — used by the "Data export only" item. */
const ALL_SECTION_KEYS = ['scores', 'hrv', 'bp', 'rhr', 'sleep', 'orthostatic', 'activities', 'triggers', 'meds', 'supplements', 'symptoms', 'digestion', 'cleanDays', 'notes'];

/**
 * Raw data export: just the rendered data sections for the period, with no
 * prompt framing (no persona, focus, or instructions) — the numbers only.
 */
export function buildDataExport(state: AppState, ctx: ScoreContext, range: ReportRange, currentKey: string): string {
  const { keys: allKeys, rangeText } = reportDateRange(range, currentKey);
  const keys = allKeys.filter((k) => state.days[k]).sort();
  const render = makeSectionRenderer(state, ctx);
  return `DATA EXPORT\nSOURCE: Autonomic (autonomic.care), a personal health-tracking app for autonomic recovery\nPERIOD: ${rangeText}\n\n${render(keys, ALL_SECTION_KEYS)}`;
}

/**
 * Investigation prompt behind the Outlook downturn warning: the last two weeks
 * of every data section, the detected slide, and a structured ask to rank what
 * could explain the drop (oncoming sickness, triggers, overexertion, sleep,
 * protocol, stress) with evidence for and against each.
 */
export function buildDownturnPrompt(state: AppState, ctx: ScoreContext, dk: string, w: Downturn): { prompt: string; rangeText: string } {
  const DAYS = 14;
  const start = addDays(dk, -(DAYS - 1));
  const longFmt = (k: string) => dateFromKey(k).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const rangeText = `Past ${DAYS} days (${longFmt(start)} to ${longFmt(dk)})`;
  const allKeys: string[] = [];
  for (let i = 0; i < DAYS; i++) allKeys.push(addDays(start, i));
  const keys = allKeys.filter((k) => state.days[k]);
  const render = makeSectionRenderer(state, ctx);

  const findings = w.factors.length
    ? w.factors.map((f) => `- ${f.label} (${f.value}): ${f.detail}`).join('\n')
    : '- Nothing found: no triggers, protocol breaks, heavy activity, or short sleep were logged in the slide window.';

  return {
    rangeText,
    prompt: `You are analyzing autonomic and recovery health data logged by a person using Autonomic (autonomic.care), a personal health-tracking app for autonomic recovery. Base every observation on the data provided below. Do not assume a diagnosis, age, sex, or medical history that is not present in the data.

Approach this analysis as an honest friend examining the data carefully - direct and accurate without unnecessary softening or cruelty.

REQUIREMENTS: Be concise, accurate, honest, specific (use actual numbers), research-grounded, and careful with recommendations (note doctor consultation for medications, therapeutic-dose supplements, or major protocol changes). Do not use em dashes anywhere in your response; use commas, colons, parentheses, or separate sentences instead.

SITUATION: The app's trend detection flagged a downturn ending ${longFmt(dk)}. The daily autonomic score fell about ${w.drop} points below its recent baseline over roughly ${w.spanDays} days (severity: ${w.severity === 'alert' ? 'high' : 'moderate'}). The app scanned the slide window and found:
${findings}

FOCUS: Work out what is most likely driving this drop. Examine ALL of the data below, not just the flagged window: compare the slide days against the earlier baseline days, and look for patterns the simple scan above cannot see (delayed trigger effects, cumulative load, circadian drift, subtle vital-sign shifts).

ANALYSIS REQUESTED:
1. THE SLIDE IN NUMBERS: Describe what actually changed across the slide days versus baseline: HRV (RMSSD, power, frequency balance), resting HR, BP, sleep, symptoms. Use the actual values.
2. CANDIDATE EXPLANATIONS, RANKED: Evaluate each hypothesis with the evidence for and against it from the data: (a) oncoming illness or infection; (b) trigger exposure, including delayed or cumulative effects from before the window; (c) overexertion or post-exertional response; (d) sleep debt or disrupted sleep; (e) protocol lapses; (f) stress or other unlogged load. Name the most likely explanation and say how confident the data lets you be.
3. SICKNESS CHECK: Autonomic shifts often precede symptoms. State which specific markers in this data do or do not look like a prodromal illness pattern (for example rising resting and sleeping HR, falling HRV with no matching load, worsening despite clean behavior).
4. WHAT TO WATCH: The 2 or 3 measurements over the next 48 to 72 hours that would best confirm or rule out your leading explanation, with the thresholds that would change the verdict.
5. WHAT TO DO NOW: Concrete rest-first guidance for the next few days, sized to the severity above. Note explicitly when symptoms or readings would warrant contacting a doctor.

DATA FOR PERIOD (${rangeText}):

${render(keys, ['scores', 'hrv', 'rhr', 'bp', 'sleep', 'activities', 'triggers', 'meds', 'supplements', 'symptoms', 'digestion', 'orthostatic', 'cleanDays', 'notes'])}`,
  };
}

/** Age in whole years from the profile birthday (never the raw date), or null. */
function profileAge(profile: AppState['profile']): number | null {
  if (!profile || !profile.birthday) return null;
  const b = new Date(profile.birthday);
  if (isNaN(b.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--;
  return a >= 0 && a < 130 ? a : null;
}

/**
 * Single-event insight prompt behind "Get AI Insights" on the POTS deep dives
 * (orthostatic episode + guided stand test): every recorded field of the one
 * event, the HR trace when captured (downsampled), and the recent orthostatic
 * history for trend context, with a structured ask to judge the event against
 * the POTS-range criteria and explain what the response pattern suggests.
 */
export function buildEventInsightPrompt(
  days: DaysMap, profile: AppState['profile'], r: Entry, dk: string,
  hrCurve?: { t: number; bpm: number }[] | null,
): { prompt: string; rangeText: string } {
  const isTest = r.type === 'standTest';
  const longFmt = (k: string) => dateFromKey(k).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const rangeText = `${longFmt(dk)}${r.time ? ' · ' + fmtTime12(r.time as string) : ''}`;
  const signed = (v: number) => (v > 0 ? `+${v}` : String(v));
  const line = (label: string, v: unknown, unit = '') => (v == null || v === '' ? null : `${label}: ${v}${unit}`);

  const SOURCE: Record<string, string> = { polar: 'Bluetooth heart-rate strap', watch: 'Apple Watch', camera: 'Phone-camera PPG', manual: 'Manual entry', health: 'Imported from the platform health store' };
  const source = (r.sourceName as string) || (r.source ? SOURCE[r.source as string] : null);

  let lines: (string | null)[];
  if (isTest) {
    const peakDelta = numOr(r.peakDelta), sustained = numOr(r.sustainedDelta);
    lines = [
      line('Supine baseline HR (last two minutes lying down)', numOr(r.baselineHr), ' bpm'),
      line('Peak standing HR', numOr(r.peakHr), ' bpm'),
      line('Largest single rise above baseline (peak delta)', peakDelta != null ? signed(peakDelta) : null, ' bpm'),
      line('Sustained rise (final-minute standing average vs baseline)', sustained != null ? signed(sustained) : null, ' bpm'),
      `App flag - sustained rise of 30 bpm or more: ${r.metThreshold ? 'Yes' : 'No'}`,
      line('Max HR reached during the test', numOr(r.maxHrReached), ' bpm'),
      r.endedEarly ? 'The test was ended early' : null,
      r.baselineUnstable ? 'Short resting phase: the baseline may be unreliable' : null,
      line('Capture source', source),
      line('User note', r.note),
    ];
  } else {
    const before = numOr(r.beforeHr), after = numOr(r.afterHr), min1 = numOr(r.hr1min);
    const maxDelta = orthoMaxDelta(r, hrCurve && hrCurve.length >= 2 ? hrCurve : null);
    const rec = after != null && min1 != null ? min1 - after : null;
    lines = [
      line('Transition', (rv(r, 'transition') as string) ?? 'Position change'),
      line('HR before (pre-episode baseline)', before, ' bpm'),
      line('HR during the episode', after, ' bpm'),
      line('HR one minute after', min1, ' bpm'),
      line('Max change from baseline', maxDelta != null ? signed(maxDelta) : null, ' bpm'),
      line('Recovery delta (HR at one minute vs during; negative means it settled back down)', rec != null ? signed(rec) : null, ' bpm'),
      line('Capture source', source),
      line('User note', r.note),
    ];
  }

  // The per-second HR trace, thinned to ~150 points so the prompt stays small.
  let curveBlock = '';
  if (hrCurve && hrCurve.length >= 2) {
    const step = Math.max(1, Math.ceil(hrCurve.length / 150));
    const pts = hrCurve.filter((_, i) => i % step === 0).map((s) => `${Math.round(s.t)}s:${s.bpm}`).join(', ');
    const markers = (isTest
      ? [line('Stood up at', numOr(r.standAt), 's')]
      : [line('Episode began at', numOr(r.transitionAt), 's'), line('Transition completed at', numOr(r.completedAt), 's')]
    ).filter(Boolean).join(' | ');
    curveBlock = `\n\nHEART-RATE TRACE (seconds from start : bpm${step > 1 ? `, showing 1 of every ${step} samples` : ''}; total length ${Math.round(hrCurve[hrCurve.length - 1].t)}s):\n${markers ? markers + '\n' : ''}${pts}`;
  }

  // Same-kind results from the surrounding month, so one event is never read
  // in isolation (trends matter more than any single episode).
  const HIST_DAYS = 30;
  const histKeys: string[] = [];
  for (let i = 0; i < HIST_DAYS; i++) histKeys.push(addDays(dk, -(HIST_DAYS - 1) + i));
  const hist = secOrthostatic(days, histKeys.filter((k) => days[k]));

  const age = profileAge(profile);
  const who = [age != null ? `Age: ${age}` : '', profile && profile.sex ? `Sex: ${profile.sex}` : ''].filter(Boolean).join(' | ');
  const eventName = isTest
    ? 'guided POTS stand test (a timed lie-then-stand heart-rate test)'
    : 'orthostatic episode (a logged heart-rate event around a position change)';

  return {
    rangeText,
    prompt: `You are analyzing a single ${eventName} recorded on ${rangeText} by a person using Autonomic (autonomic.care), a personal health-tracking app for autonomic recovery. Base every observation on the data provided below. Do not assume a diagnosis or medical history that is not present in the data.

Approach this as an honest friend examining the data carefully - direct and accurate without unnecessary softening or cruelty.

REQUIREMENTS: Be concise, accurate, honest, specific (use actual numbers), research-grounded, and careful with recommendations (note doctor consultation for medications, therapeutic-dose supplements, or major protocol changes). Do not use em dashes anywhere in your response; use commas, colons, parentheses, or separate sentences instead.

REFERENCE CRITERIA: The common adult POTS-range criterion is a sustained heart-rate rise of 30 bpm or more (40 or more for ages 12 to 19) within 10 minutes of standing, without the blood-pressure drop that defines orthostatic hypotension. This capture is heart-rate only: it contains no blood-pressure data, so orthostatic hypotension can be neither confirmed nor ruled out here. A single event is a data point, not a diagnosis; trends across repeated events under similar conditions matter most.
${who ? `\nPROFILE (self-entered): ${who}\n` : ''}
EVENT DATA:
${lines.filter(Boolean).join('\n')}${curveBlock}

RECENT ORTHOSTATIC HISTORY (past 30 days, includes this event):
${hist}

ANALYSIS REQUESTED:
1. THE EVENT IN NUMBERS: Walk through what was recorded: baseline, the rise, the peak, and how the heart rate settled. Use the actual values.
2. CRITERIA CHECK: State clearly whether this ${isTest ? 'test' : 'episode'} meets, approaches, or stays below the POTS-range criterion above, and exactly what a single heart-rate-only result can and cannot establish.
3. RESPONSE PATTERN: What the shape of the response suggests (speed of the rise, peak timing, whether and how quickly it settled, and the trace shape if provided). Also weigh benign or situational explanations worth considering, such as deconditioning, dehydration, heat, a recent meal, anxiety, illness, or medication effects.
4. TREND: Compare this event against the recent history above. Is the response better, worse, or consistent, and what does the pattern across events suggest?
5. WHAT TO DO NEXT: How to repeat the measurement under similar conditions for a fair comparison, what context is worth logging alongside it, and which specific findings here would be worth bringing to a doctor.

End your response by reminding the user that this is not a medical diagnosis, and that they should talk with their doctor if they are concerned or if symptoms persist or worsen.`,
  };
}

/**
 * The "Medical Summary For Doctor" report. Unlike the other cards this does not
 * route through universalHeader's "honest friend" persona: it asks the AI to
 * build a polished, print-ready clinical document (ideally a PDF artifact) that
 * a patient can hand to their physician, with the data laid out in scannable
 * tables. Neutral clinical tone, observations only, no diagnoses.
 */
export function buildDoctorPrompt(state: AppState, ctx: ScoreContext, range: ReportRange, currentKey: string): string {
  const { keys: allKeys, rangeText } = reportDateRange(range, currentKey);
  const keys = allKeys.filter((k) => state.days[k]).sort();
  const render = makeSectionRenderer(state, ctx);
  const sections = ['scores', 'hrv', 'bp', 'rhr', 'orthostatic', 'sleep', 'symptoms', 'digestion', 'meds', 'supplements', 'notes'];
  const sparse = hasAnyData(state.days, keys) && entryCount(state.days, keys) < 4 ? '\nNOTE: Limited data was logged for this period, so keep the document brief and flag the small sample.\n' : '';

  // Self-entered demographics give the clinician context; age is derived from
  // the birthday so the document never has to show a raw date of birth.
  const prof = state.profile || ({} as AppState['profile']);
  const a = profileAge(prof);
  const demographics = [a != null ? `Age: ${a}` : '', prof.sex ? `Sex: ${prof.sex}` : '', prof.height ? `Height: ${prof.height}` : '', prof.weight ? `Weight: ${prof.weight}` : ''].filter(Boolean).join(' | ') || 'not provided';

  return `You are a clinical health writer preparing a concise, professional medical summary for a physician. The data below was self-tracked by a patient using Autonomic (autonomic.care), a personal app for autonomic recovery (dysautonomia, POTS, long COVID, ME/CFS style presentations), captured with consumer devices: phone-camera or chest-strap PPG for HRV, a home blood-pressure cuff, and wearable sleep tracking. Base every statement strictly on the data provided. Do not invent, assume, or diagnose anything that is not present in the data.

YOUR OUTPUT: Produce a polished, print-ready clinical summary DOCUMENT the patient can hand to or email their doctor. Create it as a downloadable artifact, preferably a PDF; if PDF generation is unavailable, produce a clean, print-styled HTML document sized for US Letter. It must look professional: clear typographic hierarchy, restrained color, generous white space, and DATA PRESENTED IN TABLES wherever possible so a busy clinician can scan it in under two minutes. Right-align numeric columns and keep tables clean with subtle rules, not heavy borders.

TONE & RULES: Neutral, clinical, and objective. Report measured values and observed patterns, not diagnoses or treatment advice. Use standard medical shorthand (HRV, RMSSD, SDNN, pNN50, LF/HF, RHR, SBP/DBP, MAP, bpm). Convert the [YYYY-MM-DD] stamps into readable dates. Where a metric has a widely accepted reference range you may include a clearly labeled reference column, but do NOT characterize the patient's values as normal or abnormal beyond what the data plainly shows. Do not use em dashes; use commas, colons, parentheses, or separate sentences.

DOCUMENT STRUCTURE (each item a titled section; use tables unless noted):
1. HEADER: Title "Patient Health Tracking Summary", the reporting period (${rangeText}), the date prepared, a "Patient (self-entered): ${demographics}" line, and a one-line note that the data is patient self-tracked with consumer devices.
2. AT A GLANCE: A short bulleted clinical snapshot (5 to 8 bullets) of the most decision-relevant findings: predominant symptoms, the autonomic/HRV trend, resting HR and BP behavior, orthostatic findings, sleep, and any red flags. This is read first, so lead with what matters most.
3. VITALS & AUTONOMIC METRICS: A table with columns Metric | Latest | Period Avg | Range (min to max) | Readings (n) | Trend. Include a row for every metric with data: HRV RMSSD, SDNN, pNN50, LF/HF, resting HR (split by position when available), systolic BP, diastolic BP, MAP, pulse pressure, sleeping HR (low/high), and the daily autonomic score. Compute the averages, ranges, and counts from the readings below; show trend as a short arrow or word (rising, stable, falling).
4. ORTHOSTATIC / POTS ASSESSMENT: A table of every stand test and orthostatic reading: Date | Baseline HR | Peak HR | Peak delta (bpm) | Sustained delta (bpm) | Sustained rise >=30 bpm | Notes. Follow it with one neutral line stating whether the recorded responses meet the common orthostatic tachycardia threshold (sustained HR rise >=30 bpm on standing, >=40 bpm if under 20 years old), without rendering a diagnosis.
5. SYMPTOM SUMMARY: A table Symptom | Occurrences | Typical severity | Dates / pattern | Notes, most frequent first.
6. SLEEP SUMMARY: A table of nightly duration, quality, HR range, and stages when present, plus a one-line period average.
7. MEDICATIONS & SUPPLEMENTS: A table Name | Dose / amount | How often logged | Notes.
8. TRENDS & TRAJECTORY: A brief objective narrative (3 to 6 sentences) of how the metrics moved across the period, using actual numbers. Observations only, no advice.
9. QUESTIONS FOR THE VISIT: A short bulleted list of specific, data-grounded questions the patient may want to raise (for example about an orthostatic finding, an HRV trend, or a symptom cluster). Phrase them as the patient's questions, not as clinical recommendations.
10. METHODOLOGY & LIMITATIONS: A brief closing footnote naming the data source and noting that consumer-device measurements and self-reported symptoms have accuracy limits and are not a substitute for clinical measurement.

Omit any section or table row that has no supporting data rather than showing blanks or speculating. Keep the finished document tight enough to print on two to three pages.
${sparse}
PATIENT-TRACKED DATA (${rangeText}):

${render(keys, sections)}`;
}

export function buildPrompt(state: AppState, ctx: ScoreContext, cards: ReportCard[], range: ReportRange, currentKey: string): string {
  const { keys: allKeys, rangeText } = reportDateRange(range, currentKey);
  const keys = allKeys.filter((k) => state.days[k]).sort();
  const render = makeSectionRenderer(state, ctx);
  const header = universalHeader(state, rangeText);
  const sparse = hasAnyData(state.days, keys) && entryCount(state.days, keys) < 4 ? '\n\nNOTE: Limited data available for this period, analysis may be less comprehensive.\n' : '';
  if (cards.length === 1) {
    const card = cards[0];
    let body = `FOCUS: ${card.focus}`;
    if (card.context) body += `\n\n${card.context}`;
    body += `\n\nDATA FOR PERIOD:\n\n${render(keys, [...card.sections, 'notes'])}`;
    if (card.instructions) body += `\n\n${card.instructions}`;
    return `${header}${sparse}\n\n${body}`;
  }
  const sectionKeys: string[] = [];
  cards.forEach((c) => c.sections.forEach((s) => { if (!sectionKeys.includes(s)) sectionKeys.push(s); }));
  sectionKeys.push('notes');
  const titles = cards.map((c) => c.title);
  const intro = `This is a CUSTOM, MULTI-PART report covering ${cards.length} focus areas:\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nAddress each as its own labeled section, in order. The shared data below covers all areas. End with an integrated summary.`;
  const data = `SHARED DATA FOR PERIOD:\n\n${render(keys, sectionKeys)}`;
  const focusBlocks = cards.map((c, i) => { let b = `=== ${i + 1}. ${c.title.toUpperCase()} ===\nFOCUS: ${c.focus}`; if (c.context) b += `\n\n${c.context}`; if (c.instructions) b += `\n\nANALYSIS REQUESTED:\n${c.instructions}`; return b; }).join('\n\n');
  return `${header}${sparse}\n\n${intro}\n\n${data}\n\nFOCUS AREAS:\n\n${focusBlocks}`;
}
