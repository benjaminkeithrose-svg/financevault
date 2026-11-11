import { COLOURWAYS, LOGOS, logoShapes, MODES, STYLES } from "../theme.js";
import { useTheme } from "../hooks/useTheme.js";
import { KeyholeMark } from "./KeyholeMark.js";

/**
 * Colour swatches, Bold/Soft, light or dark, and (in Settings) the logo.
 * `compact` is the row at the foot of the menu.
 */
export function ThemePicker({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useTheme();
  return (
    <div className={compact ? "theme-picker compact" : "theme-picker"}>
      {!compact && <div className="theme-picker-label">Colour</div>}
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
            <svg viewBox="0 0 140 140" aria-hidden="true" dangerouslySetInnerHTML={{ __html: `<rect width="140" height="140" fill="${c.ink}"/>${logoShapes(theme.logo, c.fill)}` }} />
            {!compact && <span>{c.name}</span>}
          </button>
        ))}
      </div>
      {!compact && <div className="theme-picker-label">Style and brightness</div>}
      <div className="theme-picker-row">
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
        <div className="segmented" role="group" aria-label="Light or dark">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={theme.mode === m.id ? "selected" : ""}
              aria-pressed={theme.mode === m.id}
              onClick={() => setTheme({ ...theme, mode: m.id })}
            >
              {compact && m.id === "system" ? "Auto" : m.name}
            </button>
          ))}
        </div>
      </div>
      {!compact && (
        <>
          <div className="theme-picker-label">Logo</div>
          <div className="logo-choices" role="group" aria-label="Logo">
            {LOGOS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`logo-choice${theme.logo === l.id ? " selected" : ""}`}
                aria-pressed={theme.logo === l.id}
                onClick={() => setTheme({ ...theme, logo: l.id })}
              >
                <KeyholeMark size={56} logo={l.id} />
                <span>
                  <strong>{l.name}</strong>
                  <span className="cap-explain">{l.blurb}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
