/**
 * The water: one SkSL runtime shader, drawn at about 1 pixel per 1.5pt and
 * scaled up (everything in it is soft). A height field of slow swell,
 * up to 8 ripples (finger, taps, blooms, closing loops), the koi's V-wake and
 * the bulge of its body, lit by the moon: a broken reflection, faint caustics
 * and glints where ripples tilt the surface toward it.
 *
 * Coordinates: u = fragCoord / res.x, so x runs 0..1 and y 0..aspect, the
 * same pond units the engine uses. Output is premultiplied, opaque.
 */
export const WATER_SKSL = `
uniform float2 res;
uniform float t;
uniform float dim;
uniform float veil;
uniform float rest;
uniform float2 moon;
uniform float3 light;
uniform float4 koi;
uniform float4 rip[8];

float hash1(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

float swell(float2 u) {
  return 0.5 * sin(u.x * 9.0 + t * 0.5 + sin(u.y * 3.0 + t * 0.2)) + 0.35 * sin(u.y * 13.0 - t * 0.4 + u.x * 4.0) + 0.15 * sin((u.x - u.y) * 23.0 + t * 0.8);
}

// The moving water: ripples and the koi. Their slopes catch the light.
float disturb(float2 u) {
  float h = 0.0;
  for (int i = 0; i < 8; i++) {
    float4 r = rip[i];
    if (r.w > 0.0) {
      float d = length(u - r.xy);
      float x = d - (r.z * 0.17 + 0.004);
      float env = exp(-x * x * 1300.0) * r.w * exp(-r.z * 1.0) / (1.0 + d * 7.0);
      h += env * cos(x * 150.0);
    }
  }
  float2 dir = float2(cos(koi.z), sin(koi.z));
  float2 q = u - koi.xy;
  float along = dot(q, dir);
  float side = dot(q, float2(-dir.y, dir.x));
  float sp = clamp(koi.w / 0.6, 0.0, 1.0);
  float a = along + 0.07;
  h -= 0.6 * exp(-a * a * 260.0 - side * side * 2400.0) * (0.3 + sp);
  float behind = -along - 0.03;
  if (behind > 0.0) {
    float arm = abs(side) - behind * 0.36;
    h += 0.7 * exp(-arm * arm * 1800.0 - behind * 4.5) * sp * cos(behind * 110.0 - t * 7.0);
  }
  return h;
}

half4 main(float2 p) {
  float2 u = p / res.x;
  float e = 1.6 / res.x;
  float h = disturb(u);
  float hx = (disturb(u + float2(e, 0.0)) - h) / e;
  float hy = (disturb(u + float2(0.0, e)) - h) / e;
  float sw = swell(u);

  // Light from the moon's side: slopes facing it brighten, the others darken.
  float2 toMoon = normalize(moon - u + float2(0.0001, 0.0));
  float slope = (hx * toMoon.x + hy * toMoon.y) * 0.0045;
  float shine = clamp(slope, -0.6, 1.0);

  float3 deep = float3(0.008, 0.014, 0.016) * (0.85 + 0.15 * sw);
  float md = length((u - moon) * float2(1.0, 0.5));

  // The moon's reflection, broken by the water: a soft disc, then a column
  // of separate glints. Each band of water has its own glint (its own width,
  // its own offset, its own shimmer), they scatter wider further down, and
  // some bands catch nothing at all.
  float wob = hx * 0.00025 + sw * 0.004;
  float below = u.y - moon.y;
  float band = u.y * 150.0 + sw * 1.3 + h * 0.5;
  float row = floor(band);
  float fr = fract(band);
  float r1 = hash1(row);
  float r2 = hash1(row + 17.0);
  float r3 = hash1(row + 41.0);
  float spread = 0.01 + max(below, 0.0) * 0.11;
  float cx = moon.x + wob + (r1 - 0.5) * spread * 2.0;
  float halfw = 0.003 + r2 * (0.006 + max(below, 0.0) * 0.05);
  float gx = 1.0 - smoothstep(halfw * 0.35, halfw, abs(u.x - cx));
  float gy = smoothstep(0.0, 0.4, fr) * (1.0 - smoothstep(0.55, 1.0, fr));
  float flick = max(0.0, 0.35 + 0.65 * sin(t * (0.7 + r3 * 1.5) + r1 * 6.283));
  float fade = smoothstep(-0.015, 0.02, below) * exp(-max(below, 0.0) * 2.6);
  float glints = gx * gy * flick * fade * step(0.3, r3);
  float dx = u.x - moon.x - wob;
  float column = exp(-dx * dx / (0.0006 + max(below, 0.0) * 0.004)) * fade;
  float disc = exp(-pow(length((u - moon) * float2(1.0, 1.7)) / 0.03, 2.0));
  float moonlight = disc * 0.26 + glints * 0.2 + column * 0.02;

  // A few faint caustic threads near the moonlight.
  float c = sin(u.x * 37.0 + t * 0.5 + sin(u.y * 27.0 - t * 0.35)) * sin(u.y * 33.0 - t * 0.45 + sin(u.x * 21.0 + t * 0.25));
  float caustic = pow(abs(c), 9.0) * 0.022 * exp(-md * 2.2);

  float lit = moonlight + caustic + max(shine, 0.0) * 0.16;
  float3 col = deep * (1.0 + min(shine, 0.0) * 0.8) + light * lit;
  col *= dim * (1.0 - 0.72 * veil) * (1.0 - rest);
  return half4(col, 1.0);
}
`
