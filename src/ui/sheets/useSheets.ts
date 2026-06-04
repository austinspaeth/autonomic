// Sheet stack store — the RN equivalent of the legacy openModal/closeModal/
// closeAll + sheetStack (docs/index.html:1894-1958). A module singleton holds
// the stack; SheetHost renders it and components open/close via useSheets().
import { useSyncExternalStore } from 'react';
import type React from 'react';
import type { IconName } from '@ui/primitives';

export interface SheetApi {
  /** Pop this sheet (reveals the one beneath). */
  close: () => void;
  /** Close the whole stack (used after a completed action like Save). */
  closeAll: () => void;
}

export interface SheetHeaderAction {
  icon: IconName;
  label?: string;
  onPress: () => void;
}

export interface SheetOptions {
  /** Blurred, pinned footer (legacy .modal-foot — the .modal-actions bar). */
  footer?: React.ReactNode;
  /** Optional header button left of the ✕ (legacy .modal-headbtn, e.g. Edit). */
  action?: SheetHeaderAction;
}

export interface SheetEntry {
  id: string;
  render: (api: SheetApi) => React.ReactNode;
  options?: SheetOptions;
  /** Set while the exit animation plays; SheetHost removes it on completion. */
  closing?: boolean;
}

let stack: SheetEntry[] = [];
const listeners = new Set<() => void>();
let counter = 0;

function emit() {
  // New array reference so useSyncExternalStore detects the change.
  stack = stack.slice();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

const getSnapshot = () => stack;

export function openSheet(
  render: (api: SheetApi) => React.ReactNode,
  options?: SheetOptions,
): string {
  const id = `sheet_${++counter}`;
  stack.push({ id, render, options });
  emit();
  return id;
}

/** Mark the top sheet closing so it animates out; SheetHost calls remove() after. */
export function closeSheet(): void {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (!stack[i].closing) {
      stack[i] = { ...stack[i], closing: true };
      emit();
      return;
    }
  }
}

/** Drop every sheet beneath the top instantly; animate the top out. */
export function closeAllSheets(): void {
  if (!stack.length) return;
  const topIdx = stack.length - 1;
  const top = { ...stack[topIdx], closing: true };
  stack = [top];
  emit();
}

/** Remove a finished sheet from the stack (called by SheetHost after exit). */
export function removeSheet(id: string): void {
  stack = stack.filter((s) => s.id !== id);
  listeners.forEach((l) => l());
}

export function useSheetStack(): SheetEntry[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useSheets() {
  return { openSheet, closeSheet, closeAll: closeAllSheets };
}
