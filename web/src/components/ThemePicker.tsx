import { COLOURWAYS, STYLES } from "../theme.js";
import { useTheme } from "../hooks/useTheme.js";

/** Colour swatches and the Bold/Soft choice. `compact` is the row at the foot of the menu. */
export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useTheme();
  return (
    <div className={compact ? "theme-picker compact" : "theme-picker"}>
      <div className="theme-swatches" role="group" aria-label="Colours">
        {COLOURWAYS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`theme-swatch${theme.colour === c.id ? " selected" : ""}`}
            aria-pressed={theme.colour === c.id}
            aria-label={c.name}
            title={c.name}
            onClick={() => setTheme({ ...theme, colour: c.id })}
          >
            <svg viewBox="0 0 140 140" aria-hidden="true">
              <rect width="140" height="140" fill={c.ink} />
              <circle cx="70" cy="56" r="26" fill={c.fill} />
              <path d="M56 66 L84 66 L94 116 L46 116 Z" fill={c.fill} />
            </svg>
            {!compact && <span>{c.name}</span>}
          </button>
        ))}
      </div>
      <div className="segmented" role="group" aria-label="Style">
        {STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={theme.style === s.id ? "selected" : ""}
            aria-pressed={theme.style === s.id}
            title={s.blurb}
            onClick={() => setTheme({ ...theme, style: s.id })}
          >
            {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}
