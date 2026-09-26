/**
 * Look and feel: colourways, two styles, three logo designs, and light or
 * dark. Chosen per computer (kept in this browser), so whoever uses the app
 * on a machine can pick their own. Applied to <html> as data attributes the
 * stylesheet reads.
 */

export const COLOURWAYS = [
  { id: "violet", name: "Midnight violet", ink: "#1E1B4B", fill: "#7C3AED", paper: "#F5F3FF" },
  { id: "teal", name: "Deep teal", ink: "#0B3B3C", fill: "#0F766E", paper: "#EFFAF6" },
  { id: "pink", name: "Navy & pink", ink: "#172554", fill: "#BE185D", paper: "#FDF2F8" },
  { id: "lilac", name: "Cobalt & lilac", ink: "#1E3A8A", fill: "#C4B5FD", paper: "#F2F5FF" },
  { id: "forest", name: "Forest green", ink: "#14331F", fill: "#2F7D4A", paper: "#F1F7F2" },
  { id: "gold", name: "Charcoal & gold", ink: "#1F2328", fill: "#C9A227", paper: "#F6F5F1" },
  { id: "ocean", name: "Ocean blue", ink: "#0C2D48", fill: "#0369A1", paper: "#F0F7FC" },
  { id: "terracotta", name: "Warm terracotta", ink: "#3B1F14", fill: "#B4532A", paper: "#FBF4EF" },
  { id: "grey", name: "Plain greyscale", ink: "#18181B", fill: "#71717A", paper: "#F5F5F5" },
] as const;

export const STYLES = [
  { id: "bold", name: "Bold", blurb: "Heavy borders, square corners, strong header." },
  { id: "soft", name: "Soft", blurb: "Light borders, rounded cards, white header." },
] as const;

export const MODES = [
  { id: "light", name: "Light" },
  { id: "dark", name: "Dark" },
  { id: "system", name: "Match computer" },
] as const;

/** Three directions for the mark. Each is drawn in two colours: a block and what's cut through it. */
export const LOGOS = [
  { id: "keyhole", name: "Keyhole", blurb: "A keyhole cut through a solid block — the original." },
  { id: "vault", name: "Vault door", blurb: "The round door of a safe, with its handle." },
  { id: "monogram", name: "Monogram", blurb: "FV, set in a block." },
] as const;

export type Colourway = (typeof COLOURWAYS)[number]["id"];
export type Style = (typeof STYLES)[number]["id"];
export type Mode = (typeof MODES)[number]["id"];
export type Logo = (typeof LOGOS)[number]["id"];
export interface Theme {
  colour: Colourway;
  style: Style;
  mode: Mode;
  logo: Logo;
}

const KEY = "fv-theme";
const EVENT = "fv-theme-change";
const DEFAULT: Theme = { colour: "violet", style: "bold", mode: "light", logo: "keyhole" };

function pick<T extends { id: string }>(list: readonly T[], value: unknown, fallback: T["id"]): T["id"] {
  return list.some((x) => x.id === value) ? (value as T["id"]) : fallback;
}

export function readTheme(): Theme {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Theme> | null;
    return {
      colour: pick(COLOURWAYS, saved?.colour, DEFAULT.colour),
      style: pick(STYLES, saved?.style, DEFAULT.style),
      mode: pick(MODES, saved?.mode, DEFAULT.mode),
      logo: pick(LOGOS, saved?.logo, DEFAULT.logo),
    };
  } catch {
    return DEFAULT;
  }
}

/** The shapes of each logo on a 140×140 block, in the "hole" colour. */
export function logoShapes(logo: Logo, hole: string): string {
  switch (logo) {
    case "vault":
      return (
        `<circle cx="70" cy="70" r="44" fill="none" stroke="${hole}" stroke-width="12"/>` +
        `<circle cx="70" cy="70" r="12" fill="${hole}"/>` +
        `<rect x="66" y="26" width="8" height="88" fill="${hole}"/>` +
        `<rect x="26" y="66" width="88" height="8" fill="${hole}"/>`
      );
    case "monogram":
      return (
        // F
        `<path d="M26 34 H64 V48 H42 V62 H60 V76 H42 V106 H26 Z" fill="${hole}"/>` +
        // V
        `<path d="M70 34 H86 L96 82 L106 34 H122 L104 106 H88 Z" fill="${hole}"/>`
      );
    default:
      return `<circle cx="70" cy="56" r="26" fill="${hole}"/><path d="M56 66 L84 66 L94 116 L46 116 Z" fill="${hole}"/>`;
  }
}

/** The mark as an SVG string, for the browser tab icon. */
function markSvg(logo: Logo, ink: string, fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140"><rect width="140" height="140" fill="${ink}"/>${logoShapes(logo, fill)}</svg>`;
}

const darkQuery = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

function resolvedMode(theme: Theme): "light" | "dark" {
  if (theme.mode === "system") return darkQuery?.matches ? "dark" : "light";
  return theme.mode;
}

export function applyTheme(theme: Theme = readTheme()) {
  const root = document.documentElement;
  root.dataset.theme = theme.colour;
  root.dataset.style = theme.style;
  root.dataset.mode = resolvedMode(theme);
  root.style.colorScheme = resolvedMode(theme);
  const c = COLOURWAYS.find((x) => x.id === theme.colour)!;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolvedMode(theme) === "dark" ? "#0f1117" : c.ink);
  let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.appendChild(icon);
  }
  icon.type = "image/svg+xml";
  icon.href = `data:image/svg+xml,${encodeURIComponent(markSvg(theme.logo, c.ink, c.fill))}`;
}

// "Match computer" follows the computer's own light/dark setting as it changes.
darkQuery?.addEventListener?.("change", () => {
  if (readTheme().mode === "system") applyTheme();
});

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
