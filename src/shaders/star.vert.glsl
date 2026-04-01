// Physically-motivated star rendering.
// Computes apparent brightness from absolute magnitude and camera distance
// via the distance modulus: m = M + 5·log₁₀(d) − 5.

attribute vec3 color;
attribute float absMag;

uniform float pixelRatio;
uniform float magBright; // apparent mag for full display brightness
uniform float magLimit;  // apparent mag where stars vanish

varying vec3 vColor;
varying float vIntensity;
varying float vPointSize;

const float INV_LN10 = 0.4342944819; // 1 / ln(10)

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

  // Point size: compact dots for faint stars, larger PSF footprint for bright
  float baseSize = mix(0.6, 2.5, sqrt(t));
  float bloomT = max(t - 0.5, 0.0) * 2.0;
  float bloom = 50.0 * bloomT * bloomT * bloomT;

  // Near-field boost: grow sprites as camera approaches, simulating resolved PSF
  float nearBoost = clamp(0.08 / distPC, 1.0, 12.0);

  gl_PointSize = pixelRatio * (baseSize + bloom) * nearBoost;
  gl_PointSize = clamp(gl_PointSize, 0.5, 600.0);
  vPointSize = gl_PointSize;

  gl_Position = projectionMatrix * mvPosition;
}
