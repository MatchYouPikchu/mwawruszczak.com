// Bakes the terrain for the map in a worker, so the page never stutters.
// Output: an RGBA half-float texture (height, river distance, trail distance, trail arc length)
// and a float copy of the heights for the main thread (labels, lamp, agents).
'use strict';

const hash = (x, y, s) => {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
};
const sm = t => t * t * (3 - 2 * t);
const vnoise = (x, y, s) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  const u = sm(xf), v = sm(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x, y, s, o) => { let t = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, s + i); f *= 2.03; a *= .5; } return t; };
const ridged = (x, y, s, o) => {
  let t = 0, a = .5, f = 1, w = 1;
  for (let i = 0; i < o; i++) { let n = 1 - Math.abs(vnoise(x * f, y * f, s + i) * 2 - 1); n *= n * w; w = Math.min(1, n * 2); t += n * a; f *= 2.1; a *= .5; }
  return t;
};
const gauss = (dx, dz, s) => Math.exp(-(dx * dx + dz * dz) / (2 * s * s));
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

// float32 -> float16 bits
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
function toHalf(v) {
  f32[0] = v;
  const x = u32[0];
  let bits = (x >> 16) & 0x8000, m = (x >> 12) & 0x07ff;
  const e = (x >> 23) & 0xff;
  if (e < 103) return bits;
  if (e > 142) { bits |= 0x7c00; bits |= ((e === 255) ? 0 : 1) && (x & 0x007fffff); return bits; }
  if (e < 113) { m |= 0x0800; bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1); return bits; }
  bits |= ((e - 112) << 10) | (m >> 1);
  bits += m & 1;
  return bits;
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qz = az + t * dz - pz;
  return [Math.sqrt(qx * qx + qz * qz), t];
}

self.onmessage = e => {
  const { N, W, D, cx, cz, F } = e.data;
  const heights = new Float32Array(N * N);
  const tex = new Uint16Array(N * N * 4);

  // pre-measure trails (arc length per vertex)
  const trails = F.trails.map(pts => {
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
    for (const [x, z] of pts) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
    return { pts, acc, box: [minx - 4, maxx + 4, minz - 4, maxz + 4] };
  });
  // smooth the river polyline (Catmull-Rom) so it meanders instead of zig-zagging
  const river = [];
  const R0 = F.river;
  for (let i = 0; i < R0.length - 1; i++) {
    const p0 = R0[Math.max(0, i - 1)], p1 = R0[i], p2 = R0[i + 1], p3 = R0[Math.min(R0.length - 1, i + 2)];
    for (let k = 0; k < 8; k++) {
      const t = k / 8, t2 = t * t, t3 = t2 * t;
      river.push([0, 1].map(c => .5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  river.push(R0[R0.length - 1]);

  for (let j = 0; j < N; j++) {
    const v = (j + .5) / N, z = cz + D / 2 - v * D;
    for (let i = 0; i < N; i++) {
      const u = (i + .5) / N, x = cx - W / 2 + u * W;

      // rolling ground, domain-warped so it never looks like noise
      const wx = x + 7 * (fbm(x * .03 + 3.1, z * .03, 11, 3) - .5);
      const wz = z + 7 * (fbm(x * .03, z * .03 + 7.7, 13, 3) - .5);
      let h = 2.6 * fbm(wx * .04, wz * .04, 7, 5) + .22 * fbm(wx * .14, wz * .14, 21, 3);

      // the stops
      for (const p of F.peaks) {
        const g = gauss(wx - p.x, wz - p.z, p.s);
        if (g > .002) h += p.a * g * (p.base + p.rough * ridged(wx * p.f + p.x, wz * p.f + p.z, 31 + p.seed, 5));
      }
      // friction: broken, rough ground
      const fr = gauss(x - F.friction.x, z - F.friction.z, F.friction.s);
      if (fr > .002) h += fr * F.friction.a * ridged(x * .26, z * .26, 57, 5) + fr * .8 * fbm(x * .6, z * .6, 61, 3);
      // the plateau: a table mountain with a worn top, sheer walls cut by gullies and scree at the foot
      // (wall steepness varies around the rim, so the contours on it never stack as copies of one shape)
      const md = Math.hypot((x - F.mesa.x) / F.mesa.rx, (z - F.mesa.z) / F.mesa.rz) + .32 * (fbm(x * .16, z * .16, 91, 3) - .5);
      const steep = .16 + .34 * fbm(x * .21 + 4.2, z * .21, 97, 2), gully = .16 * (fbm(x * .55, z * .55, 95, 3) - .5);
      const wall = 1 - sm(clamp01((md + gully * .5 - .74) / steep)), scree = 1 - sm(clamp01((md + gully - .74) / 1.05));
      const mesa = .72 * wall + .28 * scree;
      h = h * (1 - mesa * .65) + mesa * (F.mesa.h + .35 * fbm(x * .3, z * .3, 71, 3));
      // far range on the horizon
      const far = sm(clamp01((-z - F.far.z0) / F.far.span));
      if (far > 0) h += far * F.far.a * ridged(wx * .05, wz * .05, 81, 6);

      // river valley
      let rd = 1e9;
      for (let k = 0; k < river.length - 1; k++) {
        const [d] = segDist(x, z, river[k][0], river[k][1], river[k + 1][0], river[k + 1][1]);
        if (d < rd) rd = d;
      }
      const carve = Math.exp(-(rd * rd) / (2 * 3.2 * 3.2));
      h = h * (1 - carve * .8) - carve * .2;

      // trails: distance and arc length
      let td = 1e9, ta = 0;
      for (const t of trails) {
        if (x < t.box[0] || x > t.box[1] || z < t.box[2] || z > t.box[3]) continue;
        for (let k = 0; k < t.pts.length - 1; k++) {
          const [d, s] = segDist(x, z, t.pts[k][0], t.pts[k][1], t.pts[k + 1][0], t.pts[k + 1][1]);
          if (d < td) { td = d; ta = t.acc[k] + s * (t.acc[k + 1] - t.acc[k]); }
        }
      }

      // fade to calm ground at the edges of the world
      const edge = Math.min(u, 1 - u, v, 1 - v);
      h *= sm(clamp01(edge / .08));

      h *= 1.3;
      const idx = j * N + i;
      heights[idx] = h;
      const o = idx * 4;
      tex[o] = toHalf(h);
      tex[o + 1] = toHalf(Math.min(rd, 60));
      tex[o + 2] = toHalf(Math.min(td, 60));
      tex[o + 3] = toHalf(ta);
    }
  }
  self.postMessage({ heights, tex }, [heights.buffer, tex.buffer]);
};
