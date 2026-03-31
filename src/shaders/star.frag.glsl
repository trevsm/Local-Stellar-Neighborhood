// Point-spread function for physically-motivated star rendering.
// Combines a tight Gaussian core with Lorentzian (Cauchy) wings
// to approximate real optical diffraction + scatter.

precision highp float;

varying vec3 vColor;
varying float vIntensity;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;

  // Normalized squared radius: 0 at center, 1 at circle edge
  float r2n = r2 * 4.0;

  // Gaussian core — sharp, concentrated center
  float core = exp(-r2n * 8.0);

  // Lorentzian halo — broader power-law wings (models scatter/diffraction)
  float halo = 1.0 / (1.0 + r2n * 12.0);

  // Bright stars show the halo; dim stars are core-only
  float haloMix = smoothstep(0.15, 0.7, vIntensity);
  float profile = core + halo * haloMix * 0.2;

  float brightness = profile * vIntensity;
  if (brightness < 0.002) discard;

  // Bright star cores wash out to white (sensor/retinal saturation)
  float whiteout = core * core * vIntensity;
  vec3 starColor = mix(vColor, vec3(1.0), whiteout);

  // Additive blending (SRC_ALPHA, ONE): framebuffer += starColor * brightness
  gl_FragColor = vec4(starColor, brightness);
}
