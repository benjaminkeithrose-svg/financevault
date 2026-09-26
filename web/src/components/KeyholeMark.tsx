import { useTheme } from "../hooks/useTheme.js";
import { Logo, logoShapes } from "../theme.js";

/**
 * The Financial Vault mark, in the logo design and colourway chosen under
 * Look and feel. `logo` draws a particular design (the picker's previews).
 */
export function KeyholeMark({ size = 28, label, logo }: { size?: number; label?: string; logo?: Logo }) {
  const [theme] = useTheme();
  const design = logo ?? theme.logo;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 140 140"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="keyhole-mark"
    >
      <rect width="140" height="140" fill="var(--mark-block)" />
      {/* Fixed shapes from theme.ts — no user text reaches this markup. */}
      <g dangerouslySetInnerHTML={{ __html: logoShapes(design, "var(--mark-hole)") }} />
    </svg>
  );
}
