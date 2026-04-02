// Physically-motivated star rendering.
// Computes apparent brightness from absolute magnitude and camera distance
// via the distance modulus: m = M + 5·log₁₀(d) − 5.

attribute vec3 color;
attribute float absMag;

uniform float pixelRatio;
uniform float magBright; // apparent mag for full display brightness
uniform float magLimit;  // apparent mag where stars vanish
uniform float viewportHeight; // drawing-buffer height (px) — perspective scale
uniform float tanHalfFov;     // tan(vertical FOV / 2)

varying vec3 vColor;
varying float vIntensity;
varying float vPointSize;

const float INV_LN10 = 0.4342944819; // 1 / ln(10)
/**
 * Exaggerated visual radius (parsecs) so stars resolve into discs at close zoom.
 * True R☉ ≈ 2.3e-8 pc, which is invisible at any catalog distance. ~1.5e-4 pc (~30 AU)
 * keeps stars as points beyond ~0.1 pc but lets them grow into discs as you zoom in.
 */
const float VISUAL_RADIUS_PC = 1.5e-4;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float dist = length(mvPosition.xyz);
  float distPC = max(dist, 1e-10);

  // Apparent magnitude from this camera position (inverse-square law)
  float apparentMag = absMag + 5.0 * log(distPC) * INV_LN10 - 5.0;

  // Linear in magnitude (= logarithmic in flux) → 0 at limit, 1 at bright
  float t = clamp((magLimit - apparentMag) / (magLimit - magBright), 0.0, 1.0);

  // Early-out for invisible stars
  if (t < 0.001) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vPointSize = 0.0;
    vIntensity = 0.0;
    vColor = vec3(0.0);
    return;
  }

  // Perceptual intensity (power curve concentrates dynamic range on bright end)
  vIntensity = t * t;

  // Desaturate dim stars — human color vision (cones) fails at low light
  float sat = smoothstep(0.0, 0.15, vIntensity);
  vec3 lum = vec3(dot(color, vec3(0.2126, 0.7152, 0.0722)));
  vColor = mix(lum, color, sat);

  // PSF-style footprint when far (magnitude-driven); small bloom only — no 1/d "nearBoost"
  // that hit a ceiling and made stars overlap as huge billboards.
  float baseSize = mix(0.45, 2.2, sqrt(t));
  float bloomT = max(t - 0.5, 0.0) * 2.0;
  float bloom = 5.5 * bloomT * bloomT * bloomT;
  float magPx = pixelRatio * (baseSize + bloom);

  // Angular diameter in pixels: θ ≈ 2·R/d → screen size via vertical FOV projection
  float fovScale = viewportHeight / (2.0 * tanHalfFov);
  float physDiamPx = (2.0 * VISUAL_RADIUS_PC / distPC) * fovScale;

  // Far away: magnitude model dominates; close: visual disc grows smoothly with 1/d
  float sizePx = max(physDiamPx, magPx);
  gl_PointSize = clamp(sizePx, 0.5, 2048.0);
  vPointSize = gl_PointSize;

  gl_Position = projectionMatrix * mvPosition;
}
