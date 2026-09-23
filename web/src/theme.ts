/**
 * Look and feel: four Keyhole colourways and two styles. Chosen per
 * computer (kept in this browser), so whoever uses the app on a machine can
 * pick their own. Applied to <html> as data attributes the stylesheet reads.
 */

export const COLOURWAYS = [
  { id: "violet", name: "Midnight violet", ink: "#1E1B4B", fill: "#7C3AED", paper: "#F5F3FF" },
  { id: "teal", name: "Deep teal", ink: "#0B3B3C", fill: "#0F766E", paper: "#EFFAF6" },
  { id: "pink", name: "Navy & pink", ink: "#172554", fill: "#BE185D", paper: "#FDF2F8" },
  { id: "lilac", name: "Cobalt & lilac", ink: "#1E3A8A", fill: "#C4B5FD", paper: "#F2F5FF" },
] as const;

export const STYLES = [
  { id: "bold", name: "Bold", blurb: "Heavy borders, square corners, strong header." },
  { id: "soft", name: "Soft", blurb: "Light borders, rounded cards, white header." },
] as const;

export type Colourway = (typeof COLOURWAYS)[number]["id"];
export type Style = (typeof STYLES)[number]["id"];
export interface Theme {
  colour: Colourway;
  style: Style;
}

const KEY = "fv-theme";
const EVENT = "fv-theme-change";
const DEFAULT: Theme = { colour: "violet", style: "bold" };

export function readTheme(): Theme {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Theme> | null;
    const colour = COLOURWAYS.some((c) => c.id === saved?.colour) ? saved!.colour! : DEFAULT.colour;
    const style = STYLES.some((s) => s.id === saved?.style) ? saved!.style! : DEFAULT.style;
    return { colour, style };
  } catch {
    return DEFAULT;
  }
}

/** The Keyhole mark as an SVG string, for the browser tab icon. */
function markSvg(ink: string, fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140"><rect width="140" height="140" fill="${ink}"/><circle cx="70" cy="56" r="26" fill="${fill}"/><path d="M56 66 L84 66 L94 116 L46 116 Z" fill="${fill}"/></svg>`;
}

export function applyTheme(theme: Theme = readTheme()) {
  const root = document.documentElement;
  root.dataset.theme = theme.colour;
  root.dataset.style = theme.style;
  const c = COLOURWAYS.find((x) => x.id === theme.colour)!;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", c.ink);
  let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.appendChild(icon);
  }
  icon.type = "image/svg+xml";
  icon.href = `data:image/svg+xml,${encodeURIComponent(markSvg(c.ink, c.fill))}`;
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, JSON.stringify(theme));
  } catch {
    /* still applies for this visit */
  }
  applyTheme(theme);
  window.dispatchEvent(new Event(EVENT));
}

export function onThemeChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
