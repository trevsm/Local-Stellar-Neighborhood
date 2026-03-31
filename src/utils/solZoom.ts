/**
 * Replicates the vertex shader point-size math on the CPU so we can cap
 * OrbitControls zoom before Sol's sprite exceeds a fraction of the viewport.
 */

const SOL_ABS_MAG = 4.83;
const INV_LN10 = 0.4342944819; // 1 / ln(10)

export function estimateSolPointSizePixels(
  depth: number,
  pixelRatio: number,
  magBright: number,
  magLimit: number,
): number {
  const distPC = Math.max(depth, 1e-10);
  const apparentMag = SOL_ABS_MAG + 5 * Math.log(distPC) * INV_LN10 - 5;
  const t = Math.max(0, Math.min(1, (magLimit - apparentMag) / (magLimit - magBright)));

  if (t < 0.001) return 0;

  const baseSize = 0.6 + (2.5 - 0.6) * Math.sqrt(t);
  const bloomT = Math.max(t - 0.5, 0) * 2.0;
  const bloom = 50 * bloomT * bloomT * bloomT;
  const nearBoost = Math.max(1, Math.min(12, 0.08 / distPC));

  const ps = pixelRatio * (baseSize + bloom) * nearBoost;
  return Math.max(0.5, Math.min(600, ps));
}

/**
 * Minimum camera–origin distance allowed before Sol's sprite would exceed
 * `fillRatio` of the smaller viewport side.
 */
export function minDistanceBeforeSolOverfillsViewport(
  viewportWidth: number,
  viewportHeight: number,
  pixelRatio: number,
  magBright: number,
  magLimit: number,
  fillRatio: number,
): number {
  const maxPx = Math.min(viewportWidth, viewportHeight) * fillRatio;

  let hi = 1e-6;
  while (hi < 1e15) {
    if (estimateSolPointSizePixels(hi, pixelRatio, magBright, magLimit) <= maxPx) {
      break;
    }
    hi *= 2;
  }
  if (hi >= 1e15) {
    return 1e15;
  }

  let lo = 1e-12;
  if (estimateSolPointSizePixels(lo, pixelRatio, magBright, magLimit) <= maxPx) {
    return lo;
  }

  for (let i = 0; i < 55; i++) {
    const mid = (lo + hi) / 2;
    if (estimateSolPointSizePixels(mid, pixelRatio, magBright, magLimit) > maxPx) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return hi;
}
