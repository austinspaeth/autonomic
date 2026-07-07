/**
 * AI Insights — ported from the PWA's report catalog + buildPrompt. Generates a
 * copyable analysis prompt from the user's data over a range. Pure text, no
 * network. Sections are rendered as the same [stamp]-prefixed lines.
 */
import { dateFromKey, fmtTime12, keyOf } from '../dates';
import type { AppState, DayRecord } from '../types';
import { blueZone, dayCleanliness, scoreSet, sleepHours, type DaysMap } from '../scoring/day';
import { ACTIVITY_TYPES, MED_TYPES, SYMPTOM_TYPES, TRIGGER_TYPES, isDivider } from '../registry';
import type { ScoreContext } from '../scoring';

export type ReportRange = 'day' | 'week' | 'month' | 'year';

const MED_KEYS = new Set(['allegra', 'pepsidAc', 'gaviscon', 'melatonin']);
const rv = (o: unknown, k: string): unknown => { if (!o || typeof o !== 'object') return null; const x = (o as Record<string, unknown>)[k]; return x === undefined || x === null || x === '' ? null : x; };
const stamp = (k: string, t?: string) => `[${k}${t ? ' ' + fmtTime12(t) : ''}]`;
const noteSuffix = (r: { note?: unknown }) => (r && r.note ? ` | Note: ${r.note}` : '');
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
  return orNone(eachEntry(days, keys, (d, k) => {
    const out: string[] = [];
    (d.readings || []).forEach((r) => {
      if (r.type === 'hrv') out.push(`${stamp(k, r.time as string)} Type: ${r.source === 'watch' ? 'Apple Watch' : 'Unstructured'} | HR: ${rv(r, 'avgHr') ?? '-'} | RMSSD: ${rv(r, 'rmssd') ?? '-'} | pNN50: ${rv(r, 'pnn50') ?? '-'} | SDNN: ${rv(r, 'sdnn') ?? '-'} | PNS: ${rv(r, 'pns') ?? '-'} | SNS: ${rv(r, 'sns') ?? '-'} | Stress: ${rv(r, 'stressIndex') ?? '-'} | VLF: ${rv(r, 'vlowPower') ?? '-'} | LF: ${rv(r, 'lowPower') ?? '-'} | HF: ${rv(r, 'highPower') ?? '-'}${noteSuffix(r)}`);
      if (r.type === 'breathHrv') { const vlf = rv(r, 'vlowPower'), lf = rv(r, 'lowPower'), hf = rv(r, 'highPower'); const total = [vlf, lf, hf].map(Number).filter((n) => !isNaN(n)).reduce((s, n) => s + n, 0); out.push(`${stamp(k, r.time as string)} Type: Structured (${rv(r, 'style') ?? '?'}) | HR: ${rv(r, 'hr') ?? '-'} | RMSSD: ${rv(r, 'rmssd') ?? '-'} | pNN50: ${rv(r, 'pnn50') ?? '-'}% | SDNN: ${rv(r, 'sdnn') ?? '-'} | Power: ${total || '-'} | VLF: ${vlf ?? '-'} | LF: ${lf ?? '-'} | HF: ${hf ?? '-'} | LF Peak: ${rv(r, 'lfPeak') ?? '-'} Hz | HF Peak: ${rv(r, 'hfPeak') ?? '-'} Hz${noteSuffix(r)}`); }
    });
    return out;
  }));
}
const secBP = (days: DaysMap, keys: string[]) => orNone(eachEntry(days, keys, (d, k) => (d.readings || []).filter((r) => r.type === 'bp').map((r) => `${stamp(k, r.time as string)} BP: ${rv(r, 'sys') ?? '-'}/${rv(r, 'dia') ?? '-'} | Pulse: ${rv(r, 'pulse') ?? '-'} | Type: ${rv(r, 'period') ?? '-'}${noteSuffix(r)}`)));
const secECG = (days: DaysMap, keys: string[]) => orNone(eachEntry(days, keys, (d, k) => (d.readings || []).filter((r) => r.type === 'ecg').map((r) => { const rhythm = [r.sinus && 'Sinus', r.svt && 'SVT', r.otherArrhythmia && 'Other arrhythmia'].filter(Boolean).join(', ') || '-'; return `${stamp(k, r.time as string)} QTc: ${rv(r, 'qtc') ?? '-'} | QRS: ${rv(r, 'qrs') ?? '-'} | PR: ${rv(r, 'pr') ?? '-'} | HR: ${rv(r, 'hr') ?? '-'} | Ectopics: ${rv(r, 'ectopic') ?? '-'} | Rhythm: ${rhythm}${noteSuffix(r)}`; })));
const secRHR = (days: DaysMap, keys: string[]) => orNone(eachEntry(days, keys, (d, k) => (d.readings || []).filter((r) => r.type === 'restingHr').map((r) => `${stamp(k, r.time as string)} Position: ${rv(r, 'position') ?? '-'} | HR: ${rv(r, 'hr') ?? '-'}${noteSuffix(r)}`)));
function secSleep(days: DaysMap, keys: string[]) {
  const lines: string[] = [];
  keys.forEach((k) => { const d = days[k]; if (!d || !d.sleep) return; const s = d.sleep; const bed = s.bed || ''; if (!bed && !s.wake && !rv(s, 'hrLow') && !rv(s, 'hrHigh')) return; const hrs = sleepHours(days, k); lines.push(`[${k}] Bed last night: ${bed ? fmtTime12(bed) : '-'} | Woke this morning: ${s.wake ? fmtTime12(s.wake) : '-'} | Duration: ${hrs != null ? hrs.toFixed(1) + ' hrs' : '-'} | Quality: ${s.quality === 'interrupted' ? 'Interrupted' : 'Good'} | Low HR: ${rv(s, 'hrLow') ?? '-'} | High HR: ${rv(s, 'hrHigh') ?? '-'}`); });
  return orNone(lines);
}
const secActivities = (days: DaysMap, keys: string[]) => orNone(eachEntry(days, keys, (d, k) => (d.activities || []).map((a) => { const def = ACTIVITY_TYPES[a.type]; const label = def ? def.label : a.type; const parts: string[] = []; if (def && def.custom === 'bike') { if (def.summary) { const sm = def.summary(a); if (sm) parts.push(sm); } if (def.detail) { const dt = def.detail(a); if (dt) parts.push(dt); } } else if (def) { (def.fields || []).forEach((f) => { if (isDivider(f) || f.type === 'time' || f.type === 'textarea' || f.type === 'check') return; const val = rv(a, f.key!); if (val != null) parts.push(`${f.label}: ${val}${f.unit ? f.unit : ''}`); }); (def.fields || []).filter((f) => f.type === 'check' && a[f.key!]).forEach((f) => parts.push(f.label!)); } if (a.note) parts.push(`Note: ${a.note}`); return `${stamp(k, a.time as string)} ${label}${parts.length ? ' | ' + parts.join(' | ') : ''}`; })));
function secTriggers(days: DaysMap, keys: string[]) {
  const lines: string[] = [];
  keys.forEach((k) => { const d = days[k]; if (!d || !d.food) return; const trigs = d.food.triggers || {}; const tlist = Object.keys(trigs).filter((t) => trigs[t] > 0 && TRIGGER_TYPES[t]).map((t) => `${TRIGGER_TYPES[t].label}${trigs[t] > 1 ? ` x${trigs[t]}` : ''}`); if (tlist.length) lines.push(`[${k}] Triggers: ${tlist.join(', ')}`); const water = d.food.water; if (water > 0) lines.push(`[${k}] Water: ${water} L`); });
  return orNone(lines);
}
const secMeds = (days: DaysMap, keys: string[], supplements: boolean) => orNone(eachEntry(days, keys, (d, k) => (d.meds || []).filter((m) => (supplements ? !MED_KEYS.has(m.type) : MED_KEYS.has(m.type))).map((m) => { const label = MED_TYPES[m.type] ? MED_TYPES[m.type].label : m.type; const bits: string[] = []; if (m.amount) bits.push(String(m.amount)); if (m.note) bits.push(m.note); return `${stamp(k, m.time as string)} ${label}${bits.length ? ' | ' + bits.join(' | ') : ''}`; })));
const secSymptoms = (days: DaysMap, keys: string[]) => orNone(eachEntry(days, keys, (d, k) => (d.symptoms || []).map((s) => { const def = SYMPTOM_TYPES[s.type]; const label = def ? def.label : s.type; const parts: string[] = []; if (def) (def.fields || []).forEach((f) => { if (isDivider(f) || f.type === 'time' || f.type === 'textarea') return; const v = rv(s, f.key!); if (v != null) parts.push(`${f.label}: ${v}`); }); if (s.note) parts.push(`Note: ${s.note}`); return `${stamp(k, s.time as string)} ${label}${parts.length ? ' | ' + parts.join(' | ') : ''}`; })));
const secOrthostatic = (days: DaysMap, keys: string[]) => orNone(eachEntry(days, keys, (d, k) => { const out: string[] = []; (d.readings || []).filter((r) => r.type === 'orthostatic').forEach((r) => out.push(`${stamp(k, r.time as string)} ${rv(r, 'transition') ?? 'Position change'} | Before HR: ${rv(r, 'beforeHr') ?? '-'} | After HR: ${rv(r, 'afterHr') ?? '-'} | HR @1min: ${rv(r, 'hr1min') ?? '-'}${noteSuffix(r)}`)); (d.symptoms || []).filter((s) => s.type === 'labileHr').forEach((s) => out.push(`${stamp(k, s.time as string)} High HR event | HR: ${rv(s, 'hr') ?? '-'} | Position: ${rv(s, 'position') ?? '-'}${noteSuffix(s)}`)); return out; }));

export function makeSectionRenderer(state: AppState, ctx: ScoreContext) {
  const days = state.days;
  const secScores = (keys: string[]) => { const lines: string[] = []; keys.forEach((k) => { const d = days[k]; if (!d) return; const ss = scoreSet(d.readings || [], d, k, days, ctx); if (ss.score == null) return; lines.push(`[${k}] Autonomic Score: ${ss.score}/100 (confidence ${ss.confidence}%)${blueZone(d.readings || [], ctx) ? ' [BLUE ZONE]' : ''}`); }); return orNone(lines); };
  const secCleanDays = (keys: string[]) => { const lines: string[] = []; keys.forEach((k) => { const c = dayCleanliness(days, k); if (!c) return; const missed = c.criteria.filter((x: { pending?: boolean; pass: boolean }) => !x.pending && !x.pass).map((x: { label: string }) => x.label); lines.push(`[${k}] Clean day: ${c.clean ? 'YES' : 'NO'}${missed.length ? ` (missed: ${missed.join(', ')})` : ''}`); }); return orNone(lines); };
  const DEFS: Record<string, [string, (keys: string[]) => string]> = {
    hrv: ['HRV READINGS (structured + unstructured)', (k) => secHRV(days, k)],
    bp: ['BLOOD PRESSURE READINGS', (k) => secBP(days, k)],
    ecg: ['ECG DATA', (k) => secECG(days, k)],
    rhr: ['RESTING HEART RATE', (k) => secRHR(days, k)],
    sleep: ['SLEEP DATA', (k) => secSleep(days, k)],
    activities: ['ACTIVITIES', (k) => secActivities(days, k)],
    triggers: ['TRIGGERS & HYDRATION', (k) => secTriggers(days, k)],
    meds: ['MEDICATIONS TAKEN', (k) => secMeds(days, k, false)],
    supplements: ['SUPPLEMENTS TAKEN', (k) => secMeds(days, k, true)],
    symptoms: ['SYMPTOMS NOTED', (k) => secSymptoms(days, k)],
    orthostatic: ['ORTHOSTATIC / HR EVENTS', (k) => secOrthostatic(days, k)],
    scores: ['DAILY AUTONOMIC SCORES', secScores],
    cleanDays: ['CLEAN DAY STATUS', secCleanDays],
  };
  return (keys: string[], list: string[]) => list.map((key) => { const def = DEFS[key]; return def ? `${def[0]}:\n${def[1](keys)}` : ''; }).filter(Boolean).join('\n\n');
}

export function universalHeader(_state: AppState, rangeText: string): string {
  return `You are analyzing autonomic and recovery health data logged by a person using a personal health-tracking app. Base every observation on the data provided below — do not assume a diagnosis, age, sex, or medical history that is not present in the data.

Approach this analysis as an honest friend examining the data carefully - direct and accurate without unnecessary softening or cruelty.

REQUIREMENTS: Be concise, accurate, honest, specific (use actual numbers), research-grounded, and careful with recommendations (note doctor consultation for medications, therapeutic-dose supplements, or major protocol changes).

STRUCTURE YOUR RESPONSE: Analysis; Trends Identified; Recovery Position; Projections; Recommendations; Citations.

PERIOD ANALYZED: ${rangeText}`;
}

export interface ReportCard { id: string; icon: string; title: string; desc: string; sections: string[]; focus: string; context?: string; instructions?: string }

export const REPORT_CARDS: ReportCard[] = [
  { id: 'overall', icon: 'chart', title: 'Overall Health Summary', desc: 'All metrics for the period with trends and recommendations.', sections: ['hrv', 'bp', 'ecg', 'rhr', 'sleep', 'activities', 'triggers', 'meds', 'supplements', 'symptoms', 'orthostatic', 'scores', 'cleanDays'], focus: 'Provide a comprehensive analysis of all health metrics for this period and how they interact.', instructions: 'Cover all systems and how they interact. Identify what is working and what is not.' },
  { id: 'hrv', icon: 'heartPulse', title: 'HRV Deep Dive', desc: 'Autonomic analysis: RMSSD, power distribution, frequency peaks.', sections: ['hrv', 'scores'], focus: 'Deep analysis of autonomic nervous system function based on HRV data.', context: 'General reference: the LF (baroreflex) peak is typically targeted around 0.08–0.10 Hz.', instructions: 'Analyze current autonomic function, recovery trajectory, baroreflex training, imbalances. Cite HRV research.' },
  { id: 'trajectory', icon: 'trendUp', title: 'Recovery Trajectory', desc: 'Where you are in recovery and projected timeline.', sections: ['scores', 'hrv', 'rhr', 'sleep', 'symptoms', 'activities', 'cleanDays'], focus: 'Analyze position in long COVID recovery and provide realistic projections.', instructions: 'Position in recovery, markers achieved/needed, realistic timeline, accelerating/slowing factors. Cite recovery research.' },
  { id: 'triggers', icon: 'triangle', title: 'Trigger Analysis', desc: 'Trigger exposures, activities and patterns causing setbacks.', sections: ['triggers', 'activities', 'symptoms', 'hrv', 'scores'], focus: 'Identify specific triggers causing setbacks based on data patterns.', instructions: 'Identify triggers, magnitude, recovery time, compound effects. Cite relevant histamine/MCAS research where the data supports it.' },
  { id: 'sleep', icon: 'moon', title: 'Sleep Impact Report', desc: 'How sleep patterns affect autonomic function.', sections: ['sleep', 'hrv', 'scores'], focus: 'Correlate each night with the next morning HRV and the day score.', instructions: 'Sleep quality patterns, next-day impact, optimal parameters. Cite sleep/HRV research.' },
  { id: 'cardio', icon: 'heart', title: 'Cardiovascular Analysis', desc: 'BP, HR, ECG patterns.', sections: ['bp', 'rhr', 'ecg', 'orthostatic', 'activities'], focus: 'Analyze cardiovascular function from BP, HR, ECG and orthostatic responses.', instructions: 'BP regulation, HR response, orthostatic function, ectopics, exercise tolerance. Cite POTS/dysautonomia research.' },
  { id: 'pots', icon: 'standing', title: 'POTS/Orthostatic Patterns', desc: 'Orthostatic events and POTS severity.', sections: ['orthostatic', 'rhr', 'bp', 'symptoms'], focus: 'Examine orthostatic responses and POTS-related patterns.', context: 'POTS indicators: HR increase >30 bpm standing; asymmetric perfusion.', instructions: 'POTS severity, tolerance trends, triggers, recovery time. Cite POTS research; medication suggestions need a specialist.' },
  { id: 'mcas', icon: 'cell', title: 'MCAS Pattern Analysis', desc: 'Histamine reactions and MCAS symptom patterns.', sections: ['symptoms', 'triggers', 'meds', 'scores'], focus: 'Identify mast cell activation patterns and triggers.', instructions: 'Reaction frequency/severity, triggers, and any treatment effectiveness visible in the data. Discuss MCAS research; prescriptions need physician guidance.' },
  { id: 'crash', icon: 'trendDown', title: 'Crash Pattern Analysis', desc: 'What precedes crashes and how to prevent them.', sections: ['scores', 'hrv', 'activities', 'triggers', 'symptoms', 'sleep'], focus: 'Identify what precedes crashes and how to prevent them.', instructions: 'Crash precipitants, warning signs, recovery time, prevention. Cite PEM/pacing research.' },
  { id: 'bestdays', icon: 'star', title: 'Best Days Analysis', desc: 'What made your best days work.', sections: ['scores', 'sleep', 'triggers', 'activities', 'hrv', 'cleanDays'], focus: 'Determine what made the best days possible and how to replicate them.', instructions: 'Common factors, replicable conditions, a best-day formula. Focus on actionable insights.' },
  { id: 'longcovid', icon: 'virus', title: 'Long COVID Recovery Insights', desc: 'Where you are vs research benchmarks.', sections: ['scores', 'hrv', 'symptoms', 'rhr', 'sleep', 'activities'], focus: 'Position within long COVID recovery research and benchmarks.', instructions: 'Position in spectrum, comparison to trajectories, outlook. Heavily cite 2023–2026 research.' },
  { id: 'doctor', icon: 'clipboard', title: 'Medical Summary For Doctor', desc: 'Structured summary for healthcare providers.', sections: ['hrv', 'bp', 'ecg', 'rhr', 'sleep', 'symptoms', 'orthostatic', 'meds', 'supplements', 'scores'], focus: 'Generate a structured medical summary suitable for sharing with providers.', instructions: 'Summarize recent metrics/trends, persisting symptoms, and notable concerns from the data, plus questions for a physician. Professional tone; do not assert diagnoses not present in the data.' },
];

/** Every data section, in a stable order — used by the "Data export only" item. */
const ALL_SECTION_KEYS = ['scores', 'hrv', 'bp', 'ecg', 'rhr', 'sleep', 'orthostatic', 'activities', 'triggers', 'meds', 'supplements', 'symptoms', 'cleanDays'];

/**
 * Raw data export: just the rendered data sections for the period, with no
 * prompt framing (no persona, focus, or instructions) — the numbers only.
 */
export function buildDataExport(state: AppState, ctx: ScoreContext, range: ReportRange, currentKey: string): string {
  const { keys: allKeys, rangeText } = reportDateRange(range, currentKey);
  const keys = allKeys.filter((k) => state.days[k]).sort();
  const render = makeSectionRenderer(state, ctx);
  return `DATA EXPORT\nPERIOD: ${rangeText}\n\n${render(keys, ALL_SECTION_KEYS)}`;
}

export function buildPrompt(state: AppState, ctx: ScoreContext, cards: ReportCard[], range: ReportRange, currentKey: string): string {
  const { keys: allKeys, rangeText } = reportDateRange(range, currentKey);
  const keys = allKeys.filter((k) => state.days[k]).sort();
  const render = makeSectionRenderer(state, ctx);
  const header = universalHeader(state, rangeText);
  const sparse = hasAnyData(state.days, keys) && entryCount(state.days, keys) < 4 ? '\n\nNOTE: Limited data available for this period — analysis may be less comprehensive.\n' : '';
  if (cards.length === 1) {
    const card = cards[0];
    let body = `FOCUS: ${card.focus}`;
    if (card.context) body += `\n\n${card.context}`;
    body += `\n\nDATA FOR PERIOD:\n\n${render(keys, card.sections)}`;
    if (card.instructions) body += `\n\n${card.instructions}`;
    return `${header}${sparse}\n\n${body}`;
  }
  const sectionKeys: string[] = [];
  cards.forEach((c) => c.sections.forEach((s) => { if (!sectionKeys.includes(s)) sectionKeys.push(s); }));
  const titles = cards.map((c) => c.title);
  const intro = `This is a CUSTOM, MULTI-PART report covering ${cards.length} focus areas:\n${titles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\nAddress each as its own labeled section, in order. The shared data below covers all areas. End with an integrated summary.`;
  const data = `SHARED DATA FOR PERIOD:\n\n${render(keys, sectionKeys)}`;
  const focusBlocks = cards.map((c, i) => { let b = `=== ${i + 1}. ${c.title.toUpperCase()} ===\nFOCUS: ${c.focus}`; if (c.context) b += `\n\n${c.context}`; if (c.instructions) b += `\n\nANALYSIS REQUESTED:\n${c.instructions}`; return b; }).join('\n\n');
  return `${header}${sparse}\n\n${intro}\n\n${data}\n\nFOCUS AREAS:\n\n${focusBlocks}`;
}
