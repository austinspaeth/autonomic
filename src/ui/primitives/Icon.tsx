// Icon — renders a registered SVG icon by name, inheriting `color` like the
// legacy stroke="currentColor" glyphs.
import React from 'react';
import { ICONS, type IconName } from './icons';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
}

export function Icon({ name, size = 24, color = '#000' }: IconProps) {
  const Render = ICONS[name];
  if (!Render) return null;
  return <Render size={size} color={color} />;
}
