import { useEffect, useRef } from 'react';
import rough from 'roughjs';
import { useTheme } from '../lib/theme';

interface Props {
  size?: number;
  withWordmark?: boolean;
}

/**
 * Brand mark: two overlapping squares drawn with rough.js for a hand-sketched,
 * Excalidraw-style look. Redraws on theme change so the accent stays correct.
 */
export function Logo({ size = 26, withWordmark = true }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.innerHTML = '';
    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6965db';
    const rc = rough.svg(svg);
    // Back square: sketchy hachure fill (lighter). Front: solid.
    svg.appendChild(
      rc.rectangle(3, 8, 13, 13, {
        roughness: 1.6,
        stroke: accent,
        strokeWidth: 1.4,
        fill: accent,
        fillStyle: 'hachure',
        hachureGap: 3,
      }),
    );
    svg.appendChild(
      rc.rectangle(15, 11, 14, 14, {
        roughness: 1.5,
        stroke: accent,
        strokeWidth: 1.6,
        fill: accent,
        fillStyle: 'solid',
      }),
    );
  }, [size, theme]);

  return (
    <span className="logo" aria-label="Folio">
      <svg ref={svgRef} width={size} height={size} viewBox="0 0 32 32" />
      {withWordmark && <span className="logo-word">Folio</span>}
    </span>
  );
}
