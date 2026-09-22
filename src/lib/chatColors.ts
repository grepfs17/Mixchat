/**
 * Generates a consistent HSL color from a username string.
 * The same name always produces the same hue.
 */
export function getColorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash = hash & hash;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}

let cachedBgRgb: { r: number; g: number; b: number } | null = null;

function parseColor(color: string): { r: number; g: number; b: number } | null {
  // hex #RGB or #RRGGBB
  const hexMatch = color.match(/^#([0-9a-fA-F]{3}){1,2}$/);
  if (hexMatch) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
      };
    }
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
    };
  }

  // rgb/rgba(r, g, b ...)
  const rgbMatch = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return { r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] };
  }

  // hsl/hsla(h, s%, l% ...)
  const hslMatch = color.match(/^hsla?\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%/);
  if (hslMatch) {
    const h = +hslMatch[1] / 360;
    const s = +hslMatch[2] / 100;
    const l = +hslMatch[3] / 100;
    let r: number, g: number, b: number;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }

  return null;
}

function getRelativeLuminance(c: { r: number; g: number; b: number }): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b)
  );
}

function getContrastRatio(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number },
): number {
  const l1 = getRelativeLuminance(c1);
  const l2 = getRelativeLuminance(c2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Initialise cached background from the active CSS variable
if (typeof document !== "undefined" && typeof getComputedStyle === "function") {
  try {
    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue("--color-bg-primary")
      .trim();
    if (bg) cachedBgRgb = parseColor(bg);
  } catch {}
}

/** Call this when the theme changes so we re-evaluate the background colour. */
export function setThemeBackgroundColor(color: string) {
  cachedBgRgb = parseColor(color) || cachedBgRgb;
}

// WCAG large-text minimum contrast (3:1). Colours below this are hard to
// read on the dark chat background regardless of how far apart they are in
// RGB space (e.g. pure blue #0000ff is ~2.3:1 against a near-black bg).
const MIN_CONTRAST_RATIO = 3;

/**
 * Returns the provided colour unchanged unless it has insufficient contrast
 * against the current chat background, in which case it switches to white so
 * the username remains readable.
 */
export function getReadableUsernameColor(color: string | undefined): string {
  if (!color) return "#e2e8f0";
  const rgb = parseColor(color);
  if (!rgb || !cachedBgRgb) return color;
  if (getContrastRatio(rgb, cachedBgRgb) < MIN_CONTRAST_RATIO) {
    return "#ffffff";
  }
  return color;
}

interface ColorSource {
  author: string;
  userName?: string;
  authorColor?: string;
}

/**
 * Build a lowercased username (display name and login) → chat colour map from
 * the currently visible messages, so `@mentions` can be rendered in the
 * mentioned user's colour. Colours go through the same readability pass as the
 * username itself.
 */
export function buildMentionColorMap(
  messages: ReadonlyArray<ColorSource>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const message of messages) {
    if (!message.authorColor) continue;
    const color = getReadableUsernameColor(message.authorColor);
    if (message.author) map.set(message.author.toLowerCase(), color);
    if (message.userName) map.set(message.userName.toLowerCase(), color);
  }
  return map;
}
