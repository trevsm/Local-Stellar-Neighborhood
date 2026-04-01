// Renders stars as point sprites.
// Far away: classic PSF (Gaussian core + Lorentzian halo).
// Close up: resolved stellar disc with limb darkening and corona.

precision highp float;

varying vec3 vColor;
varying float vIntensity;
varying float vPointSize;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;

  float r = sqrt(r2);
  float r2n = r2 * 4.0;

  // --- PSF profile (distant stars) ---
  float core = exp(-r2n * 8.0);
  float halo = 1.0 / (1.0 + r2n * 12.0);
  float haloMix = smoothstep(0.15, 0.7, vIntensity);
  float psfProfile = core + halo * haloMix * 0.2;

  // --- Resolved sphere profile (nearby stars) ---
  float discR = 0.2;
  float rNorm = min(r / discR, 1.0);

  // Photosphere disc with soft edge
  float disc = 1.0 - smoothstep(discR - 0.006, discR + 0.006, r);

  // Limb darkening: cos(theta) power law like a real stellar atmosphere
  float mu = sqrt(1.0 - rNorm * rNorm);
  float limb = mix(0.45, 1.0, pow(mu, 0.45));
  float sphereBody = disc * limb;

  // Tight limb glow only (no long-range scatter — avoids a faint full-sprite ring)
  float glowR = max(r - discR, 0.0);
  float coronaFinal = (1.0 - disc) * exp(-glowR * 22.0) * 0.38;

  float sphereProfile = sphereBody + coronaFinal;
  // Fade out before the point-sprite edge so the circular billboard boundary never shows
  sphereProfile *= 1.0 - smoothstep(0.26, 0.31, r);

  // --- Blend based on point size ---
  float sphereT = smoothstep(40.0, 150.0, vPointSize);
  float profile = mix(psfProfile, sphereProfile, sphereT);

  float brightness = profile * vIntensity;
  if (brightness < 0.002) discard;

  // Hot white core / limb color gradient
  float psfWhite = core * core;
  float sphereWhite = disc * mu * mu;
  float whiteout = mix(psfWhite, sphereWhite, sphereT) * vIntensity;
  vec3 starColor = mix(vColor, vec3(1.0), whiteout);

  gl_FragColor = vec4(starColor, brightness);
}
