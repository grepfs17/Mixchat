/**
 * Pure canvas helpers for the Wheel Spin tool. Kept framework-free so they can
 * be unit-tested without a DOM canvas implementation.
 */

/**
 * Largest bold font size (px) at which `text` fits within `maxWidth`, then
 * reduced a little based on how crowded the wheel is. Mirrors the original
 * spinthewheel sizing heuristics.
 */
export function computeMaxFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  optionCount: number,
  maxWidth: number,
  fontFace = "Arial",
): number {
  let low = 6;
  let high = 50;
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
  size -= optionCount * 0.45;
  if (optionCount >= 11 && optionCount <= 15) {
    size *= 0.9;
  } else if (optionCount >= 16 && optionCount <= 20) {
    size *= 0.75;
  } else if (optionCount > 20) {
    size *= Math.max(0.6 - optionCount * 0.01, 0.4);
  }
  return Math.max(size, 8);
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
  ctx.fillText(option, radius * 0.55, 0);
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
  const radius = size * 0.45;
  ctx.clearRect(0, 0, size, size);
  if (options.length === 0) return;

  const anglePerOption = (2 * Math.PI) / options.length;
  const longest = options.reduce((a, b) => (a.length > b.length ? a : b), "");
  const fontSize = computeMaxFontSize(
    ctx,
    longest,
    options.length,
    size * 0.44,
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
      radius,
      startAngle,
      anglePerOption,
      fontSize,
      fontFace,
    );
  });

  ctx.beginPath();
  ctx.arc(centerX, centerY, size * 0.07, 0, 2 * Math.PI);
  ctx.fillStyle = "#141417";
  ctx.fill();
}
