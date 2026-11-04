<!-- Feature icons, drawn as the app draws them (mobile/src/components/Icon.tsx):
     the Journal's clipboard, Progress's chart, Insights' three sparkles (AI
     reports share them), the caution triangle for crash warnings, and the
     cycle ring split into its four phases (features/cycle/CycleRing.tsx). -->
<script lang="ts">
  export let name: string;
  export let size = 22;
  const SPARKS = '<path d="M12 3l1.4 4.1L17.5 8l-3.6 1.4L12 13l-1.9-3.6L6.5 8l4.1-.9z" /><path d="M18.5 14l.8 2.3 2.2.8-2.2.8-.8 2.3-.8-2.3-2.2-.8 2.2-.8z" /><path d="M5 15l.6 1.6L7 17l-1.4.4L5 19l-.6-1.6L3 17l1.4-.4z" />';
  // The ring is four dashed arcs of one circle (r 8.5, circumference ~53.4):
  // period, follicular, ovulatory, luteal, at the app's relative strengths.
  const arc = (len: number, at: number, op: number) =>
    `<circle cx="12" cy="12" r="8.5" stroke-dasharray="${len} 53.4" stroke-dashoffset="${-at}" stroke-opacity="${op}" stroke-linecap="butt" transform="rotate(-90 12 12)" />`;
  const P: Record<string, string> = {
    journal: '<rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9z" /><path d="M9 11h6" /><path d="M9 15h4" />',
    progress: '<rect x="3" y="3" width="18" height="18" rx="2" /><path d="M8 16v-4" /><path d="M12 16V8" /><path d="M16 16v-6" />',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" />',
    insights: SPARKS,
    doctor: SPARKS,
    // A 28-day cycle: 5 period, 8 follicular, 3 ovulatory, 12 luteal days.
    cycle: arc(7.9, 0, 1) + arc(13.7, 9.54, 0.45) + arc(4.1, 24.8, 0.8) + arc(21.3, 30.52, 0.6),
    pacing: '<path d="M7 7h8a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM19 10.5v3M11.5 9l-2 3.2h3l-2 3.3" />',
    hrv: '<path d="M3 12h4l2.2-5 3.6 10 2.2-5H21" />',
    stand: '<path d="M12 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM6 9l6 2 6-2M12 11v3M9 20l3-6 3 6" />',
    watch: '<path d="M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM9 6l.8-3h4.4l.8 3M9 18l.8 3h4.4l.8-3M9.5 12h1.4l.8-1.6 1.2 3.2.8-1.6h1.3" />'
  };
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#e5432f" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{@html P[name] ?? ''}</svg>
