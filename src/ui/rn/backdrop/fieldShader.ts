/**
 * The soft "field" of every backdrop scene, as one SkSL runtime shader.
 *
 * It runs at about 1 pixel per 1.5pt (see BackdropCanvas) because everything in
 * it is soft light: bokeh, haze, fog, ink, the lamp beam, moonlight on water.
 * Crisp things (drops, embers, strings, grass) are drawn by the particle layer.
 *
 * Coordinates: p = fragCoord / width, so x runs 0..1 and y runs 0..aspect.
 * Scene indices match BACKDROP_IDS in src/core/backdrop/scenes.ts. The geometry
 * shared with the simulation (string positions, lamp cone, Chladni modes, cove
 * crest, delta pulse) uses the same formulas as src/core/backdrop/sim.ts.
 *
 * Output is premultiplied. During a sound change, scene A dissolves into scene B
 * along a noisy circular front growing from the dial, with a faint rim of light.
 */
export const FIELD_SKSL = `
uniform float2 res;
uniform float t;
uniform float sa;
uniform float sb;
uniform float edge;
uniform float settled;
uniform float intensity;
uniform float4 pal[8];
uniform float pulse;
uniform float crest;
uniform float4 strings[4];
uniform float4 ink[4];
uniform float4 chl;
uniform float chlMix;

const float PI = 3.14159265;

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + float2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}

float4 lit(float3 c, float a) {
  float k = clamp(a, 0.0, 1.0);
  return float4(c * k, k);
}

float4 over(float4 top, float4 bottom) {
  return top + bottom * (1.0 - top.a);
}

// 0 Theta rain: out-of-focus lights behind a wet window, faint condensation.
float4 sRain(float2 p, float asp, float3 c1, float3 c2, float3 c3) {
  float4 acc = float4(0.0);
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float2 c = float2(fract(0.17 + fi * 0.37), (0.1 + fract(fi * 0.61) * 0.85) * asp);
    c += 0.035 * float2(sin(t * 0.05 + fi * 1.7), cos(t * 0.04 + fi * 2.3));
    float r = 0.07 + 0.06 * fract(fi * 0.73);
    float d = length(p - c);
    float disc = 1.0 - smoothstep(r - 0.03, r, d);
    float rim = (1.0 - smoothstep(0.0, 0.02, abs(d - r + 0.014))) * 0.3;
    float tex = 0.85 + 0.3 * noise((p - c) * 40.0 + fi * 7.0);
    float br = (0.07 + 0.06 * fract(fi * 0.29)) * (0.85 + 0.15 * sin(t * 0.13 + fi));
    float3 col = mix(c1, c3 * 1.6, fract(fi * 0.45));
    if (i == 5) { col = float3(0.98, 0.78, 0.52); }
    acc = over(lit(col, (disc * 0.7 * tex + rim) * br), acc);
  }
  float h = fbm(p * 2.2 + float2(0.0, t * 0.01));
  float haze = (0.03 + 0.06 * h) * (1.0 - smoothstep(0.0, asp, p.y));
  return over(lit(mix(c3, c2, 0.3), haze), acc);
}

float stringGlow(float2 p, float y, float k, float e) {
  float xb = 0.06 + 0.88 * k / 12.0;
  float xt = 0.5 + (xb - 0.5) * 0.62;
  float x = mix(xt, xb, y);
  float d = (p.x - x) / 0.03;
  return e * exp(-d * d);
}

// 1 Nocturne: felt-warm light low in the room, strings glow while they sound.
float4 sNocturne(float2 p, float asp, float3 c1, float3 c2, float3 c4) {
  float y = clamp(p.y / asp, 0.0, 1.0);
  float4 acc = lit(mix(c4, c1, 0.4), 0.16 * exp(-(asp - p.y) * 5.0));
  float glow = 0.0;
  for (int j = 0; j < 4; j++) {
    float4 e = strings[j];
    float k = float(j) * 4.0;
    glow += stringGlow(p, y, k, e.x);
    glow += stringGlow(p, y, k + 1.0, e.y);
    glow += stringGlow(p, y, k + 2.0, e.z);
    glow += stringGlow(p, y, k + 3.0, e.w);
  }
  return over(lit(c2, glow * 0.2), acc);
}

// 2 Hearth: a low, breathing bed of heat with shimmering air above it.
float4 sHearth(float2 p, float asp, float3 c1, float3 c2, float3 c4) {
  float y = asp - p.y;
  float warp = fbm(float2(p.x * 3.0, y * 2.0 - t * 0.35));
  float tongue = fbm(float2(p.x * 4.0 + warp * 1.5, y * 3.0 - t * 0.6));
  float centre = 0.55 + 0.45 * (1.0 - smoothstep(0.1, 0.6, abs(p.x - 0.5)));
  float h = (0.08 + 0.2 * tongue) * centre;
  float body = 1.0 - smoothstep(h - 0.06, h + 0.1, y);
  float3 col = mix(c1, c4, smoothstep(0.0, h + 0.1, y));
  float shimmer = (1.0 - smoothstep(0.1, 0.55, y)) * smoothstep(0.55, 0.8, fbm(float2(p.x * 7.0, y * 5.0 - t * 0.5))) * 0.06;
  return over(lit(col, body * (0.2 + 0.18 * warp)), lit(c2, shimmer));
}

// 3 Lunar tide: moonlight laid on dark water in perspective, a slow swell.
float4 sTide(float2 p, float asp, float3 c1, float3 c2, float3 c3) {
  float yh = 0.43 * asp;
  float mx = 0.66;
  if (p.y < yh) {
    float2 q = (p - float2(mx, yh + 0.02)) * float2(1.0, 2.6);
    float sky = exp(-length(q) * 3.2) * 0.16;
    float dl = (p.y - yh) / 0.004;
    float line = exp(-dl * dl) * 0.12 * exp(-abs(p.x - mx) * 2.5);
    return lit(mix(c3, c2, 0.4), sky + line);
  }
  float z = (p.y - yh) / (asp - yh);
  float persp = 1.0 / (z + 0.06);
  float2 w = float2((p.x - mx) * persp * 0.6, persp);
  float swell = 0.5 + 0.5 * sin(w.y * 1.3 - t * 0.55 + fbm(w * 0.35 + t * 0.03) * 3.0);
  swell *= smoothstep(0.0, 0.25, z);
  float width = 0.04 + 0.32 * z;
  float dx = (p.x - mx) / width;
  float path = exp(-dx * dx);
  float rip = fbm(float2(w.x * 2.0, w.y * 0.8 - t * 0.15));
  float refl = exp(-z * 7.0) * 0.1 * exp(-abs(p.x - mx) * 2.5);
  float a = path * (0.06 + 0.12 * rip * (0.4 + 0.6 * swell)) + 0.025 * swell * (1.0 - z) + refl;
  return lit(mix(c1, c2, path * 0.6), a);
}

// 4 Deep delta: velvet dark; one slow ring of light per breath.
float4 sDelta(float2 p, float asp, float3 c1, float3 c2, float3 c3) {
  float2 o = float2(0.5, 0.3 * asp);
  float d = length(p - o);
  float r = pulse * 1.9;
  float k = (d - r) / (0.06 + 0.12 * pulse);
  float ring = exp(-k * k) * pow(1.0 - pulse, 1.5);
  float velvet = fbm(p * 1.6 + float2(t * 0.004, -t * 0.003));
  float heart = exp(-d * 3.0) * 0.05 * (0.5 + 0.5 * cos(2.0 * PI * pulse));
  float4 acc = lit(c3, 0.05 * velvet + heart);
  return over(lit(mix(c2, c1, 0.5), ring * 0.13), acc);
}

// 5 Still horizon: a long band of cloud, gusts as faint moving sheets of air.
float4 sHorizon(float2 p, float asp, float3 c1, float3 c2, float3 c3) {
  float bd = (p.y - 0.2 * asp) / 0.14;
  float band = exp(-bd * bd);
  float c = fbm(float2(p.x * 1.3 - t * 0.018, p.y * 6.0));
  float cloud = smoothstep(0.45, 0.78, c) * band * 0.2;
  float g = fbm(float2(p.x * 1.1 - t * 0.09, p.y * 7.0 + 3.0));
  float sheet = smoothstep(0.58, 0.8, g) * 0.06;
  float glow = exp(-(asp - p.y) * 6.0) * 0.16;
  float4 acc = lit(c1, glow);
  acc = over(lit(c2, sheet), acc);
  return over(lit(mix(c2, c3, 0.3), cloud), acc);
}

// 6 Ink reverie: drops of luminous ink blooming and curling in still water.
float4 sInk(float2 p, float3 c1, float3 c2) {
  float4 acc = float4(0.0);
  for (int i = 0; i < 4; i++) {
    float4 dr = ink[i];
    float age = t - dr.z;
    if (age >= 0.0 && age < 45.0 && length(p - dr.xy) < dr.w * 1.7) {
      float r = dr.w * (0.35 + 0.65 * (1.0 - exp(-age / 5.0)));
      float2 q = (p - dr.xy) / r;
      float sd = float(i) * 3.7 + fract(dr.z * 0.013) * 50.0;
      float2 w1 = float2(fbm(q * 1.3 + sd + age * 0.03), fbm(q * 1.3 + sd + 4.7 - age * 0.025));
      float2 w2 = float2(fbm(q * 2.1 + w1 * 2.2 + sd * 1.3), fbm(q * 2.1 + w1 * 2.2 + sd + 9.1));
      float l = length(q + (w2 - 0.5) * 1.1);
      float body = 1.0 - smoothstep(0.2, 1.0, l);
      float veins = fbm(q * 3.0 + w2 * 3.0 + sd);
      float dye = body * smoothstep(0.38, 0.72, veins);
      float fade = exp(-age / 12.0) * smoothstep(0.0, 1.2, age);
      acc = over(lit(mix(c1, c2, dye), (dye * 0.5 + body * 0.07) * fade * 0.5), acc);
    }
  }
  return acc;
}

float chladni(float n, float m, float u, float v) {
  return cos(n * PI * u) * cos(m * PI * v) - cos(m * PI * u) * cos(n * PI * v);
}

// 7 Adagio dusk: the plate's nodal lines glow faintly under the sand.
float4 sAdagio(float2 p, float asp, float3 c1, float3 c2, float3 c4) {
  float v = p.y / asp;
  float f = mix(chladni(chl.x, chl.y, p.x, v), chladni(chl.z, chl.w, p.x, v), chlMix);
  // Clearer and finer up high, where the dial's glass sits over them.
  float up = exp(-pow((p.y - 0.3 * asp) / (0.32 * asp), 2.0));
  float line = exp(-abs(f) * (12.0 + 10.0 * up)) * (0.035 + 0.06 * up);
  float4 acc = lit(mix(c4, c1, 0.5), exp(-p.y * 2.5) * 0.12);
  return over(lit(c2, line), acc);
}

// 8 Starfield: a dusty galactic band turning slowly around the dial.
float4 sStarfield(float2 p, float asp, float3 c2, float3 c3) {
  float2 o = float2(0.5, 0.3 * asp);
  float ang = t * 0.004;
  float cs = cos(ang);
  float sn = sin(ang);
  float2 q = p - o;
  q = float2(cs * q.x - sn * q.y, sn * q.x + cs * q.y);
  float2 dir = float2(0.8, 0.6);
  float dist = dot(q, float2(-dir.y, dir.x));
  float along = dot(q, dir);
  float band = exp(-dist * dist / 0.05);
  float dust = fbm(float2(along * 3.0, dist * 6.0) + 11.0);
  float lanes = smoothstep(0.5, 0.75, fbm(float2(along * 5.0, dist * 12.0) + 3.0));
  return lit(mix(c3, c2, dust), band * (0.04 + 0.12 * dust) * (1.0 - 0.7 * lanes));
}

// 9 Amber study: a desk-lamp cone from the corner, haze turning inside it.
float4 sAmber(float2 p, float3 c1, float3 c2) {
  float2 q = p + float2(0.06, 0.1);
  float2 dir = float2(0.527, 0.85);
  float along = dot(q, dir);
  float perp = abs(q.x * dir.y - q.y * dir.x);
  float beam = 0.0;
  if (along > 0.0) {
    beam = (1.0 - smoothstep(0.2, 0.36, perp / along)) * exp(-along * 0.45);
  }
  float haze = fbm(p * 3.0 + float2(t * 0.01, -t * 0.02));
  float breath = 0.92 + 0.08 * sin(t * 0.3);
  float src = exp(-length(q) * 9.0) * 0.25;
  return lit(mix(c1, c2, 0.3), (beam * (0.1 + 0.12 * haze) + src) * breath);
}

float treeLine(float x, float scale, float seed, float hMin, float hVar) {
  float fx = x * scale + seed * 13.0;
  float h = hMin + hVar * hash(float2(floor(fx), seed));
  float jitter = (hash(float2(floor(fx), seed + 1.0)) - 0.5) * 0.3;
  return pow(max(0.0, 1.0 - abs(fract(fx) - 0.5 - jitter) * 2.2), 1.5) * h;
}

float ridge(float x, float base, float scale, float seed) {
  float hill = (noise(float2(x * 2.2 + seed, seed)) - 0.5) * 0.07;
  float tall = treeLine(x, scale, seed, 0.02, 0.05);
  float small = treeLine(x, scale * 2.3, seed + 5.0, 0.008, 0.02);
  return base + hill - max(tall, small);
}

// 10 Mist & pine: two far ridges of pines, luminous fog rolling between them.
float4 sMist(float2 p, float asp, float3 c2, float3 c3, float3 c4) {
  float yb1 = 0.58 * asp;
  float yb2 = 0.68 * asp;
  float3 fogCol = mix(c3, c2, 0.55);
  float v = (p.y - yb1 + 0.04) / 0.2;
  float4 acc = lit(fogCol, 0.26 * exp(-v * v));
  float low = fbm(float2(p.x * 1.5 - t * 0.015, p.y * 3.0 + 9.0));
  acc = over(lit(fogCol, (0.12 + 0.12 * low) * exp(-(asp - p.y) * 4.0)), acc);
  float y1 = ridge(p.x, yb1, 24.0, 1.0);
  float y2 = ridge(p.x, yb2, 15.0, 2.0);
  float3 dark = c4 * 0.15;
  // Far ridge: lighter, it sits deeper in the mist.
  acc = over(lit(mix(dark, fogCol, 0.35), 0.6 * smoothstep(y1 - 0.003, y1 + 0.003, p.y)), acc);
  float fog1 = fbm(float2(p.x * 2.0 - t * 0.02, p.y * 5.0));
  float f1 = (p.y - yb1 - 0.03) / 0.05;
  acc = over(lit(fogCol, (0.12 + 0.3 * fog1) * exp(-f1 * f1)), acc);
  acc = over(lit(dark, 0.85 * smoothstep(y2 - 0.003, y2 + 0.003, p.y)), acc);
  float fog2 = fbm(float2(p.x * 1.6 - t * 0.035, p.y * 4.0 + 4.0));
  float f2 = (p.y - yb2 - 0.04) / 0.06;
  acc = over(lit(fogCol, (0.1 + 0.3 * fog2) * exp(-f2 * f2)), acc);
  // Faint glow returning at the bottom so the near pines stand out against it.
  return over(lit(fogCol, (0.08 + 0.1 * low) * smoothstep(0.82 * asp, asp, p.y)), acc);
}

// 11 Midnight cove: no moon; breaking surf lights up blue-green and fades.
float4 sCove(float2 p, float asp, float3 c2, float3 c3) {
  float y0 = 0.56 * asp;
  float y1 = 1.03 * asp;
  float4 acc = lit(c3, 0.04 * smoothstep(y0 - 0.1, asp, p.y));
  if (p.y > y0 - 0.02) {
    float wob = 0.02 * sin(p.x * 3.0 + t * 0.2) + 0.015 * (noise(float2(p.x * 4.0, t * 0.1)) - 0.5);
    float k = (p.y - wob - y0) / (y1 - y0);
    float brk = smoothstep(0.25, 0.5, k);
    float patch = smoothstep(0.35, 0.8, fbm(float2(p.x * 6.0, p.y * 9.0) + float2(t * 0.05, 0.0)));
    float glow = 0.0;
    for (int n = 0; n < 2; n++) {
      float tp = (crest + float(n) - k) * 9.0;
      if (tp > -0.6) {
        float line = exp(-tp * tp / 0.08);
        float foam = 0.0;
        if (tp > 0.0) { foam = exp(-tp / 3.5) * patch; }
        glow += brk * (line * 0.6 + foam * 0.5) + (1.0 - brk) * line * 0.12;
      }
    }
    float3 bio = float3(0.42, 1.0, 0.9) * 0.75 + c2 * 0.25;
    float wash = 0.05 * smoothstep(0.8, 1.0, k) * (0.6 + 0.4 * patch);
    acc = over(lit(bio, glow * 0.45 + wash), acc);
  }
  return acc;
}

float4 sceneColor(float sid, float2 p, float asp, float3 c1, float3 c2, float3 c3, float3 c4) {
  if (sid < 0.5) { return sRain(p, asp, c1, c2, c3); }
  if (sid < 1.5) { return sNocturne(p, asp, c1, c2, c4); }
  if (sid < 2.5) { return sHearth(p, asp, c1, c2, c4); }
  if (sid < 3.5) { return sTide(p, asp, c1, c2, c3); }
  if (sid < 4.5) { return sDelta(p, asp, c1, c2, c3); }
  if (sid < 5.5) { return sHorizon(p, asp, c1, c2, c3); }
  if (sid < 6.5) { return sInk(p, c1, c2); }
  if (sid < 7.5) { return sAdagio(p, asp, c1, c2, c4); }
  if (sid < 8.5) { return sStarfield(p, asp, c2, c3); }
  if (sid < 9.5) { return sAmber(p, c1, c2); }
  if (sid < 10.5) { return sMist(p, asp, c2, c3, c4); }
  return sCove(p, asp, c2, c3);
}

half4 main(float2 fc) {
  float2 p = fc / res.x;
  float asp = res.y / res.x;
  float4 col = sceneColor(sb, p, asp, pal[4].rgb, pal[5].rgb, pal[6].rgb, pal[7].rgb);
  if (settled < 0.5) {
    float2 o = float2(0.5, 0.3 * asp);
    float d = length(p - o) + (fbm(p * 3.0 + 7.0) - 0.5) * 0.25;
    float m = 1.0 - smoothstep(edge - 0.22, edge + 0.22, d);
    float4 a = sceneColor(sa, p, asp, pal[0].rgb, pal[1].rgb, pal[2].rgb, pal[3].rgb);
    col = mix(a, col, m);
    float rd = (d - edge) / 0.05;
    col = over(lit(mix(pal[1].rgb, pal[5].rgb, 0.5), exp(-rd * rd) * 0.045), col);
  }
  return half4(col * intensity);
}
`
