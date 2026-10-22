/**
 * Emote modifier vocabulary shared by BTTV and FrankerFaceZ.
 *
 * BTTV writes effect prefixes *before* the emote, attached (`w!KEKW`) or bare
 * (`w! KEKW`), and chains them (`w!h!KEKW`). Both `X!` and `!X` forms are
 * accepted. FFZ writes a modifier word *after* the emote (`KEKW ffzX`). Those
 * words carry FFZ's Hidden flag, so `ffz.ts` filters them out of the emote map
 * and they exist here only as effects. One vocabulary keeps rendering uniform.
 */
export type EmoteEffect =
  | "rotateL"
  | "rotateR"
  | "flipX"
  | "flipY"
  | "wide"
  | "cursed"
  | "rainbow"
  | "hyper"
  | "shake"
  | "jam"
  | "bounce"
  | "slide"
  | "arrive"
  | "leave"
  | "spin";

/** BTTV `X!` prefix letter → effect. `z` is handled separately (zero-width). */
export const BTTV_MODIFIERS: Record<string, EmoteEffect> = {
  w: "wide",
  h: "flipX",
  v: "flipY",
  c: "cursed",
  l: "rotateL",
  r: "rotateR",
  p: "rainbow",
  s: "shake",
};

/** FFZ effect word (typed after the target emote) → effect. */
export const FFZ_EFFECTS: Record<string, EmoteEffect> = {
  ffzX: "flipX",
  ffzY: "flipY",
  ffzW: "wide",
  ffzCursed: "cursed",
  ffzRainbow: "rainbow",
  ffzHyper: "hyper",
  ffzJam: "jam",
  ffzBounce: "bounce",
  ffzSlide: "slide",
  ffzArrive: "arrive",
  ffzLeave: "leave",
  ffzSpin: "spin",
};

export function isFfzEffectWord(word: string): boolean {
  return Object.prototype.hasOwnProperty.call(FFZ_EFFECTS, word);
}

/**
 * Canonical application order: geometry → color → motion. Used to keep the
 * emitted CSS deterministic regardless of the order the user typed effects in.
 */
const EFFECT_ORDER: EmoteEffect[] = [
  "rotateL",
  "rotateR",
  "flipX",
  "flipY",
  "wide",
  "cursed",
  "rainbow",
  "hyper",
  "shake",
  "jam",
  "bounce",
  "slide",
  "arrive",
  "leave",
  "spin",
];

export function normalizeEffects(effects: EmoteEffect[]): EmoteEffect[] {
  if (effects.length === 0) return effects;
  const seen = new Set(effects);
  return EFFECT_ORDER.filter((e) => seen.has(e));
}

export interface BttvPrefixParse {
  effects: EmoteEffect[];
  zeroWidth: boolean;
  /** Remainder of the word after the prefix tokens were stripped. */
  rest: string;
}

function isModifierLetter(ch: string): boolean {
  return (
    ch === "z" || Object.prototype.hasOwnProperty.call(BTTV_MODIFIERS, ch)
  );
}

/**
 * Strip chained BTTV modifier prefixes off the front of a word. Handles both
 * `w!h!KEKW` and `!w!hKEKW` (and a bare `w!`). A word made up entirely of
 * prefixes returns `rest === ""`, signalling it should apply to the next word.
 */
export function parseBttvPrefixes(word: string): BttvPrefixParse {
  const effects: EmoteEffect[] = [];
  let zeroWidth = false;
  let i = 0;
  while (i + 1 < word.length) {
    // `X!` form
    if (word[i + 1] === "!" && isModifierLetter(word[i].toLowerCase())) {
      const letter = word[i].toLowerCase();
      if (letter === "z") zeroWidth = true;
      else effects.push(BTTV_MODIFIERS[letter]);
      i += 2;
      continue;
    }
    // `!X` form
    if (word[i] === "!" && isModifierLetter(word[i + 1].toLowerCase())) {
      const letter = word[i + 1].toLowerCase();
      if (letter === "z") zeroWidth = true;
      else effects.push(BTTV_MODIFIERS[letter]);
      i += 2;
      continue;
    }
    break;
  }
  return { effects, zeroWidth, rest: word.slice(i) };
}

export interface EffectRenderInfo {
  /** Explicit CSS width for the `wide` (GrowX) effect. */
  width?: string;
  /** Static transform (flip / rotate) applied to the image. */
  transform?: string;
  /** Composed static filter (cursed / hyper red). */
  filter?: string;
  /** `transform-origin` override (bounce). */
  transformOrigin?: string;
  /** Composed CSS animation list applied to the wrapper. */
  animation?: string;
  /** True when the `slide` effect requires a repeating background. */
  background?: boolean;
  /** Rendered width (em) of a sliding emote, exposed as `--ffz-width`. */
  slideWidthEm?: number;
  /** Loop duration of the slide animation, exposed as `--ffz-speed-x`. */
  slideSpeed?: string;
}

/**
 * Per-effect CSS, ported from FrankerFaceZ's `EFFECT_STYLES`
 * (`src/modules/chat/emotes.js`). `animationFilter` is used instead of
 * `animation` when a static filter is present, so rainbow hue-rotate keyframes
 * preserve the composed filter.
 */
interface EffectStyleMeta {
  transform?: string;
  filter?: string;
  transformOrigin?: string;
  animation?: string;
  animationFilter?: string;
  background?: boolean;
}

const EFFECT_STYLES: Record<EmoteEffect, EffectStyleMeta> = {
  rotateL: { transform: "rotate(-90deg)" },
  rotateR: { transform: "rotate(90deg)" },
  flipX: { transform: "scaleX(-1)" },
  flipY: { transform: "scaleY(-1)" },
  wide: {},
  cursed: { filter: "grayscale(1) brightness(0.7) contrast(2.5)" },
  rainbow: {
    animation: "ffz-effect-rainbow 2s linear infinite",
    animationFilter: "ffz-effect-rainbow-filter 2s linear infinite",
  },
  hyper: {
    filter: "brightness(0.2) sepia(1) brightness(2.2) contrast(3) saturate(8)",
    animation: "ffz-effect-shake 0.1s linear infinite",
  },
  shake: { animation: "ffz-effect-shake 0.1s linear infinite" },
  jam: { animation: "ffz-effect-jam 0.6s linear infinite" },
  bounce: {
    animation: "ffz-effect-bounce 0.5s linear infinite",
    transformOrigin: "bottom center",
  },
  slide: {
    background: true,
    animation: "ffz-effect-slide var(--ffz-speed-x) linear infinite",
  },
  arrive: { animation: "ffz-effect-appear 3s infinite linear" },
  leave: { animation: "ffz-effect-leave 3s infinite linear" },
  spin: { animation: "ffz-effect-rotate 1.5s infinite linear" },
};

/**
 * Translate a set of effects into the CSS needed to render them. Geometry
 * effects become a composed `transform`/`width` for the `<img>`. Filter and
 * motion effects target a wrapper element so CSS animations cannot clobber the
 * image's inline transform.
 */
export function describeEffects(
  effects: EmoteEffect[],
): EffectRenderInfo | null {
  const uniq = normalizeEffects(effects);
  if (uniq.length === 0) return null;

  const transforms: string[] = [];
  const filters: string[] = [];
  const animationMetas: EffectStyleMeta[] = [];
  let transformOrigin: string | undefined;
  let background = false;
  let width: string | undefined;

  for (const effect of uniq) {
    if (effect === "wide") {
      width = "4em";
      continue;
    }
    const meta = EFFECT_STYLES[effect];
    if (!meta) continue;
    if (meta.transform) transforms.push(meta.transform);
    if (meta.filter) filters.push(meta.filter);
    if (meta.transformOrigin) transformOrigin = meta.transformOrigin;
    if (meta.background) background = true;
    if (meta.animation) animationMetas.push(meta);
  }

  const transform = transforms.length > 0 ? transforms.join(" ") : undefined;
  const filter = filters.length > 0 ? filters.join(" ") : undefined;

  const seen = new Set<string>();
  const animationList: string[] = [];
  for (const meta of animationMetas) {
    const name =
      filter && meta.animationFilter ? meta.animationFilter : meta.animation;
    if (!name) continue;
    const key = name.split(" ")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    animationList.push(name);
  }
  const animation =
    animationList.length > 0 ? animationList.join(", ") : undefined;

  if (!width && !transform && !filter && !animation && !background) return null;

  const slideWidthEm = width ? Number.parseFloat(width) : 2;
  return {
    width,
    transform,
    filter,
    transformOrigin,
    animation,
    background,
    slideWidthEm: background ? slideWidthEm : undefined,
    slideSpeed: background ? `${slideWidthEm / 4}s` : undefined,
  };
}
