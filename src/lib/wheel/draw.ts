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
 * Largest bold font size (px) at which `text` fits within `maxWidth`.
 */
export function computeMaxFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontFace = "Arial",
): number {
  let low = 6;
  // Scale the ceiling with the room available so a large wheel is allowed to
  // use large type, while a short label never balloons past a quarter of it.
  let high = Math.max(50, Math.round(maxWidth / 4));
  let size = low;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    ctx.font = `bold ${mid}px ${fontFace}`;
    if (ctx.measureText(text).width <= maxWidth) {
      size = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return Math.max(size, 8);
}

/**
 * Font size for the whole wheel.
 *
 * Labels run along the slice, so their length is bounded hub-to-rim while
 * their height must fit inside the wedge. The second constraint is what makes
 * crowded wheels unreadable, so it replaces the old count-based guessing.
 */
export function computeWheelFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  optionCount: number,
  fontFace = "Arial",
): number {
  const { radius, hubRadius, labelRadius } = wheelGeometry(size);
  const radial = 2 * Math.min(labelRadius - hubRadius, radius - labelRadius);
  const tangential =
    optionCount <= 1
      ? Number.POSITIVE_INFINITY
      : 2 * labelRadius * Math.sin(Math.PI / optionCount);
  return Math.max(
    8,
    Math.min(
      computeMaxFontSize(ctx, text, radial, fontFace),
      tangential * 0.9,
    ),
  );
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
