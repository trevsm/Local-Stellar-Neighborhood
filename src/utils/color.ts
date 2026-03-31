/**
 * B-V color index → sRGB for stars.
 *
 * 1. **Temperature** — Ballesteros (2012) empirical fit from B–V (main-sequence / catalog use).
 * 2. **Chromaticity** — Kim et al. spline for the **Planckian locus** in CIE 1931 xy (same curve as
 *    integrating Planck’s law × CIE 1931 2° CMFs; see Wikipedia “Planckian locus § Approximation”).
 * 3. **XYZ → linear sRGB** (D65), clip / normalize for display, **sRGB gamma**.
 *
 * AT-HYG `ci` is B–V for Hipparcos/Yale/Gliese sources and **B_T–V_T** for Tycho-2 (similar to B–V
 * for most colors; slightly redder for very cool stars — acceptable for visualization).
 */

const BV_MIN = -0.4;
const BV_MAX = 2.5;

/** Ballesteros (2012), MNRAS 427, 614 — T in Kelvin */
export function bvToTemperatureKelvin(bv: number): number {
  const bvClamped = Math.max(BV_MIN, Math.min(BV_MAX, bv));
  return (
    4600 *
    (1 / (0.92 * bvClamped + 1.7) + 1 / (0.92 * bvClamped + 0.62))
  );
}

/**
 * CIE 1931 xy on the Planckian locus (Kim et al. / Wikipedia piecewise approximation).
 * Valid ~1667–25000 K; outside range is clamped for stable hues.
 */
function blackbodyToxy(t: number): { x: number; y: number } {
  const T = Math.max(1667, Math.min(25000, t));

  let xc: number;
  if (T <= 4000) {
    xc =
      (-0.2661239 * 1e9) / (T * T * T) -
      (0.2343589 * 1e6) / (T * T) +
      (0.8776956 * 1e3) / T +
      0.17991;
  } else {
    xc =
      (-3.0258469 * 1e9) / (T * T * T) +
      (2.1070379 * 1e6) / (T * T) +
      (0.2226347 * 1e3) / T +
      0.24039;
  }

  let yc: number;
  if (T <= 2222) {
    yc =
      -1.1063814 * xc * xc * xc -
      1.3481102 * xc * xc +
      2.18555832 * xc -
      0.20219683;
  } else if (T <= 4000) {
    yc =
      -0.9549476 * xc * xc * xc -
      1.37418593 * xc * xc +
      2.09137015 * xc -
      0.16748867;
  } else {
    yc =
      3.081758 * xc * xc * xc -
      5.8733867 * xc * xc +
      3.75112997 * xc -
      0.37001483;
  }

  return { x: xc, y: yc };
}

/** xy with Y=1 → CIE XYZ (relative; only chromaticity matters after normalization). */
function xyToXyz(x: number, y: number): [number, number, number] {
  const eps = 1e-9;
  const yy = Math.max(y, eps);
  const X = x / yy;
  const Y = 1;
  const Z = (1 - x - y) / yy;
  return [X, Y, Z];
}

/** CIE XYZ (D65) → linear sRGB, IEC 61966-2-1 */
function xyzToLinearSrgb(x: number, y: number, z: number): [number, number, number] {
  const R = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const G = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const B = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return [R, G, B];
}

function linearSrgbToSrgbByte(c: number): number {
  const clamped = Math.max(0, Math.min(1, c));
  if (clamped <= 0.0031308) {
    return Math.round(255 * (12.92 * clamped));
  }
  return Math.round(255 * (1.055 * Math.pow(clamped, 1 / 2.4) - 0.055));
}

/**
 * Planckian chromaticity → display sRGB bytes (max channel normalized for hue clarity).
 */
function temperatureToSrgbBytes(t: number): [number, number, number] {
  if (!Number.isFinite(t) || t <= 0) {
    return [255, 255, 255];
  }

  const { x, y } = blackbodyToxy(t);
  const [X, Y, Z] = xyToXyz(x, y);
  let [lr, lg, lb] = xyzToLinearSrgb(X, Y, Z);

  lr = Math.max(0, lr);
  lg = Math.max(0, lg);
  lb = Math.max(0, lb);

  const m = Math.max(lr, lg, lb, 1e-12);
  lr /= m;
  lg /= m;
  lb /= m;

  return [
    linearSrgbToSrgbByte(lr),
    linearSrgbToSrgbByte(lg),
    linearSrgbToSrgbByte(lb),
  ];
}

/**
 * Convert catalog color index `ci` (B–V or B_T–V_T) to 8-bit sRGB.
 */
export function bvToRgbBytes(bv: number | null | undefined): [number, number, number] {
  if (bv == null || Number.isNaN(bv)) {
    return [200, 200, 205];
  }
  const t = bvToTemperatureKelvin(bv);
  return temperatureToSrgbBytes(t);
}
