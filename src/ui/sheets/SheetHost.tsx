// SheetHost — renders the sheet stack above everything (mounted once in
// AppShell, sibling-after the view switcher, like the legacy #modalRoot). On
// web it also locks page scroll while any sheet is open (legacy lockScroll).
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Sheet } from './Sheet';
import { useSheetStack } from './useSheets';

export function SheetHost() {
  const stack = useSheetStack();
  const open = stack.length > 0;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? 'hidden' : prev || '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // The top-most non-closing sheet is the interactive one.
  let topId: string | null = null;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (!stack[i].closing) {
      topId = stack[i].id;
      break;
    }
  }

  return (
    <>
      {stack.map((entry, i) => (
        <Sheet key={entry.id} entry={entry} index={i} isTop={entry.id === topId} />
      ))}
    </>
  );
}
