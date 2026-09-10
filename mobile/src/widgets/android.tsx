/**
 * Android home-screen widgets (react-native-android-widget). Renders the same
 * payload the iOS widgets consume (src/lib/widgets.ts) into RemoteViews trees:
 *  · Score        (2×2) — the Outlook dial + today's category word
 *  · ScoreMetrics (4×2) — dial beside graded SDNN/RMSSD/Sleep averages
 *  · TodayNumbers (4×2) — 2×3 grid of the day's numbers
 *  · StartHrv     (2×2) — one-tap capture launcher (deep link)
 *  · Protocol     (4×4) — score & metrics over today's clean-day checklist
 *                         (deep-links to the expanded Progress streak card)
 *  · Pacing       (2×2) — the budget figure over the spend bar + pace marker
 *  · PacingDetail (4×2) — the same with a state badge and two tiles
 *
 * Rendering happens in two places: `updateAndroidWidgets` (pushed from the
 * running app after journal changes) and `widgetTaskHandler` (headless — the
 * OS-driven periodic update and add/resize events), both from the live store.
 */
import React from 'react';
import { FlexWidget, OverlapWidget, SvgWidget, TextWidget, requestWidgetUpdate } from 'react-native-android-widget';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import {
  buildLiveWidgetPayload, currentPacingFrame,
  type WidgetPacingFrame, type WidgetPayload, type WidgetProtocolItem,
} from '../lib/widgets';
import { fonts } from '../theme';

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
/** `#rrggbb` at alpha `a`, in the spaced form the widget library's colour
 *  type is declared with. */
const rgba = (c: string, a: number) => {
  const n = parseInt(c.replace('#', '').slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})` as Hex;
};

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

/* ---------- pacing fragments ---------- */

/** The comp's near-black card gradient, as the two stops RemoteViews allows. */
const PACING_BG = { from: hex('#1a1a1f'), to: hex('#0e0e11'), orientation: 'TL_BR' as const };
const MARKER = rgba('#ffffff', 0.84);
const GOLD = '#eab308';

/** Layout weights are integers in practice; a zero weight collapses a view
 *  the row still needs, so every share keeps at least one part. */
const WEIGHT = 1000;
const share = (v: number) => Math.max(1, Math.round(Math.max(0, Math.min(1, v)) * WEIGHT));

const caretSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 6">
  <path d="M5 0 L10 6 L0 6 Z" fill="#ffffff" fill-opacity="0.84"/>
</svg>`;

/**
 * The spend bar. RemoteViews has no percentage widths or absolute offsets, so
 * the fill and the pace marker are each a row of weighted spacers stacked in
 * an OverlapWidget. A spacer's weight is shared with the fixed-width view
 * beside it, which puts the marker at `pace × (width − 2)` and the caret at
 * `pace × (width − 10)`: both centred on the same point at mid-bar and within
 * a few dp of it at the ends.
 *
 * No halo: without a blur it renders as a hard outline around the fill.
 */
function PacingBarA({ f, height }: { f: WidgetPacingFrame; height: number }) {
  const over = f.state === 'over';
  const fill = over ? 1 : Math.max(0, Math.min(1, f.fill));
  const r = height / 2;
  const track = f.state === 'paused' ? rgba(GOLD, 0.14) : rgba('#ffffff', 0.06);
  // RemoteViews gradients take two colours: the base and the ember's first hot stop.
  const hot = f.ember && f.ember.length > 1 ? f.ember[1].c : null;
  const fillStyle = hot
    ? { backgroundGradient: { from: hex(f.fillColor), to: hex(hot), orientation: 'LEFT_RIGHT' as const } }
    : { backgroundColor: hex(f.fillColor) };
  const lane = { width: 'match_parent' as const, height: height + 8, flexDirection: 'row' as const, paddingTop: 4 };

  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column' }}>
      <OverlapWidget style={{ width: 'match_parent', height: height + 8 }}>
        <FlexWidget style={lane}>
          <FlexWidget style={{ flex: 1, height, borderRadius: r, backgroundColor: track }} />
        </FlexWidget>
        {fill > 0.01 ? (
          <FlexWidget style={lane}>
            <FlexWidget style={{ flex: share(fill), height, borderRadius: r, ...fillStyle }} />
            {fill < 1 ? <FlexWidget style={{ flex: share(1 - fill), height }} /> : null}
          </FlexWidget>
        ) : null}
        {f.pace != null ? (
          <FlexWidget style={{ width: 'match_parent', height: height + 8, flexDirection: 'row' }}>
            <FlexWidget style={{ flex: share(f.pace), height: 1 }} />
            <FlexWidget style={{ width: 2, height: height + 8, borderRadius: 1, backgroundColor: MARKER }} />
            <FlexWidget style={{ flex: share(1 - f.pace), height: 1 }} />
          </FlexWidget>
        ) : null}
      </OverlapWidget>
      {f.pace != null ? (
        <FlexWidget style={{ width: 'match_parent', height: 8, flexDirection: 'row', paddingTop: 2 }}>
          <FlexWidget style={{ flex: share(f.pace), height: 1 }} />
          <SvgWidget svg={caretSvg} style={{ width: 10, height: 6 }} />
          <FlexWidget style={{ flex: share(1 - f.pace), height: 1 }} />
        </FlexWidget>
      ) : (
        <FlexWidget style={{ width: 1, height: 8 }} />
      )}
    </FlexWidget>
  );
}

function PacingLabelA() {
  return <TextWidget text="PACING" style={{ fontSize: 11, fontWeight: '700', color: hex(DIM) }} />;
}

/**
 * RemoteViews text cannot shrink itself to fit, so the figure is sized here
 * against the slot it has: the base size when it fits, smaller when a long
 * provisional ("About 4h 30m") would clip. 0.6 of the size is Manrope
 * ExtraBold's average advance for digits and the letters these figures use.
 */
function figureSize(text: string, base: number, width: number): number {
  const fits = Math.floor(width / (Math.max(1, text.length) * 0.6));
  return Math.max(Math.round(base * 0.55), Math.min(base, fits));
}

function PacingFigureA({ f, size, softSize, width, unitSize }: {
  f: WidgetPacingFrame; size: number; softSize: number; width: number; unitSize: number;
}) {
  const s = figureSize(f.figure, f.soft ? softSize : size, width - (f.unit ? unitSize * 2.6 : 0));
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', flexGap: 4 }}>
      {/* No fontWeight: on API 28+ it re-weights the custom face through the
          platform's synthesiser instead of using the ExtraBold file. */}
      <TextWidget text={f.figure} style={{ fontSize: s, fontFamily: fonts.numHeavy, color: hex(f.figureColor) }} />
      {f.unit ? (
        <TextWidget text={f.unit} style={{ fontSize: unitSize, fontWeight: '600', color: hex(DIM), marginBottom: Math.round(s * 0.14) }} />
      ) : null}
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

function PacingWidgetA({ f }: { f: WidgetPacingFrame }) {
  return (
    <Frame clickAction="OPEN_APP">
      <FlexWidget style={{ width: 'match_parent', height: 'wrap_content', borderRadius: 22, flexDirection: 'column', paddingHorizontal: 14, paddingTop: 13, paddingBottom: 8, backgroundGradient: PACING_BG }}>
        <PacingLabelA />
        <FlexWidget style={{ width: 1, height: 12 }} />
        <PacingFigureA f={f} size={34} softSize={25} width={112} unitSize={12} />
        <TextWidget text={f.sub} style={{ fontSize: 10.5, color: hex(DIM), marginTop: 3 }} />
        <FlexWidget style={{ width: 1, height: 10 }} />
        <PacingBarA f={f} height={9} />
      </FlexWidget>
    </Frame>
  );
}

function PacingDetailWidgetA({ f }: { f: WidgetPacingFrame }) {
  return (
    <Frame clickAction="OPEN_APP">
      <FlexWidget style={{ width: 'match_parent', height: 'wrap_content', borderRadius: 22, flexDirection: 'column', paddingHorizontal: 16, paddingTop: 13, paddingBottom: 8, backgroundGradient: PACING_BG }}>
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent' }}>
          <PacingLabelA />
          <FlexWidget style={{ flex: 1, height: 1 }} />
          {f.badge ? (
            <FlexWidget style={{ borderWidth: 1, borderColor: rgba(f.badgeColor, 0.35), borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
              <TextWidget text={f.badge} style={{ fontSize: 9.5, fontWeight: '700', color: hex(f.badgeColor) }} />
            </FlexWidget>
          ) : null}
        </FlexWidget>
        <FlexWidget style={{ width: 1, height: 10 }} />
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', width: 'match_parent', flexGap: 7 }}>
          <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
            <PacingFigureA f={f} size={36} softSize={26} width={130} unitSize={12.5} />
            <TextWidget text={f.subWide} style={{ fontSize: 11, color: hex(DIM), marginTop: 4 }} />
          </FlexWidget>
          {f.tiles.map((t) => (
            <FlexWidget key={t.label} style={{ width: 70, flexDirection: 'column', backgroundColor: rgba('#ffffff', 0.04), borderRadius: 12, paddingHorizontal: 9, paddingVertical: 8 }}>
              <TextWidget text={t.value} style={{ fontSize: 13, fontFamily: fonts.numHeavy, color: hex(t.color) }} />
              <TextWidget text={t.label} style={{ fontSize: 9, color: hex(DIM), marginTop: 2 }} />
            </FlexWidget>
          ))}
        </FlexWidget>
        <FlexWidget style={{ width: 1, height: 11 }} />
        <PacingBarA f={f} height={10} />
      </FlexWidget>
    </Frame>
  );
}

/* ---------- render + update plumbing ---------- */

export const ANDROID_WIDGETS = ['Score', 'ScoreMetrics', 'TodayNumbers', 'StartHrv', 'Protocol', 'Pacing', 'PacingDetail'] as const;

function renderFor(name: string, p: WidgetPayload): React.JSX.Element {
  switch (name) {
    case 'ScoreMetrics': return <ScoreMetricsWidgetA p={p} />;
    case 'TodayNumbers': return <TodayNumbersWidgetA p={p} />;
    case 'StartHrv': return <StartHrvWidgetA />;
    case 'Protocol': return <ProtocolWidgetA p={p} />;
    case 'Pacing': return <PacingWidgetA f={currentPacingFrame(p.pacing)} />;
    case 'PacingDetail': return <PacingDetailWidgetA f={currentPacingFrame(p.pacing)} />;
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
 *  app hasn't been opened, and what moves the pacing marker along the day. */
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED') return;
  renderWidget(renderFor(widgetInfo.widgetName, buildLiveWidgetPayload()));
}
