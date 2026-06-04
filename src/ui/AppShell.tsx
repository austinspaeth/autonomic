// AppShell — the 4-view tab shell (replaces switchView, docs/index.html:7016).
// Topbar + lazily-mounted, keep-alive screens + floating TabBar + toast host.
// Sheets (Phase C) mount above this via the SheetHost.
import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Box } from '@ui/primitives';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Topbar } from '@ui/components/Topbar';
import { TabBar, type TabItem } from '@ui/components/TabBar';
import { ToastHost } from '@ui/components/Toast';
import { SheetHost } from '@ui/sheets/SheetHost';
import { openMenu } from '@ui/screens/drawers/MenuDrawer';
import { JournalScreen } from '@ui/screens/journal/JournalScreen';
import { AnalysisScreen } from '@ui/screens/analysis/AnalysisScreen';
import { MilestonesScreen } from '@ui/screens/milestones/MilestonesScreen';
import { ReportsScreen } from '@ui/screens/reports/ReportsScreen';

const VIEWS: TabItem[] = [
  { key: 'journal', label: 'Journal', icon: 'journal' },
  { key: 'analysis', label: 'Analysis', icon: 'analysis' },
  { key: 'milestones', label: 'Milestones', icon: 'milestones' },
  { key: 'reports', label: 'Insights', icon: 'insights' },
];

export function AppShell() {
  const t = useTheme();
  const [active, setActive] = useState('journal');
  // Lazily mount Analysis/Milestones/Reports on first visit; keep mounted after
  // (preserves scroll position) — matches the legacy lazy render calls.
  const visited = useRef<Set<string>>(new Set(['journal']));
  visited.current.add(active);

  const scrollY = useSharedValue(0);
  useEffect(() => {
    // Hide the topbar divider when switching views (until the new view scrolls).
    scrollY.value = 0;
  }, [active, scrollY]);

  return (
    <Box style={{ flex: 1, backgroundColor: t.bg }}>
      <Topbar scrollY={scrollY} onMenu={() => openMenu()} />

      <Box style={{ flex: 1 }}>
        {VIEWS.map((v) => {
          if (!visited.current.has(v.key)) return null;
          const show = v.key === active;
          return (
            <View
              key={v.key}
              style={{
                ...StyleSheetAbsoluteFill,
                display: show ? 'flex' : 'none',
              }}
            >
              {v.key === 'journal' && <JournalScreen scrollY={scrollY} />}
              {v.key === 'analysis' && <AnalysisScreen scrollY={scrollY} />}
              {v.key === 'milestones' && <MilestonesScreen scrollY={scrollY} />}
              {v.key === 'reports' && <ReportsScreen scrollY={scrollY} />}
            </View>
          );
        })}
      </Box>

      <TabBar items={VIEWS} active={active} onChange={setActive} />
      <SheetHost />
      <ToastHost />
    </Box>
  );
}

const StyleSheetAbsoluteFill = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
