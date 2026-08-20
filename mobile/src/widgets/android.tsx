/**
 * Android home-screen widgets (react-native-android-widget). Renders the same
 * payload the iOS widgets consume (src/lib/widgets.ts) into RemoteViews trees:
 *  · Score        (2×2) — the Outlook dial + today's category word
 *  · ScoreMetrics (4×2) — dial beside graded SDNN/RMSSD/Sleep averages
 *  · TodayNumbers (4×2) — 2×3 grid of the day's numbers
 *  · StartHrv     (2×2) — one-tap capture launcher (deep link)
 *  · Protocol     (4×4) — score & metrics over today's clean-day checklist
 *                         (deep-links to the expanded Progress streak card)
 *
 * Rendering happens in two places: `updateAndroidWidgets` (pushed from the
 * running app after journal changes) and `widgetTaskHandler` (headless — the
 * OS-driven periodic update and add/resize events), both from the live store.
 */
import React from 'react';
import { FlexWidget, SvgWidget, TextWidget, requestWidgetUpdate } from 'react-native-android-widget';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { buildWidgetPayload, type WidgetPayload, type WidgetProtocolItem } from '../lib/widgets';

const BG = '#0d0d0f';
const CELL = '#141416';
const TEXT = '#f2f2f5';
const DIM = '#8a8a92';
const FAINT = '#6a6a72';
const ACCENT = '#e03127';
const GREEN = '#16a34a';
const CAPTURE_URI = 'autonomic://?capture=hrv';
const PROTOCOL_URI = 'autonomic://?open=protocol';
const PROTOCOL_MAX = 6;   // rows shown on the large widget before "+N more"

type Hex = `#${string}`;
const hex = (c: string) => c as Hex;

/* ---------- SVG pieces ---------- */

const polar = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180;
  return [50 + r * Math.cos(a), 50 + r * Math.sin(a)].map((v) => Math.round(v * 100) / 100);
};

/** 270° dial arc path (135° start), viewBox 0 0 100 100. */
function arcPath(frac: number, r = 40): string {
  const sweep = 270 * Math.max(0.0001, Math.min(1, frac));
  const [x0, y0] = polar(135, r);
  const [x1, y1] = polar(135 + sweep, r);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/** The Outlook dial as one SVG: track, glow underlay, score arc, number and
 *  the outlook pill's word underneath it. */
function gaugeSvg(p: WidgetPayload): string {
  const color = p.hasScore ? p.color : DIM;
  const arcs = p.hasScore
    ? `<path d="${arcPath(p.score / 100)}" fill="none" stroke="${color}" stroke-width="15" stroke-opacity="0.16" stroke-linecap="round"/>
       <path d="${arcPath(p.score / 100)}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path d="${arcPath(1)}" fill="none" stroke="#242427" stroke-width="9" stroke-linecap="round"/>
    ${arcs}
    <text x="50" y="57" text-anchor="middle" font-size="27" font-weight="bold" fill="${p.hasScore ? TEXT : DIM}">${Math.round(p.score)}</text>
    <text x="50" y="70" text-anchor="middle" font-size="8.5" font-weight="600" fill="${color}">${p.label}</text>
  </svg>`;
}

const heartButtonSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="12" fill="${ACCENT}"/>
  <path d="M12 17.5c-3-2.1-4.9-4-4.9-6.3A2.9 2.9 0 0 1 12 8.9a2.9 2.9 0 0 1 4.9 2.3c0 2.3-1.9 4.2-4.9 6.3z" fill="#ffffff"/>
</svg>`;

/** A protocol checkbox: green tick when done, red ✕ when hard-broken, else an
 *  empty ring for still-to-do. */
function checkSvg(it: WidgetProtocolItem): string {
  if (it.broken) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="11" fill="none" stroke="${ACCENT}" stroke-width="2"/>
      <path d="M8.5 8.5l7 7M15.5 8.5l-7 7" fill="none" stroke="${ACCENT}" stroke-width="2.2" stroke-linecap="round"/>
    </svg>`;
  }
  if (it.done) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="11" fill="${GREEN}"/>
      <path d="M6.8 12.4l3.2 3.3 7.2-7.4" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11" fill="none" stroke="#3a3a40" stroke-width="2"/>
  </svg>`;
}

/* ---------- shared fragments ---------- */

/** Transparent, box-filling wrapper that top-anchors its card. The launcher can
 *  hand a widget a taller cell than its content needs; letting the card size to
 *  its content (`height: 'wrap_content'`) and pinning it to the top keeps it from
 *  floating in the middle of that cell with padding above and below. The whole
 *  cell stays tappable via the click action on the frame. */
function Frame({ clickAction, clickActionData, children }: {
  clickAction: string;
  clickActionData?: Record<string, string>;
  children: React.ReactNode;
}) {
  return (
    <FlexWidget
      clickAction={clickAction}
      clickActionData={clickActionData}
      style={{ width: 'match_parent', height: 'match_parent', flexDirection: 'column', justifyContent: 'flex-start' }}
    >
      {children}
    </FlexWidget>
  );
}

function MetricRowsWidget({ p }: { p: WidgetPayload }) {
  return (
    <FlexWidget style={{ flex: 1, flexDirection: 'column', justifyContent: 'center', flexGap: 10, width: 'match_parent' }}>
      {p.rows.map((m) => (
        <FlexWidget key={m.name} style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', flexGap: 8 }}>
          <FlexWidget style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: hex(m.color) }} />
          <TextWidget text={m.name} style={{ fontSize: 12, color: hex(DIM) }} />
          <FlexWidget style={{ flex: 1, height: 1 }} />
          <TextWidget text={m.value} style={{ fontSize: 15, fontWeight: '600', color: hex(TEXT) }} />
          <TextWidget text={m.unit} style={{ fontSize: 9, color: hex(FAINT) }} />
          {m.trend ? (
            <TextWidget text={m.trend} style={{ fontSize: 10, fontWeight: '700', color: hex(m.trendColor || FAINT), marginLeft: 4 }} />
          ) : null}
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

/* ---------- the widgets ---------- */

function ScoreWidgetA({ p }: { p: WidgetPayload }) {
  return (
    <Frame clickAction="OPEN_APP">
      <FlexWidget style={{ width: 'match_parent', height: 'wrap_content', backgroundColor: hex(BG), borderRadius: 22, flexDirection: 'column', alignItems: 'center', padding: 10, flexGap: 4 }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
          <TextWidget text="Autonomic" style={{ fontSize: 11, fontWeight: '700', color: hex(DIM) }} />
        </FlexWidget>
        <SvgWidget svg={gaugeSvg(p)} style={{ width: 104, height: 104 }} />
      </FlexWidget>
    </Frame>
  );
}

function ScoreMetricsWidgetA({ p }: { p: WidgetPayload }) {
  return (
    <Frame clickAction="OPEN_APP">
      <FlexWidget style={{ width: 'match_parent', height: 'wrap_content', backgroundColor: hex(BG), borderRadius: 22, flexDirection: 'row', alignItems: 'center', padding: 14, flexGap: 14 }}>
        <SvgWidget svg={gaugeSvg(p)} style={{ width: 104, height: 104 }} />
        <FlexWidget style={{ width: 1, height: 100, backgroundColor: 'rgba(255, 255, 255, 0.05)' }} />
        <MetricRowsWidget p={p} />
      </FlexWidget>
    </Frame>
  );
}

function TodayNumbersWidgetA({ p }: { p: WidgetPayload }) {
  const rows = [p.grid.slice(0, 3), p.grid.slice(3, 6)];
  return (
    <Frame clickAction="OPEN_APP">
      <FlexWidget style={{ width: 'match_parent', height: 'wrap_content', backgroundColor: hex(BG), borderRadius: 22, flexDirection: 'column', padding: 12, flexGap: 8 }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 7 }}>
          <TextWidget text="Today's numbers" style={{ fontSize: 12, fontWeight: '700', color: hex(DIM) }} />
        </FlexWidget>
        {rows.map((row, i) => (
          <FlexWidget key={String(i)} style={{ flexDirection: 'row', width: 'match_parent', flexGap: 8 }}>
            {row.map((m) => (
              <FlexWidget key={m.name} style={{ flex: 1, height: 46, backgroundColor: hex(CELL), borderRadius: 12, flexDirection: 'column', justifyContent: 'center', paddingHorizontal: 10, flexGap: 3 }}>
                <TextWidget text={m.name} style={{ fontSize: 10, fontWeight: '600', color: hex(DIM) }} />
                <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', flexGap: 3 }}>
                  <TextWidget text={m.value} style={{ fontSize: 17, fontWeight: '600', color: hex(TEXT) }} />
                  <TextWidget text={m.unit} style={{ fontSize: 9, color: hex(FAINT) }} />
                </FlexWidget>
              </FlexWidget>
            ))}
          </FlexWidget>
        ))}
      </FlexWidget>
    </Frame>
  );
}

function StartHrvWidgetA() {
  return (
    <Frame clickAction="OPEN_URI" clickActionData={{ uri: CAPTURE_URI }}>
      <FlexWidget style={{ width: 'match_parent', height: 'wrap_content', borderRadius: 22, flexDirection: 'column', padding: 12, flexGap: 10, backgroundGradient: { from: hex('#2a0e10'), to: hex(BG), orientation: 'TL_BR' } }}>
        <TextWidget text="Quick reading" style={{ fontSize: 11, fontWeight: '700', color: hex('#e8807c') }} />
        <FlexWidget style={{ width: 'match_parent', alignItems: 'center' }}>
          <SvgWidget svg={heartButtonSvg} style={{ width: 56, height: 56 }} />
        </FlexWidget>
        <TextWidget text="Start HRV" style={{ fontSize: 14, fontWeight: '700', color: hex(TEXT) }} />
      </FlexWidget>
    </Frame>
  );
}

function ProtocolWidgetA({ p }: { p: WidgetPayload }) {
  const shown = p.protocol.slice(0, PROTOCOL_MAX);
  const extra = p.protocol.length - shown.length;
  return (
    <Frame clickAction="OPEN_URI" clickActionData={{ uri: PROTOCOL_URI }}>
      <FlexWidget style={{ width: 'match_parent', height: 'wrap_content', backgroundColor: hex(BG), borderRadius: 22, flexDirection: 'column', padding: 14, flexGap: 12 }}>
        {/* Score & metrics — the top row */}
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', flexGap: 14 }}>
          <SvgWidget svg={gaugeSvg(p)} style={{ width: 96, height: 96 }} />
          <FlexWidget style={{ width: 1, height: 92, backgroundColor: 'rgba(255, 255, 255, 0.05)' }} />
          <MetricRowsWidget p={p} />
        </FlexWidget>
        <FlexWidget style={{ width: 'match_parent', height: 1, backgroundColor: 'rgba(255, 255, 255, 0.05)' }} />
        {/* Daily protocol checklist */}
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
          <TextWidget text="Daily protocol" style={{ fontSize: 12, fontWeight: '700', color: hex(DIM) }} />
          <FlexWidget style={{ flex: 1, height: 1 }} />
          {p.protocol.length ? (
            <TextWidget text={`${p.protocolDone}/${p.protocol.length}`} style={{ fontSize: 12, fontWeight: '700', color: hex(FAINT) }} />
          ) : null}
        </FlexWidget>
        <FlexWidget style={{ flexDirection: 'column', width: 'match_parent', flexGap: 9 }}>
          {p.protocol.length === 0 ? (
            <TextWidget text="No protocol set yet" style={{ fontSize: 13, color: hex(FAINT) }} />
          ) : shown.map((it) => (
            <FlexWidget key={it.key} style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', flexGap: 9 }}>
              <SvgWidget svg={checkSvg(it)} style={{ width: 18, height: 18 }} />
              <TextWidget text={it.label} style={{ fontSize: 13, fontWeight: '500', color: hex(it.done ? TEXT : DIM) }} />
            </FlexWidget>
          ))}
          {extra > 0 ? (
            <TextWidget text={`+${extra} more`} style={{ fontSize: 12, color: hex(FAINT), marginLeft: 27 }} />
          ) : null}
        </FlexWidget>
      </FlexWidget>
    </Frame>
  );
}

/* ---------- render + update plumbing ---------- */

export const ANDROID_WIDGETS = ['Score', 'ScoreMetrics', 'TodayNumbers', 'StartHrv', 'Protocol'] as const;

function renderFor(name: string, p: WidgetPayload): React.JSX.Element {
  switch (name) {
    case 'ScoreMetrics': return <ScoreMetricsWidgetA p={p} />;
    case 'TodayNumbers': return <TodayNumbersWidgetA p={p} />;
    case 'StartHrv': return <StartHrvWidgetA />;
    case 'Protocol': return <ProtocolWidgetA p={p} />;
    default: return <ScoreWidgetA p={p} />;
  }
}

/** Pushed from the running app (initWidgetSync) after journal changes. */
export async function updateAndroidWidgets(payload: WidgetPayload): Promise<void> {
  await Promise.all(ANDROID_WIDGETS.map((widgetName) =>
    requestWidgetUpdate({ widgetName, renderWidget: () => renderFor(widgetName, payload) })
      .catch(() => { /* widget not placed — nothing to update */ }),
  ));
}

/** Headless entry (registered in index.js): OS-driven periodic updates plus
 *  add/resize. Builds the payload straight from the store — the periodic tick
 *  is what rolls the widgets over to "awaiting data" after midnight when the
 *  app hasn't been opened. */
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED') return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getState } = require('../store/store') as typeof import('../store/store');
  renderWidget(renderFor(widgetInfo.widgetName, buildWidgetPayload(getState())));
}
