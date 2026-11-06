/**
 * Pure canvas helpers for the Wheel Spin tool. Kept framework-free so they can
 * be unit-tested without a DOM canvas implementation.
 */

/** Radii of the drawn wheel, derived from the square canvas size. */
export interface WheelGeometry {
  /** Outer edge of the slices. */
  radius: number;
  /** Centre hub. */
  hubRadius: number;
  /** Where a label's midpoint sits along the slice. */
  labelRadius: number;
}

/**
 * The wheel is drawn to fill the canvas: slices reach `0.49` of the size so
 * only the stroke is left over at the edge.
 */
export function wheelGeometry(size: number): WheelGeometry {
  const radius = size * 0.49;
  return {
    radius,
    hubRadius: size * 0.07,
    labelRadius: radius * 0.57,
  };
}

/**
 * Clearance kept between a label and whatever it could collide with: the
 * slice stroke, the label's own drop shadow, and the centre hub.
 */
const LABEL_GUTTER = 6;

/** Share of the em box a label can occupy across the wedge. */
const GLYPH_HALF_EM = 0.5;

/** Width of `text` when drawn at `fontPx`, measured with the context. */
function textWidthAt(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontPx: number,
  fontFace: string,
): number {
  ctx.font = `bold ${fontPx}px ${fontFace}`;
  return ctx.measureText(text).width;
}

/**
 * Largest font size at which a label still fits its slice.
 *
 * Two constraints, both evaluated with the text's real width:
 *
 * - **Radial**: the label runs along the slice, so it must clear the hub and
 *   the rim.
 * - **Across the wedge**: the slice narrows towards the hub, so the binding
 *   point is the label's *innermost* end, not its midpoint. Measuring the
 *   wedge at the midpoint (as this used to) lets long text on ~16 slices
 *   spill into its neighbours.
 *
 * Both shrink as the font grows, so a binary search finds the largest size
 * that satisfies them together.
 */
export function computeWheelFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  optionCount: number,
  fontFace = "Arial",
): number {
  const { radius, hubRadius, labelRadius } = wheelGeometry(size);
  const radialRun =
    2 * (Math.min(labelRadius - hubRadius, radius - labelRadius) - LABEL_GUTTER);
  const sinHalf =
    optionCount <= 1 ? null : Math.sin(Math.PI / optionCount);

  const fits = (fontPx: number): boolean => {
    const width = textWidthAt(ctx, text, fontPx, fontFace);
    if (width > radialRun) return false;
    if (sinHalf === null) return true;
    // Narrowest half-width available to the glyphs, at the inner end.
    const inner = labelRadius - width / 2;
    if (inner <= hubRadius) return false;
    return GLYPH_HALF_EM * fontPx + LABEL_GUTTER <= inner * sinHalf;
  };

  let low = 6;
  let high = Math.max(50, Math.round(labelRadius));
  let best = low;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (fits(mid)) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(best, 8);
}

/**
 * Which option sits under the pointer (top of the wheel) for the given
 * accumulated rotation in degrees.
 */
export function optionIndexAtPointer(
  rotationDeg: number,
  optionCount: number,
): number {
  if (optionCount <= 0) return -1;
  const anglePerOption = 360 / optionCount;
  let canvasAngle = (270 - (rotationDeg % 360)) % 360;
  if (canvasAngle < 0) canvasAngle += 360;
  return Math.floor(canvasAngle / anglePerOption) % optionCount;
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  option: string,
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  anglePerOption: number,
  fontSize: number,
  fontFace: string,
): void {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(startAngle + anglePerOption / 2);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${fontSize}px ${fontFace}`;
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.textBaseline = "middle";
  ctx.fillText(option, radius, 0);
  ctx.restore();
}

/**
 * Renders the wheel into `ctx` at the given square `size` (px). The palette
 * follows the app's accent family (magenta / indigo / violet) rather than the
 * original project's brown/green/yellow.
 */
export function drawWheel(
  ctx: CanvasRenderingContext2D,
  size: number,
  options: string[],
): void {
  const fontFace = "Arial";
  const centerX = size / 2;
  const centerY = size / 2;
  const { radius, hubRadius, labelRadius } = wheelGeometry(size);
  ctx.clearRect(0, 0, size, size);
  if (options.length === 0) return;

  const anglePerOption = (2 * Math.PI) / options.length;
  const longest = options.reduce((a, b) => (a.length > b.length ? a : b), "");
  const fontSize = computeWheelFontSize(
    ctx,
    longest,
    size,
    options.length,
    fontFace,
  );

  const palette = [
    "#9e4073",
    "#6366f1",
    "#9146ff",
    "#4f46e5",
    "#a855f7",
    "#ec4899",
    "#7c3aed",
    "#3b82f6",
  ];

  options.forEach((option, i) => {
    const startAngle = i * anglePerOption;
    const endAngle = (i + 1) * anglePerOption;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = palette[i % palette.length];
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 2;
    ctx.stroke();

    drawLabel(
      ctx,
      option,
      centerX,
      centerY,
      labelRadius,
      startAngle,
      anglePerOption,
      fontSize,
      fontFace,
    );
  });

  ctx.beginPath();
  ctx.arc(centerX, centerY, hubRadius, 0, 2 * Math.PI);
  ctx.fillStyle = "#141417";
  ctx.fill();
}
